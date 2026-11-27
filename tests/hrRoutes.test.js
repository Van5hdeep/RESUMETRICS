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
  ben: { fullName: 'Ben Ito', headline: 'Accountant', skills: { technical: ['Excel'] }, experience: [], education: [] },
  // Same person as Asha (same email), different file text: a duplicate found only after reading.
  'asha again': { fullName: 'Asha R.', email: 'asha@example.com', skills: { technical: ['React'] }, experience: [], education: [] },
  cara: { fullName: '=Cara "CJ" Jones', email: 'cara@example.com', headline: 'UI developer', skills: { technical: ['JavaScript', 'CSS'] }, experience: [], education: [] }
}
resumes.asha.email = 'asha@example.com'
let busy = false
const read = async source => {
  if (busy) throw new AIBusyError(20, 'tokens')
  return { resumeData: resumes[source.rawText.trim()] ?? {}, parsedBy: 'ai' }
}

const app = express()
app.set('env', 'test')
app.use('/api/hr', createHrRouter({ store, auth, read, aiLimits: (_request, _response, next) => next(), aiBudget: (_request, _response, next) => next(), limitStore: () => undefined, limits: { login: { windowMs: 60_000, limit: 100 }, loginPerEmail: { windowMs: 60_000, limit: 100 }, register: { windowMs: 60_000, limit: 100 } }, demo: { enabled: false }, now: () => clock }))
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
  const waiting = await upload(token, openingId, 'cara')
  busy = false
  assert.equal(waiting.status, 429)
  assert.equal(waiting.body.code, 'ai_busy')
  assert.equal(waiting.headers.get('retry-after'), '20')

  // The opening comes back with its resumes ranked best first.
  const detail = await call('GET', `/openings/${openingId}`, { token })
  assert.deepEqual(detail.body.candidates.map(row => row.name), ['Asha Rao', 'Ben Ito'])
  assert.equal(detail.body.opening.candidateCount, 2)
  assert.ok(detail.body.weights.keywords > detail.body.weights.experience)
  assert.ok(detail.body.weights.experience > detail.body.weights.skills)
  assert.deepEqual(detail.body.candidates.map(row => row.status), ['new', 'new'])
  assert.deepEqual(detail.body.candidates.map(row => row.serial), [1, 2])
  assert.match(detail.body.candidates[0].why, /^Meets all 3 must-haves/)

  // Duplicates: the same file is refused before reading; the same email is refused after reading.
  const sameFile = await upload(token, openingId, 'asha')
  assert.equal(sameFile.status, 409)
  assert.equal(sameFile.body.code, 'duplicate')
  assert.match(sameFile.body.error, /Asha Rao/)
  const sameEmail = await upload(token, openingId, 'asha again')
  assert.equal(sameEmail.status, 409)
  assert.equal(sameEmail.body.code, 'duplicate')

  // Decisions: shortlist, reject with a reason, back to new. A reason is kept only with a rejection.
  const cara = await upload(token, openingId, 'cara')
  assert.equal(cara.body.candidate.serial, 3)
  const ashaId = asha.body.candidate.id
  const decided = await call('PATCH', `/openings/${openingId}/candidates/${ashaId}`, { token, body: { status: 'shortlisted', reason: 'ignored' } })
  assert.equal(decided.body.candidate.status, 'shortlisted')
  assert.equal(decided.body.candidate.reason, '')
  const rejected = await call('PATCH', `/openings/${openingId}/candidates/${ben.body.candidate.id}`, { token, body: { status: 'rejected', reason: 'No frontend experience' } })
  assert.equal(rejected.body.candidate.reason, 'No frontend experience')
  assert.equal((await call('PATCH', `/openings/${openingId}/candidates/${ashaId}`, { token, body: { status: 'maybe' } })).status, 400)

  // Bulk: shortlist two, then reset one; unknown actions and empty selections are refused.
  const bulk = await call('POST', `/openings/${openingId}/candidates/bulk`, { token, body: { ids: [ben.body.candidate.id, cara.body.candidate.id], action: 'shortlist' } })
  assert.equal(bulk.body.changed, 2)
  await call('POST', `/openings/${openingId}/candidates/bulk`, { token, body: { ids: [ben.body.candidate.id], action: 'reset' } })
  assert.equal((await call('POST', `/openings/${openingId}/candidates/bulk`, { token, body: { ids: [], action: 'shortlist' } })).status, 400)
  assert.equal((await call('POST', `/openings/${openingId}/candidates/bulk`, { token, body: { ids: [ashaId], action: 'promote' } })).status, 400)
  const statuses = Object.fromEntries((await call('GET', `/openings/${openingId}`, { token })).body.candidates.map(row => [row.name, row.status]))
  assert.deepEqual(statuses, { 'Asha Rao': 'shortlisted', 'Ben Ito': 'new', '=Cara "CJ" Jones': 'shortlisted' })

  // The list carries the decision pipeline.
  assert.deepEqual((await call('GET', '/openings', { token })).body.openings[0].pipeline, { new: 1, shortlisted: 2, rejected: 0 })

  // Export: shortlisted only, best first, quoted, and safe to open in a spreadsheet.
  const exportResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/hr/openings/${openingId}/export.csv`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(exportResponse.status, 200)
  assert.match(exportResponse.headers.get('content-disposition'), /frontend-developer-shortlist\.csv/)
  const csv = (await exportResponse.text()).replace(/^﻿/, '').trim().split('\r\n')
  assert.equal(csv.length, 3)
  assert.match(csv[0], /^Rank,Name,Email,Phone,Headline,Overall score,Keywords,Experience,Skills,Completeness,Must-haves met/)
  assert.match(csv[1], /^1,Asha Rao,asha@example.com/)
  assert.match(csv[2], /^2,"'=Cara ""CJ"" Jones",cara@example.com/)

  // Settings: custom weights re-rank (keywords only), blind mode hides the best name in the list, bad weights refused.
  const weighted = await call('PATCH', `/openings/${openingId}/settings`, { token, body: { weights: { skills: 0, experience: 0, education: 0, keywords: 100 } } })
  assert.deepEqual(weighted.body.weights, { keywords: 100, experience: 0, skills: 0, completeness: 0 })

  // Screening: the pass threshold and knockouts are saved and decide each resume's group; bad values are refused.
  const screened = await call('PATCH', `/openings/${openingId}/settings`, { token, body: { threshold: 80, knockouts: { mustHave: true } } })
  assert.equal(screened.body.opening.threshold, 80)
  assert.deepEqual(screened.body.opening.knockouts, { minYears: false, mustHave: true })
  assert.equal((await call('PATCH', `/openings/${openingId}/settings`, { token, body: { threshold: 20 } })).status, 400)
  assert.equal((await call('PATCH', `/openings/${openingId}/settings`, { token, body: { knockouts: 'all' } })).status, 400)
  const screenedRows = (await call('GET', `/openings/${openingId}`, { token })).body.candidates
  assert.ok(screenedRows.every(row => typeof row.ats.score === 'number' && ['ranked', 'below', 'ats'].includes(row.group) && row.threshold === 80))
  const benRow = screenedRows.find(row => row.name === 'Ben Ito')
  assert.notEqual(benRow.group, 'ranked')
  if (benRow.group === 'below') assert.equal(benRow.knockouts[0].id, 'mustHave')
  await call('PATCH', `/openings/${openingId}/settings`, { token, body: { threshold: 65, knockouts: { mustHave: false } } })
  assert.equal((await call('PATCH', `/openings/${openingId}/settings`, { token, body: { weights: { skills: 0, experience: 0, education: 0, keywords: 0 } } })).status, 400)
  assert.equal((await call('PATCH', `/openings/${openingId}/settings`, { token, body: { weights: { skills: 500 } } })).status, 400)
  assert.equal((await call('PATCH', `/openings/${openingId}/settings`, { token, body: {} })).status, 400)
  await call('PATCH', `/openings/${openingId}/settings`, { token, body: { weights: null } })
  await call('PATCH', `/openings/${openingId}/candidates/${ashaId}`, { token, body: { status: 'new' } })
  await call('PATCH', `/openings/${openingId}/settings`, { token, body: { blind: true } })
  assert.equal((await call('GET', '/openings', { token })).body.openings[0].bestCandidate, 'Candidate 1')
  await call('PATCH', `/openings/${openingId}/settings`, { token, body: { blind: false } })

  // Closed openings are read-only until reopened: no uploads, decisions, removals or job edits.
  assert.equal((await call('PATCH', `/openings/${openingId}/settings`, { token, body: { status: 'closed' } })).body.opening.status, 'closed')
  assert.equal((await upload(token, openingId, 'new person')).body.code, 'closed')
  assert.equal((await call('PATCH', `/openings/${openingId}/candidates/${ashaId}`, { token, body: { status: 'shortlisted' } })).body.code, 'closed')
  assert.equal((await call('DELETE', `/openings/${openingId}/candidates/${cara.body.candidate.id}`, { token })).body.code, 'closed')
  assert.equal((await call('PUT', `/openings/${openingId}`, { token, body: job() })).body.code, 'closed')
  assert.equal((await call('PATCH', `/openings/${openingId}/settings`, { token, body: { status: 'reopen' } })).status, 400)
  assert.equal((await call('PATCH', `/openings/${openingId}/settings`, { token, body: { status: 'open' } })).body.opening.status, 'open')
  assert.equal((await call('POST', `/openings/${openingId}/candidates/bulk`, { token, body: { ids: [cara.body.candidate.id], action: 'remove' } })).body.removed, 1)
  assert.equal((await call('GET', `/openings/${openingId}`, { token })).body.opening.candidateCount, 2)

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
  // The account still shows both openings as used, and the overview says the limit is reached.
  const afterDelete = await call('GET', '/openings', { token })
  assert.equal(afterDelete.body.openings.length, 1)
  assert.equal(afterDelete.body.account.openingsCreated, 2)
  assert.equal(afterDelete.body.account.openingLimit, 2)
  // Deleting the last one doesn't help either.
  assert.equal((await call('DELETE', `/openings/${afterDelete.body.openings[0].id}`, { token })).status, 200)
  assert.equal((await call('GET', '/auth/me', { token })).body.account.openingsCreated, 2)
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

  // Registration: per-field errors, configured logins can't be re-registered, passwords are stored hashed only.
  const signup = (overrides = {}) => ({ fullName: 'Meera Iyer', email: 'meera@talentco.in', phone: '+91 98200 11111', jobTitle: 'HR Manager', password: 'hire2026ok', confirmPassword: 'hire2026ok', companyName: 'TalentCo Pvt. Ltd.', website: 'talentco.in', industry: 'Staffing & Recruitment', companySize: '51–200', city: 'Mumbai', country: 'India', registrationType: 'gstin', registrationNumber: '27aaacr0000a1z5', agree: true, ...overrides })
  const bad = await call('POST', '/auth/register', { body: signup({ fullName: '', password: 'short', confirmPassword: 'other', registrationNumber: '12345', agree: false, industry: 'Mining' }) })
  assert.equal(bad.status, 400)
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['agree', 'confirmPassword', 'fullName', 'industry', 'password', 'registrationNumber'])
  assert.equal((await call('POST', '/auth/register', { body: signup({ email: 'abc@gmail.com' }) })).status, 409)
  const meera = await call('POST', '/auth/register', { body: signup() })
  assert.equal(meera.status, 201)
  assert.ok(meera.body.token)
  assert.equal(meera.body.account.details.fullName, 'Meera Iyer')
  assert.equal(meera.body.account.details.registrationNumber, '27AAACR0000A1Z5')
  assert.equal(meera.body.account.details.website, 'https://talentco.in')
  assert.equal(meera.body.account.verification.status, 'pending')
  assert.equal(JSON.stringify(meera.body).includes('hire2026ok'), false)
  const stored = db.read(`hrAccounts/${hrIdFor('meera@talentco.in')}`)
  assert.equal(stored.credentials.algorithm, 'scrypt')
  assert.equal(JSON.stringify(stored).includes('hire2026ok'), false)
  assert.equal((await call('POST', '/auth/register', { body: signup() })).body.code, 'exists')
  assert.equal((await call('POST', '/auth/login', { body: { email: 'Meera@TalentCo.in', password: 'hire2026ok' } })).status, 200)
  assert.equal((await call('POST', '/auth/login', { body: { email: 'meera@talentco.in', password: 'wrong-pass1' } })).status, 401)

  // Profile edits keep the email and verification; a malformed CIN is refused per field.
  const edited = await call('PUT', '/account/details', { token: meera.body.token, body: { ...signup({ companyName: 'TalentCo India', email: 'someone@else.com' }) } })
  assert.equal(edited.body.account.details.companyName, 'TalentCo India')
  assert.equal(edited.body.account.email, 'meera@talentco.in')
  assert.equal(edited.body.account.details.verification, 'pending')
  const badCin = await call('PUT', '/account/details', { token: meera.body.token, body: signup({ registrationType: 'cin', registrationNumber: 'U123' }) })
  assert.equal(badCin.status, 400)
  assert.match(badCin.body.fields.registrationNumber, /21 characters/)

  // Signing up with an email that was granted a plan earlier keeps that plan.
  db.seed(`hrAccounts/${hrIdFor('lead@corp.example')}`, { email: 'lead@corp.example', plan: { tier: 'pro', status: 'active', term: 'lifetime' }, openingsCreated: 0 })
  assert.equal((await call('POST', '/auth/register', { body: signup({ email: 'lead@corp.example' }) })).body.account.plan, 'pro')

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

  // There is no built-in password: without environment settings nobody signs in with a configured login.
  assert.deepEqual(configuredHrAccounts({}), [])
  // The demo is switched off for this router.
  assert.equal((await call('POST', '/auth/demo')).status, 404)
  assert.deepEqual(configuredHrAccounts({ RESUMETRICS_HR_EMAIL: 'HR@Corp.com', RESUMETRICS_HR_PASSWORD: 'longer-pass' }), [{ email: 'hr@corp.com', password: 'longer-pass' }])
} finally {
  server.close()
}

console.log('hrRoutes: ok')
