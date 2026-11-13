import express, { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { env } from '../config/env.js'
import { AIBusyError } from '../ai/providerBudget.js'
import { createHrAuth } from '../hr/hrAuth.js'
import { HR_DOC_ID, HrStoreError, hrStore } from '../db/hrStore.js'
import { createUserAiLimits } from '../middleware/limits.js'
import { normalizeResumeData } from '../services/resumeData.js'
import { extractCompleteResumeDocument, extractSourceFallbackDocument, normalizeResumeDocument } from '../services/resumeExtraction.js'
import { candidateSummary, rankCandidates, scoreCandidate, weightsFor } from '../../shared/hrScoring.js'
import { HR_RESUMES_PER_OPENING } from '../../shared/hrPlans.js'

// A resume is a few pages; anything far longer is not a resume and would spend the AI budget for nothing.
const MAX_RESUME_CHARACTERS = 60_000
const STATUS = { invalid: 400, plan_limit: 403, not_found: 404, opening_full: 409, too_large: 413 }

function fail(response, error, fallback) {
  if (error instanceof HrStoreError) return response.status(STATUS[error.code] ?? 400).json({ ok: false, code: error.code, error: error.message, ...(error.limit !== undefined ? { limit: error.limit } : {}) })
  console.error(`${fallback}:`, error?.message)
  return response.status(500).json({ ok: false, code: 'server', error: `${fallback}. Please try again.` })
}

/** Reads one resume: the AI extractor first, the basic text parser when the AI fails. A busy AI is reported, not hidden. */
async function readResume(document) {
  try {
    const result = await extractCompleteResumeDocument(document)
    return { resumeData: normalizeResumeData(result.resumeData), parsedBy: 'ai' }
  } catch (error) {
    if (error instanceof AIBusyError) throw error
    console.error('HR resume extraction fell back to the basic parser:', error?.message)
    const fallback = extractSourceFallbackDocument(document)
    return { resumeData: normalizeResumeData(fallback.resumeData), parsedBy: 'basic' }
  }
}

export function createHrRouter({ store = hrStore, auth = createHrAuth(), read = readResume, aiLimits = createUserAiLimits({ perMinute: env.limits.userAiPerMinute, perDay: env.limits.userAiPerDay, keyOf: request => request.hrUser.id }), loginLimit = { windowMs: 15 * 60_000, limit: 10 } } = {}) {
  const router = Router()
  const small = express.json({ limit: '100kb' })
  const documentBody = express.json({ limit: '1mb' })

  const loginLimiter = rateLimit({
    ...loginLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ ok: false, error: 'Too many sign-in attempts. Wait a few minutes and try again.' })
  })

  router.post('/auth/login', loginLimiter, small, async (request, response) => {
    const { email, password } = request.body ?? {}
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) return response.status(400).json({ ok: false, error: 'Enter your work email and password.' })
    const account = auth.checkCredentials(email, password)
    if (!account) return response.status(401).json({ ok: false, error: 'That email and password don’t match an HR account.' })
    try {
      const view = await store.ensureAccount(account.id, account.email)
      const session = auth.issue(account)
      return response.json({ ok: true, token: session.token, expiresAt: session.expiresAt, account: view })
    } catch (error) {
      return fail(response, error, 'Could not open your HR account')
    }
  })

  router.use(auth.requireHr)

  // Every :openingId / :candidateId must look like an id before it reaches Firestore.
  router.param('openingId', (request, response, next, value) => HR_DOC_ID.test(value) ? next() : response.status(404).json({ ok: false, code: 'not_found', error: 'This job opening no longer exists.' }))
  router.param('candidateId', (request, response, next, value) => HR_DOC_ID.test(value) ? next() : response.status(404).json({ ok: false, code: 'not_found', error: 'This resume is no longer in the opening.' }))

  router.get('/auth/me', async (request, response) => {
    try {
      return response.json({ ok: true, account: await store.ensureAccount(request.hrUser.id, request.hrUser.email) })
    } catch (error) {
      return fail(response, error, 'Could not load your HR account')
    }
  })

  // Openings with their resume counts, best score and strong matches, for the overview and the list.
  router.get('/openings', async (request, response) => {
    try {
      const openings = await store.listOpenings(request.hrUser.id)
      const rows = await Promise.all(openings.map(async opening => {
        const ranked = rankCandidates((await store.listCandidates(request.hrUser.id, opening.id)).map(candidate => candidateSummary(candidate, opening)))
        return { ...opening, candidateCount: ranked.length, bestScore: ranked[0]?.score ?? null, bestCandidate: ranked[0]?.name ?? null, strongCount: ranked.filter(row => row.band === 'strong').length }
      }))
      return response.json({ ok: true, openings: rows, account: await store.getAccount(request.hrUser.id) })
    } catch (error) {
      return fail(response, error, 'Could not load your job openings')
    }
  })

  router.post('/openings', small, async (request, response) => {
    try {
      return response.status(201).json({ ok: true, opening: await store.createOpening(request.hrUser.id, request.body ?? {}) })
    } catch (error) {
      return fail(response, error, 'Could not create the job opening')
    }
  })

  // The opening and every resume in it, ranked. Scores are computed here from the current requirements.
  router.get('/openings/:openingId', async (request, response) => {
    try {
      const opening = await store.getOpening(request.hrUser.id, request.params.openingId)
      const candidates = rankCandidates((await store.listCandidates(request.hrUser.id, opening.id)).map(candidate => candidateSummary(candidate, opening)))
      return response.json({ ok: true, opening, weights: weightsFor(opening), candidates })
    } catch (error) {
      return fail(response, error, 'Could not load the job opening')
    }
  })

  router.put('/openings/:openingId', small, async (request, response) => {
    try {
      return response.json({ ok: true, opening: await store.updateOpening(request.hrUser.id, request.params.openingId, request.body ?? {}) })
    } catch (error) {
      return fail(response, error, 'Could not save the job opening')
    }
  })

  router.delete('/openings/:openingId', async (request, response) => {
    try {
      await store.deleteOpening(request.hrUser.id, request.params.openingId)
      return response.json({ ok: true })
    } catch (error) {
      return fail(response, error, 'Could not delete the job opening')
    }
  })

  // One resume per request, so the browser can show each file's progress and retry only what failed.
  router.post('/openings/:openingId/candidates', aiLimits, documentBody, async (request, response) => {
    const { fileName, document } = request.body ?? {}
    const source = normalizeResumeDocument(document ?? {})
    if (!source.rawText) return response.status(400).json({ ok: false, code: 'invalid', error: 'No readable text was found in this file.' })
    if (source.rawText.length > MAX_RESUME_CHARACTERS) return response.status(413).json({ ok: false, code: 'too_large', error: 'This file is far longer than a resume.' })
    try {
      const opening = await store.getOpening(request.hrUser.id, request.params.openingId)
      if (opening.candidateCount >= HR_RESUMES_PER_OPENING) return fail(response, new HrStoreError('opening_full', `An opening holds up to ${HR_RESUMES_PER_OPENING} resumes.`, { limit: HR_RESUMES_PER_OPENING }))
      const { resumeData, parsedBy } = await read(source)
      const candidate = await store.addCandidate(request.hrUser.id, opening.id, { fileName, resumeData, parsedBy })
      return response.status(201).json({ ok: true, candidate: candidateSummary(candidate, opening) })
    } catch (error) {
      if (error instanceof AIBusyError) {
        response.set('Retry-After', String(error.retryAfterSeconds))
        return response.status(429).json({ ok: false, code: 'ai_busy', error: 'Waiting for AI reading capacity.', retryAfterSeconds: error.retryAfterSeconds })
      }
      return fail(response, error, 'Could not read this resume')
    }
  })

  router.get('/openings/:openingId/candidates/:candidateId', async (request, response) => {
    try {
      const opening = await store.getOpening(request.hrUser.id, request.params.openingId)
      const candidate = await store.getCandidate(request.hrUser.id, opening.id, request.params.candidateId)
      return response.json({ ok: true, candidate: { ...candidateSummary(candidate, opening), resumeData: candidate.resumeData, evaluation: scoreCandidate(candidate.resumeData, opening) } })
    } catch (error) {
      return fail(response, error, 'Could not load this resume')
    }
  })

  router.delete('/openings/:openingId/candidates/:candidateId', async (request, response) => {
    try {
      await store.deleteCandidate(request.hrUser.id, request.params.openingId, request.params.candidateId)
      return response.json({ ok: true })
    } catch (error) {
      return fail(response, error, 'Could not remove this resume')
    }
  })

  return router
}

export default createHrRouter
