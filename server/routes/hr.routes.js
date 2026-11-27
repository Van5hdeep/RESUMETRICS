import { createHash } from 'node:crypto'
import express, { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { env } from '../config/env.js'
import { AIBusyError } from '../ai/providerBudget.js'
import { createHrAuth, DEMO_EMAIL, DEMO_PROFILE, demoIdFor, HR_DEMO_MS, HR_SESSION_MS, hashPassword, hrIdFor, verifyPassword } from '../hr/hrAuth.js'
import { checkHrDetails, checkNewPassword } from '../../shared/hrRegistration.js'
import { HR_DOC_ID, HrStoreError, hrStore, openingFullError } from '../db/hrStore.js'
import { createUserAiLimits } from '../middleware/limits.js'
import { NO_DAILY_REQUEST_CAP, NO_DAILY_TOKEN_CAP } from '../ai/allowance.js'
import { createFirestoreRateLimitStore } from '../middleware/persistentRateLimit.js'
import { createDailyTokenBudget, trackAiUsageFor } from '../ai/usage.js'
import demoFixture from '../hr/demoFixture.json' with { type: 'json' }
import { normalizeResumeData } from '../services/resumeData.js'
import { extractCompleteResumeDocument, extractSourceFallbackDocument, normalizeResumeDocument } from '../services/resumeExtraction.js'
import { candidatesCsv, candidateSummary, rankCandidates, scoreCandidate, weightsFor } from '../../shared/hrScoring.js'

// A resume is a few pages; anything far longer is not a resume and would spend the AI budget for nothing.
const MAX_RESUME_CHARACTERS = 60_000
const STATUS = { invalid: 400, wrong_password: 400, plan_limit: 403, not_found: 404, opening_full: 409, duplicate: 409, closed: 409, exists: 409, too_large: 413 }
const hashOf = value => createHash('sha256').update(String(value ?? '').trim().toLowerCase()).digest('hex')

/**
 * A rate limiter whose counts live in `storeFor(name)` (Firestore by default, so the limit holds across serverless
 * instances; tests pass a function returning undefined for the in-memory store).
 */
function limiter({ name, windowMs, limit, message, keyGenerator, storeFor, failuresOnly = false }) {
  const store = storeFor(name)
  return rateLimit({
    windowMs,
    limit,
    ...(store ? { store } : {}),
    ...(keyGenerator ? { keyGenerator } : {}),
    // Sign-in limits count only failed attempts, so a person signing in often never locks themselves out.
    skipSuccessfulRequests: failuresOnly,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ ok: false, code: 'rate_limited', error: message })
  })
}

function fail(response, error, fallback) {
  if (error instanceof HrStoreError) return response.status(STATUS[error.code] ?? 400).json({ ok: false, code: error.code, error: error.message, ...(error.limit !== undefined ? { limit: error.limit } : {}) })
  console.error(`${fallback}:`, error?.message)
  return response.status(500).json({ ok: false, code: 'server', error: `${fallback}. Please try again.` })
}

/** Daily AI allowance for an HR account: none for demo workspaces (testing and showing the portal). */
export const hrDailyTokens = request => (request.hrUser?.demo ? NO_DAILY_TOKEN_CAP : env.hr.dailyTokens)
export const hrDailyRequests = request => (request.hrUser?.demo ? NO_DAILY_REQUEST_CAP : env.limits.userAiPerDay)

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

/**
 * createHrRouter({ store, auth, read, aiLimits, aiBudget, limits, limitStore, demo, now }). Everything is swappable
 * for tests. limits: { login, loginPerEmail, register, demo } as { windowMs, limit }. limitStore(name) returns the
 * express-rate-limit store for one limiter (Firestore by default; undefined means in memory).
 */
export function createHrRouter({
  store = hrStore,
  auth = createHrAuth(),
  read = readResume,
  // Demo workspaces are for testing and showing the portal, so they have no daily AI allowance (only the per-minute
  // limit, so one tab can't flood the AI provider).
  aiLimits = createUserAiLimits({ perMinute: env.limits.userAiPerMinute, perDay: hrDailyRequests, keyOf: request => request.hrUser.id }),
  aiBudget = createDailyTokenBudget({ keyOf: request => request.hrUser.id, allowance: hrDailyTokens }),
  limits = {},
  limitStore = name => createFirestoreRateLimitStore({ prefix: name }),
  demo = { enabled: env.hr.demoEnabled, fixture: demoFixture, profile: DEMO_PROFILE },
  now = () => Date.now()
} = {}) {
  const router = Router()
  const small = express.json({ limit: '100kb' })
  const documentBody = express.json({ limit: '1mb' })
  const windows = {
    login: { windowMs: 15 * 60_000, limit: 10 },
    loginPerEmail: { windowMs: 60 * 60_000, limit: 20 },
    register: { windowMs: 24 * 60 * 60_000, limit: 5 },
    demo: { windowMs: 60 * 60_000, limit: 5 },
    ...limits
  }

  // Per network address, and per email address (so rotating addresses can't keep guessing one account's password).
  const loginLimiter = limiter({ name: 'hr-login', ...windows.login, storeFor: limitStore, failuresOnly: true, message: 'Too many sign-in attempts. Wait a few minutes and try again.' })
  const loginEmailLimiter = limiter({ name: 'hr-login-email', ...windows.loginPerEmail, storeFor: limitStore, keyGenerator: request => `email:${hashOf(request.body?.email)}`, failuresOnly: true, message: 'Too many sign-in attempts for this account. Wait an hour and try again.' })
  const registerLimiter = limiter({ name: 'hr-register', ...windows.register, storeFor: limitStore, message: 'Too many new accounts from your network today. Try again tomorrow.' })
  const demoLimiter = limiter({ name: 'hr-demo', ...windows.demo, storeFor: limitStore, message: 'Too many demo workspaces from your network. Try again in an hour.' })
  const sessionFor = (account, expiresAt) => auth.issue(account, expiresAt ? { expiresAt } : {})

  // Configured logins (environment) first, then accounts registered through the sign-up form.
  router.post('/auth/login', loginLimiter, small, loginEmailLimiter, async (request, response) => {
    const { email, password } = request.body ?? {}
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) return response.status(400).json({ ok: false, error: 'Enter your work email and password.' })
    try {
      let account = auth.checkCredentials(email, password)
      if (!account && !auth.isConfigured(email)) {
        const normalised = email.trim().toLowerCase()
        const credentials = await store.getCredentials(hrIdFor(normalised))
        if (credentials && verifyPassword(password, credentials)) account = { id: hrIdFor(normalised), email: normalised, profile: null }
      }
      if (!account) return response.status(401).json({ ok: false, error: 'That email and password don’t match an HR account.' })
      const view = await store.ensureAccount(account.id, account.email, account.profile)
      const state = await store.getSessionState(account.id)
      const session = sessionFor({ ...account, sessionVersion: state?.sessionVersion ?? 0 })
      return response.json({ ok: true, token: session.token, expiresAt: session.expiresAt, account: view })
    } catch (error) {
      return fail(response, error, 'Could not open your HR account')
    }
  })

  // Sign-up: person, company and password in one request. Field problems come back per field for the form.
  router.post('/auth/register', registerLimiter, small, async (request, response) => {
    const { value, errors } = checkHrDetails(request.body ?? {}, { withPassword: true })
    if (Object.keys(errors).length) return response.status(400).json({ ok: false, code: 'invalid', error: 'Check the highlighted fields.', fields: errors })
    if (auth.isConfigured(value.email) || value.email === DEMO_EMAIL) return response.status(409).json({ ok: false, code: 'exists', error: 'This email is already an HR account. Sign in instead.', fields: { email: 'Already registered.' } })
    try {
      const id = hrIdFor(value.email)
      const { email, ...details } = value
      const view = await store.registerAccount(id, { email, details, credentials: hashPassword(request.body.password) })
      const session = auth.issue({ id, email })
      return response.status(201).json({ ok: true, token: session.token, expiresAt: session.expiresAt, account: view })
    } catch (error) {
      if (error instanceof HrStoreError && error.code === 'exists') return response.status(409).json({ ok: false, code: 'exists', error: error.message, fields: { email: 'Already registered.' } })
      return fail(response, error, 'Could not create your HR account')
    }
  })

  // "Explore the demo": a private workspace for this visitor alone, with made-up data, deleted after a day.
  // Nobody shares a demo, so nobody can see or change what another visitor uploaded.
  router.post('/auth/demo', demoLimiter, async (_request, response) => {
    if (!demo.enabled) return response.status(404).json({ ok: false, code: 'not_found', error: 'The demo is not available.' })
    try {
      await store.sweepExpiredDemos().catch(error => console.error('Expired demo workspaces could not be removed:', error?.message))
      const id = demoIdFor()
      const expiresAt = now() + HR_DEMO_MS
      const view = await store.createDemoAccount(id, { email: DEMO_EMAIL, profile: demo.profile, fixture: demo.fixture, expiresAt })
      const session = sessionFor({ id, email: DEMO_EMAIL, demo: true, sessionVersion: 0 }, Math.min(expiresAt, now() + HR_SESSION_MS))
      return response.status(201).json({ ok: true, token: session.token, expiresAt: session.expiresAt, account: view })
    } catch (error) {
      return fail(response, error, 'Could not open a demo workspace')
    }
  })

  router.use(auth.requireHr)

  // The token's signature was checked; now check it against the account: it must still exist, the session version
  // must match (signing out or changing the password raises it), and a demo must not have expired.
  router.use(async (request, response, next) => {
    try {
      const state = await store.getSessionState(request.hrUser.id)
      const ended = !state || state.sessionVersion !== request.hrUser.ver || (state.demo && !(state.demoExpiresAt > now()))
      if (ended) return response.status(401).json({ ok: false, code: 'hr_session', error: state?.demo ? 'This demo has ended. Open a new one from the sign-in page.' : 'Your HR session has ended. Sign in again.' })
      request.hrUser.demo = state.demo
      return next()
    } catch (error) {
      return fail(response, error, 'Could not check your HR session')
    }
  })

  // Sign out on every device: older tokens stop working. A demo workspace is deleted outright.
  router.post('/auth/logout', async (request, response) => {
    try {
      if (request.hrUser.demo) await store.deleteAccount(request.hrUser.id)
      else await store.bumpSessionVersion(request.hrUser.id)
      return response.json({ ok: true })
    } catch (error) {
      return fail(response, error, 'Could not sign you out')
    }
  })

  // { currentPassword, newPassword, confirmPassword } → a new session; every other session ends.
  router.put('/account/password', small, async (request, response) => {
    const { currentPassword, newPassword, confirmPassword } = request.body ?? {}
    const errors = checkNewPassword(newPassword, confirmPassword)
    if (typeof currentPassword !== 'string' || !currentPassword) errors.currentPassword = 'Enter your current password.'
    else if (typeof newPassword === 'string' && newPassword === currentPassword) errors.newPassword = 'Choose a password you haven’t used here.'
    if (Object.keys(errors).length) return response.status(400).json({ ok: false, code: 'invalid', error: 'Check the highlighted fields.', fields: errors })
    try {
      const version = await store.replaceCredentials(request.hrUser.id, credentials => verifyPassword(currentPassword, credentials), hashPassword(newPassword))
      const session = sessionFor({ id: request.hrUser.id, email: request.hrUser.email, sessionVersion: version })
      return response.json({ ok: true, token: session.token, expiresAt: session.expiresAt })
    } catch (error) {
      if (error instanceof HrStoreError && error.code === 'wrong_password') return response.status(400).json({ ok: false, code: 'invalid', error: error.message, fields: { currentPassword: error.message } })
      return fail(response, error, 'Could not change your password')
    }
  })

  // Edit the person and company details. The email is the sign-in and stays as it is.
  router.put('/account/details', small, async (request, response) => {
    const { value, errors } = checkHrDetails({ ...(request.body ?? {}), email: request.hrUser.email })
    if (Object.keys(errors).length) return response.status(400).json({ ok: false, code: 'invalid', error: 'Check the highlighted fields.', fields: errors })
    try {
      return response.json({ ok: true, account: await store.updateDetails(request.hrUser.id, value) })
    } catch (error) {
      return fail(response, error, 'Could not save your details')
    }
  })

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

  const rankedFor = async (hrId, opening) => rankCandidates((await store.listCandidates(hrId, opening.id)).map(candidate => candidateSummary(candidate, opening)), weightsFor(opening))
  const countBy = (rows, status) => rows.filter(row => row.status === status).length

  // Openings with their resume counts, best match and decision pipeline, for the overview and the list.
  router.get('/openings', async (request, response) => {
    try {
      const openings = await store.listOpenings(request.hrUser.id)
      const rows = await Promise.all(openings.map(async opening => {
        const ranked = await rankedFor(request.hrUser.id, opening)
        const best = ranked[0]
        // In blind mode the overview doesn't reveal the best candidate's name until HR has decided on them.
        const bestName = !best ? null : opening.blind && best.status === 'new' ? `Candidate ${best.serial}` : best.name
        return {
          ...opening,
          candidateCount: ranked.length,
          bestScore: best?.score ?? null,
          bestCandidate: bestName,
          strongCount: ranked.filter(row => row.band === 'strong').length,
          pipeline: { new: countBy(ranked, 'new'), shortlisted: countBy(ranked, 'shortlisted'), rejected: countBy(ranked, 'rejected') }
        }
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

  // The opening and every resume in it, ranked. Scores are computed here from the current requirements and weights.
  router.get('/openings/:openingId', async (request, response) => {
    try {
      const opening = await store.getOpening(request.hrUser.id, request.params.openingId)
      return response.json({ ok: true, opening, weights: weightsFor(opening), candidates: await rankedFor(request.hrUser.id, opening) })
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

  // Blind mode, custom weights, pass threshold and knockouts, open/closed.
  router.patch('/openings/:openingId/settings', small, async (request, response) => {
    try {
      const opening = await store.updateOpeningSettings(request.hrUser.id, request.params.openingId, request.body ?? {})
      return response.json({ ok: true, opening, weights: weightsFor(opening) })
    } catch (error) {
      return fail(response, error, 'Could not change the opening')
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

  // Shortlisted resumes as CSV, best first. Fetched with the session header, so the browser saves it as a file.
  router.get('/openings/:openingId/export.csv', async (request, response) => {
    try {
      const opening = await store.getOpening(request.hrUser.id, request.params.openingId)
      const shortlisted = (await rankedFor(request.hrUser.id, opening)).filter(row => row.status === 'shortlisted')
      const name = `${opening.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'opening'}-shortlist.csv`
      response.set('Content-Type', 'text/csv; charset=utf-8')
      response.set('Content-Disposition', `attachment; filename="${name}"`)
      return response.send(`﻿${candidatesCsv(shortlisted, weightsFor(opening))}\r\n`)
    } catch (error) {
      return fail(response, error, 'Could not export the shortlist')
    }
  })

  // One resume per request, so the browser can show each file's progress and retry only what failed.
  // Reading a resume calls the AI model: per-account limits and the daily allowance first, then the body, then
  // usage tracking last (body parsing can lose the async context the tracker relies on).
  router.post('/openings/:openingId/candidates', aiLimits, aiBudget, documentBody, trackAiUsageFor(request => request.hrUser.id), async (request, response) => {
    const { fileName, document } = request.body ?? {}
    const source = normalizeResumeDocument(document ?? {})
    if (!source.rawText) return response.status(400).json({ ok: false, code: 'invalid', error: 'No readable text was found in this file.' })
    if (source.rawText.length > MAX_RESUME_CHARACTERS) return response.status(413).json({ ok: false, code: 'too_large', error: 'This file is far longer than a resume.' })
    // The same file text is caught here, before spending the AI budget; the same email is caught after reading.
    const fileHash = createHash('sha256').update(source.rawText.replace(/\s+/g, ' ').trim()).digest('hex')
    try {
      const opening = await store.getOpening(request.hrUser.id, request.params.openingId)
      if (opening.status === 'closed') return fail(response, new HrStoreError('closed', 'This opening is closed. Reopen it to add resumes.'))
      const { resumeLimit } = await store.getAccount(request.hrUser.id)
      if (opening.candidateCount >= resumeLimit) return fail(response, openingFullError(resumeLimit))
      const twin = await store.findDuplicate(request.hrUser.id, opening.id, { fileHash })
      if (twin) return fail(response, new HrStoreError('duplicate', `Already in this opening${twin.resumeData?.fullName ? ` as ${twin.resumeData.fullName}` : ''}.`))
      const { resumeData, parsedBy } = await read(source)
      const candidate = await store.addCandidate(request.hrUser.id, opening.id, { fileName, fileHash, resumeData, parsedBy })
      return response.status(201).json({ ok: true, candidate: candidateSummary(candidate, opening) })
    } catch (error) {
      if (error instanceof AIBusyError) {
        response.set('Retry-After', String(error.retryAfterSeconds))
        return response.status(429).json({ ok: false, code: 'ai_busy', error: 'Waiting for AI reading capacity.', retryAfterSeconds: error.retryAfterSeconds })
      }
      return fail(response, error, 'Could not read this resume')
    }
  })

  // Several resumes at once: { ids, action: 'shortlist' | 'reject' | 'reset' | 'remove', reason? }.
  router.post('/openings/:openingId/candidates/bulk', small, async (request, response) => {
    const { ids, action, reason } = request.body ?? {}
    const valid = Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && HR_DOC_ID.test(id)) : []
    if (!valid.length) return response.status(400).json({ ok: false, code: 'invalid', error: 'Select at least one resume.' })
    const statusFor = { shortlist: 'shortlisted', reject: 'rejected', reset: 'new' }
    try {
      if (action === 'remove') return response.json({ ok: true, ...(await store.deleteCandidates(request.hrUser.id, request.params.openingId, valid)) })
      if (!statusFor[action]) return response.status(400).json({ ok: false, code: 'invalid', error: 'Choose shortlist, reject, reset or remove.' })
      return response.json({ ok: true, ...(await store.decide(request.hrUser.id, request.params.openingId, valid, { status: statusFor[action], reason })) })
    } catch (error) {
      return fail(response, error, 'Could not update these resumes')
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

  // A decision on one resume: { status: 'new' | 'shortlisted' | 'rejected', reason? }.
  router.patch('/openings/:openingId/candidates/:candidateId', small, async (request, response) => {
    try {
      await store.decide(request.hrUser.id, request.params.openingId, [request.params.candidateId], request.body ?? {})
      const opening = await store.getOpening(request.hrUser.id, request.params.openingId)
      return response.json({ ok: true, candidate: candidateSummary(await store.getCandidate(request.hrUser.id, opening.id, request.params.candidateId), opening) })
    } catch (error) {
      return fail(response, error, 'Could not save this decision')
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
