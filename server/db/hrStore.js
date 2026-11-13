import { randomUUID } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { getConnectionStore } from '../services/firebaseAdmin.js'
import { HR_FREE_OPENING_LIMIT, HR_RESUMES_PER_OPENING, isHrPro } from '../../shared/hrPlans.js'
import { descriptionLines, EMPLOYMENT_TYPES } from '../../shared/hrScoring.js'
import { extractJd } from '../../shared/jdExtract.js'

// hrAccounts/{hrId}, hrAccounts/{hrId}/openings/{openingId}, .../openings/{openingId}/candidates/{candidateId}.
// Only the Express HR routes touch these, after requireHr has verified the session; Firestore rules stay closed.
export const HR_DOC_ID = /^[A-Za-z0-9_-]{8,64}$/
const MAX_RESUME_BYTES = 200_000

export class HrStoreError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'HrStoreError'
    this.code = code
    Object.assign(this, extra)
  }
}

const toIso = value => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  return null
}
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const terms = (value, max, length = 60) => {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value.map(item => text(item, length)).filter(item => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase())).slice(0, max)
}

/** Checks and cleans the fields HR typed. Keywords and responsibilities are read from the description here. */
export function validateOpeningFields(input = {}) {
  const title = text(input.title, 120)
  if (!title) throw new HrStoreError('invalid', 'Give the job a title.')
  const mustHave = terms(input.mustHave, 20)
  if (!mustHave.length) throw new HrStoreError('invalid', 'Add at least one must-have skill. Resumes are scored against them.')
  const employmentType = EMPLOYMENT_TYPES.includes(input.employmentType) ? input.employmentType : EMPLOYMENT_TYPES[0]
  const years = Number(input.minYears)
  if (input.minYears !== undefined && input.minYears !== null && input.minYears !== '' && (!Number.isFinite(years) || years < 0 || years > 30)) {
    throw new HrStoreError('invalid', 'Minimum experience must be between 0 and 30 years.')
  }
  const description = text(input.description, 8000)
  const read = description ? extractJd(descriptionLines(title, description)) : { keywords: [], responsibilities: [] }
  const mustLower = new Set(mustHave.map(item => item.toLowerCase()))
  return {
    title,
    employmentType,
    location: text(input.location, 80),
    minYears: Number.isFinite(years) && years > 0 ? Math.round(years * 2) / 2 : 0,
    education: text(input.education, 120),
    mustHave,
    niceToHave: terms(input.niceToHave, 20).filter(item => !mustLower.has(item.toLowerCase())),
    description,
    keywords: terms(read.keywords, 12),
    responsibilities: terms(read.responsibilities, 8, 200)
  }
}

const toOpening = (id, raw) => ({
  id,
  title: raw.title,
  employmentType: raw.employmentType,
  location: raw.location ?? '',
  minYears: raw.minYears ?? 0,
  education: raw.education ?? '',
  mustHave: raw.mustHave ?? [],
  niceToHave: raw.niceToHave ?? [],
  description: raw.description ?? '',
  keywords: raw.keywords ?? [],
  responsibilities: raw.responsibilities ?? [],
  candidateCount: raw.candidateCount ?? 0,
  createdAt: toIso(raw.createdAt),
  updatedAt: toIso(raw.updatedAt)
})

const toCandidate = (id, raw) => ({ id, fileName: raw.fileName ?? '', resumeData: raw.resumeData ?? {}, parsedBy: raw.parsedBy ?? 'ai', createdAt: toIso(raw.createdAt) })

export function createHrStore({ getDb = getConnectionStore, timestamp = () => FieldValue.serverTimestamp(), now = () => Date.now() } = {}) {
  const accountRef = hrId => getDb().collection('hrAccounts').doc(hrId)
  const openingsOf = hrId => accountRef(hrId).collection('openings')
  const candidatesOf = (hrId, openingId) => openingsOf(hrId).doc(openingId).collection('candidates')

  const accountView = (raw = {}) => {
    const pro = isHrPro(raw.plan, now())
    const used = Number.isInteger(raw.openingsCreated) ? raw.openingsCreated : 0
    return { email: raw.email ?? '', plan: pro ? 'pro' : 'free', planDetails: raw.plan ?? { tier: 'free' }, openingsCreated: used, openingLimit: pro ? null : HR_FREE_OPENING_LIMIT }
  }

  /** Creates the account document on first sign-in; returns the account view. */
  async function ensureAccount(hrId, email) {
    const ref = accountRef(hrId)
    const snapshot = await ref.get()
    if (!snapshot.exists) {
      const fresh = { email, plan: { tier: 'free' }, openingsCreated: 0, createdAt: timestamp() }
      await ref.set(fresh)
      return accountView(fresh)
    }
    return accountView(snapshot.data())
  }

  async function getAccount(hrId) {
    const snapshot = await accountRef(hrId).get()
    return accountView(snapshot.exists ? snapshot.data() : {})
  }

  async function listOpenings(hrId) {
    const snapshot = await openingsOf(hrId).orderBy('createdAt', 'desc').get()
    return snapshot.docs.map(doc => toOpening(doc.id, doc.data()))
  }

  async function getOpening(hrId, openingId) {
    const snapshot = await openingsOf(hrId).doc(openingId).get()
    if (!snapshot.exists) throw new HrStoreError('not_found', 'This job opening no longer exists.')
    return toOpening(snapshot.id, snapshot.data())
  }

  /** Free accounts can create HR_FREE_OPENING_LIMIT openings in total; the check and the write are one transaction. */
  async function createOpening(hrId, input) {
    const fields = validateOpeningFields(input)
    const id = randomUUID()
    const ref = openingsOf(hrId).doc(id)
    await getDb().runTransaction(async transaction => {
      const account = await transaction.get(accountRef(hrId))
      const raw = account.exists ? account.data() : {}
      const used = Number.isInteger(raw.openingsCreated) ? raw.openingsCreated : 0
      if (!isHrPro(raw.plan, now()) && used >= HR_FREE_OPENING_LIMIT) {
        throw new HrStoreError('plan_limit', `The free plan includes ${HR_FREE_OPENING_LIMIT} job openings. Upgrade to Hiring Pro for unlimited openings.`, { limit: HR_FREE_OPENING_LIMIT })
      }
      transaction.set(ref, { ...fields, candidateCount: 0, createdAt: timestamp(), updatedAt: timestamp() })
      transaction.set(accountRef(hrId), { openingsCreated: used + 1 }, { merge: true })
    })
    return getOpening(hrId, id)
  }

  async function updateOpening(hrId, openingId, input) {
    const fields = validateOpeningFields(input)
    const ref = openingsOf(hrId).doc(openingId)
    const snapshot = await ref.get()
    if (!snapshot.exists) throw new HrStoreError('not_found', 'This job opening no longer exists.')
    await ref.update({ ...fields, updatedAt: timestamp() })
    return getOpening(hrId, openingId)
  }

  /** Removes the opening and its resumes. The opening still counts towards the free plan's total. */
  async function deleteOpening(hrId, openingId) {
    await getDb().recursiveDelete(openingsOf(hrId).doc(openingId))
  }

  async function listCandidates(hrId, openingId) {
    const snapshot = await candidatesOf(hrId, openingId).orderBy('createdAt', 'asc').get()
    return snapshot.docs.map(doc => toCandidate(doc.id, doc.data()))
  }

  async function getCandidate(hrId, openingId, candidateId) {
    const snapshot = await candidatesOf(hrId, openingId).doc(candidateId).get()
    if (!snapshot.exists) throw new HrStoreError('not_found', 'This resume is no longer in the opening.')
    return toCandidate(snapshot.id, snapshot.data())
  }

  async function addCandidate(hrId, openingId, { fileName, resumeData, parsedBy }) {
    if (JSON.stringify(resumeData ?? {}).length > MAX_RESUME_BYTES) throw new HrStoreError('too_large', 'This resume has more text than one opening can store.')
    const id = randomUUID()
    const openingRef = openingsOf(hrId).doc(openingId)
    await getDb().runTransaction(async transaction => {
      const opening = await transaction.get(openingRef)
      if (!opening.exists) throw new HrStoreError('not_found', 'This job opening no longer exists.')
      const count = opening.data().candidateCount ?? 0
      if (count >= HR_RESUMES_PER_OPENING) throw new HrStoreError('opening_full', `An opening holds up to ${HR_RESUMES_PER_OPENING} resumes.`, { limit: HR_RESUMES_PER_OPENING })
      transaction.set(candidatesOf(hrId, openingId).doc(id), { fileName: text(fileName, 160), resumeData, parsedBy: parsedBy === 'basic' ? 'basic' : 'ai', createdAt: timestamp() })
      transaction.update(openingRef, { candidateCount: count + 1 })
    })
    return getCandidate(hrId, openingId, id)
  }

  /** Deleting twice is fine: a retried request must not fail or lower the count twice. */
  async function deleteCandidate(hrId, openingId, candidateId) {
    const openingRef = openingsOf(hrId).doc(openingId)
    const ref = candidatesOf(hrId, openingId).doc(candidateId)
    await getDb().runTransaction(async transaction => {
      const [opening, candidate] = [await transaction.get(openingRef), await transaction.get(ref)]
      if (!opening.exists || !candidate.exists) return
      transaction.delete(ref)
      transaction.update(openingRef, { candidateCount: Math.max(0, (opening.data().candidateCount ?? 1) - 1) })
    })
  }

  return { ensureAccount, getAccount, listOpenings, getOpening, createOpening, updateOpening, deleteOpening, listCandidates, getCandidate, addCandidate, deleteCandidate }
}

export const hrStore = createHrStore()
