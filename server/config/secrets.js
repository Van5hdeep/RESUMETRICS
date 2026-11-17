import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { env } from './env.js'

export class SecretConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SecretConfigurationError'
  }
}

/** True on a hosted deployment (Vercel sets VERCEL; other hosts set NODE_ENV=production). */
export const isProduction = (source = process.env) => Boolean(source.VERCEL) || source.NODE_ENV === 'production'

let cachedRoot = null

/**
 * The key every signed value on this server (HR sessions, GitHub connection state) is derived from.
 * RESUMETRICS_SESSION_SECRET is preferred (RESUMETRICS_HR_SESSION_SECRET is still read for older setups). Without it,
 * the key is derived from the Firebase service account, which every serverless instance shares. A local run with
 * neither gets a random key (sessions end on restart); a production run with neither refuses to sign anything.
 */
function firebaseKeyMaterial() {
  if (env.firebase.serviceAccountJson) return env.firebase.serviceAccountJson
  if (!env.firebase.serviceAccountPath) return ''
  const path = resolve(env.firebase.serviceAccountPath)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

export function rootSecret(source = process.env, readMaterial = firebaseKeyMaterial) {
  if (cachedRoot && source === process.env) return cachedRoot
  const configured = source.RESUMETRICS_SESSION_SECRET?.trim() || source.RESUMETRICS_HR_SESSION_SECRET?.trim()
  let root = configured || ''
  if (!root) {
    const material = readMaterial()
    if (material) root = createHash('sha256').update(`resumetrics-root\n${material}`).digest('hex')
  }
  if (!root) {
    if (isProduction(source)) throw new SecretConfigurationError('RESUMETRICS_SESSION_SECRET is not set. Sessions cannot be signed.')
    root = randomBytes(32).toString('hex')
  }
  if (source === process.env) cachedRoot = root
  return root
}

/** A separate key per purpose, so a value signed for one use is never accepted by another. */
export const secretFor = (purpose, source = process.env) => createHash('sha256').update(`${purpose}\n${rootSecret(source)}`).digest('hex')
