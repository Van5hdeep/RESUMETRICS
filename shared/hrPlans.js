// HR portal plans: one definition for the portal's plan page (src/hr/HrPlan.jsx) and the server check
// (server/db/hrStore.js). Prices are in rupees, GST included. They are placeholders until payments are wired.

export const HR_PRICES = Object.freeze({ monthly: 999, yearly: 9599 })

/** Yearly against twelve monthly payments, as a whole percent. */
export const HR_YEARLY_SAVING_PERCENT = Math.round((1 - HR_PRICES.yearly / (HR_PRICES.monthly * 12)) * 100)

/** Job openings a free HR account can create in its lifetime (deleting one does not give the slot back). */
export const HR_FREE_OPENING_LIMIT = 2

/** Resumes one opening can hold, on every plan: keeps the AI reading budget bounded. */
export const HR_RESUMES_PER_OPENING = 50

/**
 * hrAccounts/{hrId}.plan = { tier: 'free' | 'pro', status: 'active' | ..., term: 'monthly' | 'yearly', currentPeriodEnd }.
 * Pro needs an active status and, when it has one, a period end in the future.
 */
export function isHrPro(plan, now = Date.now()) {
  if (!plan || plan.tier !== 'pro' || plan.status !== 'active') return false
  if (!plan.currentPeriodEnd) return true
  const end = Date.parse(plan.currentPeriodEnd)
  return Number.isFinite(end) && end > now
}

/** Openings this account may still create: a number, or Infinity on Pro. */
export function openingsLeft(plan, openingsCreated, now = Date.now()) {
  if (isHrPro(plan, now)) return Infinity
  return Math.max(0, HR_FREE_OPENING_LIMIT - (Number(openingsCreated) || 0))
}
