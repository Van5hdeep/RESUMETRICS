import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import aiRoutes from './routes/ai.routes.js'
import { createGitHubRouter } from './routes/github.routes.js'
import resumeRoutes from './routes/resume.routes.js'
import nimbusRoutes from './routes/nimbus.routes.js'
import jdRoutes from './routes/jd.routes.js'
import userRoutes from './routes/user.routes.js'
import jobsRoutes from './routes/jobs.routes.js'
import { createHrRouter } from './routes/hr.routes.js'
import { createRequirePro } from './middleware/requirePro.js'
import { createRequireUser, initializeFirebaseAdmin, requireUser } from './services/firebaseAdmin.js'
import { createIpLimiter, createUserAiLimits } from './middleware/limits.js'
import { securityHeaders } from './middleware/securityHeaders.js'
import { createDailyTokenBudget, createMemoryUsageStore, setUsageStore, trackAiUsage } from './ai/usage.js'
import { aiAllowance } from './ai/allowance.js'
import { createFirestoreUsageStore, createResilientUsageStore } from './ai/usageStore.js'
import { BRAND } from '../shared/brand.js'

// Daily AI usage lives in Firestore (users/{uid}/usage/{day}) so it survives restarts and is shared by every serverless instance.
setUsageStore(createResilientUsageStore(createFirestoreUsageStore(), createMemoryUsageStore()))

const app = express()
app.disable('x-powered-by')
app.use(securityHeaders)
const allowedOrigins = env.webOrigin.split(',').map(origin => origin.trim()).filter(Boolean)
const allowsLocalDevelopment = allowedOrigins.some(origin => {
  try {
    const url = new URL(origin)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
})

function isAllowedOrigin(origin) {
  if (allowedOrigins.includes(origin)) return true
  if (!allowsLocalDevelopment) return false

  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  } catch {
    return false
  }
}

// A page on another site gets no CORS headers (so its browser can't read our answers) and a plain 403, not a 500.
const corsForAllowed = cors()
app.use((request, response, next) => {
  const origin = request.get('origin')
  if (!origin || isAllowedOrigin(origin)) return corsForAllowed(request, response, next)
  return response.status(403).json({ ok: false, code: 'origin', error: `This site is not allowed to call the ${BRAND.name} API.` })
})
// Behind a hosting proxy, rate limits must see the client's address, not the proxy's (RESUMETRICS_TRUST_PROXY hops).
app.set('trust proxy', env.trustProxy)

// Order on AI routes: per-IP limit → sign-in → per-user limits and daily token allowance → JSON body (so refused
// requests are never parsed) → usage tracking (last: body parsing can lose the async context it relies on).
const ipLimiter = createIpLimiter({ perMinute: env.limits.ipPerMinute })
// Free, Pro and Lifetime accounts get different AI allowances (server/ai/allowance.js).
const userAiLimits = createUserAiLimits({ perMinute: request => aiAllowance.perMinute(request), perDay: request => aiAllowance.perDay(request) })
const enforceDailyTokenBudget = createDailyTokenBudget({ allowance: request => aiAllowance.dailyTokens(request) })
// Resume source pages are extracted in the browser and sent with page metadata; the route chunks long text
// for AI processing, so only resume import needs the large body. Everything else stays small.
const smallJson = express.json({ limit: '256kb' })
const documentJson = express.json({ limit: '2mb' })

app.use('/api', ipLimiter)
app.use('/api/ai', aiRoutes)
// The GitHub evidence scan calls the AI model, so it gets the same per-user limits and daily allowance.
app.use('/api/github', smallJson, createGitHubRouter({ aiGuard: [...userAiLimits, enforceDailyTokenBudget, trackAiUsage] }))
// Resume import, NIMBUS and job fixes call the AI model: signed-in users only, within their limits.
app.use('/api/resume', requireUser, userAiLimits, enforceDailyTokenBudget, documentJson, trackAiUsage, resumeRoutes)
app.use('/api/nimbus', requireUser, userAiLimits, enforceDailyTokenBudget, smallJson, trackAiUsage, nimbusRoutes)
// Job tailoring and the job tracker are Pro features (shared/plans.js).
app.use('/api/jd', requireUser, createRequirePro({ feature: 'jobTailoring' }), userAiLimits, enforceDailyTokenBudget, smallJson, trackAiUsage, jdRoutes)
const requireJobsUser = createRequireUser({ signInMessage: `Sign in to ${BRAND.name} to use the job tracker.`, unavailableMessage: 'Sign-in can’t be checked on the server right now. Please try again in a few minutes.' })
app.use('/api/jobs', requireJobsUser, createRequirePro({ feature: 'jobTracker' }), smallJson, jobsRoutes)
// Saved resumes: signed-in users only, scoped to their own uid. Body cap = the 500 KB resume limit plus the request envelope.
app.use('/api/user', express.json({ limit: '600kb' }), userRoutes)
// HR portal: its own email + password session (server/hr/hrAuth.js), separate from candidate Firebase accounts.
app.use('/api/hr', createHrRouter())

// Unknown API paths answer in JSON like every other API error (not Express's HTML page).
app.use('/api', (_request, response) => response.status(404).json({ ok: false, code: 'not_found', error: 'This API route does not exist.' }))

try {
  initializeFirebaseAdmin()
  console.log('Firebase Admin initialized for authenticated integrations.')
} catch {
  console.error('Firebase service account configuration is missing or invalid. AI and GitHub endpoints will refuse requests until it is configured.')
}

app.use((error, _request, response, _next) => {
  if (error?.status >= 400 && error?.status < 500 && error?.type) console.warn('Refused request:', error.type)
  else console.error('Unhandled server error:', error)
  if (error?.type === 'entity.too.large') {
    return response.status(413).json({ ok: false, error: 'This document is too large to send safely. Split it into smaller files and try again.' })
  }
  // A request body that isn't valid JSON is the sender's mistake, not a server fault.
  if (error?.type === 'entity.parse.failed' || error?.type === 'encoding.unsupported' || error?.type === 'charset.unsupported') {
    return response.status(400).json({ ok: false, code: 'invalid', error: 'The request body could not be read. Send valid JSON.' })
  }
  response.status(500).json({ ok: false, error: 'The server could not process this request.' })
})

if (env.ai.provider === 'mock') console.warn('AI provider is MOCK: every AI answer is canned (RESUMETRICS_AI_PROVIDER=mock). Never use this in production.')

// On Vercel the app is exported as a serverless function (api/index.js) instead of listening on a port.
if (!process.env.VERCEL) {
  app.listen(env.port, () => {
    console.log(`${BRAND.name} AI server listening on http://localhost:${env.port}`)
  })
}

export default app
