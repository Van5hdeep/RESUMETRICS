import assert from 'node:assert/strict'
import express from 'express'
import { connectionStateCookie, createGitHubRouter, selectAuthorizedInstallation } from '../server/routes/github.routes.js'
import { createGitHubStateCodec } from '../server/services/githubState.js'

// GitHub routes with GitHub, Firestore and Firebase swapped for fakes. The point of these checks: an installation
// is linked to a Resumetrics account only when the GitHub user who signed in can reach it.
let clock = Date.UTC(2026, 10, 17, 9, 0, 0)
const codec = createGitHubStateCodec({ secret: () => 'test-secret', now: () => clock })
const otherCodec = createGitHubStateCodec({ secret: () => 'another-secret', now: () => clock })

const saved = new Map()
const connections = {
  get: async uid => saved.get(uid) ?? { connected: false },
  save: async (uid, connection) => { const value = { connected: true, githubInstallationId: connection.installationId, githubLogin: connection.login }; saved.set(uid, value); return value },
  remove: async uid => { saved.delete(uid) }
}
// GitHub user "alice" can reach installation 111; installation 999 belongs to somebody else.
const codes = { 'alice-code': { login: 'alice', avatarUrl: '', installationIds: ['111'] }, 'two-code': { login: 'two', avatarUrl: '', installationIds: ['111', '222'] }, 'none-code': { login: 'none', avatarUrl: '', installationIds: [] } }
let scans = 0
const github = {
  getGitHubAuthorizationIdentity: async code => { if (!codes[code]) throw new Error('bad code'); return codes[code] },
  getGitHubInstallationUrl: state => `https://github.example/install?state=${state}`,
  getGitHubUserAuthorizationUrl: state => `https://github.example/authorize?state=${state}`,
  getInstallationProfile: async id => ({ installationId: String(id), login: `owner-of-${id}`, avatarUrl: '' }),
  getUserRepositories: async () => [],
  scanGitHubEvidence: async function * () { scans += 1; yield { type: 'progress' } }
}
// The test "Firebase" user is whoever the bearer token names.
const authenticate = (request, response, next) => {
  const uid = (request.get('authorization') ?? '').replace(/^Bearer /, '')
  if (!uid) return response.status(401).json({ ok: false })
  request.firebaseUser = { uid }
  return next()
}
let guardCalls = 0
const refuseAll = (_request, response) => { guardCalls += 1; response.status(429).json({ ok: false, code: 'limited' }) }

const app = express()
app.use(express.json())
app.use('/api/github', createGitHubRouter({ authenticate, github, connections, state: codec, evidence: { saveEvidence: async () => {} }, aiGuard: [refuseAll] }))
const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
const base = `http://127.0.0.1:${server.address().port}/api/github`
const call = async (method, path, { uid, body, cookie } = {}) => {
  const response = await fetch(`${base}${path}`, {
    method,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${uid}` } : {}), ...(cookie ? { Cookie: `${connectionStateCookie}=${encodeURIComponent(cookie)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: response.status, body: await response.json().catch(() => ({})), location: response.headers.get('location') ?? '', setCookie: response.headers.get('set-cookie') ?? '' }
}
const stateFrom = url => new URL(url).searchParams.get('state')
const quietly = async work => { const original = console.error; console.error = () => {}; try { return await work() } finally { console.error = original } }

try {
  // The old hole: posting any installation id linked it. Now the route is gone (410) and links nothing.
  const hijack = await call('POST', '/complete-installation', { uid: 'mallory', body: { installationId: '999' } })
  assert.equal(hijack.status, 410)
  assert.equal(saved.has('mallory'), false)

  // Starting a connection sets the signed state in an HTTP-only cookie.
  const start = await call('GET', '/connect', { uid: 'mallory' })
  assert.equal(start.status, 200)
  assert.match(start.setCookie, /HttpOnly/i)
  const malloryState = stateFrom(start.body.authorizationUrl)
  assert.ok(codec.verify(malloryState))

  // A valid code for a GitHub user who can't reach installation 999 is refused, with a message the person can act on.
  const denied = await quietly(() => call('POST', '/complete-authorization', { uid: 'mallory', cookie: malloryState, body: { code: 'alice-code', state: malloryState, installationId: '999' } }))
  assert.equal(denied.status, 403)
  assert.match(denied.body.error, /cannot access that installation/)
  assert.equal(saved.has('mallory'), false)

  // The state must match this browser's cookie, belong to this user, be signed by us and be unexpired.
  assert.equal((await call('POST', '/complete-authorization', { uid: 'mallory', body: { code: 'alice-code', state: malloryState } })).status, 400)
  assert.equal((await call('POST', '/complete-authorization', { uid: 'alice', cookie: malloryState, body: { code: 'alice-code', state: malloryState } })).status, 400)
  const forged = otherCodec.create('mallory')
  assert.equal((await call('POST', '/complete-authorization', { uid: 'mallory', cookie: forged, body: { code: 'alice-code', state: forged } })).status, 400)
  const tampered = `${malloryState.split('.')[0]}x.${malloryState.split('.')[1]}`
  assert.equal(codec.verify(tampered), null)
  assert.equal(codec.verify(`${malloryState}.extra`), null)
  assert.equal(codec.verify('x'.repeat(600)), null)
  clock += 11 * 60_000
  assert.equal((await call('POST', '/complete-authorization', { uid: 'mallory', cookie: malloryState, body: { code: 'alice-code', state: malloryState } })).status, 400)
  clock -= 11 * 60_000

  // Installation-only return: the browser is sent to GitHub sign-in; the id rides in the signed state.
  const pendingRedirect = await call('GET', '/callback?installation_id=111')
  assert.equal(pendingRedirect.status, 302)
  assert.match(pendingRedirect.location, /github=installation-pending/)
  const authorize = await call('GET', '/authorize?installation_id=111', { uid: 'alice' })
  assert.match(authorize.body.authorizationUrl, /^https:\/\/github\.example\/authorize\?state=/)
  const aliceState = stateFrom(authorize.body.authorizationUrl)
  assert.equal(codec.verify(aliceState).installationId, '111')
  assert.equal(codec.create('x', { installationId: '../1' }).length > 0 && codec.verify(codec.create('x', { installationId: '../1' })).installationId, '')

  // The genuine owner connects: the code proves they reach 111.
  const ok = await call('POST', '/complete-authorization', { uid: 'alice', cookie: aliceState, body: { code: 'alice-code', state: aliceState } })
  assert.equal(ok.status, 200)
  assert.equal(saved.get('alice').githubInstallationId, '111')

  // Server-side callback: same rules, and the cookie must be present.
  const bobState = codec.create('bob')
  const noCookie = await call('GET', `/callback?code=alice-code&state=${encodeURIComponent(bobState)}`)
  assert.match(noCookie.location, /github=invalid-state/)
  const wrongInstallation = await quietly(() => call('GET', `/callback?code=alice-code&installation_id=999&state=${encodeURIComponent(bobState)}`, { cookie: bobState }))
  assert.match(wrongInstallation.location, /github=connection-failed/)
  assert.equal(saved.has('bob'), false)
  const viaCallback = await call('GET', `/callback?code=alice-code&state=${encodeURIComponent(bobState)}`, { cookie: bobState })
  assert.match(viaCallback.location, /github=connected/)
  assert.equal(saved.get('bob').githubInstallationId, '111')

  // Choosing among installations.
  assert.equal(selectAuthorizedInstallation('', codes['alice-code']), '111')
  assert.throws(() => selectAuthorizedInstallation('', codes['two-code']), /More than one/)
  assert.throws(() => selectAuthorizedInstallation('', codes['none-code']), /No Resumetrics GitHub App installation/)
  assert.equal(selectAuthorizedInstallation('222', codes['two-code']), '222')

  // The evidence scan calls the AI model: the AI guard runs before it, and a refusal stops the scan.
  const scan = await call('POST', '/evidence-scan', { uid: 'alice', body: { resumeData: {} } })
  assert.equal(scan.status, 429)
  assert.equal(guardCalls, 1)
  assert.equal(scans, 0)

  // Everything but the callback needs a signed-in user.
  for (const [method, path] of [['GET', '/connect'], ['GET', '/authorize'], ['POST', '/complete-authorization'], ['GET', '/status'], ['GET', '/repos'], ['POST', '/evidence-scan'], ['DELETE', '/disconnect']]) {
    assert.equal((await call(method, path)).status, 401, `${method} ${path} must need sign-in`)
  }

  console.log('githubRoutes: all checks passed')
} finally {
  server.close()
}
