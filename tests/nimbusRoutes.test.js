// PLAN-034: the NIMBUS route gates guided Pro tools, caps free accounts per day and streams suggestion items.
process.env.RESUMETRICS_AI_PROVIDER = 'mock'
process.env.RESUMETRICS_AI_DEFAULT_MODEL = 'mock'
const assert = (await import('node:assert/strict')).default
const express = (await import('express')).default
const { createNimbusRouter } = await import('../server/routes/nimbus.routes.js')

const plans = { pro: { tier: 'pro', status: 'active', term: 'lifetime' }, free: null }
const app = express()
app.set('env', 'test')
app.use(express.json())
app.use((request, _response, next) => { request.firebaseUser = { uid: request.get('x-user') }; next() })
app.use('/api/nimbus', createNimbusRouter({ users: { getPlan: async uid => plans[uid] ?? null }, freePerDay: () => 2 }))
const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
const resumeData = { fullName: 'Asha Rao', experience: [{ role: 'Developer', company: 'Acme', bullets: ['Built the dashboard', 'Wrote tests', 'Fixed bugs'] }] }
const call = async (user, body) => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/nimbus/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': user }, body: JSON.stringify({ context: { resumeData }, ...body }) })
  const text = await response.text()
  const events = response.headers.get('content-type')?.includes('json') && !text.includes('\n') ? [JSON.parse(text)] : text.trim().split('\n').map(line => JSON.parse(line))
  return { status: response.status, events }
}

try {
  // A suggestion list streams its message, then the items.
  const listed = await call('pro', { instruction: 'mock:suggest' })
  assert.equal(listed.status, 200)
  const items = listed.events.find(event => event.type === 'items')
  assert.equal(items.items.length, 3)
  assert.equal(listed.events.at(-1).plan, 'pro')

  // Guided tools need Pro; a free account gets a 403 the client shows as an upgrade prompt.
  const locked = await call('free', { instruction: 'Quantify my bullets', feature: 'quantify' })
  assert.equal(locked.status, 403)
  assert.equal(locked.events[0].code, 'pro_required')
  assert.equal((await call('pro', { instruction: 'Rewrite it', feature: 'tone', tone: 'Shouty' })).status, 400)
  assert.equal((await call('pro', { instruction: 'x', feature: 'hack' })).status, 400)

  // Free accounts get freePerDay turns; Pro is not capped here.
  assert.equal((await call('free', { instruction: 'mock:layout' })).status, 200)
  assert.equal((await call('free', { instruction: 'mock:layout' })).status, 200)
  const capped = await call('free', { instruction: 'mock:layout' })
  assert.equal(capped.status, 429)
  assert.equal(capped.events[0].code, 'nimbus_free_limit')
  for (let index = 0; index < 3; index += 1) assert.equal((await call('pro', { instruction: 'mock:layout' })).status, 200)
  console.log('nimbusRoutes: all checks passed')
} finally {
  server.close()
}
