import { createHash } from 'node:crypto'
import { getConnectionStore } from '../services/firebaseAdmin.js'

/**
 * An express-rate-limit store that keeps counts in Firestore (rateLimits/{prefix}_{hash of key}), so a limit holds
 * across every serverless instance instead of restarting on each one. Used only for low-volume, high-value limits
 * (HR sign-in, sign-up, demo workspaces); the per-request flood limits stay in memory, where they are cheap.
 * Keys (IP addresses, emails) are stored only as hashes. If Firestore can't be reached, the count falls back to
 * this instance's memory for that request, so the limit weakens but never fails open entirely.
 */
export function createFirestoreRateLimitStore({ prefix, getDb = getConnectionStore, now = () => Date.now() } = {}) {
  if (!prefix || !/^[a-z0-9-]+$/.test(prefix)) throw new Error('A rate-limit store needs a lowercase prefix.')
  let windowMs = 60_000
  let lastLogged = 0
  const memory = new Map()
  const docId = key => `${prefix}_${createHash('sha256').update(String(key)).digest('hex').slice(0, 40)}`
  const refOf = key => getDb().collection('rateLimits').doc(docId(key))

  const fallback = (key, error) => {
    if (now() - lastLogged > 60_000) {
      lastLogged = now()
      console.error(`Rate limit store (${prefix}) unavailable, counting in memory for now:`, error?.message)
    }
    const current = memory.get(key)
    const fresh = !current || current.resetAt <= now()
    const entry = fresh ? { hits: 1, resetAt: now() + windowMs } : { hits: current.hits + 1, resetAt: current.resetAt }
    memory.set(key, entry)
    if (memory.size > 10_000) for (const [old, value] of memory) if (value.resetAt <= now()) memory.delete(old)
    return { totalHits: entry.hits, resetTime: new Date(entry.resetAt) }
  }

  return {
    localKeys: false,
    prefix,
    init(options) {
      windowMs = options.windowMs
    },
    async increment(key) {
      try {
        const ref = refOf(key)
        return await getDb().runTransaction(async transaction => {
          const snapshot = await transaction.get(ref)
          const data = snapshot.exists ? snapshot.data() : null
          const at = now()
          const fresh = !data || !(Number(data.resetAt) > at)
          const hits = fresh ? 1 : Number(data.hits || 0) + 1
          const resetAt = fresh ? at + windowMs : Number(data.resetAt)
          // expireAt lets a Firestore TTL policy on rateLimits.expireAt clean old rows (optional).
          transaction.set(ref, { hits, resetAt, expireAt: new Date(resetAt) })
          return { totalHits: hits, resetTime: new Date(resetAt) }
        })
      } catch (error) {
        return fallback(key, error)
      }
    },
    async decrement(key) {
      try {
        const ref = refOf(key)
        await getDb().runTransaction(async transaction => {
          const snapshot = await transaction.get(ref)
          if (!snapshot.exists) return
          const data = snapshot.data()
          transaction.set(ref, { ...data, hits: Math.max(0, Number(data.hits || 0) - 1) })
        })
      } catch {
        const current = memory.get(key)
        if (current) current.hits = Math.max(0, current.hits - 1)
      }
    },
    async resetKey(key) {
      memory.delete(key)
      try { await refOf(key).delete() } catch { /* nothing stored */ }
    }
  }
}
