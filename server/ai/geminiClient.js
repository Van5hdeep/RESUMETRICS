// Google Gemini through its OpenAI-compatible endpoint, shaped like the Groq SDK client
// ({ chat: { completions: { create } } }) so server/services/aiClient.js can use it as a fallback model.
// Used only after every Groq model is busy (PLAN-034 follow-up). Free-tier Gemini may use requests to improve
// Google's products, so it stays the last resort; see server/.env.example.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

export function createGeminiClient({ apiKey, timeoutMs = 25_000, fetchImpl = fetch }) {
  async function create(request) {
    let response
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (error) {
      // A slow free-tier answer counts as unavailable, so the caller moves on (status 504).
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      throw Object.assign(new Error(timedOut ? 'Gemini took too long to answer.' : `Gemini could not be reached: ${error?.message}`), { status: timedOut ? 504 : 503 })
    }
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = Array.isArray(body) ? body[0]?.error : body?.error
      throw Object.assign(new Error(`Gemini: ${detail?.message ?? `HTTP ${response.status}`}`), { status: response.status, headers: response.headers })
    }
    return body
  }
  return { chat: { completions: { create } } }
}
