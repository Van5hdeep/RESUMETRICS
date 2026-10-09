import { Router } from 'express'
import { requireFirebaseUser, FirebaseServerConfigurationError } from '../services/firebaseAdmin.js'
import {
  upsertUserProfile,
  getSettings,
  updateSettings,
  saveResume,
  listResumes,
  getResume,
  deleteResume,
  deleteAllResumes,
  getDashboardSummary
} from '../services/userStore.js'

const router = Router()

function isFirestoreUnavailable(error) {
  const message = String(error?.message ?? '')
  return Number(error?.code) === 7 && /cloud firestore api|firestore.*(?:disabled|not been used)/i.test(message)
}

function publicPersistenceMessage() {
  return 'Data could not be saved because Cloud Firestore is not enabled for Resumetrics yet. Create a Cloud Firestore database in Firebase Console, then try again.'
}

// Middleware to ensure user profile exists before any route
async function ensureUserProfile(request, response, next) {
  try {
    await upsertUserProfile(request.firebaseUser.uid, request.firebaseUser)
    return next()
  } catch (error) {
    console.error('Profile upsert failed:', error?.message)
    if (isFirestoreUnavailable(error)) {
      return response.status(503).json({ ok: false, error: publicPersistenceMessage() })
    }
    return response.status(500).json({ ok: false, error: 'Could not initialize user profile.' })
  }
}

// Apply auth + profile middleware to all routes
router.use(requireFirebaseUser, ensureUserProfile)

/**
 * GET /api/user/dashboard
 * Returns dashboard summary + recent resumes
 */
router.get('/dashboard', async (request, response) => {
  try {
    const summary = await getDashboardSummary(request.firebaseUser.uid)
    const recentResumes = await listResumes(request.firebaseUser.uid, {})
    
    // Limit to 6 for dashboard grid
    const projects = recentResumes.slice(0, 6)
    
    response.set('Cache-Control', 'no-store')
    return response.json({
      ok: true,
      summary,
      projects
    })
  } catch (error) {
    console.error('Dashboard load failed:', error?.message)
    if (isFirestoreUnavailable(error)) {
      return response.status(503).json({ ok: false, error: publicPersistenceMessage() })
    }
    return response.status(500).json({ ok: false, error: 'Could not load dashboard data.' })
  }
})

/**
 * GET /api/user/settings
 * Returns user settings
 */
router.get('/settings', async (request, response) => {
  try {
    const settings = await getSettings(request.firebaseUser.uid)
    return response.json({ ok: true, settings })
  } catch (error) {
    console.error('Settings load failed:', error?.message)
    if (isFirestoreUnavailable(error)) {
      return response.status(503).json({ ok: false, error: publicPersistenceMessage() })
    }
    return response.status(500).json({ ok: false, error: 'Could not load settings.' })
  }
})

/**
 * PATCH /api/user/settings
 * Updates user settings (partial merge)
 */
router.patch('/settings', async (request, response) => {
  try {
    const { settings: partialSettings } = request.body || {}
    
    if (!partialSettings || typeof partialSettings !== 'object') {
      return response.status(400).json({ ok: false, error: 'Settings object is required.' })
    }
    
    const updated = await updateSettings(request.firebaseUser.uid, partialSettings)
    return response.json({ ok: true, settings: updated })
  } catch (error) {
    console.error('Settings update failed:', error?.message)
    
    if (error.message?.includes('Invalid settings field')) {
      return response.status(400).json({ ok: false, error: error.message })
    }
    
    if (isFirestoreUnavailable(error)) {
      return response.status(503).json({ ok: false, error: publicPersistenceMessage() })
    }
    
    return response.status(500).json({ ok: false, error: 'Could not update settings.' })
  }
})

/**
 * POST /api/user/resumes
 * Create or update a resume
 */
router.post('/resumes', async (request, response) => {
  try {
    const { resumeId, data } = request.body || {}
    
    if (!data || typeof data !== 'object') {
      return response.status(400).json({ ok: false, error: 'Resume data is required.' })
    }
    
    const saved = await saveResume(request.firebaseUser.uid, resumeId || null, data)
    return response.json({ ok: true, resume: saved })
  } catch (error) {
    console.error('Resume save failed:', error?.message)
    
    if (error.message === 'Resume not found') {
      return response.status(404).json({ ok: false, error: 'Resume not found.' })
    }
    
    if (isFirestoreUnavailable(error)) {
      return response.status(503).json({ ok: false, error: publicPersistenceMessage() })
    }
    
    return response.status(500).json({ ok: false, error: 'Could not save resume.' })
  }
})

/**
 * GET /api/user/resumes
 * List all resumes (optionally filtered by type)
 */
router.get('/resumes', async (request, response) => {
  try {
    const { type } = request.query
    const options = {}
    
    if (type && (type === 'resume' || type === 'cover_letter')) {
      options.type = type
    }
    
    const resumes = await listResumes(request.firebaseUser.uid, options)
    response.set('Cache-Control', 'no-store')
    return response.json({ ok: true, resumes })
  } catch (error) {
    console.error('Resume list failed:', error?.message)
    if (isFirestoreUnavailable(error)) {
      return response.status(503).json({ ok: false, error: publicPersistenceMessage() })
    }
    return response.status(500).json({ ok: false, error: 'Could not load resumes.' })
  }
})

/**
 * GET /api/user/resumes/:id
 * Get full resume document
 */
router.get('/resumes/:id', async (request, response) => {
  try {
    const { id } = request.params
    
    if (!id || typeof id !== 'string') {
      return response.status(400).json({ ok: false, error: 'Resume ID is required.' })
    }
    
    const resume = await getResume(request.firebaseUser.uid, id)
    return response.json({ ok: true, resume })
  } catch (error) {
    console.error('Resume fetch failed:', error?.message)
    
    if (error.message === 'Resume not found') {
      return response.status(404).json({ ok: false, error: 'Resume not found.' })
    }
    
    if (isFirestoreUnavailable(error)) {
      return response.status(503).json({ ok: false, error: publicPersistenceMessage() })
    }
    
    return response.status(500).json({ ok: false, error: 'Could not load resume.' })
  }
})

/**
 * DELETE /api/user/resumes
 * Delete all resumes for the authenticated user
 */
router.delete('/resumes', async (request, response) => {
  try {
    const deletedCount = await deleteAllResumes(request.firebaseUser.uid)
    return response.json({ 
      ok: true, 
      message: `${deletedCount} resume${deletedCount === 1 ? '' : 's'} deleted successfully.`,
      deletedCount 
    })
  } catch (error) {
    console.error('Bulk resume delete failed:', error?.message)
    
    if (isFirestoreUnavailable(error)) {
      return response.status(503).json({ ok: false, error: publicPersistenceMessage() })
    }
    
    return response.status(500).json({ ok: false, error: 'Could not delete resumes.' })
  }
})

/**
 * DELETE /api/user/resumes/:id
 * Delete a resume
 */
router.delete('/resumes/:id', async (request, response) => {
  try {
    const { id } = request.params
    
    if (!id || typeof id !== 'string') {
      return response.status(400).json({ ok: false, error: 'Resume ID is required.' })
    }
    
    await deleteResume(request.firebaseUser.uid, id)
    return response.json({ ok: true, message: 'Resume deleted successfully.' })
  } catch (error) {
    console.error('Resume delete failed:', error?.message)
    
    if (error.message === 'Resume not found') {
      return response.status(404).json({ ok: false, error: 'Resume not found.' })
    }
    
    if (isFirestoreUnavailable(error)) {
      return response.status(503).json({ ok: false, error: publicPersistenceMessage() })
    }
    
    return response.status(500).json({ ok: false, error: 'Could not delete resume.' })
  }
})

export default router
