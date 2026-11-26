// The fallback checks below need a fake Groq set-up, and the config is read once on first import.
process.env.RESUMETRICS_AI_PROVIDER = 'groq'
process.env.RESUMETRICS_AI_API_KEY = 'test-key'
process.env.RESUMETRICS_AI_DEFAULT_MODEL = 'model-a'
process.env.RESUMETRICS_AI_FALLBACK_MODELS = 'model-a,model-b,model-c'
process.env.RESUMETRICS_GEMINI_API_KEY = ''   // keep a real key in .env.local out of these checks
const assert = (await import('node:assert/strict')).default
const { AIBusyError, createProviderBudget, formatWait } = await import('../server/ai/providerBudget.js')

const message = chars => [{ role: 'user', content: 'x'.repeat(chars) }]   // ~chars/4 tokens
const busy = (work, check) => assert.throws(work, error => error instanceof AIBusyError && check(error))

// Readable waits.
assert.equal(formatWait(40), '40 s')
assert.equal(formatWait(0.2), '1 s')
assert.equal(formatWait(600), '10 min')
assert.equal(formatWait(5 * 3600), 'about 5 hours')

// Requests per minute: the 4th call within a minute waits for the 1st to leave the window.
let budget = createProviderBudget({ rpm: 3, tpm: 1_000_000, rpd: 1000 })
budget.reserve(message(40), 0)
budget.reserve(message(40), 10_000)
budget.reserve(message(40), 20_000)
busy(() => budget.reserve(message(40), 30_000), error => error.reason === 'requests' && error.retryAfterSeconds === 30 && error.status === 429)
budget.reserve(message(40), 60_000)   // first call has left the window

// Tokens per minute: real usage from settle() replaces the estimate.
budget = createProviderBudget({ rpm: 100, tpm: 1000, rpd: 1000 })
const first = budget.reserve(message(400), 0)        // estimate 100
budget.settle(first, 900)                             // really used 900
busy(() => budget.reserve(message(800), 5_000), error => error.reason === 'tokens' && error.retryAfterSeconds === 55)
budget.reserve(message(800), 60_000)                  // the 900 have expired

// Wait only until just enough old calls expire: 3 calls of 300 tokens, a 500-token request needs two to go.
budget = createProviderBudget({ rpm: 100, tpm: 1000, rpd: 1000 })
for (const at of [0, 10_000, 20_000]) budget.settle(budget.reserve(message(4), at), 300)
busy(() => budget.reserve(message(2000), 25_000), error => error.retryAfterSeconds === 45)   // second call expires at 70 s

// One request larger than the whole minute budget still goes through when the minute is empty.
budget = createProviderBudget({ rpm: 100, tpm: 100, rpd: 1000 })
budget.reserve(message(4000), 0)

// Requests per day, across all users.
budget = createProviderBudget({ rpm: 100, tpm: 1_000_000, rpd: 2 })
budget.reserve(message(4), 0)
budget.reserve(message(4), 1000)
busy(() => budget.reserve(message(4), 2000), error => error.reason === 'daily' && /today's limit/.test(error.message))
budget.reserve(message(4), 86_400_000)                // the first call is a day old

// Tokens per day, across all users (the Groq free tier's tightest limit): wait until enough old calls are a day old.
budget = createProviderBudget({ rpm: 100, tpm: 1_000_000, rpd: 1000, tpd: 1000 })
budget.settle(budget.reserve(message(4), 0), 600)
budget.settle(budget.reserve(message(4), 3_600_000), 300)
busy(() => budget.reserve(message(800), 7_200_000), error => error.reason === 'daily' && error.retryAfterSeconds === 79_200)  // 200 more needs the first call gone
budget.reserve(message(800), 86_400_000)

// A provider 429 blocks that model until its Retry-After has passed.
budget = createProviderBudget({ rpm: 100, tpm: 1_000_000, rpd: 1000 })
budget.block(20, 0)
busy(() => budget.reserve(message(4), 5_000), error => error.reason === 'provider' && error.retryAfterSeconds === 15)
budget.reserve(message(4), 20_000)

// Model fallback (server/services/aiClient.js): budgets are per model, a rate-limited or retired model is skipped,
// and the caller learns which model answered.
const { generateAIResponse, setAIClientForTests } = await import('../server/services/aiClient.js')
const { budgetFor } = await import('../server/ai/providerBudget.js')
const tried = []
const behaviour = { 'model-a': () => { throw Object.assign(new Error('Rate limit reached'), { status: 429, headers: { 'retry-after': '40' } }) }, 'model-b': () => { throw Object.assign(new Error('The model model-b has been decommissioned'), { status: 400 }) } }
setAIClientForTests({ chat: { completions: { create: async request => {
  tried.push(request.model)
  behaviour[request.model]?.()
  return { choices: [{ message: { content: `answer from ${request.model}` } }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }
} } } })
let answeredBy = null
assert.equal(await generateAIResponse({ userPrompt: 'hi', onModel: model => { answeredBy = model } }), 'answer from model-c')
assert.deepEqual(tried, ['model-a', 'model-b', 'model-c'])
assert.equal(answeredBy, 'model-c')
// model-a is now blocked for its Retry-After, so the next call does not even try it.
tried.length = 0
await generateAIResponse({ userPrompt: 'hi again' })
assert.deepEqual(tried, ['model-b', 'model-c'])
busy(() => budgetFor('model-a').reserve(message(4)), error => error.reason === 'provider')
// When every model is busy, the shortest wait is reported.
behaviour['model-c'] = () => { throw Object.assign(new Error('Rate limit'), { status: 429, headers: { 'retry-after': '12' } }) }
await assert.rejects(generateAIResponse({ userPrompt: 'third' }), error => error instanceof AIBusyError && error.retryAfterSeconds === 12)
// A real error (bad key) is not hidden by trying other models.
behaviour['model-d'] = () => { throw Object.assign(new Error('Invalid API key'), { status: 401 }) }
tried.length = 0
await assert.rejects(generateAIResponse({ userPrompt: 'x', model: 'model-d', fallbackModels: ['model-e'] }), error => error.status === 401)
assert.deepEqual(tried, ['model-d'])
setAIClientForTests(null)

// Gemini as a fallback model: requests go to its OpenAI-compatible endpoint, errors carry status and Retry-After,
// and a slow answer becomes a 504 so the caller moves on.
const { createGeminiClient } = await import('../server/ai/geminiClient.js')
const { env } = await import('../server/config/env.js')
assert.ok(!env.ai.fallbackModels.some(model => model.startsWith('gemini:')), 'no key, no Gemini fallback')
let sent = null
const gemini = createGeminiClient({ apiKey: 'g-key', fetchImpl: async (url, options) => { sent = { url, options }; return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { total_tokens: 7 } }), { status: 200 }) } })
assert.equal((await gemini.chat.completions.create({ model: 'gemini-flash-lite-latest', messages: [] })).choices[0].message.content, '{"ok":true}')
assert.match(sent.url, /generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions$/)
assert.equal(sent.options.headers.Authorization, 'Bearer g-key')
const limited = createGeminiClient({ apiKey: 'g', fetchImpl: async () => new Response(JSON.stringify([{ error: { message: 'Quota exceeded' } }]), { status: 429, headers: { 'retry-after': '21' } }) })
await assert.rejects(limited.chat.completions.create({}), error => error.status === 429 && error.headers.get('retry-after') === '21' && /Quota exceeded/.test(error.message))
const slow = createGeminiClient({ apiKey: 'g', timeoutMs: 20, fetchImpl: (url, options) => new Promise((resolve, reject) => {
  // A real request keeps the process alive; this fake needs its own timer to (AbortSignal.timeout's is unref'd).
  const keepAlive = setTimeout(() => {}, 1000)
  options.signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(options.signal.reason) })
}) })
await assert.rejects(slow.chat.completions.create({}), error => error.status === 504)

console.log('providerBudget: all checks passed')
