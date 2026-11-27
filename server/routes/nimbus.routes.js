import { Router } from 'express'
import { startNdjson } from '../ai/ndjson.js'
import { friendlyNimbusError, planNimbusTurn, TONES } from '../nimbus/nimbusEngine.js'
import { planLetterTurn } from '../nimbus/letterEngine.js'
import { usageDay } from '../ai/usage.js'
import { env } from '../config/env.js'
import { isProPlan } from '../../shared/plans.js'
import { userStore } from '../db/userStore.js'
import { BRAND } from '../../shared/brand.js'

// Guided Pro tasks (PLAN-034, D44). Free-form requests stay free; these named tools need Pro.
export const PRO_FEATURES = ['quantify', 'tone', 'tailor', 'one-page', 'template']
const PLAN_CACHE_MS = 60_000

/**
 * The NIMBUS router. users: plan lookup (tests pass a stub). freePerDay: NIMBUS turns a free account gets per day,
 * counted in memory per server process (like the other per-user limits).
 */
export function createNimbusRouter({ users = userStore, freePerDay = () => env.limits.nimbusFreePerDay, now = () => Date.now() } = {}) {
  const router = Router()
  const plans = new Map()   // uid -> { pro, at }
  const freeTurns = new Map() // uid -> { day, count }

  const isPro = async uid => {
    if (!uid) return false
    const cached = plans.get(uid)
    if (cached && now() - cached.at < PLAN_CACHE_MS) return cached.pro
    try {
      const pro = isProPlan(await users.getPlan(uid), now())
      plans.set(uid, { pro, at: now() })
      return pro
    } catch (error) {
      // If the plan can't be read, treat the account as free rather than blocking NIMBUS.
      console.error('NIMBUS could not read the plan:', error?.message)
      return false
    }
  }
  const takeFreeTurn = uid => {
    const day = usageDay(now())
    const entry = freeTurns.get(uid)
    const current = entry?.day === day ? entry : { day, count: 0 }
    if (current.count >= freePerDay()) return false
    freeTurns.set(uid, { day, count: current.count + 1 })
    return true
  }

  // One NIMBUS turn, streamed: thinking → (plan + steps) | options | question | message → items → done.
  router.post('/turn', async (request, response) => {
    const { instruction, context, feature = null, tone = null } = request.body ?? {}
    if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > 2000) {
      return response.status(400).json({ ok: false, error: 'Tell NIMBUS what to do (up to 2,000 characters).' })
    }
    if (!context || typeof context !== 'object' || !context.resumeData) {
      return response.status(400).json({ ok: false, error: 'Open a resume before asking NIMBUS to edit it.' })
    }
    // The cover letter uses the same turn contract with its own prompt and operations (PLAN-033).
    const isLetter = context.document === 'letter'
    if (isLetter && (!context.letter || typeof context.letter !== 'object')) {
      return response.status(400).json({ ok: false, error: 'Open a cover letter before asking NIMBUS to edit it.' })
    }
    if (feature !== null && (isLetter || !PRO_FEATURES.includes(feature))) return response.status(400).json({ ok: false, error: 'Unknown NIMBUS tool.' })
    if (feature === 'tone' && !TONES.includes(tone)) return response.status(400).json({ ok: false, error: `Pick a tone: ${TONES.join(', ')}.` })
    const uid = request.firebaseUser?.uid
    const pro = await isPro(uid)
    if (feature && !pro) return response.status(403).json({ ok: false, code: 'pro_required', feature: 'nimbusPro', error: `This NIMBUS tool is part of ${BRAND.pro}.` })
    if (!pro && uid && !takeFreeTurn(uid)) {
      return response.status(429).json({ ok: false, code: 'nimbus_free_limit', error: `You’ve used today’s ${freePerDay()} free NIMBUS requests. They refresh tomorrow, or Pro raises the limit. The checks and fixes that don’t need AI still work.` })
    }

    const stream = startNdjson(request, response)
    stream.send({ type: 'thinking', text: 'Reading your resume and request…' })
    try {
      const turn = isLetter
        ? await planLetterTurn({ instruction: instruction.trim(), context })
        : await planNimbusTurn({ instruction: instruction.trim(), context, plan: pro ? 'pro' : 'free', feature, tone })
      if (stream.closed) return
      if (turn.mode === 'edit') {
        // Parts the checks refused are listed as failed steps with a plain reason, so the person sees what wasn't done.
        stream.send({ type: 'plan', steps: [
          ...turn.steps.map((step, index) => ({ id: `s${index + 1}`, title: step.title })),
          ...(turn.skipped ?? []).map((step, index) => ({ id: `x${index + 1}`, title: step.title, skipped: true, note: 'I couldn’t do this part safely. Try asking for it on its own.' }))
        ] })
        turn.steps.forEach((step, index) => stream.send({ type: 'step', id: `s${index + 1}`, title: step.title, operations: step.operations }))
        stream.send({ type: 'message', text: turn.message || 'Done.' })
        if (turn.items?.length) stream.send({ type: 'items', items: turn.items })
      } else if (turn.mode === 'suggest') {
        stream.send({ type: 'message', text: turn.message })
        stream.send({ type: 'items', items: turn.items })
      } else if (turn.mode === 'options') {
        if (turn.message) stream.send({ type: 'message', text: turn.message })
        stream.send({ type: 'options', ...turn.options })
      } else if (turn.mode === 'question') {
        stream.send({ type: 'question', text: turn.question.text, quickReplies: turn.question.quickReplies, intro: turn.message && turn.message !== turn.question.text ? turn.message : '' })
      } else {
        stream.send({ type: 'message', text: turn.message, tone: turn.tone ?? (turn.mode === 'refuse' ? 'warning' : 'neutral') })
      }
      stream.end({ type: 'done', model: turn.model, plan: pro ? 'pro' : 'free' })
    } catch (error) {
      console.error('NIMBUS turn failed:', error?.message)
      const message = friendlyNimbusError(error)
      stream.end({ type: 'error', message })
    }
  })
  return router
}

export default createNimbusRouter()
