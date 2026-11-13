import assert from 'node:assert/strict'
import express from 'express'
import { bearerToken, createHrAuth, hrIdFor, HR_SESSION_MS, configuredHrAccounts } from '../server/hr/hrAuth.js'
import { createHrStore } from '../server/db/hrStore.js'
import { createHrRouter } from '../server/routes/hr.routes.js'
import { AIBusyError } from '../server/ai/providerBudget.js'
import { createFakeFirestore } from './helpers/fakeFirestore.js'

const db = createFakeFirestore()
let clock = Date.UTC(2026, 10, 13, 9, 0, 0)
const quietWarn = console.warn
console.warn = () => {}
const auth = createHrAuth({ accounts: [{ email: 'abc@gmail.com', password: '12345' }, { email: 'other@corp.com', password: 'secret1' }], secret: 'test-secret', now: () => clock })
console.warn = quietWarn
const store = createHrStore({ getDb: () => db, timestamp: db.timestamp, now: () => clock })

// The AI reader is replaced: the "document" text decides what comes back.
const resumes = {
  asha: { fullName: 'Asha Rao', headline: 'Frontend Developer', summary: 'React developer.', skills: { technical: ['React', 'JavaScript', 'CSS'] }, experience: [{ role: 'Frontend Developer', company: 'Acme', startDate: 'Jan 2021', endDate: 'Present', bullets: ['Built React components'] }], education: [] },
  ben: { fullName: 'Ben Ito', headline: 'Accountant', skills: { technical: ['Excel'] }, experience: [], education: [] }
}
let busy = false
const read = async source => {
  if (busy) throw new AIBusyError(20, 'tokens')
  return { resumeData: resumes[source.rawText.trim()] ?? {}, parsedBy: 'ai' }
}

const app = express()
app.set('env', 'test')
app.use('/api/hr', createHrRouter({ store, auth, read, aiLimits: (_request, _response, next) => next(), loginLimit: { windowMs: 60_000, limit: 100 } }))
const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/hr${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: response.status, body: await response.json().catch(() => ({})), headers: response.headers }
}
const quietly = async work => {
  const original = console.error
  console.error = () => {}
  try { return await work() } finally { console.error = original }
}
const job = (overrides = {}) => ({ title: 'Frontend Developer', employmentType: 'Full-time', location: 'Pune', minYears: 2, mustHave: ['React', 'JavaScript', 'CSS'], niceToHave: ['TypeScript'], description: 'You will build React components. Requirements: React, JavaScript, CSS.', ...overrides })
const upload = (token, openingId, who) => call('POST', `/openings/${openingId}/candidates`, { token, body: { fileName: `${who}.pdf`, document: { rawText: who, pages: [{ pageNumber: 1, text: who }] } } })

try {
  // Sign-in: email + password only; wrong or missing details are refused and create nothing.
  assert.equal((await call('POST', '/auth/login', { body: { email: 'abc@gmail.com', password: 'wrong' } })).status, 401)
  assert.equal((await call('POST', '/auth/login', { body: { email: '', password: '' } })).status, 400)
  assert.equal(db.docs.size, 0)
  const login = await call('POST', '/auth/login', { body: { email: '  ABC@gmail.com ', password: '12345' } })
  assert.equal(login.status, 200)
  assert.equal(login.body.account.email, 'abc@gmail.com')
  assert.equal(login.body.account.plan, 'free')
  assert.equal(login.body.account.openingLimit, 2)
  const token = login.body.token
  const hrId = hrIdFor('abc@gmail.com')
  assert.ok(db.read(`hrAccounts/${hrId}`))

  // Every other route needs a valid, unexpired session.
  assert.equal((await call('GET', '/openings')).status, 401)
  assert.equal((await call('GET', '/openings', { token: `${token}x` })).status, 401)
  assert.equal((await call('GET', '/openings', { token: 'a.b' })).status, 401)
  assert.equal((await call('GET', '/auth/me', { token })).body.account.email, 'abc@gmail.com')

  // Describing a job: a title and at least one must-have are required; keywords come from the description.
  assert.equal((await call('POST', '/openings', { token, body: job({ title: ' ' }) })).status, 400)
  assert.equal((await call('POST', '/openings', { token, body: job({ mustHave: [] }) })).status, 400)
  assert.equal((await call('POST', '/openings', { token, body: job({ minYears: 99 }) })).status, 400)
  const first = await call('POST', '/openings', { token, body: job() })
  assert.equal(first.status, 201)
  const openingId = first.body.opening.id
  assert.equal(first.body.opening.minYears, 2)
  assert.deepEqual(first.body.opening.niceToHave, ['TypeScript'])

  // Upload resumes; each is read, stored and scored against this opening only.
  const asha = await upload(token, openingId, 'asha')
  assert.equal(asha.status, 201)
  assert.equal(asha.body.candidate.name, 'Asha Rao')
  assert.equal(asha.body.candidate.mustHaveMet, 3)
  const ben = await upload(token, openingId, 'ben')
  assert.equal(ben.body.candidate.mustHaveMet, 0)
  assert.equal((await upload(token, openingId, '   ')).status, 400)

  // A busy AI is reported with a wait, and nothing is stored.
  busy = true
  const waiting = await upload(token, openingId, 'asha')
  busy = false
  assert.equal(waiting.status, 429)
  assert.equal(waiting.body.code, 'ai_busy')
  assert.equal(waiting.headers.get('retry-after'), '20')

  // The opening comes back with its resumes ranked best first.
  const detail = await call('GET', `/openings/${openingId}`, { token })
  assert.deepEqual(detail.body.candidates.map(row => row.name), ['Asha Rao', 'Ben Ito'])
  assert.equal(detail.body.opening.candidateCount, 2)
  assert.ok(detail.body.weights.skills > detail.body.weights.experience)

  // Editing the job re-ranks immediately (scores are computed on read).
  await call('PUT', `/openings/${openingId}`, { token, body: job({ mustHave: ['Excel'] }) })
  const reranked = await call('GET', `/openings/${openingId}`, { token })
  assert.equal(reranked.body.candidates[0].name, 'Ben Ito')
  await call('PUT', `/openings/${openingId}`, { token, body: job() })

  // Full breakdown for one resume, then removing it.
  const full = await call('GET', `/openings/${openingId}/candidates/${ben.body.candidate.id}`, { token })
  assert.equal(full.status, 200)
  assert.deepEqual(full.body.candidate.evaluation.mustHave.items.map(item => item.found), [false, false, false])
  assert.equal((await call('DELETE', `/openings/${openingId}/candidates/${ben.body.candidate.id}`, { token })).status, 200)
  assert.equal((await call('DELETE', `/openings/${openingId}/candidates/${ben.body.candidate.id}`, { token })).status, 200)
  assert.equal((await call('GET', `/openings/${openingId}`, { token })).body.opening.candidateCount, 1)

  // The list shows each opening's best score.
  const list = await call('GET', '/openings', { token })
  assert.equal(list.body.openings[0].bestCandidate, 'Asha Rao')
  assert.equal(list.body.account.openingsCreated, 1)

  // Free plan: two openings in total. Deleting one does not give the slot back.
  assert.equal((await call('POST', '/openings', { token, body: job({ title: 'Designer', mustHave: ['Figma'] }) })).status, 201)
  const third = await call('POST', '/openings', { token, body: job({ title: 'QA', mustHave: ['Selenium'] }) })
  assert.equal(third.status, 403)
  assert.equal(third.body.code, 'plan_limit')
  assert.equal((await call('DELETE', `/openings/${openingId}`, { token })).status, 200)
  assert.equal([...db.docs.keys()].some(key => key.includes(openingId)), false)
  assert.equal((await call('POST', '/openings', { token, body: job({ title: 'QA', mustHave: ['Selenium'] }) })).status, 403)

  // Hiring Pro: unlimited openings.
  db.seed(`hrAccounts/${hrId}`, { ...db.read(`hrAccounts/${hrId}`), plan: { tier: 'pro', status: 'active', term: 'monthly', currentPeriodEnd: new Date(clock + 86_400_000).toISOString() } })
  assert.equal((await call('POST', '/openings', { token, body: job({ title: 'QA', mustHave: ['Selenium'] }) })).status, 201)
  assert.equal((await call('GET', '/auth/me', { token })).body.account.openingLimit, null)

  // Another HR account sees none of this account's openings.
  const other = (await call('POST', '/auth/login', { body: { email: 'other@corp.com', password: 'secret1' } })).body.token
  assert.equal((await call('GET', '/openings', { token: other })).body.openings.length, 0)
  const mine = (await call('GET', '/openings', { token })).body.openings[0].id
  assert.equal((await call('GET', `/openings/${mine}`, { token: other })).status, 404)
  assert.equal((await quietly(() => call('GET', '/openings/../../x', { token }))).status, 404)

  // Sessions expire.
  clock += HR_SESSION_MS + 1
  assert.equal((await call('GET', '/openings', { token })).status, 401)

  // Bearer headers are parsed without a regular expression; crafted or oversized headers are refused quickly.
  assert.equal(bearerToken('Bearer abc.def'), 'abc.def')
  assert.equal(bearerToken('bearer   abc.def  '), 'abc.def')
  assert.equal(bearerToken('Basic abc'), '')
  assert.equal(bearerToken(undefined), '')
  const started = Date.now()
  assert.equal(bearerToken(`Bearer ${' '.repeat(50_000)}x`), '')
  assert.ok(Date.now() - started < 50)
  assert.equal((await call('GET', '/openings', { token: ' '.repeat(5000) })).status, 401)

  // Passwords are compared as salted scrypt keys; absurdly long ones are refused before hashing.
  assert.equal(auth.checkCredentials('abc@gmail.com', '12345')?.email, 'abc@gmail.com')
  assert.equal(auth.checkCredentials('abc@gmail.com', '12345 '), null)
  assert.equal(auth.checkCredentials('abc@gmail.com', 'x'.repeat(10_000)), null)

  // Without environment settings the demo account is used.
  assert.deepEqual(configuredHrAccounts({}).map(account => account.email), ['abc@gmail.com'])
  assert.deepEqual(configuredHrAccounts({ RESUMETRICS_HR_EMAIL: 'HR@Corp.com', RESUMETRICS_HR_PASSWORD: 'longer-pass' }), [{ email: 'hr@corp.com', password: 'longer-pass' }])
} finally {
  server.close()
}

console.log('hrRoutes: ok')
