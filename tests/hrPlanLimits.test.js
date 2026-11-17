import assert from 'node:assert/strict'
import express from 'express'
import { createHrAuth, DEMO_PROFILE, hrIdFor } from '../server/hr/hrAuth.js'
import { createHrStore } from '../server/db/hrStore.js'
import { createHrRouter } from '../server/routes/hr.routes.js'
import { HR_FREE_OPENING_LIMIT, HR_FREE_RESUMES_PER_OPENING, HR_PRO_RESUMES_PER_OPENING, resumesPerOpening } from '../shared/hrPlans.js'
import { createFakeFirestore } from './helpers/fakeFirestore.js'
import fixture from '../server/hr/demoFixture.json' with { type: 'json' }

// HR plan limits: Free = 2 openings in total (deleting one doesn't give it back) and 5 resumes per opening;
// Hiring Pro (and every demo workspace) = unlimited openings and 50 resumes per opening.
const db = createFakeFirestore()
const clock = Date.UTC(2026, 10, 17, 10, 0, 0)
const auth = createHrAuth({ accounts: [], secret: 'test-secret', now: () => clock })
const store = createHrStore({ getDb: () => db, timestamp: db.timestamp, now: () => clock })
let reads = 0
const read = async source => { reads += 1; return { resumeData: { fullName: `Person ${source.rawText}`, email: `${source.rawText}@example.com`, skills: { technical: ['React'] }, experience: [], education: [] }, parsedBy: 'ai' } }
const pass = (_request, _response, next) => next()

const app = express()
app.use('/api/hr', createHrRouter({ store, auth, read, aiLimits: pass, aiBudget: pass, limitStore: () => undefined, limits: { register: { windowMs: 60_000, limit: 100 }, demo: { windowMs: 60_000, limit: 100 } }, demo: { enabled: true, fixture, profile: DEMO_PROFILE }, now: () => clock }))
const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/hr${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}
const upload = (token, openingId, who) => call('POST', `/openings/${openingId}/candidates`, { token, body: { fileName: `${who}.txt`, document: { rawText: who, pages: [{ pageNumber: 1, text: who }] } } })
const job = title => ({ title, mustHave: ['React'] })
const signup = email => ({ fullName: 'Priya Shah', email, phone: '+91 98765 43210', jobTitle: 'HR Manager', companyName: 'Corp', industry: 'Information Technology', companySize: '11–50', city: 'Pune', password: 'first-pass-1', confirmPassword: 'first-pass-1', agree: true })

try {
  assert.equal(HR_FREE_RESUMES_PER_OPENING, 5)
  assert.equal(HR_PRO_RESUMES_PER_OPENING, 50)
  assert.equal(HR_FREE_OPENING_LIMIT, 2)
  assert.equal(resumesPerOpening(null), 5)
  assert.equal(resumesPerOpening({ tier: 'pro', status: 'active' }), 50)
  assert.equal(resumesPerOpening({ tier: 'pro', status: 'cancelled' }), 5, 'an inactive Pro plan is Free')
  assert.equal(resumesPerOpening({ tier: 'pro', status: 'active', currentPeriodEnd: new Date(clock - 1).toISOString() }, clock), 5, 'an expired Pro plan is Free')

  // ---- Free: 5 resumes per opening ----
  const free = await call('POST', '/auth/register', { body: signup('free@corp.example') })
  assert.equal(free.status, 201)
  assert.equal(free.body.account.resumeLimit, 5)
  const token = free.body.token
  const opening = (await call('POST', '/openings', { token, body: job('Frontend Developer') })).body.opening
  for (const who of ['a', 'b', 'c', 'd', 'e']) assert.equal((await upload(token, opening.id, who)).status, 201, `free resume ${who} fits`)
  assert.equal(reads, 5)
  const sixth = await upload(token, opening.id, 'f')
  assert.equal(sixth.status, 403)
  assert.equal(sixth.body.code, 'plan_limit')
  assert.equal(sixth.body.limit, 5)
  assert.match(sixth.body.error, /free plan holds 5 resumes per opening/)
  assert.equal(reads, 5, 'the 6th resume is refused before the AI reads it')
  assert.equal((await call('GET', `/openings/${opening.id}`, { token })).body.candidates.length, 5)
  // The store checks the limit itself too (in the same transaction), so a race past the route check can't add a 6th.
  await assert.rejects(store.addCandidate(hrIdFor('free@corp.example'), opening.id, { fileName: 'race.txt', fileHash: 'x', resumeData: { fullName: 'Race' }, parsedBy: 'ai' }), error => error.code === 'plan_limit')
  // Removing a resume makes room again (the per-opening limit counts what is in the opening now).
  const first = (await call('GET', `/openings/${opening.id}`, { token })).body.candidates[0]
  assert.equal((await call('DELETE', `/openings/${opening.id}/candidates/${first.id}`, { token })).status, 200)
  assert.equal((await upload(token, opening.id, 'f')).status, 201)

  // ---- Free: 2 openings in total, deleting doesn't give one back ----
  const second = (await call('POST', '/openings', { token, body: job('Designer') })).body.opening
  assert.equal((await call('POST', '/openings', { token, body: job('QA') })).body.code, 'plan_limit')
  assert.equal((await call('DELETE', `/openings/${second.id}`, { token })).status, 200)
  assert.equal((await call('DELETE', `/openings/${opening.id}`, { token })).status, 200)
  const empty = await call('GET', '/openings', { token })
  assert.equal(empty.body.openings.length, 0)
  assert.equal(empty.body.account.openingsCreated, 2, 'deleted openings still count')
  assert.equal((await call('POST', '/openings', { token, body: job('QA') })).status, 403, 'no new opening after deleting both')

  // ---- Hiring Pro: 50 resumes per opening, unlimited openings ----
  const proId = hrIdFor('pro@corp.example')
  const pro = await call('POST', '/auth/register', { body: signup('pro@corp.example') })
  db.seed(`hrAccounts/${proId}`, { ...db.read(`hrAccounts/${proId}`), plan: { tier: 'pro', status: 'active', term: 'yearly' } })
  const proToken = pro.body.token
  assert.equal((await call('GET', '/auth/me', { token: proToken })).body.account.resumeLimit, 50)
  for (const title of ['One', 'Two', 'Three']) assert.equal((await call('POST', '/openings', { token: proToken, body: job(title) })).status, 201)
  const proOpening = (await call('GET', '/openings', { token: proToken })).body.openings[0]
  for (const who of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) assert.equal((await upload(proToken, proOpening.id, who)).status, 201, `pro resume ${who} fits`)
  // At 50 the opening is full (not a plan limit: there is no bigger plan).
  db.seed(`hrAccounts/${proId}/openings/${proOpening.id}`, { ...db.read(`hrAccounts/${proId}/openings/${proOpening.id}`), candidateCount: 50 })
  const readsBefore = reads
  const full = await upload(proToken, proOpening.id, 'p51')
  assert.equal(full.status, 409)
  assert.equal(full.body.code, 'opening_full')
  assert.equal(full.body.limit, 50)
  assert.equal(reads, readsBefore, 'a full opening is refused before the AI reads the resume')
  // If Pro lapses, the opening keeps its resumes but takes no more until it is under the free limit.
  db.seed(`hrAccounts/${proId}`, { ...db.read(`hrAccounts/${proId}`), plan: { tier: 'pro', status: 'cancelled' } })
  db.seed(`hrAccounts/${proId}/openings/${proOpening.id}`, { ...db.read(`hrAccounts/${proId}/openings/${proOpening.id}`), candidateCount: 6 })
  assert.equal((await upload(proToken, proOpening.id, 'after-lapse')).body.code, 'plan_limit')

  // ---- Demo workspaces are on Hiring Pro ----
  const demo = await call('POST', '/auth/demo')
  assert.equal(demo.body.account.plan, 'pro')
  assert.equal(demo.body.account.resumeLimit, 50)
  assert.equal(demo.body.account.openingLimit, null)

  console.log('hrPlanLimits: all checks passed')
} finally {
  server.close()
}
