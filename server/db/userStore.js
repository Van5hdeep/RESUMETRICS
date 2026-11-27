import { getConnectionStore } from '../services/firebaseAdmin.js'

// users/{uid}: profile, settings and plan. Resumes live in resumeStore.js.
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system',
  notifications: Object.freeze({ email: true }),
  defaultTemplateId: null,
  onboardingComplete: false
})

const THEMES = ['system', 'light', 'dark']
const PROFILE_TOUCH_MS = 10 * 60_000

export class SettingsError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SettingsError'
  }
}

/** A clean settings patch, or SettingsError. Unknown keys and wrong types are refused, never stored. */
export function validateSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new SettingsError('Settings object is required.')
  const clean = {}
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'theme') {
      if (!THEMES.includes(value)) throw new SettingsError(`theme must be one of ${THEMES.join(', ')}.`)
      clean.theme = value
    } else if (key === 'notifications') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.email !== 'boolean' || Object.keys(value).length !== 1) throw new SettingsError('notifications must be { email: true|false }.')
      clean.notifications = { email: value.email }
    } else if (key === 'defaultTemplateId') {
      if (value !== null && (typeof value !== 'string' || !value || value.length > 64)) throw new SettingsError('defaultTemplateId must be a template id or null.')
      clean.defaultTemplateId = value
    } else if (key === 'onboardingComplete') {
      if (typeof value !== 'boolean') throw new SettingsError('onboardingComplete must be true or false.')
      clean.onboardingComplete = value
    } else {
      throw new SettingsError(`Invalid settings field: ${key}`)
    }
  }
  return clean
}

const PLAN_TERMS = ['monthly', 'yearly', 'lifetime', 'demo']

/** Only known fields with known values; payment ids and anything else stored on the plan stay on the server. */
export function publicPlan(plan) {
  if (!plan || typeof plan !== 'object' || plan.tier !== 'pro') return { tier: 'free', status: 'active', term: null, source: null, currentPeriodEnd: null }
  return {
    tier: 'pro',
    status: typeof plan.status === 'string' ? plan.status : 'inactive',
    term: PLAN_TERMS.includes(plan.term) ? plan.term : null,
    source: typeof plan.source === 'string' ? plan.source : null,
    currentPeriodEnd: typeof plan.currentPeriodEnd === 'string' ? plan.currentPeriodEnd : null
  }
}

export function createUserStore({ getDb = getConnectionStore, now = () => Date.now() } = {}) {
  // uid → last time this server process confirmed the profile. Saves are frequent; the profile barely changes.
  const touched = new Map()

  /**
   * Makes sure users/{uid} exists and its Google profile fields are current. Writes only when something changed,
   * and at most one check per user per ten minutes per server process (Spark plan reads and writes are limited).
   */
  async function ensureProfile(uid, firebaseUser) {
    const last = touched.get(uid)
    if (last !== undefined && now() - last < PROFILE_TOUCH_MS) return
    const ref = getDb().collection('users').doc(uid)
    const snapshot = await ref.get()
    const profile = {
      displayName: firebaseUser.name || firebaseUser.email?.split('@')[0] || (firebaseUser.demo === true ? 'Demo user' : 'User'),
      email: firebaseUser.email || '',
      photoURL: firebaseUser.picture || ''
    }
    const stamp = new Date(now()).toISOString()
    if (!snapshot.exists) {
      // A plan granted before the first sign-in (scripts/grant-pro.mjs) waits under the verified email address.
      const email = firebaseUser.email_verified === true ? String(firebaseUser.email || '').toLowerCase() : ''
      const grant = email ? await getDb().collection('planGrants').doc(email).get() : null
      await ref.set({
        profile: { ...profile, createdAt: stamp, updatedAt: stamp },
        settings: { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications } },
        plan: grant?.exists && grant.data().plan ? grant.data().plan : { tier: 'free', status: 'active' }
      })
    } else {
      const current = snapshot.data().profile ?? {}
      if (Object.keys(profile).some(key => current[key] !== profile[key])) {
        await ref.update({ 'profile.displayName': profile.displayName, 'profile.email': profile.email, 'profile.photoURL': profile.photoURL, 'profile.updatedAt': stamp })
      }
    }
    touched.set(uid, now())
  }

  async function getSettings(uid) {
    const snapshot = await getDb().collection('users').doc(uid).get()
    if (!snapshot.exists) throw new Error('User profile not found')
    return { ...DEFAULT_SETTINGS, ...(snapshot.data().settings ?? {}) }
  }

  async function updateSettings(uid, patch) {
    const clean = validateSettingsPatch(patch)
    const updates = Object.fromEntries(Object.entries(clean).map(([key, value]) => [`settings.${key}`, value]))
    if (Object.keys(updates).length) await getDb().collection('users').doc(uid).update(updates)
    return getSettings(uid)
  }

  /** The plan as the browser may see it (shared/plans.js). Missing or unreadable plans are free. */
  async function getPlan(uid) {
    const snapshot = await getDb().collection('users').doc(uid).get()
    return publicPlan(snapshot.exists ? snapshot.data().plan : null)
  }

  return { ensureProfile, getSettings, updateSettings, getPlan }
}

export const userStore = createUserStore()
