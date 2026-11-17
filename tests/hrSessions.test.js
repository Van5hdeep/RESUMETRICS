import assert from 'node:assert/strict'
import express from 'express'
import { createHrAuth, DEMO_EMAIL, DEMO_PROFILE, HR_DEMO_MS, hrIdFor } from '../server/hr/hrAuth.js'
import { createHrStore, publicHrPlan } from '../server/db/hrStore.js'
import { createHrRouter } from '../server/routes/hr.routes.js'
import { createDailyTokenBudget, createMemoryUsageStore, getUsage, recordAiCall, setUsageStore, usageDay } from '../server/ai/usage.js'
import { createFirestoreRateLimitStore } from '../server/middleware/persistentRateLimit.js'
import { createFakeFirestore } from './helpers/fakeFirestore.js'
import fixture from '../server/hr/demoFixture.json' with { type: 'json' }

// Sessions, sign-out, password changes, private demo workspaces and the HR AI allowance.
const db = createFakeFirestore()
let clock = Date.UTC(2026, 10, 17, 9, 0, 0)
const auth = createHrAuth({ accounts: [{ email: 'env@corp.example', password: 'env-pass-1' }], secret: 'test-secret', now: () => clock })
const store = createHrStore({ getDb: () => db, timestamp: db.timestamp, now: () => clock })
const limitsDb = createFakeFirestore()
const usage = createMemoryUsageStore()
setUsageStore(usage)

// The AI reader records a model call, like the real one does, so usage tracking can be checked.
const read = async () => {
  await recordAiCall({ tokensIn: 700, tokensOut: 300 })
  return { resumeData: { fullName: `Person ${Math.random()}`, skills: { technical: ['React'] }, experience: [], education: [] }, parsedBy: 'ai' }
}
const aiBudget = createDailyTokenBudget({ keyOf: request => request.hrUser.id, allowance: request => (request.hrUser.demo ? 1000 : 100_000) })

const app = express()
app.use('/api/hr', createHrRouter({
  store, auth, read, aiBudget,
  aiLimits: (_request, _response, next) => next(),
  // The shared (Firestore) limit store on a fake database and the test clock, as it runs in production.
  limitStore: name => createFirestoreRateLimitStore({ prefix: name, getDb: () => limitsDb, now: () => clock }),
  limits: { login: { windowMs: 60_000, limit: 1000 }, loginPerEmail: { windowMs: 60_000, limit: 4 }, register: { windowMs: 60_000, limit: 1000 }, demo: { windowMs: 60 * 60_000, limit: 3 } },
  demo: { enabled: true, fixture, profile: DEMO_PROFILE },
  now: () => clock
}))
const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/hr${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}
const quietly = async work => { const original = console.error; console.error = () => {}; try { return await work() } finally { console.error = original } }
const signup = (overrides = {}) => ({ fullName: 'Priya Shah', email: 'priya@corp.example', phone: '+91 98765 43210', jobTitle: 'HR Manager', companyName: 'Corp', industry: 'Information Technology', companySize: '11–50', city: 'Pune', password: 'first-pass-1', confirmPassword: 'first-pass-1', agree: true, ...overrides })
const upload = (token, openingId, name) => call('POST', `/openings/${openingId}/candidates`, { token, body: { fileName: `${name}.txt`, document: { rawText: name, pages: [{ pageNumber: 1, text: name }] } } })

try {
  // ---- Private demo workspaces ----
  const visitorA = await call('POST', '/auth/demo')
  const visitorB = await call('POST', '/auth/demo')
  assert.equal(visitorA.status, 201)
  assert.equal(visitorA.body.account.email, DEMO_EMAIL)
  assert.equal(visitorA.body.account.demo, true)
  assert.equal(visitorA.body.account.plan, 'free', 'a demo is never Pro')
  assert.equal(visitorA.body.account.canChangePassword, false)
  assert.equal(visitorA.body.account.details.fullName, DEMO_PROFILE.fullName)
  assert.ok(visitorA.body.expiresAt <= clock + HR_DEMO_MS)
  const listA = await call('GET', '/openings', { token: visitorA.body.token })
  const listB = await call('GET', '/openings', { token: visitorB.body.token })
  assert.equal(listA.body.openings.length, 1)
  assert.equal(listA.body.openings[0].candidateCount, fixture.candidates.length)
  assert.notEqual(listA.body.openings[0].id, listB.body.openings[0].id, 'each visitor gets their own copy')
  const openingA = listA.body.openings[0].id
  const openingB = listB.body.openings[0].id
  // Visitor B can't read, change or delete visitor A's workspace.
  assert.equal((await call('GET', `/openings/${openingA}`, { token: visitorB.body.token })).status, 404)
  assert.equal((await call('DELETE', `/openings/${openingA}`, { token: visitorB.body.token })).status, 200)   // deletes nothing of A's
  assert.equal((await call('GET', `/openings/${openingA}`, { token: visitorA.body.token })).status, 200)
  const editA = await call('PUT', '/account/details', { token: visitorA.body.token, body: { ...DEMO_PROFILE, fullName: 'Changed By A' } })
  assert.equal(editA.status, 200)
  assert.equal((await call('GET', '/auth/me', { token: visitorB.body.token })).body.account.details.fullName, DEMO_PROFILE.fullName)
  // Sample candidates are scored like uploaded ones.
  const opened = await call('GET', `/openings/${openingB}`, { token: visitorB.body.token })
  assert.equal(opened.body.candidates.length, fixture.candidates.length)
  assert.ok(opened.body.candidates.every(candidate => Number.isFinite(candidate.score)))
  // A demo can't take a password or register as the demo address.
  assert.equal((await call('PUT', '/account/password', { token: visitorA.body.token, body: { currentPassword: 'x', newPassword: 'new-pass-22', confirmPassword: 'new-pass-22' } })).status, 400)
  assert.equal((await call('POST', '/auth/register', { body: signup({ email: DEMO_EMAIL }) })).status, 409)

  // The demo AI allowance is small (1,000 tokens here): one resume uses it up, the next is refused before the AI runs.
  assert.equal((await upload(visitorA.body.token, openingA, 'first')).status, 201)
  const idA = [...db.docs.keys()].map(key => key.split('/')).filter(parts => parts.length === 2 && parts[0] === 'hrAccounts').map(parts => parts[1]).find(id => db.read(`hrAccounts/${id}`)?.details?.fullName === 'Changed By A')
  assert.match(idA, /^hrdemo_[0-9a-f]{24}$/)
  const demoUsage = await getUsage(idA, usageDay())
  assert.equal(demoUsage.calls, 1, 'the AI call counts against the demo workspace')
  const second = await upload(visitorA.body.token, openingA, 'second')
  assert.equal(second.status, 429)
  assert.equal(second.body.code, 'ai_allowance')

  // Demo workspaces per network address are limited (3 per hour here).
  assert.equal((await call('POST', '/auth/demo')).status, 201)
  assert.equal((await call('POST', '/auth/demo')).status, 429)

  // Signing out of a demo deletes it; the token stops working.
  const demoIds = () => [...new Set([...db.docs.keys()].filter(key => key.startsWith('hrAccounts/hrdemo_')).map(key => key.split('/')[1]))]
  const before = demoIds().length
  assert.equal((await call('POST', '/auth/logout', { token: visitorB.body.token })).status, 200)
  assert.equal(demoIds().length, before - 1)
  assert.equal((await call('GET', '/openings', { token: visitorB.body.token })).status, 401)

  // An expired demo ends, and the next demo sweeps it away.
  clock += HR_DEMO_MS + 1
  const expired = await call('GET', '/openings', { token: visitorA.body.token })
  assert.equal(expired.status, 401)
  clock += 60 * 60_000   // a new hour for the per-address demo limit
  const fresh = await call('POST', '/auth/demo')
  assert.equal(fresh.status, 201)
  assert.equal(demoIds().length, 1, 'expired demo workspaces were deleted')

  // ---- Registered accounts: sign-out everywhere and password changes ----
  const created = await call('POST', '/auth/register', { body: signup() })
  assert.equal(created.status, 201)
  assert.equal(created.body.account.canChangePassword, true)
  const laptop = await call('POST', '/auth/login', { body: { email: 'priya@corp.example', password: 'first-pass-1' } })
  const phone = await call('POST', '/auth/login', { body: { email: 'priya@corp.example', password: 'first-pass-1' } })
  assert.equal((await call('GET', '/openings', { token: laptop.body.token })).status, 200)
  assert.equal((await call('POST', '/auth/logout', { token: laptop.body.token })).status, 200)
  assert.equal((await call('GET', '/openings', { token: laptop.body.token })).status, 401, 'signed-out token is dead')
  assert.equal((await call('GET', '/openings', { token: phone.body.token })).status, 401, 'sign-out ends every device')
  assert.equal((await call('GET', '/openings', { token: created.body.token })).status, 401)

  const again = await call('POST', '/auth/login', { body: { email: 'priya@corp.example', password: 'first-pass-1' } })
  assert.equal(again.status, 200)
  const token = again.body.token
  const wrong = await call('PUT', '/account/password', { token, body: { currentPassword: 'nope-nope-1', newPassword: 'second-pass-2', confirmPassword: 'second-pass-2' } })
  assert.equal(wrong.status, 400)
  assert.match(wrong.body.fields.currentPassword, /not correct/)
  const weak = await call('PUT', '/account/password', { token, body: { currentPassword: 'first-pass-1', newPassword: 'short', confirmPassword: 'short' } })
  assert.equal(weak.status, 400)
  assert.ok(weak.body.fields.newPassword)
  const mismatch = await call('PUT', '/account/password', { token, body: { currentPassword: 'first-pass-1', newPassword: 'second-pass-2', confirmPassword: 'second-pass-3' } })
  assert.ok(mismatch.body.fields.confirmPassword)
  const same = await call('PUT', '/account/password', { token, body: { currentPassword: 'first-pass-1', newPassword: 'first-pass-1', confirmPassword: 'first-pass-1' } })
  assert.ok(same.body.fields.newPassword)
  const changed = await call('PUT', '/account/password', { token, body: { currentPassword: 'first-pass-1', newPassword: 'second-pass-2', confirmPassword: 'second-pass-2' } })
  assert.equal(changed.status, 200)
  assert.equal((await call('GET', '/openings', { token })).status, 401, 'the old session ends')
  assert.equal((await call('GET', '/openings', { token: changed.body.token })).status, 200, 'the new session works')
  assert.equal((await call('POST', '/auth/login', { body: { email: 'priya@corp.example', password: 'first-pass-1' } })).status, 401)
  assert.equal((await call('POST', '/auth/login', { body: { email: 'priya@corp.example', password: 'second-pass-2' } })).status, 200)
  const stored = db.read(`hrAccounts/${hrIdFor('priya@corp.example')}`)
  assert.ok(!JSON.stringify(stored).includes('second-pass-2'), 'the password itself is never stored')

  // Environment logins keep their password in the environment.
  const envLogin = await call('POST', '/auth/login', { body: { email: 'env@corp.example', password: 'env-pass-1' } })
  assert.equal(envLogin.status, 200)
  assert.equal(envLogin.body.account.canChangePassword, false)
  assert.equal((await call('PUT', '/account/password', { token: envLogin.body.token, body: { currentPassword: 'env-pass-1', newPassword: 'other-pass-2', confirmPassword: 'other-pass-2' } })).status, 400)

  // Guessing one account's password is limited per email, whatever the network address (4 tries here).
  for (let attempt = 0; attempt < 3; attempt += 1) await call('POST', '/auth/login', { body: { email: 'target@corp.example', password: `guess-${attempt}` } })
  assert.equal((await call('POST', '/auth/login', { body: { email: 'TARGET@corp.example ', password: 'guess-x' } })).status, 401)
  assert.equal((await call('POST', '/auth/login', { body: { email: 'target@corp.example', password: 'guess-y' } })).status, 429)

  // Internal plan fields (how and when a plan was granted) never reach the portal.
  assert.deepEqual(publicHrPlan({ tier: 'pro', status: 'active', term: 'lifetime', source: 'developer', grantedAt: '2026-11-13' }), { tier: 'pro', status: 'active', term: 'lifetime', currentPeriodEnd: null })
  assert.deepEqual(publicHrPlan(null), { tier: 'free' })

  // A token for an account that no longer exists is refused.
  db.docs.delete(`hrAccounts/${hrIdFor('priya@corp.example')}`)
  assert.equal((await call('GET', '/openings', { token: changed.body.token })).status, 401)

  // Without any secret, a production server refuses to sign (it does not fall back to a random key per instance).
  const { rootSecret } = await import('../server/config/secrets.js')
  assert.throws(() => rootSecret({ VERCEL: '1' }, () => ''), /RESUMETRICS_SESSION_SECRET/)
  assert.equal(rootSecret({}, () => '').length, 64, 'a local run without a secret gets a random one')
  assert.equal(rootSecret({ VERCEL: '1' }, () => 'key-json'), rootSecret({ VERCEL: '1' }, () => 'key-json'), 'instances sharing the Firebase key agree')
  assert.equal(typeof rootSecret({ RESUMETRICS_SESSION_SECRET: 'abc' }), 'string')

  // ---- The shared rate-limit store ----
  const limitDb = createFakeFirestore()
  let limitClock = 1_000_000
  const limitStore = createFirestoreRateLimitStore({ prefix: 'hr-login', getDb: () => limitDb, now: () => limitClock })
  limitStore.init({ windowMs: 60_000 })
  assert.equal((await limitStore.increment('203.0.113.9')).totalHits, 1)
  assert.equal((await limitStore.increment('203.0.113.9')).totalHits, 2)
  assert.ok(![...limitDb.docs.keys()].some(key => key.includes('203.0.113.9')), 'addresses are stored only as hashes')
  // A second instance with the same database sees the same count.
  const otherInstance = createFirestoreRateLimitStore({ prefix: 'hr-login', getDb: () => limitDb, now: () => limitClock })
  otherInstance.init({ windowMs: 60_000 })
  assert.equal((await otherInstance.increment('203.0.113.9')).totalHits, 3)
  await limitStore.decrement('203.0.113.9')
  assert.equal((await limitStore.increment('203.0.113.9')).totalHits, 3)
  limitClock += 60_001
  assert.equal((await limitStore.increment('203.0.113.9')).totalHits, 1, 'a new window starts over')
  const broken = createFirestoreRateLimitStore({ prefix: 'hr-login', getDb: () => { throw new Error('offline') }, now: () => limitClock })
  broken.init({ windowMs: 60_000 })
  await quietly(async () => {
    assert.equal((await broken.increment('k')).totalHits, 1)
    assert.equal((await broken.increment('k')).totalHits, 2, 'still counts in memory when the database is down')
  })
  assert.throws(() => createFirestoreRateLimitStore({ prefix: 'Bad Prefix' }))

  console.log('hrSessions: all checks passed')
} finally {
  server.close()
}
