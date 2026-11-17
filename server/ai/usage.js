import { AsyncLocalStorage } from 'node:async_hooks'
import { env } from '../config/env.js'
import { formatWait } from './providerBudget.js'

// Which signed-in user the current request's AI calls belong to, without passing uids through every engine.
const scope = new AsyncLocalStorage()

/**
 * Express middleware: AI calls made while handling this request count against request.firebaseUser.
 * Mount it last, right before the router: body parsing runs on stream events and can lose async context.
 */
export function trackAiUsage(request, _response, next) {
  scope.run({ uid: request.firebaseUser.uid }, next)
}

/** trackAiUsage for AI spend that belongs to another kind of account (an HR account id). Same mounting rule. */
export const trackAiUsageFor = keyOf => (request, _response, next) => scope.run({ uid: keyOf(request) }, next)

const currentUid = () => scope.getStore()?.uid ?? null

/** The day a usage row belongs to, "YYYY-MM-DD" in the usage time zone (default Asia/Kolkata). */
export function usageDay(now = Date.now(), timeZone = env.usage.timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Seconds until the next usage day starts in that time zone. */
export function secondsUntilNextDay(now = Date.now(), timeZone = env.usage.timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map(part => [part.type, Number(part.value)]))
  return Math.max(1, 86_400 - (parts.hour * 3600 + parts.minute * 60 + parts.second))
}

const EMPTY = Object.freeze({ calls: 0, tokensIn: 0, tokensOut: 0, limitedCalls: 0 })

/**
 * Per-user, per-day AI usage in memory (resets when the server restarts). The running server swaps in the
 * Firestore store (usageStore.js) with this one as the fallback; tests use this one directly.
 */
export function createMemoryUsageStore() {
  const rows = new Map()
  return {
    async get(uid, day) {
      return { ...(rows.get(`${uid}|${day}`) ?? EMPTY) }
    },
    async add(uid, day, delta) {
      const key = `${uid}|${day}`
      const row = { ...(rows.get(key) ?? EMPTY) }
      for (const field of Object.keys(EMPTY)) row[field] += delta[field] ?? 0
      rows.set(key, row)
      // Past days are only needed until the database exists; keep memory bounded.
      if (rows.size > 20_000) for (const old of rows.keys()) if (!old.endsWith(`|${day}`)) rows.delete(old)
      return { ...row }
    }
  }
}

let usageStore = createMemoryUsageStore()
/** Swap the store (tests now, the database later). */
export function setUsageStore(store) { usageStore = store }
export const getUsage = (uid, day = usageDay()) => usageStore.get(uid, day)

const shortUid = uid => `${String(uid).slice(0, 8)}…`

/** Record one model call for the current request's user. Outside a request (npm run ai:ping, evals) it does nothing. */
export async function recordAiCall({ tokensIn = 0, tokensOut = 0 }) {
  const uid = currentUid()
  if (!uid) return null
  const totals = await usageStore.add(uid, usageDay(), { calls: 1, tokensIn, tokensOut })
  const used = totals.tokensIn + totals.tokensOut
  console.log(`[ai usage] ${shortUid(uid)} today: ${totals.calls} calls, ${used.toLocaleString('en-US')} of ${env.usage.userDailyTokens.toLocaleString('en-US')} tokens`)
  return totals
}

/** Count a request refused by a limit, for the given user or the current request's user. */
export async function recordLimited(uid = currentUid()) {
  if (uid) await usageStore.add(uid, usageDay(), { limitedCalls: 1 })
}

/**
 * Express middleware factory: refuses AI requests once the account has used today's token allowance.
 * keyOf(request) names whose usage row counts (the Firebase uid by default, an HR account id for the HR portal).
 */
export function createDailyTokenBudget({ keyOf = request => request.firebaseUser.uid, allowance = () => env.usage.userDailyTokens } = {}) {
  return async function dailyTokenBudget(request, response, next) {
    const uid = keyOf(request)
    const today = await getUsage(uid)
    if (today.tokensIn + today.tokensOut < allowance(request)) return next()
    await recordLimited(uid)
    const seconds = secondsUntilNextDay()
    response.set('Retry-After', String(seconds))
    return response.status(429).json({ ok: false, code: 'ai_allowance', error: `You’ve used today’s AI allowance. It resets in ${formatWait(seconds)}.`, retryAfterSeconds: seconds })
  }
}

/** The candidate app's check (after requireUser). */
export const enforceDailyTokenBudget = createDailyTokenBudget()
