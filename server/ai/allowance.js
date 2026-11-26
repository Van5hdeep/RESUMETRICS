import { env } from '../config/env.js'
import { isProPlan } from '../../shared/plans.js'
import { userStore } from '../db/userStore.js'

const CACHE_MS = 60_000

/** 'free' | 'pro' | 'lifetime' for a users/{uid}.plan value. Lifetime covers the developer accounts too. */
export function tierOf(plan, now = Date.now()) {
  if (!isProPlan(plan, now)) return 'free'
  return plan.term === 'lifetime' ? 'lifetime' : 'pro'
}

/** What each tier may use per minute, per day (AI requests) and per day (tokens). */
export function allowanceFor(tier, config = env) {
  if (tier === 'pro') return config.allowances.pro
  if (tier === 'lifetime') return config.allowances.lifetime
  return { perMinute: config.limits.userAiPerMinute, perDay: config.limits.userAiPerDay, dailyTokens: config.usage.userDailyTokens }
}

/**
 * Looks up a signed-in user's AI allowance from their plan. The plan is remembered for a minute per server
 * process, because every AI request asks. If the plan can't be read the account gets the Free allowance, so a
 * database hiccup never gives anyone more than they paid for and never blocks them outright.
 */
export function createAllowanceResolver({ users = userStore, config = env, now = () => Date.now() } = {}) {
  const cache = new Map()   // uid -> { tier, at }
  const tierFor = async uid => {
    if (!uid) return 'free'
    const cached = cache.get(uid)
    if (cached && now() - cached.at < CACHE_MS) return cached.tier
    let tier = 'free'
    try {
      tier = tierOf(await users.getPlan(uid), now())
    } catch (error) {
      console.error('AI allowance could not read the plan:', error?.message)
      return 'free'
    }
    cache.set(uid, { tier, at: now() })
    if (cache.size > 10_000) for (const [old, entry] of cache) if (now() - entry.at >= CACHE_MS) cache.delete(old)
    return tier
  }
  const forRequest = async request => {
    const tier = await tierFor(request.firebaseUser?.uid)
    return { tier, ...allowanceFor(tier, config) }
  }
  return {
    tierFor,
    forRequest,
    perMinute: async request => (await forRequest(request)).perMinute,
    perDay: async request => (await forRequest(request)).perDay,
    dailyTokens: async request => (await forRequest(request)).dailyTokens
  }
}

/** The resolver the running server uses. */
export const aiAllowance = createAllowanceResolver()
