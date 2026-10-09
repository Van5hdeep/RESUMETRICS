import { getConnectionStore } from './firebaseAdmin.js'

/**
 * Upserts user profile on first login and refreshes Firebase auth fields on every call.
 * Creates default settings only on first create, never overwrites them after.
 * 
 * @param {string} uid - Firebase user ID
 * @param {object} firebaseUser - Verified Firebase token payload
 * @returns {Promise<void>}
 */
export async function upsertUserProfile(uid, firebaseUser) {
  const db = getConnectionStore()
  const userRef = db.collection('users').doc(uid)
  const userDoc = await userRef.get()

  const profileUpdate = {
    displayName: firebaseUser.name || firebaseUser.email?.split('@')[0] || 'User',
    email: firebaseUser.email || '',
    photoURL: firebaseUser.picture || '',
    updatedAt: new Date().toISOString()
  }

  if (!userDoc.exists) {
    // First create: set profile, default settings, and plan stub
    await userRef.set({
      profile: {
        ...profileUpdate,
        createdAt: profileUpdate.updatedAt
      },
      settings: {
        theme: 'system',
        notifications: { email: true },
        defaultTemplateId: null,
        onboardingComplete: false
      },
      plan: {
        tier: 'free',
        status: 'active'
      }
    })
  } else {
    // Subsequent calls: only refresh profile fields, never touch settings
    await userRef.update({
      'profile.displayName': profileUpdate.displayName,
      'profile.email': profileUpdate.email,
      'profile.photoURL': profileUpdate.photoURL,
      'profile.updatedAt': profileUpdate.updatedAt
    })
  }
}

/**
 * Get user settings
 * 
 * @param {string} uid - Firebase user ID
 * @returns {Promise<object>} Settings object
 */
export async function getSettings(uid) {
  const db = getConnectionStore()
  const userDoc = await db.collection('users').doc(uid).get()
  
  if (!userDoc.exists) {
    throw new Error('User profile not found')
  }
  
  return userDoc.data().settings || {}
}

/**
 * Update user settings (partial merge, whitelist only)
 * 
 * @param {string} uid - Firebase user ID
 * @param {object} partialSettings - Settings to update
 * @returns {Promise<object>} Updated settings
 */
export async function updateSettings(uid, partialSettings) {
  const allowedFields = ['theme', 'notifications', 'defaultTemplateId', 'onboardingComplete']
  const updates = {}
  
  // Whitelist validation: reject unknown keys
  for (const key of Object.keys(partialSettings)) {
    if (!allowedFields.includes(key)) {
      throw new Error(`Invalid settings field: ${key}`)
    }
    updates[`settings.${key}`] = partialSettings[key]
  }
  
  if (Object.keys(updates).length === 0) {
    return await getSettings(uid)
  }
  
  const db = getConnectionStore()
  await db.collection('users').doc(uid).update(updates)
  
  return await getSettings(uid)
}

/**
 * Compute progress percentage based on filled fields in draftContent
 * 
 * @param {object} draftContent - Resume draft content
 * @returns {number} Progress percentage (0-100)
 */
/**
 * Compute resume status based on content
 * @param {object} draftContent - Draft content to analyze
 * @returns {string} Status ('empty', 'draft', or 'complete')
 */
function computeStatus(draftContent) {
  const percent = computeProgressPercent(draftContent)
  if (percent === 0) return 'empty'
  if (percent < 80) return 'draft'
  return 'complete'
}

function computeProgressPercent(draftContent) {
  if (!draftContent || typeof draftContent !== 'object') return 0
  
  // draftContent is the workspaceState, so check draftContent.resumeData
  const resumeData = draftContent.resumeData
  if (!resumeData || typeof resumeData !== 'object') return 0
  
  let filledFields = 0
  let totalFields = 5
  
  // Check actual resume data fields
  if (resumeData.fullName && resumeData.fullName.trim()) filledFields++
  if (resumeData.summary && resumeData.summary.trim()) filledFields++
  if (resumeData.experience && Array.isArray(resumeData.experience) && resumeData.experience.length > 0) filledFields++
  if (resumeData.education && Array.isArray(resumeData.education) && resumeData.education.length > 0) filledFields++
  if (resumeData.skills && Object.keys(resumeData.skills || {}).length > 0) filledFields++
  
  return Math.round((filledFields / totalFields) * 100)
}

/**
 * Save or update a resume/cover letter
 * 
 * @param {string} uid - Firebase user ID
 * @param {string|null} resumeId - Resume ID (null for new)
 * @param {object} data - Resume data
 * @param {boolean} data.overwriteExtractedData - Force overwrite extractedData
 * @returns {Promise<object>} Saved resume with id
 */
export async function saveResume(uid, resumeId, data) {
  const db = getConnectionStore()
  const resumesRef = db.collection('users').doc(uid).collection('resumes')
  
  const now = new Date().toISOString()
  const isNew = !resumeId
  
  const resumeData = {
    type: data.type || 'resume',
    title: data.title || 'Untitled',
    status: computeStatus(data.draftContent),
    templateId: data.templateId || null,
    draftContent: data.draftContent || {},
    progress: {
      percent: computeProgressPercent(data.draftContent)
    },
    updatedAt: now,
    lastEditedAt: now
  }
  
  if (isNew) {
    resumeData.createdAt = now
    // First save: set extractedData
    resumeData.extractedData = data.extractedData || {}
  } else {
    // Update: only overwrite extractedData if explicitly requested
    if (data.overwriteExtractedData === true) {
      resumeData.extractedData = data.extractedData || {}
    }
  }
  
  let docRef
  if (isNew) {
    docRef = await resumesRef.add(resumeData)
    return { id: docRef.id, ...resumeData }
  } else {
    docRef = resumesRef.doc(resumeId)
    const existing = await docRef.get()
    
    if (!existing.exists) {
      throw new Error('Resume not found')
    }
    
    await docRef.update(resumeData)
    return { id: resumeId, ...resumeData }
  }
}

/**
 * List user resumes with optional type filter
 * 
 * @param {string} uid - Firebase user ID
 * @param {object} options - Query options
 * @param {string} options.type - Filter by type ('resume' or 'cover_letter')
 * @returns {Promise<Array>} Array of resume summaries
 */
export async function listResumes(uid, options = {}) {
  const db = getConnectionStore()
  let query = db.collection('users').doc(uid).collection('resumes')
  
  if (options.type) {
    query = query.where('type', '==', options.type)
  }
  
  query = query.orderBy('lastEditedAt', 'desc')
  
  const snapshot = await query.get()
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    title: doc.data().title,
    type: doc.data().type,
    status: doc.data().status,
    progress: doc.data().progress,
    lastEditedAt: doc.data().lastEditedAt
  }))
}

/**
 * Get full resume document with ownership verification
 * 
 * @param {string} uid - Firebase user ID
 * @param {string} resumeId - Resume ID
 * @returns {Promise<object>} Full resume document
 */
export async function getResume(uid, resumeId) {
  const db = getConnectionStore()
  const docRef = db.collection('users').doc(uid).collection('resumes').doc(resumeId)
  const doc = await docRef.get()
  
  if (!doc.exists) {
    throw new Error('Resume not found')
  }
  
  // Ownership is inherently verified by the subcollection path (users/{uid}/resumes/{id})
  return { id: doc.id, ...doc.data() }
}

/**
 * Delete resume with ownership verification
 * 
 * @param {string} uid - Firebase user ID
 * @param {string} resumeId - Resume ID
 * @returns {Promise<void>}
 */
export async function deleteResume(uid, resumeId) {
  const db = getConnectionStore()
  const docRef = db.collection('users').doc(uid).collection('resumes').doc(resumeId)
  
  // Verify existence (ownership is inherent in the subcollection path)
  const doc = await docRef.get()
  if (!doc.exists) {
    throw new Error('Resume not found')
  }
  
  await docRef.delete()
}

/**
 * Delete all resumes for a user
 * 
 * @param {string} uid - Firebase user ID
 * @returns {Promise<number>} Number of resumes deleted
 */
export async function deleteAllResumes(uid) {
  const db = getConnectionStore()
  const resumesRef = db.collection('users').doc(uid).collection('resumes')
  
  // Get all resumes for this user
  const snapshot = await resumesRef.get()
  
  if (snapshot.empty) {
    return 0
  }
  
  // Batch delete all documents (Firestore batches are limited to 500 operations)
  const batchSize = 500
  let deletedCount = 0
  
  for (let i = 0; i < snapshot.docs.length; i += batchSize) {
    const batch = db.batch()
    const batchDocs = snapshot.docs.slice(i, i + batchSize)
    
    batchDocs.forEach(doc => {
      batch.delete(doc.ref)
    })
    
    await batch.commit()
    deletedCount += batchDocs.length
  }
  
  return deletedCount
}

/**
 * Get dashboard summary with aggregated stats
 * 
 * @param {string} uid - Firebase user ID
 * @returns {Promise<object>} Dashboard summary
 */
export async function getDashboardSummary(uid) {
  const db = getConnectionStore()
  const snapshot = await db.collection('users').doc(uid).collection('resumes').get()
  
  const resumes = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
  const savedCount = resumes.length
  
  // Compute average progress per type
  const resumeItems = resumes.filter(r => r.type === 'resume')
  const coverLetterItems = resumes.filter(r => r.type === 'cover_letter')
  
  const avgProgress = (items) => {
    if (items.length === 0) return 0
    const sum = items.reduce((acc, item) => acc + (item.progress?.percent || 0), 0)
    return Math.round(sum / items.length)
  }
  
  return {
    savedCount,
    progress: {
      resumeBuilding: avgProgress(resumeItems),
      resumeTailoring: 0, // Future feature, stub for now
      coverLetter: avgProgress(coverLetterItems)
    }
  }
}
