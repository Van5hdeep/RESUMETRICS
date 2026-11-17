import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { secretFor } from '../config/secrets.js'

// The GitHub connection `state` is signed rather than kept in server memory: on serverless hosting the request
// that starts a connection and the one that finishes it usually run on different instances. The state names the
// Resumetrics user and expires after ten minutes; it also travels in an HTTP-only cookie, and both must match.
const stateTtlMs = 10 * 60 * 1000
export const githubConnectionStateTtlMs = stateTtlMs
const MAX_STATE_LENGTH = 512

export function createGitHubStateCodec({ secret = () => secretFor('github-connection-state'), now = () => Date.now() } = {}) {
  const sign = payload => createHmac('sha256', secret()).update(payload).digest('base64url')

  /** A fresh state for this user, optionally carrying the installation GitHub just reported (still to be verified). */
  function create(firebaseUid, { installationId = '' } = {}) {
    const inst = typeof installationId === 'string' && /^\d{1,20}$/.test(installationId) ? installationId : ''
    const payload = Buffer.from(JSON.stringify({ uid: firebaseUid, exp: now() + stateTtlMs, n: randomBytes(12).toString('base64url'), ...(inst ? { inst } : {}) })).toString('base64url')
    return `${payload}.${sign(payload)}`
  }

  /** → { firebaseUid, installationId } for a genuine, unexpired state, else null. */
  function verify(state) {
    if (typeof state !== 'string' || state.length > MAX_STATE_LENGTH) return null
    const [payload, signature, extra] = state.split('.')
    if (!payload || !signature || extra !== undefined) return null
    const expected = Buffer.from(sign(payload))
    const given = Buffer.from(signature)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      if (typeof data.uid !== 'string' || !data.uid || !(data.exp > now())) return null
      return { firebaseUid: data.uid, installationId: typeof data.inst === 'string' ? data.inst : '' }
    } catch {
      return null
    }
  }

  return { create, verify }
}

const codec = createGitHubStateCodec()
export const createGitHubConnectionState = (firebaseUid, options) => codec.create(firebaseUid, options)
export const verifyGitHubConnectionState = state => codec.verify(state)
