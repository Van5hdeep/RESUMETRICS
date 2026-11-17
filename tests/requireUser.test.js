import assert from 'node:assert/strict'
import { createRequireUser, FirebaseServerConfigurationError, requireFirebaseUser, requireUser } from '../server/services/firebaseAdmin.js'

// Minimal Express stand-ins: request.get reads a header, response records status and JSON body.
const requestWith = authorization => ({ get: name => (name.toLowerCase() === 'authorization' ? authorization : undefined) })
function run(middleware, request) {
  const result = { status: null, body: null, nextCalled: false }
  const response = {
    status(code) { result.status = code; return this },
    json(body) { result.body = body; return this }
  }
  return Promise.resolve(middleware(request, response, () => { result.nextCalled = true })).then(() => result)
}

const verified = []
const guard = createRequireUser({
  signInMessage: 'Sign in first.',
  unavailableMessage: 'Not configured.',
  verify: async token => {
    verified.push(token)
    if (token === 'good-token') return { uid: 'alice' }
    if (token === 'config-error') throw new FirebaseServerConfigurationError('missing service account')
    throw Object.assign(new Error('bad token'), { code: 'auth/argument-error' })
  }
})

const quietly = async work => {
  const original = console.error
  console.error = () => {}
  try { return await work() } finally { console.error = original }
}

// No header, or a non-Bearer scheme, is refused before any verification.
let result = await run(guard, requestWith(undefined))
assert.equal(result.status, 401)
assert.equal(result.body.error, 'Sign in first.')
assert.equal(result.nextCalled, false)
result = await run(guard, requestWith('Basic abc'))
assert.equal(result.status, 401)
assert.deepEqual(verified, [])

// A valid token passes through with the decoded user attached.
const request = requestWith('Bearer good-token')
result = await run(guard, request)
assert.equal(result.nextCalled, true)
assert.equal(result.status, null)
assert.deepEqual(request.firebaseUser, { uid: 'alice' })
assert.deepEqual(verified, ['good-token'])

// Invalid tokens are 401; a server without Firebase Admin is 503.
result = await quietly(() => run(guard, requestWith('Bearer forged')))
assert.equal(result.status, 401)
assert.match(result.body.error, /sign in again/i)
assert.equal(result.nextCalled, false)
result = await quietly(() => run(guard, requestWith('Bearer config-error')))
assert.equal(result.status, 503)
assert.equal(result.body.error, 'Not configured.')

// The shared guards keep their own wording.
assert.match((await run(requireUser, requestWith(undefined))).body.error, /AI features/)
assert.match((await run(requireFirebaseUser, requestWith(undefined))).body.error, /GitHub/)

console.log('requireUser: all checks passed')

// The Firebase sign-in header is read without a regular expression: a crafted header can't stall the server.
{
  const { bearerToken } = await import('../server/services/bearer.js')
  assert.equal(bearerToken('Bearer abc.def'), 'abc.def')
  assert.equal(bearerToken('bearer   abc.def  '), 'abc.def')
  assert.equal(bearerToken('Basic abc'), '')
  assert.equal(bearerToken(`Bearer ${'x'.repeat(5000)}`), '', 'oversized headers are refused')
  const started = Date.now()
  for (let index = 0; index < 50; index += 1) bearerToken(`Bearer${' '.repeat(4000)}`)
  assert.ok(Date.now() - started < 50, 'a header full of spaces is handled in linear time')
  console.log('requireUser bearer parsing: ok')
}
