import { rateLimit } from 'express-rate-limit'
import { formatWait } from '../ai/providerBudget.js'
import { recordLimited } from '../ai/usage.js'

const MINUTE = 60_000
const DAY = 86_400_000

// One JSON shape for every refusal, plus Retry-After so clients and proxies know when to come back.
function refuse(message) {
  return (request, response) => {
    const resetAt = request.rateLimit?.resetTime?.getTime?.() ?? Date.now() + MINUTE
    const seconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
    // Per-user refusals show up in that user's usage row (the IP limiter runs before sign-in, so no uid).
    if (request.firebaseUser?.uid) recordLimited(request.firebaseUser.uid).catch(() => {})
    response.set('Retry-After', String(seconds))
    response.status(429).json({ ok: false, error: message(formatWait(seconds)), retryAfterSeconds: seconds })
  }
}

/** Per network address, before sign-in is checked, on every /api route: stops floods cheaply. */
export function createIpLimiter({ perMinute }) {
  return rateLimit({
    windowMs: MINUTE,
    limit: perMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: refuse(wait => `Too many requests from your network. Try again in ${wait}.`)
  })
}

/**
 * Per signed-in user, shared by all AI routes (resume import, NIMBUS, job fixes). Mount after requireUser.
 * Keyed by Firebase uid (or `keyOf`, e.g. the HR account) rather than IP, because a whole campus can share one
 * address. In memory: resets on restart.
 */
export function createUserAiLimits({ perMinute, perDay, keyOf = request => request.firebaseUser.uid }) {
  const byUser = keyOf
  return [
    rateLimit({
      windowMs: MINUTE,
      limit: perMinute,
      keyGenerator: byUser,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: refuse(wait => `You’re sending AI requests too quickly. Try again in ${wait}.`)
    }),
    rateLimit({
      windowMs: DAY,
      limit: perDay,
      keyGenerator: byUser,
      standardHeaders: false,
      legacyHeaders: false,
      handler: refuse(wait => `You’ve used today’s ${perDay} AI actions. More are available in ${wait}.`)
    })
  ]
}
