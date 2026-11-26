// Plans, prices and limits: one definition for the pricing page (src/plan/PlanPage.jsx) and the server checks
// (server/db/resumeStore.js, server/middleware/requirePro.js). Prices are in rupees and include GST.

export const PRICES = Object.freeze({ monthly: 299, yearly: 2399, lifetime: 4999 })

/** Yearly against twelve monthly payments, as a whole percent (33). */
export const YEARLY_SAVING_PERCENT = Math.round((1 - PRICES.yearly / (PRICES.monthly * 12)) * 100)

/** Resumes a free account can create. Deleting one gives the slot back only when it was under COUNTED_DELETE_PERCENT complete. */
export const FREE_RESUME_LIMIT = 2
export const COUNTED_DELETE_PERCENT = 75

export const PRO_FEATURES = Object.freeze({
  jobTailoring: 'Job tailoring',
  jobTracker: 'Job tracker',
  // Guided NIMBUS tools (server/routes/nimbus.routes.js PRO_FEATURES); free-form NIMBUS stays free with a daily cap.
  nimbusPro: 'NIMBUS Pro tools'
})

/**
 * users/{uid}.plan = { tier: 'free' | 'pro', status: 'active' | ..., term: 'monthly' | 'yearly' | 'lifetime', source, currentPeriodEnd }.
 * Pro needs an active status; a monthly or yearly plan also stops at currentPeriodEnd (lifetime has none).
 */
export function isProPlan(plan, now = Date.now()) {
  if (!plan || plan.tier !== 'pro' || plan.status !== 'active') return false
  if (!plan.currentPeriodEnd) return true
  const end = Date.parse(plan.currentPeriodEnd)
  return Number.isFinite(end) && end > now
}

/** "2,399" — Indian digit grouping. */
export const formatRupees = amount => Number(amount).toLocaleString('en-IN')
