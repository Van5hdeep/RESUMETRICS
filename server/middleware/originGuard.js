// Which web pages may call the API. A page on another site gets no CORS headers (so its browser can't read our
// answers) and a plain 403. Allowed:
//   - the addresses in RESUMETRICS_WEB_ORIGIN (comma-separated, e.g. the live domain and an old one)
//   - the site the server itself is answering on: on Vercel the website and the API share one address, so a new
//     domain or a pull-request preview works without changing settings. Browsers always send the real Origin,
//     and another site can't pretend to be this one.
//   - http://localhost and 127.0.0.1 on any port, when RESUMETRICS_WEB_ORIGIN itself is a local address (development)
// Requests without an Origin (same-page navigations, server-to-server, curl) are let through; sign-in and the other
// checks still apply to them.
import cors from 'cors'

const hostOf = value => {
  try {
    return new URL(value).host.toLowerCase()
  } catch {
    return ''
  }
}
const isLocal = value => {
  try {
    const { hostname } = new URL(value)
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

/** The hosts this request was addressed to: the Host header, and the first X-Forwarded-Host a proxy (Vercel) set. */
export function requestHosts(request) {
  return [request.get('host'), request.get('x-forwarded-host')?.split(',')[0]]
    .map(value => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Whether a page at `origin` may call the API, given the configured origins and the hosts the request was sent to.
 */
export function isAllowedOrigin(origin, { allowedOrigins = [], hosts = [] } = {}) {
  if (allowedOrigins.includes(origin)) return true
  const host = hostOf(origin)
  if (host && hosts.includes(host)) return true
  if (allowedOrigins.some(isLocal)) {
    try {
      return new URL(origin).protocol === 'http:' && isLocal(origin)
    } catch {
      return false
    }
  }
  return false
}

/** Express middleware: CORS for allowed pages, a 403 with `message` for everything else. */
export function createOriginGuard({ allowedOrigins, message }) {
  const corsForAllowed = cors()
  return function originGuard(request, response, next) {
    const origin = request.get('origin')
    if (!origin || isAllowedOrigin(origin, { allowedOrigins, hosts: requestHosts(request) })) return corsForAllowed(request, response, next)
    return response.status(403).json({ ok: false, code: 'origin', error: message })
  }
}
