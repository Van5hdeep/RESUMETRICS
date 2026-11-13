// HR portal API client. The HR session is separate from candidate (Firebase) sign-in: a signed token from
// POST /api/hr/auth/login, kept in localStorage and sent as a Bearer token.
const API_BASE = import.meta.env.VITE_API_URL || ''
const KEY = 'resumetrics.hr.session'
export const SESSION_ENDED = 'resumetrics:hr-session-ended'

export function getSession() {
  try {
    const session = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return session?.token && session.expiresAt > Date.now() ? session : null
  } catch {
    return null
  }
}

function saveSession(session) {
  try { localStorage.setItem(KEY, JSON.stringify(session)) } catch { /* private window: the session lasts for this tab only */ }
}

export function clearSession() {
  try { localStorage.removeItem(KEY) } catch { /* nothing stored */ }
}

export class HrApiError extends Error {
  constructor(message, { status = 0, code = '', retryAfterSeconds = 0, limit = null } = {}) {
    super(message)
    this.name = 'HrApiError'
    Object.assign(this, { status, code, retryAfterSeconds, limit })
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const session = getSession()
  let response
  try {
    response = await fetch(`${API_BASE}/api/hr${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch {
    throw new HrApiError('Couldn’t reach Resumetrics. Check your connection.', { code: 'network' })
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      clearSession()
      window.dispatchEvent(new Event(SESSION_ENDED))
    }
    throw new HrApiError(data.error || 'Something went wrong. Please try again.', { status: response.status, code: data.code, retryAfterSeconds: data.retryAfterSeconds, limit: data.limit })
  }
  return data
}

export async function signIn(email, password) {
  const data = await request('/auth/login', { method: 'POST', body: { email, password } })
  saveSession({ token: data.token, expiresAt: data.expiresAt, email: data.account.email })
  return data.account
}

const id = value => encodeURIComponent(value)

export const hrApi = {
  me: () => request('/auth/me').then(data => data.account),
  listOpenings: () => request('/openings'),
  createOpening: fields => request('/openings', { method: 'POST', body: fields }).then(data => data.opening),
  getOpening: openingId => request(`/openings/${id(openingId)}`),
  updateOpening: (openingId, fields) => request(`/openings/${id(openingId)}`, { method: 'PUT', body: fields }).then(data => data.opening),
  deleteOpening: openingId => request(`/openings/${id(openingId)}`, { method: 'DELETE' }),
  uploadCandidate: (openingId, fileName, document) => request(`/openings/${id(openingId)}/candidates`, { method: 'POST', body: { fileName, document } }).then(data => data.candidate),
  getCandidate: (openingId, candidateId) => request(`/openings/${id(openingId)}/candidates/${id(candidateId)}`).then(data => data.candidate),
  deleteCandidate: (openingId, candidateId) => request(`/openings/${id(openingId)}/candidates/${id(candidateId)}`, { method: 'DELETE' })
}
