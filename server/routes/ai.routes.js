import { Router } from 'express'
import { env, validateAIConfiguration } from '../config/env.js'
import { getUsage, secondsUntilNextDay, usageDay } from '../ai/usage.js'
import { aiAllowance } from '../ai/allowance.js'
import { requireUser } from '../services/firebaseAdmin.js'

const router = Router()

function publicConfigurationMessage() {
  return 'AI backend is not configured. Add the required RESUMETRICS_AI_* values to server/.env.local.'
}

// Config check only; it never calls the model. To try the model itself, run `npm run ai:ping`
// (the old public POST /api/ai/test let anyone send prompts on our key).
router.get('/health', (_request, response) => {
  try {
    validateAIConfiguration()
    return response.json({
      ok: true,
      provider: env.ai.provider,
      message: 'AI backend is configured'
    })
  } catch (error) {
    console.error('AI health check configuration error:', error.message)
    return response.status(503).json({
      ok: false,
      provider: env.ai.provider,
      message: publicConfigurationMessage()
    })
  }
})

// The signed-in person's own AI usage today and what is left of their daily allowance.
router.get('/usage', requireUser, async (request, response) => {
  const day = usageDay()
  const usage = await getUsage(request.firebaseUser.uid, day)
  const tokens = usage.tokensIn + usage.tokensOut
  const allowance = await aiAllowance.forRequest(request)
  return response.json({
    ok: true,
    day,
    ...usage,
    tokens,
    tier: allowance.tier,
    dailyTokenAllowance: allowance.dailyTokens,
    remainingTokens: Math.max(0, allowance.dailyTokens - tokens),
    resetsInSeconds: secondsUntilNextDay()
  })
})

export default router
