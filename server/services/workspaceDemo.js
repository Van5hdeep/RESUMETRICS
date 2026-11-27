// "Try the demo" for the resume workspace, the same idea as the HR portal's "Explore the demo": each visitor gets a
// private demo account of their own, signed in without Google, deleted after a day. It has every Pro feature and no
// daily AI allowance, for testing and pitching. Nobody shares a demo, so nobody sees another visitor's resumes.
//
// Sign-in uses a Firebase custom token made by this server, so no extra sign-in method has to be enabled in the
// Firebase console. The token carries { demo: true, demoExpiresAt }, which every signed-in request can check.
import { randomBytes } from 'node:crypto'
import { getAuth } from 'firebase-admin/auth'
import { getConnectionStore, initializeFirebaseAdmin } from './firebaseAdmin.js'
import { DEFAULT_SETTINGS } from '../db/userStore.js'

export const WORKSPACE_DEMO_MS = 24 * 60 * 60 * 1000
export const DEMO_DISPLAY_NAME = 'Demo user'
/** Expired demos removed per sweep, so a sweep never makes one sign-in slow. */
const SWEEP_BATCH = 20

export const workspaceDemoIdFor = () => `demo_${randomBytes(12).toString('hex')}`

/** The plan a demo account has: Pro, ending when the demo does (shared/plans.js isProPlan). */
export const demoPlan = expiresAt => ({ tier: 'pro', status: 'active', term: 'demo', source: 'demo', currentPeriodEnd: new Date(expiresAt).toISOString() })

export function createWorkspaceDemos({ getDb = getConnectionStore, getAdminAuth = () => getAuth(initializeFirebaseAdmin()), now = () => Date.now() } = {}) {
  /** Opens a demo: its user record (Pro plan, demo marker) and a custom token for signing in. */
  async function create() {
    const uid = workspaceDemoIdFor()
    const expiresAt = now() + WORKSPACE_DEMO_MS
    const stamp = new Date(now()).toISOString()
    await getDb().collection('users').doc(uid).set({
      profile: { displayName: DEMO_DISPLAY_NAME, email: '', photoURL: '', createdAt: stamp, updatedAt: stamp },
      settings: { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications } },
      plan: demoPlan(expiresAt),
      // Top-level, so expired demos can be found with one query.
      demoExpiresAt: expiresAt
    })
    const token = await getAdminAuth().createCustomToken(uid, { demo: true, demoExpiresAt: expiresAt })
    return { uid, token, expiresAt }
  }

  /** Deletes demos whose day is over: their resumes and everything else under users/{uid}, and the sign-in itself. */
  async function sweepExpired() {
    const snapshot = await getDb().collection('users').where('demoExpiresAt', '<', now()).limit(SWEEP_BATCH).get()
    await Promise.all(snapshot.docs.map(async doc => {
      await getDb().recursiveDelete(doc.ref)
      await getAdminAuth().deleteUser(doc.id).catch(() => {})   // already gone, or never signed in
    }))
    return snapshot.docs.length
  }

  return { create, sweepExpired }
}

export const workspaceDemos = createWorkspaceDemos()
