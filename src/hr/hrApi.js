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
  constructor(message, { status = 0, code = '', retryAfterSeconds = 0, limit = null, fields = null } = {}) {
    super(message)
    this.name = 'HrApiError'
    Object.assign(this, { status, code, retryAfterSeconds, limit, fields })
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
    throw new HrApiError(data.error || 'Something went wrong. Please try again.', { status: response.status, code: data.code, retryAfterSeconds: data.retryAfterSeconds, limit: data.limit, fields: data.fields ?? null })
  }
  return data
}

export async function signIn(email, password) {
  const data = await request('/auth/login', { method: 'POST', body: { email, password } })
  saveSession({ token: data.token, expiresAt: data.expiresAt, email: data.account.email })
  return data.account
}

/** Opens a private demo workspace (made-up data, deleted after a day) and signs in to it. */
export async function startDemo() {
  const data = await request('/auth/demo', { method: 'POST' })
  saveSession({ token: data.token, expiresAt: data.expiresAt, email: data.account.email })
  return data.account
}

/** Ends the session on the server (every device; a demo workspace is deleted), then here. Never throws. */
export async function signOutEverywhere() {
  try { if (getSession()) await request('/auth/logout', { method: 'POST' }) } catch { /* the local session ends anyway */ }
  clearSession()
}

/** Creates an HR account and signs in. A field problem rejects with error.fields = { fieldName: message }. */
export async function register(details) {
  const data = await request('/auth/register', { method: 'POST', body: details })
  saveSession({ token: data.token, expiresAt: data.expiresAt, email: data.account.email })
  return data.account
}

const id = value => encodeURIComponent(value)

export const hrApi = {
  me: () => request('/auth/me').then(data => data.account),
  updateDetails: details => request('/account/details', { method: 'PUT', body: details }).then(data => data.account),
  /** Every other session ends; this one continues with the new token. A field problem rejects with error.fields. */
  async changePassword(currentPassword, newPassword, confirmPassword) {
    const data = await request('/account/password', { method: 'PUT', body: { currentPassword, newPassword, confirmPassword } })
    const session = getSession()
    saveSession({ token: data.token, expiresAt: data.expiresAt, email: session?.email ?? '' })
  },
  listOpenings: () => request('/openings'),
  createOpening: fields => request('/openings', { method: 'POST', body: fields }).then(data => data.opening),
  getOpening: openingId => request(`/openings/${id(openingId)}`),
  updateOpening: (openingId, fields) => request(`/openings/${id(openingId)}`, { method: 'PUT', body: fields }).then(data => data.opening),
  deleteOpening: openingId => request(`/openings/${id(openingId)}`, { method: 'DELETE' }),
  uploadCandidate: (openingId, fileName, document) => request(`/openings/${id(openingId)}/candidates`, { method: 'POST', body: { fileName, document } }).then(data => data.candidate),
  getCandidate: (openingId, candidateId) => request(`/openings/${id(openingId)}/candidates/${id(candidateId)}`).then(data => data.candidate),
  deleteCandidate: (openingId, candidateId) => request(`/openings/${id(openingId)}/candidates/${id(candidateId)}`, { method: 'DELETE' }),
  /** { blind?, weights?, status? } → { opening, weights } */
  updateSettings: (openingId, settings) => request(`/openings/${id(openingId)}/settings`, { method: 'PATCH', body: settings }),
  /** status: 'new' | 'shortlisted' | 'rejected'; reason is kept only with a rejection. */
  decide: (openingId, candidateId, status, reason = '') => request(`/openings/${id(openingId)}/candidates/${id(candidateId)}`, { method: 'PATCH', body: { status, reason } }).then(data => data.candidate),
  /** action: 'shortlist' | 'reject' | 'reset' | 'remove' */
  bulk: (openingId, ids, action, reason = '') => request(`/openings/${id(openingId)}/candidates/bulk`, { method: 'POST', body: { ids, action, reason } }),
  /** Downloads the shortlist as a CSV file (the session header can't ride on a plain link). */
  async exportShortlist(openingId) {
    const session = getSession()
    let response
    try {
      response = await fetch(`${API_BASE}/api/hr/openings/${id(openingId)}/export.csv`, { headers: session ? { Authorization: `Bearer ${session.token}` } : {} })
    } catch {
      throw new HrApiError('Couldn’t reach Resumetrics. Check your connection.', { code: 'network' })
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      if (response.status === 401) { clearSession(); window.dispatchEvent(new Event(SESSION_ENDED)) }
      throw new HrApiError(data.error || 'The shortlist could not be exported.', { status: response.status, code: data.code })
    }
    const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'shortlist.csv'
    const url = URL.createObjectURL(await response.blob())
    const link = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
