import assert from 'node:assert/strict'
import express from 'express'
import { createWorkspaceDemos, demoPlan, WORKSPACE_DEMO_MS } from '../server/services/workspaceDemo.js'
import { createRequireUser, isExpiredDemo } from '../server/services/firebaseAdmin.js'
import { allowanceFor, createAllowanceResolver, NO_DAILY_REQUEST_CAP, NO_DAILY_TOKEN_CAP, tierOf } from '../server/ai/allowance.js'
import { createUserRouter, DEMOS_PER_HOUR } from '../server/routes/user.routes.js'
import { hrDailyRequests, hrDailyTokens } from '../server/routes/hr.routes.js'
import { publicPlan } from '../server/db/userStore.js'
import { isProPlan } from '../shared/plans.js'
import { createFakeFirestore } from './helpers/fakeFirestore.js'

let clock = Date.parse('2026-11-27T10:00:00Z')
const now = () => clock

// The demo plan is Pro until the demo ends, then free; its AI tier has no daily caps.
const plan = demoPlan(clock + WORKSPACE_DEMO_MS)
assert.equal(isProPlan(publicPlan(plan), clock), true)
assert.equal(isProPlan(publicPlan(plan), clock + WORKSPACE_DEMO_MS + 1), false)
assert.equal(publicPlan(plan).term, 'demo')
assert.equal(tierOf(plan, clock), 'demo')
const config = { limits: { userAiPerMinute: 2, userAiPerDay: 5 }, usage: { userDailyTokens: 1000 }, allowances: { pro: { perMinute: 4, perDay: 10, dailyTokens: 5000 }, lifetime: { perMinute: 6, perDay: 20, dailyTokens: 9000 } } }
assert.deepEqual(allowanceFor('demo', config), { perMinute: 6, perDay: NO_DAILY_REQUEST_CAP, dailyTokens: NO_DAILY_TOKEN_CAP })
const resolver = createAllowanceResolver({ users: { getPlan: async () => publicPlan(plan) }, config, now })
assert.equal(await resolver.dailyTokens({ firebaseUser: { uid: 'demo_1' } }), NO_DAILY_TOKEN_CAP)
assert.ok(Number.isFinite(NO_DAILY_TOKEN_CAP), 'the cap survives JSON (Infinity would become null)')

// HR demo workspaces have no daily allowance; real HR accounts keep theirs.
assert.equal(hrDailyTokens({ hrUser: { demo: true } }), NO_DAILY_TOKEN_CAP)
assert.equal(hrDailyRequests({ hrUser: { demo: true } }), NO_DAILY_REQUEST_CAP)
assert.ok(hrDailyTokens({ hrUser: { demo: false } }) < NO_DAILY_TOKEN_CAP)
assert.ok(hrDailyRequests({ hrUser: { demo: false } }) < NO_DAILY_REQUEST_CAP)

// Opening a demo: a Pro user record with its expiry, and a custom token carrying the demo marker.
const db = createFakeFirestore()
const issued = []
const deleted = []
const adminAuth = {
  createCustomToken: async (uid, claims) => { issued.push({ uid, claims }); return `token-for-${uid}` },
  deleteUser: async uid => { deleted.push(uid) }
}
const demos = createWorkspaceDemos({ getDb: () => db, getAdminAuth: () => adminAuth, now })
const opened = await demos.create()
assert.match(opened.uid, /^demo_[0-9a-f]{24}$/)
assert.equal(opened.token, `token-for-${opened.uid}`)
assert.deepEqual(issued[0].claims, { demo: true, demoExpiresAt: clock + WORKSPACE_DEMO_MS })
const record = db.read(`users/${opened.uid}`)
assert.equal(record.plan.term, 'demo')
assert.equal(record.profile.displayName, 'Demo user')
assert.equal(record.demoExpiresAt, clock + WORKSPACE_DEMO_MS)

// Sweeping: only expired demos go, with everything under them; real accounts are never touched.
db.seed(`users/${opened.uid}/resumes/r1`, { name: 'Demo resume' })
db.seed('users/real-person', { profile: { displayName: 'Asha' }, plan: { tier: 'free' } })
assert.equal(await demos.sweepExpired(), 0)
clock += WORKSPACE_DEMO_MS + 1
assert.equal(await demos.sweepExpired(), 1)
assert.equal(db.read(`users/${opened.uid}`), undefined)
assert.equal(db.read(`users/${opened.uid}/resumes/r1`), undefined)
assert.deepEqual(deleted, [opened.uid])
assert.ok(db.read('users/real-person'))

// Signed-in requests: a demo whose day is over is refused; a live demo and a Google account pass.
assert.equal(isExpiredDemo({ demo: true, demoExpiresAt: clock - 1 }, clock), true)
assert.equal(isExpiredDemo({ demo: true, demoExpiresAt: clock + 1 }, clock), false)
assert.equal(isExpiredDemo({ uid: 'google-user' }, clock), false)
const tokens = { live: { uid: 'demo_live', demo: true, demoExpiresAt: Date.now() + 60_000 }, ended: { uid: 'demo_old', demo: true, demoExpiresAt: Date.now() - 1 }, google: { uid: 'g1' } }
const requireUser = createRequireUser({ signInMessage: 'Sign in', unavailableMessage: 'Down', verify: async token => tokens[token] })

// The demo endpoint: opens a demo without signing in, can be switched off, and is capped per network.
const app = express()
const opener = { create: async () => ({ token: 'custom-token', expiresAt: 123 }), sweepExpired: async () => 0 }
app.use('/on', express.json(), createUserRouter({ authenticate: requireUser, demos: opener, demoEnabled: true, demoStore: null }))
app.use('/off', express.json(), createUserRouter({ authenticate: requireUser, demos: opener, demoEnabled: false, demoStore: null }))
app.get('/check', requireUser, (request, response) => response.json({ ok: true, uid: request.firebaseUser.uid }))
const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
const base = `http://127.0.0.1:${server.address().port}`
try {
  const first = await fetch(`${base}/on/demo`, { method: 'POST' })
  assert.equal(first.status, 201)
  assert.deepEqual(await first.json(), { ok: true, token: 'custom-token', expiresAt: 123 })
  assert.equal((await fetch(`${base}/off/demo`, { method: 'POST' })).status, 404)
  for (let index = 1; index < DEMOS_PER_HOUR; index += 1) assert.equal((await fetch(`${base}/on/demo`, { method: 'POST' })).status, 201)
  const tooMany = await fetch(`${base}/on/demo`, { method: 'POST' })
  assert.equal(tooMany.status, 429)
  assert.equal((await tooMany.json()).code, 'rate_limited')

  const check = token => fetch(`${base}/check`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal((await check('live')).status, 200)
  assert.equal((await check('google')).status, 200)
  const ended = await check('ended')
  assert.equal(ended.status, 401)
  assert.equal((await ended.json()).code, 'demo_ended')
} finally {
  server.close()
}

console.log('workspaceDemo: ok')
