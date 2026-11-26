import { useRef, useState } from 'react'
import { streamNdjson } from '../utils/readNdjson.js'
import { optionToOperations } from './applyNimbusOperations.js'
import { describeNimbusOperation } from './describeNimbusOperation.js'
import { isUndoRequest, withStatus } from './nimbusItems.js'

// Waits for React to render and the template to re-paginate. Hidden tabs don't run animation frames,
// so a timer resolves it anyway (a turn never stalls because the user switched tabs).
export const settleLayout = (extra = 60) => new Promise(resolve => {
  let done = false
  const finish = () => { if (!done) { done = true; resolve() } }
  requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(finish, extra)))
  window.setTimeout(finish, extra + 250)
})

const DESIGN_TYPES = new Set(['set_layout', 'set_resume_style', 'set_element_style'])
const isStale = error => error?.name === 'StaleOperationError'

/**
 * NIMBUS turn runner shared by the editor, the letter studio and their test fixtures.
 * adapter: { snapshot(), restore(snapshot), applyOperations(ops) → { changed, fitOnePage }, buildContext(), fitToOnePage() → { ok, changed, note },
 *            stateKey?() → string (changes when the document changes), pageCount?() → number }
 * Turns may carry `items` (PLAN-034): suggestions the user applies one by one with an arrow, previews on hover,
 * or applies all at once. The chat has no undo buttons: typing "undo" reverses NIMBUS's last change (no AI call),
 * and Ctrl+Z still steps back through the editor's history.
 */
export default function useNimbusTurns({ turns, setTurns, adapter, available, endpoint = '/api/nimbus/turn', stepDelay = 320 }) {
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  // What NIMBUS is doing right now, for the cloud animation and the task line above the composer.
  const [phase, setPhase] = useState('idle')
  const [task, setTask] = useState('')
  const [startedAt, setStartedAt] = useState(0)
  // A suggestion's question the user is answering in the composer: { turnId, itemId, text, title, quickReplies }.
  const [pendingQuestion, setPendingQuestion] = useState(null)
  const phaseTimerRef = useRef(0)
  const settlePhase = next => {
    setPhase(next)
    setTask('')
    window.clearTimeout(phaseTimerRef.current)
    phaseTimerRef.current = window.setTimeout(() => setPhase('idle'), 1800)
  }
  const abortRef = useRef(null)
  // Every change NIMBUS made, newest last: { before, keyAfter, label, turnId, itemId }. Typed "undo" pops one.
  const undoStackRef = useRef([])
  const previewSnapshotRef = useRef(null)
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter
  const busyRef = useRef(false)

  const update = (id, patch) => setTurns(current => current.map(turn => turn.id === id ? { ...turn, ...(typeof patch === 'function' ? patch(turn) : patch) } : turn))
  const updateItem = (turnId, itemId, patch) => update(turnId, turn => ({ items: (turn.items ?? []).map(item => item.id === itemId ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item) }))
  const notice = (text, tone = 'warning') => setTurns(current => [...current, { id: `n${Date.now()}`, role: 'assistant', status: 'done', tone, text }].slice(-60))
  const stateKey = () => adapterRef.current.stateKey?.() ?? null
  const pageCount = () => adapterRef.current.pageCount?.() ?? null
  const remember = async entry => {
    await settleLayout(60)
    undoStackRef.current = [...undoStackRef.current, { ...entry, keyAfter: stateKey() }].slice(-30)
  }

  // "undo" / "undo that" / "revert": put back what the page was before NIMBUS's last change, without the AI.
  const undoLast = text => {
    const stamp = Date.now()
    const reply = (message, tone = 'neutral') => setTurns(current => [...current, { id: `u${stamp}`, role: 'user', text }, { id: `a${stamp + 1}`, role: 'assistant', status: 'done', tone, text: message }].slice(-60))
    const last = undoStackRef.current.at(-1)
    if (!last) { reply('There’s nothing of mine to undo yet. Ctrl+Z steps back through your own edits.'); return }
    // Restoring after hand edits would throw those edits away; Ctrl+Z goes through them one at a time instead.
    if (last.keyAfter !== null && last.keyAfter !== stateKey()) { reply('You’ve edited the resume since my last change, so undoing it here would lose your edits. Use Ctrl+Z to step back instead.', 'warning'); return }
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    adapterRef.current.restore(last.before)
    if (last.itemId) updateItem(last.turnId, last.itemId, item => ({ status: item.operations?.length ? 'ready' : 'deferred', note: 'Undone.' }))
    else if (last.turnId) update(last.turnId, { undone: true, appliedIndex: undefined })
    reply(`Undone: ${last.label}.`)
  }

  // After a design change: if the resume grew onto another page, say so and offer to bring it back (page guard).
  const guardPages = (turnId, pagesBefore, operations) => {
    const pagesAfter = pageCount()
    if (!pagesBefore || !pagesAfter || pagesAfter <= pagesBefore || !operations.some(op => DESIGN_TYPES.has(op.type))) return
    update(turnId, turn => ({ items: [...(turn.items ?? []).filter(item => item.id !== 'fit'), { id: 'fit', title: `That change pushed it to ${pagesAfter} pages`, why: `Pressing this brings it back to ${pagesBefore === 1 ? 'one page' : `${pagesBefore} pages`} by tightening spacing and size, never below 9pt.`, kind: 'layout', impact: 'high', operations: [{ type: 'fit_one_page' }], status: 'ready' }] }))
  }

  /**
   * Run one turn. options: { feature, tone } for Pro tools, label (what the user bubble shows instead of the
   * instruction), item: { turnId, itemId } when a deferred suggestion is being carried out.
   */
  const run = async (instruction, options = {}) => {
    let text = String(instruction ?? '').trim()
    if (!text || busyRef.current) return
    if (!available) { notice('Open or create a resume first, then I can work on it.'); return }
    if (!options.item && !pendingQuestion && isUndoRequest(text)) { undoLast(text); return }
    const answering = options.item ? null : pendingQuestion
    if (answering) {
      setPendingQuestion(null)
      updateItem(answering.turnId, answering.itemId, { status: 'answered' })
      text = `About “${answering.title}”: you asked “${answering.text}”. My answer: ${text}`
    }
    const stamp = Date.now()
    const turnId = `a${stamp}`
    const before = adapterRef.current.snapshot()
    const pagesBefore = pageCount()
    const label = options.label ?? (answering ? `${String(instruction).trim()}` : text)
    setTurns(current => [...current, { id: `u${stamp}`, role: 'user', text: label }, { id: turnId, role: 'assistant', status: 'thinking', thinking: 'Reading your request…', steps: [], changes: [], fresh: true }].slice(-60))
    if (options.item) updateItem(options.item.turnId, options.item.itemId, { status: 'running', note: '' })
    busyRef.current = true
    setBusy(true)
    setStartedAt(Date.now())
    window.clearTimeout(phaseTimerRef.current)
    setPhase('searching')
    setTask('Reading your resume')
    const controller = new AbortController()
    abortRef.current = controller
    // Never leave someone waiting indefinitely.
    let timedOut = false
    const deadline = window.setTimeout(() => { timedOut = true; controller.abort() }, 75_000)
    let chain = Promise.resolve()
    let fit = false
    let anyChange = false
    let failed = false
    const appliedOps = []
    try {
      await streamNdjson(endpoint, {
        body: { instruction: text, context: adapterRef.current.buildContext({ feature: options.feature ?? null }), ...(options.feature ? { feature: options.feature } : {}), ...(options.tone ? { tone: options.tone } : {}) },
        signal: controller.signal,
        onEvent: event => {
          if (event.type === 'thinking') { setPhase('contemplating'); setTask('Thinking it through'); update(turnId, { thinking: event.text }) }
          else if (event.type === 'plan') update(turnId, { status: 'running', steps: event.steps.map(step => ({ ...step, status: step.skipped ? 'failed' : 'pending' })) })
          else if (event.type === 'step') chain = chain.then(async () => {
            if (controller.signal.aborted) return
            setPhase('executing')
            setTask(event.title)
            update(turnId, turn => ({ steps: turn.steps.map(step => step.id === event.id ? { ...step, status: 'running' } : step) }))
            await settleLayout(120)
            const keyBeforeStep = stateKey()
            try {
              const result = adapterRef.current.applyOperations(event.operations)
              await settleLayout(60)
              // A step whose operations left the page exactly as it was gets no tick.
              const stepChanged = result.fitOnePage || (result.changed && (keyBeforeStep === null || stateKey() !== keyBeforeStep))
              anyChange = anyChange || stepChanged
              fit = fit || result.fitOnePage
              appliedOps.push(...event.operations)
              update(turnId, turn => ({ changes: [...(turn.changes ?? []), ...event.operations.filter(op => op.type !== 'fit_one_page').map(describeNimbusOperation)] }))
              await settleLayout(stepDelay)
              update(turnId, turn => ({ steps: turn.steps.map(step => step.id === event.id ? (stepChanged ? { ...step, status: 'done' } : { ...step, status: 'failed', note: 'Nothing changed on the page.' }) : step) }))
            } catch (error) {
              update(turnId, turn => ({ steps: turn.steps.map(step => step.id === event.id ? { ...step, status: 'failed', note: isStale(error) ? 'That part changed while I was working. Ask again.' : error.message } : step) }))
            }
          })
          else if (event.type === 'message') chain = chain.then(() => update(turnId, { text: event.text, tone: event.tone }))
          else if (event.type === 'items') chain = chain.then(() => update(turnId, turn => ({ items: [...withStatus(event.items), ...(turn.items ?? []).filter(item => item.id === 'fit')] })))
          else if (event.type === 'options') update(turnId, { options: { kind: event.kind, target: event.target, prompt: event.prompt, choices: event.choices } })
          else if (event.type === 'question') update(turnId, { question: { text: event.text, quickReplies: event.quickReplies }, intro: event.intro })
          else if (event.type === 'error') { failed = true; update(turnId, { status: 'error', text: event.message }) }
        }
      })
      await chain
      if (fit && !controller.signal.aborted) {
        setPhase('executing')
        setTask('Fitting the resume on one page')
        update(turnId, turn => ({ steps: [...turn.steps, { id: 'fit', title: 'Fit the resume on one page', status: 'running' }] }))
        const outcome = await adapterRef.current.fitToOnePage()
        anyChange = anyChange || outcome.changed
        update(turnId, turn => ({
          steps: turn.steps.map(step => step.id === 'fit' ? { ...step, status: outcome.ok ? 'done' : 'failed', note: outcome.note } : step),
          ...(outcome.ok ? {} : { text: outcome.note, tone: 'warning' })
        }))
      } else if (anyChange) {
        await settleLayout(80)
        guardPages(turnId, pagesBefore, appliedOps)
      }
    } catch (error) {
      if (timedOut) {
        failed = true
        update(turnId, { status: 'error', text: 'NIMBUS is taking too long right now. Please try again in a minute.' })
      } else if (!controller.signal.aborted) {
        failed = true
        update(turnId, { status: 'error', text: error instanceof TypeError ? 'NIMBUS is offline — start the app with npm run dev:all.' : error.message || 'NIMBUS could not answer just now.', ...(error.status === 403 ? { upgrade: true } : {}) })
      }
    } finally {
      window.clearTimeout(deadline)
      await chain.catch(() => {})
      if (anyChange && !options.item) await remember({ before, label: `“${text.slice(0, 60)}${text.length > 60 ? '…' : ''}”`, turnId })
      update(turnId, turn => ({
        status: failed ? 'error' : 'done',
        ...(controller.signal.aborted && !timedOut ? { steps: turn.steps.map(step => step.status === 'pending' || step.status === 'running' ? { ...step, status: 'failed', note: 'Stopped' } : step), text: turn.text || 'Stopped. Changes made so far are kept.' } : {})
      }))
      // A deferred suggestion that changed the page becomes an applied item.
      if (options.item) {
        const { turnId: listId, itemId } = options.item
        if (anyChange && !failed) {
          await remember({ before, label: options.label?.replace(/^→ /, '') ?? 'that change', turnId: listId, itemId })
          updateItem(listId, itemId, { status: 'applied', viaTurn: turnId, note: '' })
        } else updateItem(listId, itemId, { status: 'deferred', note: failed ? 'That didn’t work. Press again to retry.' : 'No change was needed.' })
      }
      busyRef.current = false
      setBusy(false)
      abortRef.current = null
      settlePhase(failed ? 'error' : anyChange ? 'done' : 'idle')
    }
  }

  // A quick second click on Send (now Stop) must not cancel the request it just made.
  const stop = () => { if (Date.now() - startedAt > 700) abortRef.current?.abort() }

  const endPreview = () => {
    if (previewSnapshotRef.current) adapterRef.current.restore(previewSnapshotRef.current)
    previewSnapshotRef.current = null
    setPreviewing(false)
  }
  // Hover or focus previews operations on the page; leaving restores exactly what was there.
  const previewOperations = operations => {
    if (busyRef.current) return
    if (!operations) { endPreview(); return }
    if (!previewSnapshotRef.current) previewSnapshotRef.current = adapterRef.current.snapshot()
    setPreviewing(true)
    adapterRef.current.restore(previewSnapshotRef.current)
    try { adapterRef.current.applyOperations(operations.filter(op => op.type !== 'fit_one_page')) } catch { adapterRef.current.restore(previewSnapshotRef.current) }
  }
  const previewOption = (turn, choice) => previewOperations(choice ? optionToOperations(turn.options, choice) : null)
  const previewItem = (turn, item) => previewOperations(item?.status === 'ready' ? item.operations : null)

  const applyOption = (turn, index) => {
    const choice = turn.options.choices[index]
    const before = previewSnapshotRef.current ?? adapterRef.current.snapshot()
    if (previewSnapshotRef.current) adapterRef.current.restore(previewSnapshotRef.current)
    previewSnapshotRef.current = null
    setPreviewing(false)
    const operations = optionToOperations(turn.options, choice)
    adapterRef.current.applyOperations(operations)
    remember({ before, label: choice.name ?? choice.templateName ?? choice.fontId ?? 'that choice', turnId: turn.id })
    update(turn.id, { appliedIndex: index, undone: false, changes: operations.map(describeNimbusOperation) })
  }

  /** Press an item's arrow. Ready: apply now. Deferred: run its instruction. Info: answer its question in the composer. */
  const applyItem = async (turn, item) => {
    if (busyRef.current || !item) return
    if (item.status === 'deferred' || item.status === 'stale') {
      endPreview()
      run(item.instruction ?? `${item.title}. ${item.why ?? ''}`, { label: `→ ${item.title}`, item: { turnId: turn.id, itemId: item.id }, ...(item.feature ? { feature: item.feature } : {}) })
      return
    }
    if (item.status === 'info' || item.status === 'answered') { askItem(turn, item); return }
    if (item.status !== 'ready') return
    endPreview()
    const before = adapterRef.current.snapshot()
    const pagesBefore = pageCount()
    updateItem(turn.id, item.id, { status: 'applying', note: '' })
    try {
      const result = adapterRef.current.applyOperations(item.operations)
      if (result.fitOnePage) {
        const outcome = await adapterRef.current.fitToOnePage()
        if (!outcome.ok) updateItem(turn.id, item.id, { note: outcome.note })
      }
      await remember({ before, label: item.title, turnId: turn.id, itemId: item.id })
      updateItem(turn.id, item.id, { status: 'applied', note: '' })
      if (!result.fitOnePage) guardPages(turn.id, pagesBefore, item.operations)
    } catch (error) {
      updateItem(turn.id, item.id, isStale(error)
        ? { status: 'stale', note: 'This part changed since. Press to ask NIMBUS again.', instruction: item.instruction ?? `${item.title}. ${item.why ?? ''}` }
        : { status: 'failed', note: error.message || 'This change could not be applied.' })
    }
  }

  const applyAll = async turn => {
    for (const item of turn.items ?? []) {
      if (item.status !== 'ready' || item.id === 'fit') continue
      // Read the latest item state each time: an earlier apply may have made this one stale.
      await applyItem(turn, item)
    }
  }

  const askItem = (turn, item) => setPendingQuestion({ turnId: turn.id, itemId: item.id, title: item.title, text: item.question?.text ?? item.title, quickReplies: item.question?.quickReplies ?? [] })

  const answerQuestion = (turn, reply) => {
    update(turn.id, { answered: true })
    run(reply)
  }

  const reset = () => {
    abortRef.current?.abort()
    undoStackRef.current = []
    previewSnapshotRef.current = null
    setPendingQuestion(null)
    setPreviewing(false)
  }

  return {
    busy, phase, task, previewing, pendingQuestion, run, stop, notice, reset,
    previewOption, applyOption, answerQuestion,
    previewItem, applyItem, applyAll, askItem, cancelQuestion: () => setPendingQuestion(null)
  }
}
