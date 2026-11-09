// context.dev (https://docs.context.dev): reads a web page through its own browsers and proxies and returns it as
// structured JSON. Server-side only; the key never reaches the browser. The rest of the app calls scrapeJson().
const API = 'https://api.context.dev/v1'

export class ContextDevError extends Error {
  /** code: not_configured | auth | credits | rate_limited | timeout | unreachable | failed | empty */
  constructor(code, message, status = 0) {
    super(message)
    this.name = 'ContextDevError'
    this.code = code
    this.status = status
  }
}

const CODES = { 401: 'auth', 402: 'credits', 403: 'auth', 429: 'rate_limited' }

/**
 * Reads `url` and extracts data matching `schema` (a JSON Schema object). Resolves { data, markdown, creditsRemaining }.
 * With markdown: true the page's own text comes back too (no extra credits), to check the extraction against.
 * maxAgeMs lets context.dev answer from its own copy of the page when it is fresh enough.
 */
export async function scrapeJson({ url, schema, instructions = '', maxAgeMs, markdown = false, waitForMs = 0 }, { apiKey, fetchImpl = fetch, timeoutMs = 50_000 } = {}) {
  if (!apiKey) throw new ContextDevError('not_configured', 'is not configured')
  const body = {
    url,
    formats: { json: true, ...(markdown ? { markdown: true } : {}) },
    jsonParams: { schema, ...(instructions ? { instructions } : {}) },
    // waitFor gives pages that draw their content with scripts time to finish before they are read.
    ...(waitForMs > 0 ? { sharedParams: { waitFor: waitForMs } } : {}),
    ...(Number.isFinite(maxAgeMs) ? { maxAgeMs } : {})
  }
  let response
  try {
    response = await fetchImpl(`${API}/web/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    throw error?.name === 'TimeoutError' ? new ContextDevError('timeout', 'timed out') : new ContextDevError('unreachable', 'could not be reached')
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload) throw new ContextDevError(CODES[response.status] ?? 'failed', `answered ${response.status}`, response.status)
  const json = payload.json
  if (!json?.success || !json.data || typeof json.data !== 'object') throw new ContextDevError('empty', `returned no data${json?.error_code ? ` (${json.error_code})` : ''}`, response.status)
  const text = payload.markdown?.data ?? payload.markdown?.markdown
  return { data: json.data, markdown: typeof text === 'string' ? text : '', creditsRemaining: Number.isFinite(payload.key_metadata?.credits_remaining) ? payload.key_metadata.credits_remaining : null }
}
