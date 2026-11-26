import { env } from '../config/env.js'

const MINUTE = 60_000
const DAY = 86_400_000

/** "40 s", "3 min", "about 5 hours" for messages people read. */
export function formatWait(seconds) {
  const safe = Math.max(1, Math.ceil(Number(seconds) || 1))
  if (safe < 90) return `${safe} s`
  const minutes = Math.round(safe / 60)
  return minutes < 90 ? `${minutes} min` : `about ${Math.round(minutes / 60)} hours`
}

/** The model can't take another call yet. status 429 so callers treat it like a provider rate limit. */
export class AIBusyError extends Error {
  constructor(retryAfterSeconds, reason = 'requests') {
    const seconds = Math.max(1, Math.ceil(retryAfterSeconds))
    super(reason === 'daily'
      ? `The AI has reached today's limit for everyone. Try again in ${formatWait(seconds)}.`
      : `The AI is busy right now. Try again in ${formatWait(seconds)}.`)
    this.name = 'AIBusyError'
    this.status = 429
    this.reason = reason
    this.retryAfterSeconds = seconds
    this.wait = formatWait(seconds)
  }
}

// Rough token count for the request side (about 4 characters per token); the real count replaces it after the call.
const estimateTokens = messages => Math.ceil((messages ?? []).reduce((sum, message) => sum + String(message?.content ?? '').length, 0) / 4)

/**
 * App-wide budget for one provider account, shared by every user: requests and tokens per minute and per day
 * (rolling windows, in memory, so it resets when the server restarts). Sized to the Groq free tier by default.
 * reserve() before each model call, settle() with the real total tokens afterwards.
 */
export function createProviderBudget({ rpm, tpm, rpd, tpd = Infinity }) {
  const calls = []   // { at, tokens } for the last 24 hours, oldest first

  // Seconds until enough of the oldest `window` calls expire for `estimate` more tokens to fit under `cap`.
  const waitForTokens = (window, used, estimate, cap, span, now) => {
    let index = 0
    while (index < window.length && used + estimate > cap) used -= window[index++].tokens
    return (window[index - 1].at + span - now) / 1000
  }

  // When the provider itself answers 429, nothing is sent to it again until its Retry-After has passed.
  let blockedUntil = 0
  function block(seconds, now = Date.now()) {
    blockedUntil = Math.max(blockedUntil, now + Math.max(1, Number(seconds) || 30) * 1000)
  }

  function reserve(messages, now = Date.now()) {
    if (now < blockedUntil) throw new AIBusyError((blockedUntil - now) / 1000, 'provider')
    while (calls.length && now - calls[0].at >= DAY) calls.shift()
    if (calls.length >= rpd) throw new AIBusyError((calls[0].at + DAY - now) / 1000, 'daily')

    const estimate = estimateTokens(messages)
    const dayTokens = calls.reduce((sum, call) => sum + call.tokens, 0)
    if (calls.length && dayTokens + estimate > tpd) throw new AIBusyError(waitForTokens(calls, dayTokens, estimate, tpd, DAY, now), 'daily')

    const lastMinute = calls.filter(call => now - call.at < MINUTE)
    if (lastMinute.length >= rpm) throw new AIBusyError((lastMinute[0].at + MINUTE - now) / 1000, 'requests')

    let used = lastMinute.reduce((sum, call) => sum + call.tokens, 0)
    // A single request larger than the whole budget is let through when the minute is empty; the provider decides.
    // Wait until just enough of the oldest calls leave the window (or all of them, for an oversized request).
    if (lastMinute.length && used + estimate > tpm) throw new AIBusyError(waitForTokens(lastMinute, used, estimate, tpm, MINUTE, now), 'tokens')

    const ticket = { at: now, tokens: estimate }
    calls.push(ticket)
    return ticket
  }

  function settle(ticket, totalTokens) {
    if (ticket && Number.isFinite(totalTokens) && totalTokens >= 0) ticket.tokens = totalTokens
  }

  return { reserve, settle, block }
}

// One budget per model: Groq's free-tier limits (requests and tokens per minute and per day) apply to each model
// separately, so a task that falls back to another model draws on that model's allowance (PLAN-034 follow-up).
const budgets = new Map()
export function budgetFor(model, limits = {}) {
  const key = model || 'default'
  if (!budgets.has(key)) budgets.set(key, createProviderBudget({ rpm: env.limits.providerRpm, tpm: env.limits.providerTpm, rpd: env.limits.providerRpd, tpd: env.limits.providerTpd, ...limits }))
  return budgets.get(key)
}
