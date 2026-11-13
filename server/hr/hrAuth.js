// HR portal sign-in: email + password checked by this server (not Firebase), and a signed session token.
// Firebase Auth refuses passwords shorter than six characters, and HR accounts are separate from candidate
// accounts anyway, so the portal has its own small session scheme.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { env } from '../config/env.js'

export const HR_SESSION_MS = 12 * 60 * 60 * 1000
const DEMO = Object.freeze({ email: 'abc@gmail.com', password: '12345' })

const normaliseEmail = value => String(value ?? '').trim().toLowerCase()
const digest = value => createHash('sha256').update(String(value)).digest()

/** Stable account id for an email: Firestore-safe and does not expose the address in paths. */
export const hrIdFor = email => `hr_${createHash('sha256').update(normaliseEmail(email)).digest('hex').slice(0, 24)}`

/** The accounts allowed to sign in. Today one, from the environment, else the demo pair. */
export function configuredHrAccounts(source = process.env) {
  const email = normaliseEmail(source.RESUMETRICS_HR_EMAIL)
  const password = String(source.RESUMETRICS_HR_PASSWORD ?? '')
  if (email && password) return [{ email, password }]
  return [{ ...DEMO, demo: true }]
}

function defaultSecret() {
  const configured = process.env.RESUMETRICS_HR_SESSION_SECRET?.trim()
  if (configured) return configured
  // Derive from the Firebase key already on the server, so every serverless instance agrees without new setup.
  let material = env.firebase.serviceAccountJson
  if (!material && env.firebase.serviceAccountPath) {
    const path = resolve(env.firebase.serviceAccountPath)
    if (existsSync(path)) material = readFileSync(path, 'utf8')
  }
  return material ? createHash('sha256').update(`resumetrics-hr-session\n${material}`).digest('hex') : randomBytes(32).toString('hex')
}

const toBase64Url = value => Buffer.from(value).toString('base64url')

/**
 * createHrAuth({ accounts, secret, now }) → { checkCredentials, issue, verify, requireHr }.
 * Everything is swappable for tests.
 */
export function createHrAuth({ accounts = configuredHrAccounts(), secret = defaultSecret(), now = () => Date.now() } = {}) {
  if (accounts.some(account => account.demo)) console.warn('HR portal is using the demo sign-in (abc@gmail.com). Set RESUMETRICS_HR_EMAIL and RESUMETRICS_HR_PASSWORD to replace it.')
  const sign = payload => createHmac('sha256', secret).update(payload).digest('base64url')

  /** → { id, email } or null. Compares digests in constant time so the timing says nothing about the password. */
  function checkCredentials(email, password) {
    const wantedEmail = normaliseEmail(email)
    let match = null
    for (const account of accounts) {
      const emailOk = timingSafeEqual(digest(account.email), digest(wantedEmail))
      const passwordOk = timingSafeEqual(digest(account.password), digest(String(password ?? '')))
      if (emailOk && passwordOk) match = account
    }
    return match ? { id: hrIdFor(match.email), email: match.email } : null
  }

  function issue(account) {
    const expiresAt = now() + HR_SESSION_MS
    const payload = toBase64Url(JSON.stringify({ sub: account.id, email: account.email, exp: expiresAt }))
    return { token: `${payload}.${sign(payload)}`, expiresAt }
  }

  /** → { id, email } or null for a missing, forged or expired token. */
  function verify(token) {
    const [payload, signature, extra] = String(token ?? '').split('.')
    if (!payload || !signature || extra !== undefined) return null
    const expected = Buffer.from(sign(payload))
    const given = Buffer.from(signature)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      if (typeof data.sub !== 'string' || typeof data.email !== 'string' || !(data.exp > now())) return null
      return { id: data.sub, email: data.email }
    } catch {
      return null
    }
  }

  function requireHr(request, response, next) {
    const match = (request.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)
    const account = match ? verify(match[1]) : null
    if (!account) return response.status(401).json({ ok: false, code: 'hr_session', error: 'Your HR session has ended. Sign in again.' })
    request.hrUser = account
    return next()
  }

  return { checkCredentials, issue, verify, requireHr }
}
