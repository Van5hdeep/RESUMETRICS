import { randomUUID } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { getConnectionStore } from '../services/firebaseAdmin.js'
import { HR_FREE_OPENING_LIMIT, HR_RESUMES_PER_OPENING, isHrPro } from '../../shared/hrPlans.js'
import { CANDIDATE_STATUSES, descriptionLines, EMPLOYMENT_TYPES, validateWeights } from '../../shared/hrScoring.js'
import { extractJd } from '../../shared/jdExtract.js'
import { verificationFor } from '../../shared/hrRegistration.js'

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
  // Settings HR changes on the opening page (not in the job form).
  blind: raw.blind === true,
  weights: raw.weights ?? null,
  status: raw.status === 'closed' ? 'closed' : 'open',
  closedAt: toIso(raw.closedAt),
  createdAt: toIso(raw.createdAt),
  updatedAt: toIso(raw.updatedAt)
})

const toCandidate = (id, raw, index = 0) => ({
  id,
  serial: Number.isInteger(raw.serial) ? raw.serial : index + 1,
  fileName: raw.fileName ?? '',
  fileHash: raw.fileHash ?? '',
  resumeData: raw.resumeData ?? {},
  parsedBy: raw.parsedBy ?? 'ai',
  status: CANDIDATE_STATUSES.includes(raw.status) ? raw.status : 'new',
  reason: raw.reason ?? '',
  decidedAt: toIso(raw.decidedAt),
  createdAt: toIso(raw.createdAt)
})

const emailOf = resumeData => String(resumeData?.email ?? '').trim().toLowerCase()
const closedError = () => new HrStoreError('closed', 'This opening is closed. Reopen it to make changes.')
const MAX_BULK = 50

/** { blind?, weights?, status? } from the opening page; anything else is ignored. */
export function validateOpeningSettings(input = {}) {
  const settings = {}
  if (input.blind !== undefined) settings.blind = input.blind === true
  if (input.status !== undefined) {
    if (!['open', 'closed'].includes(input.status)) throw new HrStoreError('invalid', 'An opening is either open or closed.')
    settings.status = input.status
  }
  if (input.weights !== undefined) {
    try { settings.weights = validateWeights(input.weights) } catch (error) { throw new HrStoreError('invalid', error.message) }
  }
  if (!Object.keys(settings).length) throw new HrStoreError('invalid', 'Nothing to change.')
  return settings
}

/** A decision on one or more resumes: { status, reason }. A reason is kept only with a rejection. */
export function validateDecision(input = {}) {
  if (!CANDIDATE_STATUSES.includes(input.status)) throw new HrStoreError('invalid', 'A resume is new, shortlisted or rejected.')
  return { status: input.status, reason: input.status === 'rejected' ? text(input.reason, 200) : '' }
}

export function createHrStore({ getDb = getConnectionStore, timestamp = () => FieldValue.serverTimestamp(), now = () => Date.now() } = {}) {
  const accountRef = hrId => getDb().collection('hrAccounts').doc(hrId)
  const openingsOf = hrId => accountRef(hrId).collection('openings')
  const candidatesOf = (hrId, openingId) => openingsOf(hrId).doc(openingId).collection('candidates')

  // What the portal may see of an account. Credentials (salt + hash) never leave the server.
  const accountView = (raw = {}) => {
    const pro = isHrPro(raw.plan, now())
    const used = Number.isInteger(raw.openingsCreated) ? raw.openingsCreated : 0
    const details = raw.details ? { ...raw.details, email: raw.email ?? '' } : null
    return { email: raw.email ?? '', plan: pro ? 'pro' : 'free', planDetails: raw.plan ?? { tier: 'free' }, openingsCreated: used, openingLimit: pro ? null : HR_FREE_OPENING_LIMIT, details, verification: details ? verificationFor(details) : null }
  }

  /** The stored password check for a registered account, or null when the account has never registered. */
  async function getCredentials(hrId) {
    const snapshot = await accountRef(hrId).get()
    return snapshot.exists && snapshot.data().credentials ? snapshot.data().credentials : null
  }

  /**
   * Creates (or claims) the account for a new sign-up. An account that already has a password is refused; one that
   * exists without a password (e.g. a plan granted before the person signed up) keeps its plan and openings.
   */
  async function registerAccount(hrId, { email, details, credentials }) {
    const ref = accountRef(hrId)
    await getDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref)
      if (snapshot.exists && snapshot.data().credentials) throw new HrStoreError('exists', 'An HR account with this email already exists. Sign in instead.')
      const base = snapshot.exists ? {} : { plan: { tier: 'free' }, openingsCreated: 0, createdAt: timestamp() }
      transaction.set(ref, { ...base, email, details: { ...details, verification: 'pending' }, credentials, registeredAt: timestamp() }, { merge: true })
    })
    return getAccount(hrId)
  }

  /** Updates the person and company details (not the email or password). Verification is kept. */
  async function updateDetails(hrId, details) {
    const ref = accountRef(hrId)
    const snapshot = await ref.get()
    if (!snapshot.exists) throw new HrStoreError('not_found', 'This HR account no longer exists.')
    const current = snapshot.data().details ?? {}
    const { email: _email, ...rest } = details
    await ref.set({ details: { ...rest, verification: current.verification ?? 'pending', ...(current.demo ? { demo: true } : {}) } }, { merge: true })
    return getAccount(hrId)
  }

  /** Reads the opening inside a transaction; throws not_found, or closed when `open` is required. */
  async function readOpening(transaction, ref, { open = false } = {}) {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) throw new HrStoreError('not_found', 'This job opening no longer exists.')
    if (open && snapshot.data().status === 'closed') throw closedError()
    return snapshot
  }

  /**
   * Creates the account document on first sign-in; returns the account view. `details` (the demo login's made-up
   * person and company) fill in an account that has none yet, and never overwrite edits.
   */
  async function ensureAccount(hrId, email, details = null) {
    const ref = accountRef(hrId)
    const snapshot = await ref.get()
    if (!snapshot.exists) {
      const fresh = { email, plan: { tier: 'free' }, openingsCreated: 0, createdAt: timestamp(), ...(details ? { details } : {}) }
      await ref.set(fresh)
      return accountView(fresh)
    }
    if (details && !snapshot.data().details) {
      await ref.set({ details }, { merge: true })
      return accountView({ ...snapshot.data(), details })
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
      transaction.set(ref, { ...fields, candidateCount: 0, nextSerial: 0, status: 'open', blind: false, weights: null, createdAt: timestamp(), updatedAt: timestamp() })
      transaction.set(accountRef(hrId), { openingsCreated: used + 1 }, { merge: true })
    })
    return getOpening(hrId, id)
  }

  /** Edits the job description. A closed opening is read-only. */
  async function updateOpening(hrId, openingId, input) {
    const fields = validateOpeningFields(input)
    const ref = openingsOf(hrId).doc(openingId)
    const snapshot = await ref.get()
    if (!snapshot.exists) throw new HrStoreError('not_found', 'This job opening no longer exists.')
    if (snapshot.data().status === 'closed') throw closedError()
    await ref.update({ ...fields, updatedAt: timestamp() })
    return getOpening(hrId, openingId)
  }

  /** Blind mode, custom weights, open/closed. Allowed on a closed opening (that is how it is reopened). */
  async function updateOpeningSettings(hrId, openingId, input) {
    const settings = validateOpeningSettings(input)
    const ref = openingsOf(hrId).doc(openingId)
    const snapshot = await ref.get()
    if (!snapshot.exists) throw new HrStoreError('not_found', 'This job opening no longer exists.')
    if (settings.status) settings.closedAt = settings.status === 'closed' ? timestamp() : null
    await ref.update({ ...settings, updatedAt: timestamp() })
    return getOpening(hrId, openingId)
  }

  /** Removes the opening and its resumes. The opening still counts towards the free plan's total. */
  async function deleteOpening(hrId, openingId) {
    await getDb().recursiveDelete(openingsOf(hrId).doc(openingId))
  }

  async function listCandidates(hrId, openingId) {
    const snapshot = await candidatesOf(hrId, openingId).orderBy('createdAt', 'asc').get()
    return snapshot.docs.map((doc, index) => toCandidate(doc.id, doc.data(), index))
  }

  async function getCandidate(hrId, openingId, candidateId) {
    const snapshot = await candidatesOf(hrId, openingId).doc(candidateId).get()
    if (!snapshot.exists) throw new HrStoreError('not_found', 'This resume is no longer in the opening.')
    return toCandidate(snapshot.id, snapshot.data())
  }

  /** The resume already in this opening with the same file text (or, when given, the same email); null if none. */
  async function findDuplicate(hrId, openingId, { fileHash, email = '' }) {
    const existing = await listCandidates(hrId, openingId)
    return existing.find(item => (fileHash && item.fileHash === fileHash) || (email && emailOf(item.resumeData) === email)) ?? null
  }

  /**
   * Stores one read resume. Refused when the opening is closed or full, or when the same file or the same email is
   * already in it (code 'duplicate'). Every check and the write happen in one transaction.
   */
  async function addCandidate(hrId, openingId, { fileName, fileHash = '', resumeData, parsedBy }) {
    if (JSON.stringify(resumeData ?? {}).length > MAX_RESUME_BYTES) throw new HrStoreError('too_large', 'This resume has more text than one opening can store.')
    const id = randomUUID()
    const openingRef = openingsOf(hrId).doc(openingId)
    const email = emailOf(resumeData)
    await getDb().runTransaction(async transaction => {
      const opening = await readOpening(transaction, openingRef, { open: true })
      const existing = (await transaction.get(candidatesOf(hrId, openingId))).docs.map(doc => doc.data())
      const twin = existing.find(item => (fileHash && item.fileHash === fileHash) || (email && emailOf(item.resumeData) === email))
      if (twin) throw new HrStoreError('duplicate', `Already in this opening${twin.resumeData?.fullName ? ` as ${twin.resumeData.fullName}` : ''}.`)
      const count = opening.data().candidateCount ?? 0
      if (count >= HR_RESUMES_PER_OPENING) throw new HrStoreError('opening_full', `An opening holds up to ${HR_RESUMES_PER_OPENING} resumes.`, { limit: HR_RESUMES_PER_OPENING })
      const serial = Math.max(Number(opening.data().nextSerial) || 0, existing.length) + 1
      transaction.set(candidatesOf(hrId, openingId).doc(id), { serial, fileName: text(fileName, 160), fileHash: text(fileHash, 64), resumeData, parsedBy: parsedBy === 'basic' ? 'basic' : 'ai', status: 'new', reason: '', decidedAt: null, createdAt: timestamp() })
      transaction.update(openingRef, { candidateCount: count + 1, nextSerial: serial })
    })
    return getCandidate(hrId, openingId, id)
  }

  /** Shortlist, reject (with an optional reason) or return to new, for one or many resumes in one transaction. */
  async function decide(hrId, openingId, candidateIds, input) {
    const decision = validateDecision(input)
    const ids = [...new Set(candidateIds)].slice(0, MAX_BULK)
    const openingRef = openingsOf(hrId).doc(openingId)
    let changed = 0
    await getDb().runTransaction(async transaction => {
      await readOpening(transaction, openingRef, { open: true })
      const refs = ids.map(id => candidatesOf(hrId, openingId).doc(id))
      const snapshots = []
      for (const ref of refs) snapshots.push(await transaction.get(ref))
      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) return
        changed += 1
        transaction.update(refs[index], { status: decision.status, reason: decision.reason, decidedAt: decision.status === 'new' ? null : timestamp() })
      })
    })
    if (!changed) throw new HrStoreError('not_found', 'These resumes are no longer in the opening.')
    return { changed }
  }

  /** Removes resumes (one or many). Removing one twice is fine: a retried request must not lower the count twice. */
  async function deleteCandidates(hrId, openingId, candidateIds) {
    const ids = [...new Set(candidateIds)].slice(0, MAX_BULK)
    const openingRef = openingsOf(hrId).doc(openingId)
    let removed = 0
    await getDb().runTransaction(async transaction => {
      const opening = await transaction.get(openingRef)
      if (!opening.exists) return
      if (opening.data().status === 'closed') throw closedError()
      const refs = ids.map(id => candidatesOf(hrId, openingId).doc(id))
      const snapshots = []
      for (const ref of refs) snapshots.push(await transaction.get(ref))
      snapshots.forEach((snapshot, index) => { if (snapshot.exists) { removed += 1; transaction.delete(refs[index]) } })
      if (removed) transaction.update(openingRef, { candidateCount: Math.max(0, (opening.data().candidateCount ?? removed) - removed) })
    })
    return { removed }
  }

  const deleteCandidate = (hrId, openingId, candidateId) => deleteCandidates(hrId, openingId, [candidateId])

  return { ensureAccount, getAccount, getCredentials, registerAccount, updateDetails, listOpenings, getOpening, createOpening, updateOpening, updateOpeningSettings, deleteOpening, listCandidates, getCandidate, findDuplicate, addCandidate, decide, deleteCandidates, deleteCandidate }
}

export const hrStore = createHrStore()
