import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDirectory = path.dirname(fileURLToPath(import.meta.url))
const serverDirectory = path.resolve(configDirectory, '..')

// Keep local secrets in the server directory. Existing process variables take priority.
dotenv.config({ path: path.join(serverDirectory, '.env.local'), quiet: true })
dotenv.config({ path: path.join(serverDirectory, '.env'), quiet: true })

const positiveInt = (name, fallback) => {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

// Groq's free chat models as of 2026-11 (the key's model list). A model that disappears is skipped at run time.
const GROQ_FREE_CHAT_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b']
const geminiModel = () => process.env.RESUMETRICS_GEMINI_API_KEY?.trim() ? `gemini:${process.env.RESUMETRICS_GEMINI_MODEL?.trim() || 'gemini-flash-lite-latest'}` : null
function fallbackModelsFrom(raw, provider, gemini) {
  const value = raw?.trim()
  if (value === 'none') return []
  const models = value ? value.split(',').map(item => item.trim()).filter(Boolean) : provider === 'groq' ? [...GROQ_FREE_CHAT_MODELS] : []
  // Gemini goes last unless the list already names it.
  return gemini && !models.some(model => model.startsWith('gemini:')) ? [...models, gemini] : models
}

const timeZoneOr = (name, fallback) => {
  const value = process.env[name]?.trim()
  if (!value) return fallback
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return value
  } catch {
    return fallback
  }
}

const firebaseServiceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
  ''

// Hosted environments (Vercel) have no key files on disk, so the credentials can also arrive as variable contents.
const firebaseServiceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ?? ''
const githubPrivateKey = (process.env.GITHUB_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim()

export const env = Object.freeze({
  port: Number.parseInt(process.env.PORT ?? '8787', 10),
  webOrigin: process.env.RESUMETRICS_WEB_ORIGIN ?? 'http://localhost:5173',
  firebase: Object.freeze({
    serviceAccountPath: firebaseServiceAccountPath,
    serviceAccountJson: firebaseServiceAccountJson
  }),
  github: Object.freeze({
    appId: process.env.GITHUB_APP_ID?.trim() ?? '',
    clientId: process.env.GITHUB_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET?.trim() ?? '',
    privateKeyPath: process.env.GITHUB_PRIVATE_KEY_PATH?.trim() ?? '',
    privateKey: githubPrivateKey,
    appSlug: process.env.GITHUB_APP_SLUG?.trim() ?? 'resumetrics-evidence',
    callbackUrl: process.env.GITHUB_CALLBACK_URL?.trim() ?? 'http://localhost:8787/api/github/callback',
    frontendUrl: process.env.FRONTEND_URL?.trim() ?? process.env.RESUMETRICS_WEB_ORIGIN?.trim() ?? 'http://localhost:5173'
  }),
  ai: Object.freeze({
    apiKey: process.env.RESUMETRICS_AI_API_KEY?.trim() ?? '',
    provider: process.env.RESUMETRICS_AI_PROVIDER?.trim().toLowerCase() ?? 'groq',
    defaultModel: process.env.RESUMETRICS_AI_DEFAULT_MODEL?.trim() || (process.env.RESUMETRICS_AI_PROVIDER?.trim().toLowerCase() === 'mock' ? 'mock' : ''),
    // Optional per-task models; each falls back to the default model.
    models: Object.freeze({
      nimbus: process.env.RESUMETRICS_AI_MODEL_NIMBUS?.trim() ?? '',
      jd: process.env.RESUMETRICS_AI_MODEL_JD?.trim() ?? '',
      linkedin: process.env.RESUMETRICS_AI_MODEL_LINKEDIN?.trim() ?? '',
      github: process.env.RESUMETRICS_AI_MODEL_GITHUB?.trim() ?? ''
    }),
    // Models tried in order when a task's own model is rate-limited or unavailable. Groq's free limits are per
    // model, so spreading over several multiplies the capacity at no cost. Comma-separated; "none" turns it off.
    fallbackModels: Object.freeze(fallbackModelsFrom(process.env.RESUMETRICS_AI_FALLBACK_MODELS, process.env.RESUMETRICS_AI_PROVIDER?.trim().toLowerCase() ?? 'groq', geminiModel())),
    // Optional Google Gemini key: its model ("gemini:<id>") is the last fallback, after every Groq model.
    gemini: Object.freeze({
      apiKey: process.env.RESUMETRICS_GEMINI_API_KEY?.trim() ?? '',
      model: process.env.RESUMETRICS_GEMINI_MODEL?.trim() || 'gemini-flash-lite-latest',
      timeoutMs: positiveInt('RESUMETRICS_GEMINI_TIMEOUT_MS', 25_000),
      // Free-tier style limits for its own budget; a 429 from Google also pauses it for the Retry-After.
      rpm: positiveInt('RESUMETRICS_GEMINI_RPM', 15),
      rpd: positiveInt('RESUMETRICS_GEMINI_RPD', 1000)
    })
  }),
  githubScanCap: Math.max(1, Math.min(100, Number.parseInt(process.env.RESUMETRICS_GITHUB_SCAN_CAP ?? '25', 10) || 25)),
  // Rate limits (server/middleware/limits.js, server/ai/providerBudget.js). Provider defaults match the Groq free tier.
  limits: Object.freeze({
    ipPerMinute: positiveInt('RESUMETRICS_LIMIT_IP_PER_MINUTE', 60),
    userAiPerMinute: positiveInt('RESUMETRICS_LIMIT_USER_AI_PER_MINUTE', 10),
    userAiPerDay: positiveInt('RESUMETRICS_LIMIT_USER_AI_PER_DAY', 150),
    // NIMBUS requests a free account may make per day (PLAN-034, D44); Pro keeps the general per-day limit above.
    nimbusFreePerDay: positiveInt('RESUMETRICS_LIMIT_NIMBUS_FREE_PER_DAY', 20),
    providerRpm: positiveInt('RESUMETRICS_AI_RPM', 30),
    providerTpm: positiveInt('RESUMETRICS_AI_TPM', 8000),
    providerRpd: positiveInt('RESUMETRICS_AI_RPD', 1000),
    providerTpd: positiveInt('RESUMETRICS_AI_TPD', 200_000)
  }),
  // Per-user daily AI allowance (server/ai/usage.js). The day starts at midnight in this time zone.
  usage: Object.freeze({
    userDailyTokens: positiveInt('RESUMETRICS_USER_DAILY_TOKENS', 50_000),
    timeZone: timeZoneOr('RESUMETRICS_USAGE_TIME_ZONE', 'Asia/Kolkata')
  }),
  // AI allowance per plan (server/ai/allowance.js). Free = userAiPerMinute, userAiPerDay and userDailyTokens above;
  // Pro (monthly or yearly) and Lifetime (which includes the developer accounts) get more, because they pay. The
  // provider-wide limits (providerTpm, providerTpd) still cap everyone together: raise those with the AI key.
  allowances: Object.freeze({
    pro: Object.freeze({
      perMinute: positiveInt('RESUMETRICS_PRO_AI_PER_MINUTE', 20),
      perDay: positiveInt('RESUMETRICS_PRO_AI_PER_DAY', 600),
      dailyTokens: positiveInt('RESUMETRICS_PRO_DAILY_TOKENS', 250_000)
    }),
    lifetime: Object.freeze({
      perMinute: positiveInt('RESUMETRICS_LIFETIME_AI_PER_MINUTE', 30),
      perDay: positiveInt('RESUMETRICS_LIFETIME_AI_PER_DAY', 1500),
      dailyTokens: positiveInt('RESUMETRICS_LIFETIME_DAILY_TOKENS', 600_000)
    })
  }),
  // Job tracker (server/jobs). JSearch (OpenWeb Ninja) lists postings from LinkedIn, Glassdoor, Foundit and others;
  // context.dev reads the listing pages of the boards it misses (Naukri, Indeed, Internshala), with Tavily web search
  // as the fallback. A search is cached so repeats cost nothing.
  jobs: Object.freeze({
    jsearchKey: process.env.JSEARCH_API_KEY?.trim() ?? '',
    jsearchUrl: process.env.JSEARCH_API_URL?.trim() || 'https://api.openwebninja.com/jsearch/search',
    contextDevKey: process.env.CONTEXT_DEV_API_KEY?.trim() ?? '',
    tavilyKey: process.env.TAVILY_API_KEY?.trim() ?? '',
    searchesPerDay: positiveInt('RESUMETRICS_JOB_SEARCHES_PER_DAY', 15),
    cacheHours: positiveInt('RESUMETRICS_JOB_CACHE_HOURS', 6)
  }),
  // HR portal (server/routes/hr.routes.js). Daily AI allowance per HR account, in tokens (one resume is roughly
  // 10-30k), a smaller one for demo workspaces, and whether "Explore the demo" is offered (RESUMETRICS_HR_DEMO=0 turns it off).
  hr: Object.freeze({
    dailyTokens: positiveInt('RESUMETRICS_HR_DAILY_TOKENS', 200_000),
    demoDailyTokens: positiveInt('RESUMETRICS_HR_DEMO_DAILY_TOKENS', 40_000),
    demoEnabled: process.env.RESUMETRICS_HR_DEMO?.trim() !== '0'
  }),
  // Number of reverse proxies in front of the server (e.g. 1 on Cloud Run or Render), so rate limits see real client IPs.
  trustProxy: Math.max(0, Number.parseInt(process.env.RESUMETRICS_TRUST_PROXY ?? '0', 10) || 0)
})

export class GitHubConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GitHubConfigurationError'
  }
}

export function validateGitHubConfiguration() {
  if (!env.github.appId) throw new GitHubConfigurationError('GITHUB_APP_ID is missing. Add it to server/.env.local.')
  if (!env.github.clientId) throw new GitHubConfigurationError('GITHUB_CLIENT_ID is missing. Add it to server/.env.local.')
  if (!env.github.clientSecret) throw new GitHubConfigurationError('GITHUB_CLIENT_SECRET is missing. Add it to server/.env.local.')
  if (!env.github.privateKeyPath && !env.github.privateKey) throw new GitHubConfigurationError('GITHUB_PRIVATE_KEY_PATH (or GITHUB_PRIVATE_KEY) is missing. Add it to server/.env.local.')
  if (!env.github.appSlug) throw new GitHubConfigurationError('GITHUB_APP_SLUG is missing. Add it to server/.env.local.')
  if (!env.github.callbackUrl) throw new GitHubConfigurationError('GITHUB_CALLBACK_URL is missing. Add it to server/.env.local.')
  if (!env.github.frontendUrl) throw new GitHubConfigurationError('FRONTEND_URL is missing. Add it to server/.env.local.')
}

export class AIConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AIConfigurationError'
  }
}

export function validateAIConfiguration() {
  // The offline mock needs no key or model (server/ai/mockProvider.js).
  if (env.ai.provider === 'mock') return

  if (!env.ai.apiKey) {
    throw new AIConfigurationError('RESUMETRICS_AI_API_KEY is missing. Add it to server/.env.local.')
  }

  if (!env.ai.defaultModel) {
    throw new AIConfigurationError('RESUMETRICS_AI_DEFAULT_MODEL is missing. Add it to server/.env.local.')
  }

  if (env.ai.provider !== 'groq') {
    throw new AIConfigurationError(`Unsupported AI provider: ${env.ai.provider}.`)
  }
}
