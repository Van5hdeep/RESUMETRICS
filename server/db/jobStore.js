import { createHash } from 'node:crypto'
import { getConnectionStore } from '../services/firebaseAdmin.js'
import { JOB_STATUSES } from '../../shared/jobMatch.js'

// Job tracker data:
//   users/{uid}/jobTracker/state  { day, searches, lastSearch }   today's fresh-search count and the last results
//   users/{uid}/savedJobs/{key}    a posting the person saved, with its application status and notes
//   jobCache/{hash}                raw results for one set of search terms, shared by everyone (no personal data)
//   salaryCache/{hash}             median pay for a company or role and place (no personal data)
export { JOB_STATUSES }
export const SAVED_JOB_LIMIT = 300
export const JOB_KEY = /^[a-f0-9]{24}$/

export class JobStoreError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'JobStoreError'
    this.code = code
    Object.assign(this, extra)
  }
}

/** Stable document id for a posting (JSearch ids are long base64 strings; Tavily postings only have a URL). */
export const jobKeyOf = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 24)

const text = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const httpsUrl = value => (typeof value === 'string' && /^https?:\/\//.test(value) && value.length <= 2000 ? value : '')

/** The saved copy of a posting: only display fields, checked, so the browser can't store anything else. */
export function validateSavedJob(job) {
  if (!job || typeof job !== 'object') throw new JobStoreError('invalid', 'A job is required.')
  const clean = {
    title: text(job.title, 140),
    company: text(job.company, 100),
    location: text(job.location, 100),
    logo: httpsUrl(job.logo).startsWith('https://') ? httpsUrl(job.logo) : '',
    url: httpsUrl(job.url),
    platform: text(job.platform, 30),
    type: text(job.type, 40),
    salary: text(job.salary, 60),
    postedAt: typeof job.postedAt === 'string' && Number.isFinite(Date.parse(job.postedAt)) ? job.postedAt : null,
    score: Number.isInteger(job.score) && job.score >= 0 && job.score <= 100 ? job.score : null,
    resumeId: typeof job.resumeId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(job.resumeId) ? job.resumeId : null
  }
  if (!clean.title || !clean.url) throw new JobStoreError('invalid', 'A job needs a title and a link.')
  return clean
}

export function createJobStore({ getDb = getConnectionStore, now = () => Date.now() } = {}) {
  const stateRef = uid => getDb().collection('users').doc(uid).collection('jobTracker').doc('state')
  const savedFor = uid => getDb().collection('users').doc(uid).collection('savedJobs')

  async function getState(uid) {
    const snapshot = await stateRef(uid).get()
    return snapshot.exists ? snapshot.data() : {}
  }

  /** Counts one fresh search for `day`, or throws 'limit' when today's are used up. Resolves the searches left. */
  async function takeSearch(uid, day, perDay) {
    return getDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(stateRef(uid))
      const state = snapshot.exists ? snapshot.data() : {}
      const used = state.day === day && Number.isInteger(state.searches) ? state.searches : 0
      if (used >= perDay) throw new JobStoreError('limit', `You’ve run today’s ${perDay} job searches. Your saved jobs and last results are still here; new searches open tomorrow.`)
      transaction.set(stateRef(uid), { day, searches: used + 1 }, { merge: true })
      return perDay - used - 1
    })
  }

  async function saveLastSearch(uid, lastSearch) {
    await stateRef(uid).set({ lastSearch }, { merge: true })
  }

  /**
   * Rewrites the last search with update(lastSearch) in a transaction, so boards loading side by side don't overwrite
   * each other's rows. update returns the new search, or null to leave it alone. Resolves what was written (or null).
   */
  async function updateLastSearch(uid, update) {
    return getDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(stateRef(uid))
      const next = update(snapshot.exists ? snapshot.data().lastSearch ?? null : null)
      if (next) transaction.set(stateRef(uid), { lastSearch: next }, { merge: true })
      return next ?? null
    })
  }

  async function getCached(hash, maxAgeMs) {
    const snapshot = await getDb().collection('jobCache').doc(hash).get()
    if (!snapshot.exists) return null
    const cached = snapshot.data()
    return Number.isFinite(cached.createdAt) && now() - cached.createdAt < maxAgeMs ? cached : null
  }

  async function putCached(hash, payload) {
    await getDb().collection('jobCache').doc(hash).set({ ...payload, createdAt: now() })
  }

  /** Salary estimates by company, role and place (no personal data), kept for weeks because they change slowly. */
  async function getSalary(key, maxAgeMs) {
    const snapshot = await getDb().collection('salaryCache').doc(key).get()
    if (!snapshot.exists) return undefined
    const cached = snapshot.data()
    return Number.isFinite(cached.createdAt) && now() - cached.createdAt < maxAgeMs ? cached.estimate ?? null : undefined
  }

  async function putSalary(key, estimate) {
    await getDb().collection('salaryCache').doc(key).set({ estimate: estimate ?? null, createdAt: now() })
  }

  async function listSaved(uid) {
    const snapshot = await savedFor(uid).orderBy('savedAt', 'desc').limit(SAVED_JOB_LIMIT).get()
    return snapshot.docs.map(doc => ({ key: doc.id, ...doc.data() }))
  }

  /** Saving again keeps the status and notes, so a second click never resets progress. */
  async function saveJob(uid, key, job) {
    const clean = validateSavedJob(job)
    const ref = savedFor(uid).doc(key)
    const stamp = new Date(now()).toISOString()
    return getDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref)
      const existing = snapshot.exists ? snapshot.data() : null
      const saved = { ...clean, status: existing?.status ?? 'saved', notes: existing?.notes ?? '', savedAt: existing?.savedAt ?? stamp, updatedAt: stamp }
      transaction.set(ref, saved)
      return { key, ...saved }
    })
  }

  async function updateSaved(uid, key, { status, notes } = {}) {
    const changes = {}
    if (status !== undefined) {
      if (!JOB_STATUSES.includes(status)) throw new JobStoreError('invalid', `status must be one of ${JOB_STATUSES.join(', ')}.`)
      changes.status = status
      if (status === 'applied') changes.appliedAt = new Date(now()).toISOString()
    }
    if (notes !== undefined) {
      if (typeof notes !== 'string' || notes.length > 2000) throw new JobStoreError('invalid', 'Notes must be text of at most 2,000 characters.')
      changes.notes = notes
    }
    if (!Object.keys(changes).length) throw new JobStoreError('invalid', 'Nothing to change.')
    changes.updatedAt = new Date(now()).toISOString()
    const ref = savedFor(uid).doc(key)
    try {
      await ref.update(changes)
    } catch (error) {
      if (Number(error?.code) === 5) throw new JobStoreError('not_found', 'This job is no longer saved.')
      throw error
    }
    const snapshot = await ref.get()
    return { key, ...snapshot.data() }
  }

  async function deleteSaved(uid, key) {
    await savedFor(uid).doc(key).delete()
  }

  return { getState, takeSearch, saveLastSearch, updateLastSearch, getCached, putCached, getSalary, putSalary, listSaved, saveJob, updateSaved, deleteSaved }
}

export const jobStore = createJobStore()
