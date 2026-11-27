import { isProPlan, PRO_FEATURES } from '../../shared/plans.js'
import { userStore } from '../db/userStore.js'
import { BRAND } from '../../shared/brand.js'

const CACHE_MS = 60_000

/**
 * After requireUser: lets Pro accounts through and answers 403 { code: 'pro_required' } otherwise. The plan is
 * remembered for a minute per server process, because these routes are called often and the plan rarely changes.
 */
export function createRequirePro({ feature, users = userStore, now = () => Date.now() } = {}) {
  const cache = new Map()   // uid -> { plan, at }
  const name = PRO_FEATURES[feature] ?? 'This feature'
  return async function requirePro(request, response, next) {
    const uid = request.firebaseUser?.uid
    if (!uid) return response.status(401).json({ ok: false, error: 'Sign in to continue.' })
    try {
      let entry = cache.get(uid)
      if (!entry || now() - entry.at > CACHE_MS) {
        entry = { plan: await users.getPlan(uid), at: now() }
        cache.set(uid, entry)
      }
      if (isProPlan(entry.plan, now())) return next()
      return response.status(403).json({ ok: false, code: 'pro_required', feature, error: `${name} is part of ${BRAND.pro}.` })
    } catch (error) {
      console.error('Could not check the plan:', error?.message)
      return response.status(503).json({ ok: false, error: 'Your plan could not be checked. Please try again.' })
    }
  }
}
