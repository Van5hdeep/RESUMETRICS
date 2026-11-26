import Groq from 'groq-sdk'
import { env, validateAIConfiguration } from '../config/env.js'
import { AIBusyError, budgetFor } from '../ai/providerBudget.js'
import { recordAiCall, recordLimited } from '../ai/usage.js'
import { createMockClient } from '../ai/mockProvider.js'
import { createGeminiClient } from '../ai/geminiClient.js'

// Seconds from a provider 429's Retry-After header (Headers object or plain record), default 30.
function retryAfterSeconds(error) {
  const raw = typeof error?.headers?.get === 'function' ? error.headers.get('retry-after') : error?.headers?.['retry-after']
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 30
}

// Tests swap in a fake provider SDK to check model fallback without network calls.
let clientForTests = null

// Fallback models named "gemini:<id>" go to Google Gemini (server/ai/geminiClient.js) with their own budget.
const GEMINI_PREFIX = 'gemini:'
const isGemini = candidate => String(candidate).startsWith(GEMINI_PREFIX)
let geminiClient = null
function clientFor(candidate) {
  if (clientForTests) return clientForTests
  if (!isGemini(candidate)) return createProviderClient()
  if (!env.ai.gemini.apiKey) throw Object.assign(new Error('No Gemini key is set (RESUMETRICS_GEMINI_API_KEY).'), { status: 404 })
  geminiClient ??= createGeminiClient({ apiKey: env.ai.gemini.apiKey, timeoutMs: env.ai.gemini.timeoutMs })
  return geminiClient
}
const budgetOf = candidate => isGemini(candidate)
  ? budgetFor(candidate, { rpm: env.ai.gemini.rpm, rpd: env.ai.gemini.rpd, tpm: 250_000 })
  : budgetFor(candidate)
export function setAIClientForTests(client) { clientForTests = client }

function createProviderClient() {
  if (clientForTests) return clientForTests
  validateAIConfiguration()

  // Provider selection is kept here so route handlers stay provider-agnostic.
  // The SDK retries rate limits (honouring retry-after), timeouts and server errors itself.
  if (env.ai.provider === 'groq') {
    // Interactive features can't make people wait through long retry chains: one retry, 30s per call.
    return new Groq({ apiKey: env.ai.apiKey, maxRetries: 1, timeout: 30_000 })
  }
  // Canned, offline answers for CI and tests (server/ai/mockProvider.js).
  if (env.ai.provider === 'mock') return createMockClient()

  // validateAIConfiguration currently prevents this path, but it keeps the
  // provider boundary explicit for future implementations.
  throw new Error(`No client is registered for provider: ${env.ai.provider}`)
}

function buildResponseFormat(responseFormat, jsonSchema) {
  if (responseFormat === 'json_schema' && jsonSchema) return { type: 'json_schema', json_schema: { name: jsonSchema.name, schema: jsonSchema.schema, strict: true } }
  if (responseFormat === 'json') return { type: 'json_object' }
  return undefined
}

const isReasoningModel = model => /gpt-oss/i.test(model)

/**
 * Generate a response without exposing a provider SDK to routes or frontend code.
 */
export async function generateAIResponse({
  systemPrompt = 'You are a concise, helpful resume-writing assistant.',
  userPrompt,
  temperature = 0.4,
  responseFormat = 'text',
  jsonSchema,
  seed,
  maxCompletionTokens,
  reasoningEffort,
  model,
  messages,
  // Models to try after `model` (defaults to env.ai.fallbackModels); onModel(model) reports the one that answered.
  fallbackModels,
  onModel
}) {
  if (!messages && (typeof userPrompt !== 'string' || !userPrompt.trim())) {
    throw new TypeError('A non-empty user prompt is required.')
  }

  const selectedModel = model || env.ai.defaultModel
  const conversation = messages ?? [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt.trim() }
  ]
  const requestFor = candidate => {
    if (isGemini(candidate)) {
      // Gemini's OpenAI-compatible API: no seed; light thinking keeps the free tier fast.
      const request = { model: candidate.slice(GEMINI_PREFIX.length), messages: conversation, temperature, response_format: buildResponseFormat(responseFormat, jsonSchema) }
      if (Number.isInteger(maxCompletionTokens)) request.max_completion_tokens = maxCompletionTokens
      if (reasoningEffort) request.reasoning_effort = 'low'
      return request
    }
    const request = { model: candidate, messages: conversation, temperature, response_format: buildResponseFormat(responseFormat, jsonSchema) }
    if (Number.isInteger(seed)) request.seed = seed
    if (Number.isInteger(maxCompletionTokens)) request.max_completion_tokens = maxCompletionTokens
    if (reasoningEffort && isReasoningModel(candidate)) request.reasoning_effort = reasoningEffort
    // Qwen thinks out loud by default; keep its reasoning out of the answer so the JSON parses.
    if (/qwen/i.test(candidate)) request.reasoning_format = 'hidden'
    return request
  }

  // The task's model first, then the fallback models: a model that is rate-limited (by our per-model budget or by
  // the provider) or no longer offered is skipped. Each call passes that model's budget first, and is counted
  // against the signed-in user of the current request (server/ai/usage.js). The mock has a single "model".
  const candidates = env.ai.provider === 'mock' ? [selectedModel] : [...new Set([selectedModel, ...(fallbackModels ?? env.ai.fallbackModels)].filter(Boolean))]
  let completion
  let usedModel
  let ticket
  let busy = null
  let lastError = null
  for (const candidate of candidates) {
    ticket = undefined
    try {
      // The mock costs nothing, so it skips the provider budget (tests make many calls quickly); usage is still recorded.
      if (env.ai.provider !== 'mock') ticket = budgetOf(candidate).reserve(conversation)
      completion = await clientFor(candidate).chat.completions.create(requestFor(candidate))
      usedModel = candidate
      break
    } catch (error) {
      if (ticket) budgetOf(candidate).settle(ticket, 0)
      const asBusy = error instanceof AIBusyError ? error : error?.status === 429 ? new AIBusyError(retryAfterSeconds(error), 'provider') : null
      if (asBusy) {
        if (!(error instanceof AIBusyError)) budgetOf(candidate).block(asBusy.retryAfterSeconds)
        if (!busy || asBusy.retryAfterSeconds < busy.retryAfterSeconds) busy = asBusy
        continue
      }
      // A model that was retired, renamed or rejects a parameter: try the next one. Anything else is a real error.
      if (error?.status === 404 || error?.status >= 500 || (error?.status === 400 && /model/i.test(String(error?.message)))) { lastError = error; continue }
      throw error
    }
  }
  if (!completion) {
    if (busy) {
      recordLimited().catch(() => {})
      throw busy
    }
    throw lastError ?? new Error('No AI model could be reached.')
  }
  onModel?.(usedModel)
  budgetOf(usedModel).settle(ticket, completion.usage?.total_tokens)
  recordAiCall({ tokensIn: completion.usage?.prompt_tokens ?? 0, tokensOut: completion.usage?.completion_tokens ?? 0 })
    .catch(error => console.error('AI usage could not be recorded:', error?.message))

  const result = completion.choices?.[0]?.message?.content?.trim()
  if (!result) throw new Error('The AI provider returned an empty response.')
  return result
}
