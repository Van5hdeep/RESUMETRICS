import assert from 'node:assert/strict'
import express from 'express'
import { allowanceFor, createAllowanceResolver, tierOf } from '../server/ai/allowance.js'
import { createDailyTokenBudget, createMemoryUsageStore, setUsageStore, usageDay } from '../server/ai/usage.js'
import { createUserAiLimits } from '../server/middleware/limits.js'

const NOW = Date.UTC(2026, 10, 26, 9, 0, 0)
const config = {
  limits: { userAiPerMinute: 2, userAiPerDay: 5 },
  usage: { userDailyTokens: 1000 },
  allowances: { pro: { perMinute: 4, perDay: 10, dailyTokens: 5000 }, lifetime: { perMinute: 6, perDay: 20, dailyTokens: 9000 } }
}

// Which tier a plan is: expired, cancelled and missing plans are Free; lifetime is its own tier.
assert.equal(tierOf(null, NOW), 'free')
assert.equal(tierOf({ tier: 'free', status: 'active' }, NOW), 'free')
assert.equal(tierOf({ tier: 'pro', status: 'canceled', term: 'monthly' }, NOW), 'free')
assert.equal(tierOf({ tier: 'pro', status: 'active', term: 'monthly', currentPeriodEnd: new Date(NOW - 1000).toISOString() }, NOW), 'free', 'an ended plan is Free')
assert.equal(tierOf({ tier: 'pro', status: 'active', term: 'yearly', currentPeriodEnd: new Date(NOW + 86_400_000).toISOString() }, NOW), 'pro')
assert.equal(tierOf({ tier: 'pro', status: 'active', term: 'lifetime', source: 'developer' }, NOW), 'lifetime')
assert.deepEqual(allowanceFor('free', config), { perMinute: 2, perDay: 5, dailyTokens: 1000 })
assert.equal(allowanceFor('pro', config).dailyTokens, 5000)
assert.equal(allowanceFor('lifetime', config).perDay, 20)

// The resolver reads each plan once a minute, and a plan that can't be read counts as Free.
const plans = { free: null, pro: { tier: 'pro', status: 'active', term: 'monthly' }, dev: { tier: 'pro', status: 'active', term: 'lifetime' } }
let reads = 0
let clock = NOW
const resolver = createAllowanceResolver({ config, now: () => clock, users: { getPlan: async uid => { reads += 1; if (uid === 'broken') throw new Error('database down'); return plans[uid] } } })
const as = uid => ({ firebaseUser: { uid } })
assert.equal(await resolver.perDay(as('free')), 5)
assert.equal(await resolver.perDay(as('pro')), 10)
assert.equal(await resolver.dailyTokens(as('dev')), 9000)
assert.equal((await resolver.forRequest(as('broken'))).tier, 'free')
const before = reads
await resolver.perMinute(as('pro')); await resolver.dailyTokens(as('pro'))
assert.equal(reads, before, 'a remembered plan is not read again')
clock += 61_000
await resolver.perDay(as('pro'))
assert.equal(reads, before + 1, 'the plan is read again after a minute')
assert.equal((await resolver.forRequest({})).tier, 'free', 'no signed-in user means Free')

// Rate limits follow the plan: the same limiter lets a Pro account do more than a Free one.
const app = express()
app.use((request, _response, next) => { request.firebaseUser = { uid: request.get('x-test-user') }; next() })
app.use(createUserAiLimits({ perMinute: request => resolver.perMinute(request), perDay: request => resolver.perDay(request) }), (_request, response) => response.json({ ok: true }))
const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
const call = user => fetch(`http://127.0.0.1:${server.address().port}/`, { headers: { 'x-test-user': user } })
const statuses = async (user, count) => { const out = []; for (let i = 0; i < count; i += 1) out.push((await call(user)).status); return out }
assert.deepEqual(await statuses('free', 3), [200, 200, 429], 'Free: 2 a minute')
assert.deepEqual(await statuses('pro', 5), [200, 200, 200, 200, 429], 'Pro: 4 a minute')
assert.deepEqual(await statuses('dev', 7), [200, 200, 200, 200, 200, 200, 429], 'Lifetime: 6 a minute')
server.close()

// The daily day-limit message names the plan's own number.
const dayApp = express()
dayApp.use((request, _response, next) => { request.firebaseUser = { uid: request.get('x-test-user') }; next() })
dayApp.use(createUserAiLimits({ perMinute: 100, perDay: request => resolver.perDay(request) }), (_request, response) => response.json({ ok: true }))
const dayServer = await new Promise(resolve => { const listener = dayApp.listen(0, '127.0.0.1', () => resolve(listener)) })
for (let i = 0; i < 5; i += 1) await fetch(`http://127.0.0.1:${dayServer.address().port}/`, { headers: { 'x-test-user': 'free' } })
const refused = await fetch(`http://127.0.0.1:${dayServer.address().port}/`, { headers: { 'x-test-user': 'free' } })
assert.equal(refused.status, 429)
assert.match((await refused.json()).error, /today’s 5 AI actions/)
dayServer.close()

// The token allowance follows the plan too.
const store = createMemoryUsageStore()
setUsageStore(store)
await store.add('free', usageDay(), { tokensIn: 600, tokensOut: 600 })
await store.add('pro', usageDay(), { tokensIn: 600, tokensOut: 600 })
const budget = createDailyTokenBudget({ allowance: request => resolver.dailyTokens(request) })
const run = async uid => {
  let passed = false
  const response = { set() {}, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
  await budget(as(uid), response, () => { passed = true })
  return { passed, code: response.code }
}
assert.deepEqual(await run('free'), { passed: false, code: 429 }, 'Free account is over 1,000 tokens')
assert.deepEqual(await run('pro'), { passed: true, code: undefined }, 'the same use is fine on Pro (5,000)')

console.log('aiAllowance: all checks passed')
