import { FieldValue } from 'firebase-admin/firestore'
import { getConnectionStore } from '../services/firebaseAdmin.js'

// users/{uid}/usage/{YYYY-MM-DD}: { calls, tokensIn, tokensOut, limitedCalls, updatedAt }, one document per user per day.
// Counters use atomic increments, so overlapping requests (or several serverless instances) never lose a count and
// no transaction is needed. Same get/add contract as the in-memory store in usage.js.
const FIELDS = ['calls', 'tokensIn', 'tokensOut', 'limitedCalls']

const rowFrom = data => Object.fromEntries(FIELDS.map(field => [field, Number.isFinite(data?.[field]) ? data[field] : 0]))

export function createFirestoreUsageStore({
  getDb = getConnectionStore,
  increment = amount => FieldValue.increment(amount),
  timestamp = () => FieldValue.serverTimestamp()
} = {}) {
  // HR portal accounts (ids starting "hr_" or "hrdemo_") keep their usage under hrAccounts/{id}; everyone else under users/{uid}.
  const parentFor = uid => getDb().collection(/^hr(demo)?_/.test(uid) ? 'hrAccounts' : 'users').doc(uid)
  const docFor = (uid, day) => parentFor(uid).collection('usage').doc(day)

  async function get(uid, day) {
    return rowFrom((await docFor(uid, day).get()).data())
  }

  async function add(uid, day, delta) {
    const counts = {}
    for (const field of FIELDS) if (delta[field]) counts[field] = increment(delta[field])
    const ref = docFor(uid, day)
    await ref.set({ ...counts, updatedAt: timestamp() }, { merge: true })
    return rowFrom((await ref.get()).data())
  }

  return { get, add }
}

/**
 * Keeps AI requests working when the database can't be reached (Firestore not enabled yet, a brief outage): usage
 * falls back to the fallback store for that call and is logged, at most once a minute. The provider budget and the
 * per-minute limits still protect the model key in the meantime.
 */
export function createResilientUsageStore(primary, fallback, { now = Date.now } = {}) {
  let lastLogged = 0
  const guard = async (method, args) => {
    try {
      return await primary[method](...args)
    } catch (error) {
      if (now() - lastLogged > 60_000) {
        lastLogged = now()
        console.error('AI usage store unavailable, using in-memory counts for now:', error?.message)
      }
      return fallback[method](...args)
    }
  }
  return { get: (...args) => guard('get', args), add: (...args) => guard('add', args) }
}
