import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import aiRoutes from './routes/ai.routes.js'
import githubRoutes from './routes/github.routes.js'
import resumeRoutes from './routes/resume.routes.js'
import nimbusRoutes from './routes/nimbus.routes.js'
import jdRoutes from './routes/jd.routes.js'
import userRoutes from './routes/user.routes.js'
import jobsRoutes from './routes/jobs.routes.js'
import { createHrRouter } from './routes/hr.routes.js'
import { createRequirePro } from './middleware/requirePro.js'
import { initializeFirebaseAdmin, requireUser } from './services/firebaseAdmin.js'
import { createIpLimiter, createUserAiLimits } from './middleware/limits.js'
import { createMemoryUsageStore, enforceDailyTokenBudget, setUsageStore, trackAiUsage } from './ai/usage.js'
import { createFirestoreUsageStore, createResilientUsageStore } from './ai/usageStore.js'

// Daily AI usage lives in Firestore (users/{uid}/usage/{day}) so it survives restarts and is shared by every serverless instance.
setUsageStore(createResilientUsageStore(createFirestoreUsageStore(), createMemoryUsageStore()))

const app = express()
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

app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) return callback(null, true)
    return callback(new Error('Origin is not allowed by CORS.'))
  }
}))
// Behind a hosting proxy, rate limits must see the client's address, not the proxy's (RESUMETRICS_TRUST_PROXY hops).
app.set('trust proxy', env.trustProxy)

// Order on AI routes: per-IP limit → sign-in → per-user limits and daily token allowance → JSON body (so refused
// requests are never parsed) → usage tracking (last: body parsing can lose the async context it relies on).
const ipLimiter = createIpLimiter({ perMinute: env.limits.ipPerMinute })
const userAiLimits = createUserAiLimits({ perMinute: env.limits.userAiPerMinute, perDay: env.limits.userAiPerDay })
// Resume source pages are extracted in the browser and sent with page metadata; the route chunks long text
// for AI processing, so only resume import needs the large body. Everything else stays small.
const smallJson = express.json({ limit: '256kb' })
const documentJson = express.json({ limit: '2mb' })

app.use('/api', ipLimiter)
app.use('/api/ai', aiRoutes)
app.use('/api/github', smallJson, githubRoutes)
// Resume import, NIMBUS and job fixes call the AI model: signed-in users only, within their limits.
app.use('/api/resume', requireUser, userAiLimits, enforceDailyTokenBudget, documentJson, trackAiUsage, resumeRoutes)
app.use('/api/nimbus', requireUser, userAiLimits, enforceDailyTokenBudget, smallJson, trackAiUsage, nimbusRoutes)
// Job tailoring and the job tracker are Pro features (shared/plans.js).
app.use('/api/jd', requireUser, createRequirePro({ feature: 'jobTailoring' }), userAiLimits, enforceDailyTokenBudget, smallJson, trackAiUsage, jdRoutes)
app.use('/api/jobs', requireUser, createRequirePro({ feature: 'jobTracker' }), smallJson, jobsRoutes)
// Saved resumes: signed-in users only, scoped to their own uid. Body cap = the 500 KB resume limit plus the request envelope.
app.use('/api/user', express.json({ limit: '600kb' }), userRoutes)
// HR portal: its own email + password session (server/hr/hrAuth.js), separate from candidate Firebase accounts.
app.use('/api/hr', createHrRouter())

try {
  initializeFirebaseAdmin()
  console.log('Firebase Admin initialized for authenticated integrations.')
} catch {
  console.error('Firebase service account configuration is missing or invalid. AI and GitHub endpoints will refuse requests until it is configured.')
}

app.use((error, _request, response, _next) => {
  console.error('Unhandled server error:', error)
  if (error?.type === 'entity.too.large') {
    return response.status(413).json({ ok: false, error: 'This document is too large to send safely. Split it into smaller files and try again.' })
  }
  response.status(500).json({ ok: false, error: 'The server could not process this request.' })
})

if (env.ai.provider === 'mock') console.warn('AI provider is MOCK: every AI answer is canned (RESUMETRICS_AI_PROVIDER=mock). Never use this in production.')

// On Vercel the app is exported as a serverless function (api/index.js) instead of listening on a port.
if (!process.env.VERCEL) {
  app.listen(env.port, () => {
    console.log(`Resumetrics AI server listening on http://localhost:${env.port}`)
  })
}

export default app
