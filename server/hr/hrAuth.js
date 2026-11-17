// HR portal sign-in: email + password checked by this server (not Firebase), and a signed session token.
// Firebase Auth refuses passwords shorter than six characters, and HR accounts are separate from candidate
// accounts anyway, so the portal has its own small session scheme.
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { secretFor } from '../config/secrets.js'

export const HR_SESSION_MS = 12 * 60 * 60 * 1000
/** How long a demo workspace lives before it (and its session) ends. */
export const HR_DEMO_MS = 24 * 60 * 60 * 1000

/** The address every demo workspace signs in as. The .example domain is reserved: no real mailbox can own it. */
export const DEMO_EMAIL = 'demo@resumetrics.example'

/**
 * The made-up person and company a demo workspace shows (server/hr/demoSandbox.js). Every company detail is
 * fictional: the website uses the reserved .example domain and the CIN only has the right shape, it belongs to no
 * real business.
 */
export const DEMO_PROFILE = Object.freeze({
  fullName: 'Vanshdeep Mishra',
  phone: '+91 90000 12345',
  jobTitle: 'Talent Acquisition Lead',
  companyName: 'Resumetrics Demo Pvt. Ltd.',
  website: 'https://demo.resumetrics.example',
  industry: 'Information Technology',
  companySize: '11–50',
  city: 'Pune',
  country: 'India',
  registrationType: 'cin',
  registrationNumber: 'U72900MH2024PTC000001',
  verification: 'verified',
  demo: true
})

// Longer inputs are refused before hashing, so a huge password can't tie up the CPU.
const MAX_PASSWORD_LENGTH = 256
const MAX_AUTH_HEADER_LENGTH = 4096

const normaliseEmail = value => String(value ?? '').trim().toLowerCase()
const emailKey = value => createHash('sha256').update(normaliseEmail(value)).digest()
// Passwords use scrypt (a deliberately slow, salted key-derivation function), never a plain fast hash.
const passwordKey = (password, salt) => scryptSync(String(password), salt, 32)

/** A registered password as { salt, hash } (hex), for hrAccounts/{hrId}.credentials. The password itself is never stored. */
export function hashPassword(password) {
  const salt = randomBytes(16)
  return { salt: salt.toString('hex'), hash: passwordKey(password, salt).toString('hex'), algorithm: 'scrypt' }
}

/** Constant-time check of a password against stored { salt, hash }. */
export function verifyPassword(password, credentials) {
  const given = String(password ?? '')
  if (!credentials?.salt || !credentials?.hash || given.length > MAX_PASSWORD_LENGTH) return false
  const expected = Buffer.from(credentials.hash, 'hex')
  const actual = passwordKey(given, Buffer.from(credentials.salt, 'hex'))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** "Bearer <token>" → "<token>", without a regular expression (no backtracking on crafted headers). */
export function bearerToken(header) {
  const value = String(header ?? '')
  if (value.length > MAX_AUTH_HEADER_LENGTH || value.slice(0, 7).toLowerCase() !== 'bearer ') return ''
  return value.slice(7).trim()
}

/** Stable account id for an email: Firestore-safe and does not expose the address in paths. */
export const hrIdFor = email => `hr_${createHash('sha256').update(normaliseEmail(email)).digest('hex').slice(0, 24)}`

/** A fresh, unguessable id for one demo workspace. */
export const demoIdFor = () => `hrdemo_${randomBytes(12).toString('hex')}`

/**
 * Logins whose password lives in the environment (RESUMETRICS_HR_EMAIL + RESUMETRICS_HR_PASSWORD), if any.
 * There is no built-in password: visitors try the portal through a private demo workspace instead.
 */
export function configuredHrAccounts(source = process.env) {
  const email = normaliseEmail(source.RESUMETRICS_HR_EMAIL)
  const password = String(source.RESUMETRICS_HR_PASSWORD ?? '')
  return email && password ? [{ email, password }] : []
}

const toBase64Url = value => Buffer.from(value).toString('base64url')

/**
 * createHrAuth({ accounts, secret, now }) → { checkCredentials, isConfigured, issue, verify, requireHr }.
 * Everything is swappable for tests. `secret` is a string or a function read when first needed, so a production
 * server without a secret refuses HR requests instead of failing to start.
 */
export function createHrAuth({ accounts = configuredHrAccounts(), secret = () => secretFor('hr-session'), now = () => Date.now() } = {}) {
  let key = typeof secret === 'string' ? secret : null
  const sign = payload => createHmac('sha256', key ??= secret()).update(payload).digest('base64url')
  // Each configured password is kept only as a salted scrypt key; the plain text is not held after this.
  const stored = accounts.map(account => {
    const salt = randomBytes(16)
    return { email: normaliseEmail(account.email), emailKey: emailKey(account.email), salt, passwordKey: passwordKey(account.password, salt), profile: account.profile ?? null }
  })

  /** → { id, email } or null. Every account is checked in constant time, so timing says nothing about either field. */
  function checkCredentials(email, password) {
    const given = String(password ?? '')
    if (given.length > MAX_PASSWORD_LENGTH) return null
    const wantedEmail = emailKey(email)
    let match = null
    for (const account of stored) {
      const emailOk = timingSafeEqual(account.emailKey, wantedEmail)
      const passwordOk = timingSafeEqual(account.passwordKey, passwordKey(given, account.salt))
      if (emailOk && passwordOk) match = account
    }
    return match ? { id: hrIdFor(match.email), email: match.email, profile: match.profile } : null
  }

  /**
   * A session token. `ver` is the account's session version: signing out or changing the password raises it, which
   * ends every token issued before (checked against the account on each request, see hr.routes.js).
   */
  function issue(account, { expiresAt = now() + HR_SESSION_MS } = {}) {
    const ver = Number.isInteger(account.sessionVersion) ? account.sessionVersion : 0
    const payload = toBase64Url(JSON.stringify({ sub: account.id, email: account.email, ver, ...(account.demo ? { demo: true } : {}), exp: expiresAt }))
    return { token: `${payload}.${sign(payload)}`, expiresAt }
  }

  /** → { id, email, ver, demo } or null for a missing, forged or expired token. */
  function verify(token) {
    const [payload, signature, extra] = String(token ?? '').split('.')
    if (!payload || !signature || extra !== undefined) return null
    const expected = Buffer.from(sign(payload))
    const given = Buffer.from(signature)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      if (typeof data.sub !== 'string' || typeof data.email !== 'string' || !(data.exp > now())) return null
      return { id: data.sub, email: data.email, ver: Number.isInteger(data.ver) ? data.ver : 0, demo: data.demo === true }
    } catch {
      return null
    }
  }

  /** Checks the token's signature and expiry. The router then checks it against the account (session version). */
  function requireHr(request, response, next) {
    let account = null
    try {
      const token = bearerToken(request.get('authorization'))
      account = token ? verify(token) : null
    } catch (error) {
      console.error('HR session check failed:', error?.message)
      return response.status(503).json({ ok: false, code: 'unavailable', error: 'Sign-in is not configured on the server yet.' })
    }
    if (!account) return response.status(401).json({ ok: false, code: 'hr_session', error: 'Your HR session has ended. Sign in again.' })
    request.hrUser = account
    return next()
  }

  /** True for the configured logins (their password lives in the environment, not in Firestore). */
  const isConfigured = email => stored.some(account => account.email === normaliseEmail(email))

  return { checkCredentials, isConfigured, issue, verify, requireHr }
}
