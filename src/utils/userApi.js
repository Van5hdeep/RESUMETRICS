import { getAuth } from 'firebase/auth'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787'

/**
 * Get current Firebase ID token for authenticated requests
 */
async function getIdToken() {
  const auth = getAuth()
  const user = auth.currentUser
  if (!user) throw new Error('User not authenticated')
  return await user.getIdToken()
}

/**
 * Make authenticated API request
 */
async function authenticatedFetch(endpoint, options = {}) {
  const token = await getIdToken()
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }
  
  return data
}

/**
 * Get dashboard summary and recent projects
 */
export async function getDashboard() {
  return await authenticatedFetch('/api/user/dashboard')
}

/**
 * Get user settings
 */
export async function getSettings() {
  return await authenticatedFetch('/api/user/settings')
}

/**
 * Update user settings (partial merge)
 */
export async function updateSettings(settings) {
  return await authenticatedFetch('/api/user/settings', {
    method: 'PATCH',
    body: JSON.stringify({ settings })
  })
}

/**
 * Save resume (create or update)
 */
export async function saveResume(resumeId, data) {
  return await authenticatedFetch('/api/user/resumes', {
    method: 'POST',
    body: JSON.stringify({ resumeId, data })
  })
}

/**
 * List all resumes (optionally filtered by type)
 */
export async function listResumes(type = null) {
  const query = type ? `?type=${type}` : ''
  return await authenticatedFetch(`/api/user/resumes${query}`)
}

/**
 * Get full resume document
 */
export async function getResume(resumeId) {
  return await authenticatedFetch(`/api/user/resumes/${resumeId}`)
}

/**
 * Delete resume
 */
export async function deleteResume(resumeId) {
  return await authenticatedFetch(`/api/user/resumes/${resumeId}`, {
    method: 'DELETE'
  })
}

/**
 * Delete all resumes for the current user
 */
export async function clearAllResumes() {
  return await authenticatedFetch('/api/user/resumes', {
    method: 'DELETE'
  })
}
