import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { createRequireUser } from '../services/firebaseAdmin.js'
import { workspaceDemos } from '../services/workspaceDemo.js'
import { createFirestoreRateLimitStore } from '../middleware/persistentRateLimit.js'
import { env } from '../config/env.js'
import { RESUME_ID, ResumeStoreError, resumeStore } from '../db/resumeStore.js'
import { evidenceStore } from '../db/evidenceStore.js'
import { SettingsError, userStore } from '../db/userStore.js'
import { isProPlan } from '../../shared/plans.js'
import { BRAND } from '../../shared/brand.js'

const VERSION_ID = /^[A-Za-z0-9_-]{8,64}$/

const requireAccount = createRequireUser({
  signInMessage: `Sign in to ${BRAND.name} to save your work.`,
  unavailableMessage: 'Saving isn’t available right now. Please try again in a few minutes.'
})

function isFirestoreUnavailable(error) {
  const message = String(error?.message ?? '')
  return Number(error?.code) === 7 && /cloud firestore api|firestore.*(?:disabled|not been used)/i.test(message)
}

const STATUS = { invalid: 400, plan_limit: 403, not_found: 404, conflict: 409, too_large: 413 }

function fail(response, error, fallback) {
  if (error instanceof ResumeStoreError) {
    return response.status(STATUS[error.code] ?? 400).json({ ok: false, code: error.code, error: error.message, ...(error.serverRevision !== undefined ? { serverRevision: error.serverRevision } : {}), ...(error.limit !== undefined ? { limit: error.limit } : {}) })
  }
  if (error instanceof SettingsError) return response.status(400).json({ ok: false, code: 'invalid', error: error.message })
  console.error(`${fallback}:`, error?.message)
  if (isFirestoreUnavailable(error)) return response.status(503).json({ ok: false, code: 'unavailable', error: 'Data could not be saved because Cloud Firestore is not enabled for this app yet. Create a Cloud Firestore database in Firebase Console, then try again.' })
  return response.status(500).json({ ok: false, code: 'server', error: `${fallback}.` })
}

/** Demo accounts one network may open in an hour (the counts live in Firestore, so they hold across instances). */
export const DEMOS_PER_HOUR = 5
const demoLimiterFor = store => rateLimit({
  windowMs: 60 * 60_000,
  limit: DEMOS_PER_HOUR,
  ...(store ? { store } : {}),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ ok: false, code: 'rate_limited', error: 'Too many demo workspaces from your network. Try again in an hour.' })
})

export function createUserRouter({ resumes = resumeStore, users = userStore, evidence = evidenceStore, authenticate = requireAccount, demos = workspaceDemos, demoEnabled = env.workspaceDemo.enabled, demoStore = createFirestoreRateLimitStore({ prefix: 'workspace-demo' }) } = {}) {
  const router = Router()

  // "Try the demo": a private demo account for this visitor alone, with every Pro feature and no daily AI allowance,
  // deleted after a day. Expired demos are swept first, so they don't pile up.
  router.post('/demo', demoLimiterFor(demoStore), async (_request, response) => {
    if (!demoEnabled) return response.status(404).json({ ok: false, code: 'not_found', error: 'The demo is not available.' })
    try {
      await demos.sweepExpired().catch(error => console.error('Expired demo workspaces could not be removed:', error?.message))
      const { token, expiresAt } = await demos.create()
      return response.status(201).json({ ok: true, token, expiresAt })
    } catch (error) {
      return fail(response, error, 'Could not open a demo workspace')
    }
  })

  router.use(authenticate, async (request, response, next) => {
    try {
      await users.ensureProfile(request.firebaseUser.uid, request.firebaseUser)
      return next()
    } catch (error) {
      return fail(response, error, 'Could not initialise your account')
    }
  })

  router.param('id', (request, response, next, id) => {
    if (!RESUME_ID.test(id)) return response.status(400).json({ ok: false, code: 'invalid', error: 'Invalid resume id.' })
    return next()
  })

  router.param('versionId', (request, response, next, versionId) => {
    if (!VERSION_ID.test(versionId)) return response.status(400).json({ ok: false, code: 'invalid', error: 'Invalid version id.' })
    return next()
  })

  // The plan and how many resumes it has left: { plan, pro, resumes: { used, limit } } (limit null on Pro).
  router.get('/plan', async (request, response) => {
    try {
      const [plan, allowance] = await Promise.all([users.getPlan(request.firebaseUser.uid), resumes.resumeAllowance(request.firebaseUser.uid)])
      response.set('Cache-Control', 'no-store')
      return response.json({ ok: true, plan, pro: isProPlan(plan), resumes: allowance })
    } catch (error) {
      return fail(response, error, 'Could not load your plan')
    }
  })

  router.get('/settings', async (request, response) => {
    try {
      return response.json({ ok: true, settings: await users.getSettings(request.firebaseUser.uid) })
    } catch (error) {
      return fail(response, error, 'Could not load settings')
    }
  })

  router.patch('/settings', async (request, response) => {
    try {
      return response.json({ ok: true, settings: await users.updateSettings(request.firebaseUser.uid, request.body?.settings) })
    } catch (error) {
      return fail(response, error, 'Could not update settings')
    }
  })

  // Newest first, with each resume's content: the dashboard previews them without a second request.
  router.get('/resumes', async (request, response) => {
    try {
      const list = await resumes.listResumes(request.firebaseUser.uid)
      response.set('Cache-Control', 'no-store')
      return response.json({ ok: true, resumes: list })
    } catch (error) {
      return fail(response, error, 'Could not load resumes')
    }
  })

  router.get('/resumes/:id', async (request, response) => {
    try {
      response.set('Cache-Control', 'no-store')
      return response.json({ ok: true, resume: await resumes.getResume(request.firebaseUser.uid, request.params.id) })
    } catch (error) {
      return fail(response, error, 'Could not load resume')
    }
  })

  // Create or update. Body: { baseRevision: null | number, fields: {...} }. 409 when baseRevision is stale.
  router.put('/resumes/:id', async (request, response) => {
    try {
      const { baseRevision = null, fields } = request.body ?? {}
      const saved = await resumes.saveResume(request.firebaseUser.uid, request.params.id, { baseRevision, fields })
      return response.json({ ok: true, resume: saved })
    } catch (error) {
      return fail(response, error, 'Could not save resume')
    }
  })

  router.patch('/resumes/:id', async (request, response) => {
    try {
      return response.json({ ok: true, resume: await resumes.renameResume(request.firebaseUser.uid, request.params.id, request.body?.name) })
    } catch (error) {
      return fail(response, error, 'Could not rename resume')
    }
  })

  // Body: { newId } — chosen by the browser, like a first save, so a retry can't create two copies.
  router.post('/resumes/:id/duplicate', async (request, response) => {
    const newId = request.body?.newId
    if (typeof newId !== 'string' || !RESUME_ID.test(newId)) return response.status(400).json({ ok: false, code: 'invalid', error: 'Invalid resume id.' })
    try {
      return response.status(201).json({ ok: true, resume: await resumes.duplicateResume(request.firebaseUser.uid, request.params.id, newId) })
    } catch (error) {
      return fail(response, error, 'Could not duplicate resume')
    }
  })

  router.get('/resumes/:id/versions', async (request, response) => {
    try {
      response.set('Cache-Control', 'no-store')
      return response.json({ ok: true, versions: await resumes.listVersions(request.firebaseUser.uid, request.params.id) })
    } catch (error) {
      return fail(response, error, 'Could not load versions')
    }
  })

  // Saves the stored resume as a version. 201 with the version, or 200 with version: null when nothing changed.
  router.post('/resumes/:id/versions', async (request, response) => {
    try {
      const version = await resumes.createVersion(request.firebaseUser.uid, request.params.id)
      return response.status(version ? 201 : 200).json({ ok: true, version })
    } catch (error) {
      return fail(response, error, 'Could not save a version')
    }
  })

  router.post('/resumes/:id/versions/:versionId/restore', async (request, response) => {
    try {
      return response.json({ ok: true, resume: await resumes.restoreVersion(request.firebaseUser.uid, request.params.id, request.params.versionId) })
    } catch (error) {
      return fail(response, error, 'Could not restore this version')
    }
  })

  // Saved evidence for a resume ({ github: {...} | null }). Written by the server when a scan finishes, never by the browser.
  router.get('/resumes/:id/evidence', async (request, response) => {
    try {
      response.set('Cache-Control', 'no-store')
      return response.json({ ok: true, evidence: await evidence.getEvidence(request.firebaseUser.uid, request.params.id) })
    } catch (error) {
      return fail(response, error, 'Could not load evidence')
    }
  })

  router.delete('/resumes/:id/evidence/:kind', async (request, response) => {
    try {
      await evidence.deleteEvidence(request.firebaseUser.uid, request.params.id, request.params.kind)
      return response.json({ ok: true })
    } catch (error) {
      return fail(response, error, 'Could not delete evidence')
    }
  })

  router.delete('/resumes/:id', async (request, response) => {
    try {
      await resumes.deleteResume(request.firebaseUser.uid, request.params.id)
      return response.json({ ok: true })
    } catch (error) {
      return fail(response, error, 'Could not delete resume')
    }
  })

  return router
}

export default createUserRouter()
