import assert from 'node:assert/strict'
import express from 'express'
import { createOriginGuard, isAllowedOrigin } from '../server/middleware/originGuard.js'

const live = { allowedOrigins: ['https://tryresumetrics.vercel.app'] }

// Configured addresses are allowed; so is the site the server answers on (a renamed domain, a PR preview).
assert.equal(isAllowedOrigin('https://tryresumetrics.vercel.app', live), true)
assert.equal(isAllowedOrigin('https://tryrefile.vercel.app', { ...live, hosts: ['tryrefile.vercel.app'] }), true)
assert.equal(isAllowedOrigin('https://resumetrics-git-feat-van5hdeep.vercel.app', { ...live, hosts: ['resumetrics-git-feat-van5hdeep.vercel.app'] }), true)
// Another site is refused, even when it is also on vercel.app, and localhost is refused in production.
assert.equal(isAllowedOrigin('https://evil.vercel.app', { ...live, hosts: ['tryrefile.vercel.app'] }), false)
assert.equal(isAllowedOrigin('https://tryrefile.vercel.app.evil.com', { ...live, hosts: ['tryrefile.vercel.app'] }), false)
assert.equal(isAllowedOrigin('http://localhost:5173', { ...live, hosts: ['tryrefile.vercel.app'] }), false)
assert.equal(isAllowedOrigin('not a url', { ...live, hosts: ['tryrefile.vercel.app'] }), false)
// Development: a local RESUMETRICS_WEB_ORIGIN allows any local port over http.
const dev = { allowedOrigins: ['http://localhost:5173'], hosts: ['localhost:8787'] }
assert.equal(isAllowedOrigin('http://localhost:5174', dev), true)
assert.equal(isAllowedOrigin('http://127.0.0.1:4173', dev), true)
assert.equal(isAllowedOrigin('https://example.com', dev), false)

// Through Express: the Host header (or a proxy's X-Forwarded-Host) names the site; others get a 403 and no CORS.
const app = express()
app.use(createOriginGuard({ allowedOrigins: live.allowedOrigins, message: 'Not allowed.' }))
app.get('/ping', (_request, response) => response.json({ ok: true }))
const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
const port = server.address().port
const call = headers => fetch(`http://127.0.0.1:${port}/ping`, { headers })
try {
  assert.equal((await call({})).status, 200, 'no Origin: let through')
  assert.equal((await call({ Origin: 'https://tryresumetrics.vercel.app' })).status, 200)
  const sameSite = await call({ Origin: `http://127.0.0.1:${port}` })
  assert.equal(sameSite.status, 200, 'same host as the server')
  assert.equal(sameSite.headers.get('access-control-allow-origin'), '*')
  assert.equal((await call({ Origin: 'https://tryrefile.vercel.app', 'X-Forwarded-Host': 'tryrefile.vercel.app' })).status, 200, 'behind a proxy')
  const other = await call({ Origin: 'https://evil.example' })
  assert.equal(other.status, 403)
  assert.equal(other.headers.get('access-control-allow-origin'), null)
  assert.deepEqual(await other.json(), { ok: false, code: 'origin', error: 'Not allowed.' })
} finally {
  server.close()
}

console.log('originGuard: ok')
