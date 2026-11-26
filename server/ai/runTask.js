import { env } from '../config/env.js'
import { generateAIResponse } from '../services/aiClient.js'

/** Model for a task group, falling back to the default model. */
export const modelFor = group => env.ai.provider === 'mock' ? env.ai.defaultModel : env.ai.models?.[group] || env.ai.defaultModel

export function parseJson(raw) {
  const text = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(text)
  } catch {
    // Models occasionally wrap JSON in prose; take the outermost object.
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1))
    throw new SyntaxError('The AI response was not valid JSON.')
  }
}

/**
 * Run one structured AI task: JSON output → validate(). If parsing or validation fails, the model gets one
 * chance to repair its answer using the error messages; after that `fallback()` (if any) is used.
 * validate(data) must return the cleaned value or throw an Error whose message explains what is wrong.
 */
export async function runStructuredTask({ group, systemPrompt, userPrompt, validate, fallback, temperature = 0.1, maxCompletionTokens, reasoningEffort, onAttempt }) {
  const model = modelFor(group)
  const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
  let lastError = null
  let usedModel = model
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const started = Date.now()
    let raw = ''
    try {
      // The client may answer from a fallback model when this one is rate-limited (server/services/aiClient.js).
      raw = await generateAIResponse({ messages, model, temperature, responseFormat: 'json', maxCompletionTokens, reasoningEffort, onModel: answered => { usedModel = answered } })
      // validate may be stricter on the first attempt, when a repair is still possible.
      const value = validate(parseJson(raw), { attempt })
      onAttempt?.({ attempt, ok: true, ms: Date.now() - started, model: usedModel })
      return { value, attempts: attempt, model: usedModel, repaired: attempt > 1 }
    } catch (error) {
      lastError = error
      onAttempt?.({ attempt, ok: false, ms: Date.now() - started, model, error: error.message })
      // Configuration and network errors are not the model's fault; don't retry them as repairs.
      // Configuration, auth and rate-limit errors are not the model's fault; retrying immediately won't help.
      if (error?.name === 'AIConfigurationError' || error?.status === 401 || error?.status === 429 || /timeout|timed out/i.test(`${error?.name} ${error?.message}`)) break
      if (attempt === 1 && raw) {
        messages.push({ role: 'assistant', content: raw.slice(0, 12_000) })
        messages.push({ role: 'user', content: `Your JSON was rejected: ${String(error.message).slice(0, 600)}\nReturn the corrected JSON object only, following the same rules.` })
      } else if (attempt === 1) {
        continue
      }
    }
  }
  console.warn(`AI task (${group}) fell back after errors: ${String(lastError?.message ?? lastError).slice(0, 300)}`)
  if (fallback) return { value: fallback(lastError), attempts: 2, model, fallback: true, error: lastError?.message, busy: lastError?.name === 'AIBusyError' }
  throw lastError
}
