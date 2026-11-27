import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { env } from '../config/env.js'
import { bearerToken } from './bearer.js'
import { BRAND } from '../../shared/brand.js'

export class FirebaseServerConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'FirebaseServerConfigurationError'
  }
}

let firebaseAdminApp

export function initializeFirebaseAdmin() {
  if (firebaseAdminApp) return firebaseAdminApp
  let serviceAccount
  if (env.firebase.serviceAccountJson) {
    try {
      serviceAccount = JSON.parse(env.firebase.serviceAccountJson)
    } catch {
      throw new FirebaseServerConfigurationError('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.')
    }
  } else {
    if (!env.firebase.serviceAccountPath) {
      throw new FirebaseServerConfigurationError(
        'Firebase service account configuration is missing or invalid. Set FIREBASE_SERVICE_ACCOUNT_PATH, GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON in server/.env.local.'
      )
    }

    const serviceAccountPath = resolve(env.firebase.serviceAccountPath)
    if (!existsSync(serviceAccountPath)) {
      throw new FirebaseServerConfigurationError('The Firebase service account file could not be found.')
    }

    try {
      serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
    } catch {
      throw new FirebaseServerConfigurationError('The Firebase service account file is not valid JSON.')
    }
  }

  firebaseAdminApp = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert(serviceAccount) })
  return firebaseAdminApp
}

export async function verifyFirebaseIdToken(idToken) {
  return getAuth(initializeFirebaseAdmin()).verifyIdToken(idToken)
}

export function getConnectionStore() {
  return getFirestore(initializeFirebaseAdmin())
}

/**
 * Express middleware: verifies the Firebase ID token in `Authorization: Bearer …` and sets request.firebaseUser.
 * Each route group passes its own messages so the person knows what needs signing in. `verify` is swappable for tests.
 */
export function createRequireUser({ signInMessage, unavailableMessage, verify = verifyFirebaseIdToken }) {
  return async function requireUser(request, response, next) {
    const token = bearerToken(request.get('authorization'))
    if (!token) return response.status(401).json({ ok: false, error: signInMessage })

    try {
      request.firebaseUser = await verify(token)
      return next()
    } catch (error) {
      if (error instanceof FirebaseServerConfigurationError) {
        console.error('Firebase Admin configuration error:', error.message)
        return response.status(503).json({ ok: false, error: unavailableMessage })
      }
      console.error('Firebase token verification failed:', error?.code ?? error?.message)
      return response.status(401).json({ ok: false, error: `Your ${BRAND.name} session could not be verified. Please sign in again.` })
    }
  }
}

export const requireFirebaseUser = createRequireUser({
  signInMessage: `Sign in to ${BRAND.name} before connecting GitHub.`,
  unavailableMessage: 'GitHub connection is not configured on the server yet.'
})

// AI routes spend the shared model quota, so only signed-in people may call them.
export const requireUser = createRequireUser({
  signInMessage: `Sign in to ${BRAND.name} to use AI features.`,
  unavailableMessage: 'Sign-in can’t be checked on the server right now. Please try again in a few minutes.'
})
