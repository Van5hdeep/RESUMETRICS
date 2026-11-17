import assert from 'node:assert/strict'
import express from 'express'
import { createMemoryUsageStore, enforceDailyTokenBudget, getUsage, recordAiCall, secondsUntilNextDay, setUsageStore, trackAiUsage, usageDay } from '../server/ai/usage.js'
import { env } from '../server/config/env.js'

const quietly = async work => {
  const original = console.log
  console.log = () => {}
  try { return await work() } finally { console.log = original }
}

// Usage days follow the configured time zone: 20:00 UTC on 7 Oct is already 8 Oct in India.
const evening = Date.UTC(2026, 9, 7, 20, 0, 0)
assert.equal(usageDay(evening, 'Asia/Kolkata'), '2026-10-08')
assert.equal(usageDay(evening, 'UTC'), '2026-10-07')
assert.equal(secondsUntilNextDay(Date.UTC(2026, 9, 7, 18, 30, 0), 'Asia/Kolkata'), 86_400)   // IST midnight
assert.equal(secondsUntilNextDay(Date.UTC(2026, 9, 8, 18, 29, 0), 'Asia/Kolkata'), 60)       // 23:59 IST

// The store adds per user per day.
setUsageStore(createMemoryUsageStore())
const day = usageDay()

// Outside a request nothing is recorded (npm run ai:ping, evals).
assert.equal(await recordAiCall({ tokensIn: 5, tokensOut: 5 }), null)

// Inside requests, model calls are attributed to the right user across body parsing, awaits and overlapping requests.
const app = express()
app.use('/api/ai', (request, _response, next) => { request.firebaseUser = { uid: request.get('x-test-user') }; next() },
  express.json(), trackAiUsage, async (request, response) => {
    // The delay comes from the test's own requests; it is capped so no request can hold the server for long.
    await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(Number(request.body.delay) || 0, 0), 1000)))
    await recordAiCall({ tokensIn: request.body.tokensIn, tokensOut: 10 })
    await Promise.resolve()
    await recordAiCall({ tokensIn: request.body.tokensIn, tokensOut: 10 })
    response.json({ ok: true })
  })
const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
const call = (user, tokensIn, delay) => fetch(`http://127.0.0.1:${server.address().port}/api/ai`, {
  method: 'POST', headers: { 'x-test-user': user, 'Content-Type': 'application/json' }, body: JSON.stringify({ tokensIn, delay })
})
await quietly(() => Promise.all([call('alice', 100, 30), call('bob', 1000, 5), call('alice', 100, 15)]))
server.close()
assert.deepEqual(await getUsage('alice', day), { calls: 4, tokensIn: 400, tokensOut: 40, limitedCalls: 0 })
assert.deepEqual(await getUsage('bob', day), { calls: 2, tokensIn: 2000, tokensOut: 20, limitedCalls: 0 })

// The daily allowance refuses once used up, with Retry-After until midnight, and counts the refusal.
const store = createMemoryUsageStore()
setUsageStore(store)
await store.add('carol', day, { tokensIn: env.usage.userDailyTokens - 10, tokensOut: 10 })
await store.add('dave', day, { tokensIn: env.usage.userDailyTokens - 11, tokensOut: 10 })
function runBudget(uid) {
  const result = { status: null, body: null, headers: {}, nextCalled: false }
  const response = {
    set(name, value) { result.headers[name] = value; return this },
    status(code) { result.status = code; return this },
    json(body) { result.body = body; return this }
  }
  return enforceDailyTokenBudget({ firebaseUser: { uid } }, response, () => { result.nextCalled = true }).then(() => result)
}
const refused = await runBudget('carol')
assert.equal(refused.status, 429)
assert.equal(refused.nextCalled, false)
assert.match(refused.body.error, /today’s AI allowance/)
assert.ok(Number(refused.headers['Retry-After']) > 0 && Number(refused.headers['Retry-After']) <= 86_400)
assert.equal((await getUsage('carol', day)).limitedCalls, 1)
assert.equal((await runBudget('dave')).nextCalled, true)

console.log('aiUsage: all checks passed')
