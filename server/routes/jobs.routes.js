import { Router } from 'express'
import { env } from '../config/env.js'
import { usageDay } from '../ai/usage.js'
import { RESUME_ID, ResumeStoreError, resumeStore } from '../db/resumeStore.js'
import { JOB_KEY, JobStoreError, jobStore } from '../db/jobStore.js'
import { JobSearchError, WEB_BOARDS, boardLabel, buildRows, cacheKeyOf, jobSearch, mergeBoardRow } from '../jobs/jobSearch.js'
import { buildSearchProfile } from '../../shared/jobMatch.js'

// Job tracker (Pro). Mounted after requireUser and requirePro (server/index.js), so every request has a Pro uid.
const STATUS = { invalid: 400, not_found: 404, limit: 429 }
const plain = value => JSON.parse(JSON.stringify(value))

function fail(response, error, fallback) {
  if (error instanceof JobStoreError) return response.status(STATUS[error.code] ?? 400).json({ ok: false, code: error.code, error: error.message })
  if (error instanceof ResumeStoreError) return response.status(error.code === 'not_found' ? 404 : 400).json({ ok: false, code: error.code, error: error.code === 'not_found' ? 'That resume no longer exists. Pick another one.' : error.message })
  if (error instanceof JobSearchError) return response.status(503).json({ ok: false, code: 'unavailable', error: error.message })
  console.error(`${fallback}:`, error?.message)
  return response.status(500).json({ ok: false, code: 'server', error: `${fallback}.` })
}

export function createJobsRouter({ jobs = jobStore, resumes = resumeStore, search = jobSearch, perDay = env.jobs.searchesPerDay, day = () => usageDay() } = {}) {
  const router = Router()
  const searchesLeft = state => perDay - (state.day === day() && Number.isInteger(state.searches) ? state.searches : 0)

  router.param('key', (request, response, next, key) => {
    if (!JOB_KEY.test(key)) return response.status(400).json({ ok: false, code: 'invalid', error: 'Invalid job id.' })
    return next()
  })

  // The last search (or null) and how many fresh searches are left today.
  router.get('/latest', async (request, response) => {
    try {
      const state = await jobs.getState(request.firebaseUser.uid)
      response.set('Cache-Control', 'no-store')
      return response.json({ ok: true, search: state.lastSearch ?? null, searchesLeft: searchesLeft(state), searchesPerDay: perDay })
    } catch (error) {
      return fail(response, error, 'Could not load your job search')
    }
  })

  // Body: { resumeId, role?, location?, remote?, datePosted? }. Cached terms don't count toward the daily searches.
  router.post('/search', async (request, response) => {
    const uid = request.firebaseUser.uid
    const { resumeId, ...overrides } = request.body ?? {}
    if (typeof resumeId !== 'string' || !RESUME_ID.test(resumeId)) return response.status(400).json({ ok: false, code: 'invalid', error: 'Pick a resume to search with.' })
    try {
      const resume = await resumes.getResume(uid, resumeId)
      const profile = buildSearchProfile(resume.data, overrides)
      let raw = await search.lookup(profile)
      let left = null
      const cached = Boolean(raw)
      if (!raw) {
        left = await jobs.takeSearch(uid, day(), perDay)
        raw = await search.fetchFresh(profile)
      }
      // The boards in pendingBoards load next, one request each (POST /boards/:platform), and join these rows.
      const pendingBoards = search.boardsAvailable() ? [...WEB_BOARDS] : []
      const result = plain({ resumeId, resumeName: resume.name, profile, rows: buildRows(profile, raw), failures: raw.failures ?? [], pendingBoards, cached, searchedAt: new Date().toISOString() })
      await jobs.saveLastSearch(uid, result).catch(error => console.error('Last job search could not be kept:', error?.message))
      if (left === null) left = searchesLeft(await jobs.getState(uid))
      return response.json({ ok: true, search: result, searchesLeft: left, searchesPerDay: perDay })
    } catch (error) {
      return fail(response, error, 'Could not search for jobs')
    }
  })

  // One board's row for the last search (same body as /search). It reads the board only for the search just run, so it
  // can't be used for searches outside the daily allowance; the row is merged into the kept last search.
  router.post('/boards/:platform', async (request, response) => {
    const uid = request.firebaseUser.uid
    const { platform } = request.params
    const { resumeId, ...overrides } = request.body ?? {}
    if (!WEB_BOARDS.includes(platform)) return response.status(400).json({ ok: false, code: 'invalid', error: 'Unknown job board.' })
    if (typeof resumeId !== 'string' || !RESUME_ID.test(resumeId)) return response.status(400).json({ ok: false, code: 'invalid', error: 'Pick a resume to search with.' })
    try {
      const resume = await resumes.getResume(uid, resumeId)
      const profile = buildSearchProfile(resume.data, overrides)
      const key = cacheKeyOf(profile)
      const sameSearch = last => Boolean(last && last.resumeId === resumeId && last.profile && cacheKeyOf(last.profile) === key)
      const last = (await jobs.getState(uid)).lastSearch
      if (!sameSearch(last)) return response.status(409).json({ ok: false, code: 'stale', error: 'Run the search again to load this board.' })
      let board = await search.lookupBoard(profile, platform)
      let failed = false
      if (!board) {
        try {
          board = await search.fetchBoard(profile, platform)
        } catch (error) {
          if (!(error instanceof JobSearchError)) throw error
          failed = true
        }
      }
      const salaries = (await search.lookup(profile))?.salaries ?? {}
      const [row = null] = board ? buildRows(profile, { web: board.web, salaries }) : []
      const merge = current => mergeBoardRow(current, platform, row, failed)
      const updated = await jobs.updateLastSearch(uid, current => (sameSearch(current) ? plain(merge(current)) : null))
        .catch(error => { console.error('Board row could not be kept:', error?.message); return null })
      const merged = updated ?? merge(last)
      return response.json({ ok: true, platform, row: merged.rows.find(item => item.platform === platform) ?? null, failed, failure: failed ? boardLabel(platform) : null })
    } catch (error) {
      return fail(response, error, 'Could not load this job board')
    }
  })

  router.get('/saved', async (request, response) => {
    try {
      response.set('Cache-Control', 'no-store')
      return response.json({ ok: true, jobs: await jobs.listSaved(request.firebaseUser.uid) })
    } catch (error) {
      return fail(response, error, 'Could not load your saved jobs')
    }
  })

  router.put('/saved/:key', async (request, response) => {
    try {
      return response.json({ ok: true, job: await jobs.saveJob(request.firebaseUser.uid, request.params.key, request.body?.job) })
    } catch (error) {
      return fail(response, error, 'Could not save this job')
    }
  })

  // Body: { status?, notes? }
  router.patch('/saved/:key', async (request, response) => {
    try {
      return response.json({ ok: true, job: await jobs.updateSaved(request.firebaseUser.uid, request.params.key, request.body ?? {}) })
    } catch (error) {
      return fail(response, error, 'Could not update this job')
    }
  })

  router.delete('/saved/:key', async (request, response) => {
    try {
      await jobs.deleteSaved(request.firebaseUser.uid, request.params.key)
      return response.json({ ok: true })
    } catch (error) {
      return fail(response, error, 'Could not remove this job')
    }
  })

  return router
}

export default createJobsRouter()
