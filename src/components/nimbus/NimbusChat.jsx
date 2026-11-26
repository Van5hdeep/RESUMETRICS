import { useEffect, useRef, useState } from 'react'
import BloubAIIcon from '../BloubAIIcon.jsx'
import { useTypewriter } from '../../nimbus/useTypewriter.js'
import { findFont } from '../../editor/fontRegistry.js'
import './nimbus-guide.css'

const placeholders = [
  'What would make my resume stand out?',
  'Is there anything unnecessary here?',
  'This feels crowded, make it spacious…',
  'Deepen my summary…',
  'Make my internship bullets stronger…',
  'Change my headline to Data Analyst…',
  'Add Python and SQL to my skills…',
  'Move Projects above Education…'
]

// Bloub states: idle, curious, exploring, thinking, processing, success, exclaim.
function cloudState({ busy, phase, typing }) {
  if (busy) return phase === 'executing' ? 'processing' : phase === 'contemplating' ? 'thinking' : 'curious'
  if (phase === 'done') return 'success'
  if (phase === 'error') return 'exclaim'
  return typing ? 'exploring' : 'idle'
}

// Only text written in this session types itself; restored conversations appear whole.
const isRecent = turn => /^a\d+$/.test(turn.id) && Date.now() - Number(turn.id.slice(1)) < 120_000

function TypedText({ text, animate, className, onDone }) {
  const typed = useTypewriter(text, animate)
  useEffect(() => { if (typed.done) onDone?.() }, [typed.done]) // eslint-disable-line react-hooks/exhaustive-deps
  // Screen readers get the whole message once (the visible text is hidden from them while it types).
  return <p className={className} onClick={typed.done ? undefined : typed.skip}>
    <span className="sr-only">{text}</span>
    <span aria-hidden="true">{typed.text}{!typed.done && <span className="nimbus-caret" />}</span>
  </p>
}

const STEP_MARK = { pending: '', running: '', done: '✓', failed: '!' }
function Steps({ steps }) {
  if (!steps?.length) return null
  const done = steps.filter(step => step.status === 'done').length
  return <ol className="nimbus-steps" aria-label={`Progress: ${done} of ${steps.length} done`}>
    {steps.map(step => <li key={step.id} className={`is-${step.status}`}>
      <span className="nimbus-step-mark" aria-hidden="true">{STEP_MARK[step.status]}</span>
      <span>{step.title}{step.note && <small>{step.note}</small>}</span>
    </li>)}
  </ol>
}

const Arrow = () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M10.5 5.5 15 10l-4.5 4.5" /></svg>
const Check = () => <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3.2L15 6.8" /></svg>
const Lock = () => <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="9" width="10" height="7.5" rx="1.6" /><path d="M7.5 9V7a2.5 2.5 0 0 1 5 0v2" /></svg>
const ITEM_ACTION = { ready: 'Apply', deferred: 'Do it', stale: 'Ask again', info: 'Answer', answered: 'Answer again', failed: 'Try again', locked: 'Pro feature' }

function ItemMark({ status }) {
  if (status === 'applying' || status === 'running') return <span className="nimbus-spinner" aria-hidden="true" />
  if (status === 'applied') return <Check />
  if (status === 'locked') return <Lock />
  if (status === 'info' || status === 'answered') return <span aria-hidden="true">?</span>
  if (status === 'failed') return <span aria-hidden="true">!</span>
  return <Arrow />
}

// No Show or Undo per item: hover previews the change on the page, and typing "undo" takes the last one back.
function Item({ turn, item, actions, busy, onUpgrade }) {
  const working = item.status === 'applying' || item.status === 'running'
  const press = () => {
    if (item.status === 'locked') { onUpgrade?.(); return }
    if (item.status === 'failed') { actions.applyItem(turn, { ...item, status: item.instruction ? 'deferred' : 'ready' }); return }
    actions.applyItem(turn, item)
  }
  const preview = on => actions.previewItem?.(turn, on ? item : null)
  return <li className={`nimbus-item is-${item.status}`}>
    <button type="button" className="nimbus-item-go" disabled={working || item.status === 'applied' || (busy && item.status !== 'locked')}
      aria-label={`${ITEM_ACTION[item.status] ?? 'Apply'}: ${item.title}`} title={ITEM_ACTION[item.status]}
      onClick={press} onMouseEnter={() => preview(true)} onMouseLeave={() => preview(false)} onFocus={() => preview(true)} onBlur={() => preview(false)}>
      <ItemMark status={item.status} />
    </button>
    <div className="nimbus-item-body">
      <span className="nimbus-item-title">{item.title}{item.status === 'locked' && <small className="nimbus-pro">PRO</small>}</span>
      {item.why && <span className="nimbus-item-why">{item.why}</span>}
      {item.note && <span className="nimbus-item-note">{item.note}</span>}
    </div>
  </li>
}

function Items({ turn, actions, busy, pro, onUpgrade }) {
  if (!turn.items?.length || !actions) return null
  const ready = turn.items.filter(item => item.status === 'ready' && item.id !== 'fit').length
  return <div className="nimbus-items-wrap">
    <ol className="nimbus-items">{turn.items.map(item => <Item key={item.id} turn={turn} item={item} actions={actions} busy={busy} onUpgrade={onUpgrade} />)}</ol>
    {ready > 1 && <button type="button" className="nimbus-apply-all" disabled={busy} onClick={() => pro ? actions.applyAll(turn) : onUpgrade?.()}>
      {pro ? `Apply all ${ready}` : <>Apply all {ready} <small className="nimbus-pro">PRO</small></>}
    </button>}
  </div>
}

function Options({ turn, actions, busy }) {
  const options = turn.options
  if (!options?.choices?.length || !actions) return null
  return <div className="nimbus-options" role="group" aria-label={options.prompt}>
    {options.prompt && <span className="nimbus-options-prompt">{options.prompt}</span>}
    {options.choices.map((choice, index) => {
      const label = choice.name ?? (choice.fontId ? findFont(choice.fontId)?.name ?? choice.fontId : null) ?? choice.templateName ?? choice.templateId
      return <button key={index} type="button" disabled={busy} className={`nimbus-option${turn.appliedIndex === index ? ' is-applied' : ''}`}
        onMouseEnter={() => actions.previewOption(turn, choice)} onMouseLeave={() => actions.previewOption(turn, null)}
        onFocus={() => actions.previewOption(turn, choice)} onBlur={() => actions.previewOption(turn, null)}
        onClick={() => actions.applyOption(turn, index)}>
        {choice.hex && <span className="nimbus-swatch" style={{ background: choice.hex }} aria-hidden="true" />}
        {choice.heading && <span className="nimbus-swatch is-palette" style={{ background: `linear-gradient(90deg, ${choice.heading} 33%, ${choice.accent} 33% 66%, ${choice.text} 66%)` }} aria-hidden="true" />}
        <span><b>{label}</b>{choice.why && <small>{choice.why}</small>}</span>
      </button>
    })}
  </div>
}

/**
 * NIMBUS: small wordmark, cloud, the conversation (typed replies, step progress, suggestion lists with arrows,
 * questions, option cards), the task line and the composer.
 * actions: the useNimbusTurns result (item and option handlers). There are no undo buttons: typing "undo" reverses
 * NIMBUS's last change.
 * tools: [{ id, label, pro, onRun }] guided requests shown as chips. checks: { count, onShow } free local fixes.
 */
export default function NimbusChat({
  turns, busy, phase, task, available, value, onChange, onSend, onStop, inputRef, hints = placeholders,
  unavailableText = 'Open a resume to talk to NIMBUS', suggestions = [], greeting = null, actions = null,
  pro = false, onUpgrade = null, tools = [], checks = null
}) {
  const sectionRef = useRef(null)
  const threadRef = useRef(null)
  const [placeholder, setPlaceholder] = useState(0)
  const [showTools, setShowTools] = useState(false)
  const [openTool, setOpenTool] = useState(null)
  const pending = actions?.pendingQuestion ?? null
  const started = turns.some(turn => turn.role === 'user')

  useEffect(() => {
    const thread = threadRef.current
    if (thread) thread.scrollTop = thread.scrollHeight
  }, [turns, busy])
  useEffect(() => { if (!value && inputRef?.current) inputRef.current.style.height = '' }, [value, inputRef])
  useEffect(() => { if (pending) inputRef?.current?.focus() }, [pending, inputRef])
  // A new one-liner every few seconds while the box is empty.
  useEffect(() => {
    if (value) return undefined
    const timer = window.setInterval(() => setPlaceholder(index => (index + 1) % hints.length), 4200)
    return () => window.clearInterval(timer)
  }, [value, hints.length])

  const submit = event => {
    event.preventDefault()
    if (busy || !value.trim() || !available) return
    onSend(value.trim())
    setPlaceholder(index => (index + 1) % hints.length)
  }

  const messages = turns.filter(turn => turn.role === 'user' || turn.text || turn.question?.text || turn.items?.length || turn.steps?.length || turn.options)
  const lastId = messages.at(-1)?.id
  const toolChips = tools.length > 0 && available && !busy && (showTools || !started)
  return <section className={`nimbus${started ? ' is-talking' : ''}`} ref={sectionRef} aria-label="NIMBUS">
    <h2 className="nimbus-wordmark">NIMBUS</h2>
    <div className="nimbus-cloud" aria-hidden="true">
      <BloubAIIcon state={available ? cloudState({ busy, phase, typing: Boolean(value.trim()) }) : 'idle'} followRegionRef={sectionRef} />
    </div>
    <div className="nimbus-thread" ref={threadRef} role="log" aria-live="polite">
      {messages.map(turn => {
        if (turn.role === 'user') return <p key={turn.id} className="nimbus-msg is-user">{turn.text}</p>
        const text = turn.id === 'welcome' && greeting ? greeting : turn.question?.text ? `${turn.intro ? `${turn.intro} ` : ''}${turn.question.text}` : turn.text
        const animate = turn.id === 'welcome' ? !started : isRecent(turn) && turn.id === lastId
        const warning = turn.tone === 'warning' || turn.status === 'error'
        return <div key={turn.id} className="nimbus-turn">
          <Steps steps={turn.steps} />
          {text && <TypedText text={text} animate={animate} className={`nimbus-msg is-nimbus${warning ? ' is-warning' : ''}`} />}
          {turn.upgrade && onUpgrade && <button type="button" className="nimbus-link" onClick={onUpgrade}>See Pro</button>}
          {turn.question?.quickReplies?.length > 0 && !turn.answered && actions && <div className="nimbus-quick" role="group" aria-label="Quick replies">
            {turn.question.quickReplies.map(reply => <button key={reply} type="button" className="nimbus-chip" disabled={busy} onClick={() => actions.answerQuestion(turn, reply)}>{reply}</button>)}
          </div>}
          <Items turn={turn} actions={actions} busy={busy} pro={pro} onUpgrade={onUpgrade} />
          <Options turn={turn} actions={actions} busy={busy} />
        </div>
      })}
    </div>
    {busy && task && <p className="nimbus-task" role="status">{task}</p>}
    {!busy && available && suggestions.length > 0 && !started && <div className="nimbus-suggestions" role="group" aria-label="Suggestions">
      {suggestions.map(item => <button key={item} type="button" className="nimbus-chip" onClick={() => onSend(item)}>{item}</button>)}
    </div>}
    {toolChips && <div className="nimbus-suggestions nimbus-tools" role="group" aria-label="NIMBUS tools">
      {checks?.count > 0 && <button type="button" className="nimbus-chip is-checks" onClick={() => { setShowTools(false); checks.onShow() }}>{checks.count} quick fix{checks.count === 1 ? '' : 'es'}{Number.isFinite(checks.score) ? ` · score ${checks.score}` : ''}</button>}
      {openTool
        ? <>{openTool.options.map(option => <button key={option.label} type="button" className="nimbus-chip" onClick={() => { setOpenTool(null); setShowTools(false); option.onRun() }}>{option.label}</button>)}
          <button type="button" className="nimbus-chip is-locked" onClick={() => setOpenTool(null)}>Back</button></>
        : tools.map(tool => <button key={tool.id} type="button" className={`nimbus-chip${tool.pro && !pro ? ' is-locked' : ''}`} onClick={() => {
          if (tool.pro && !pro) { onUpgrade?.(); return }
          if (tool.options) { setOpenTool(tool); return }
          setShowTools(false)
          tool.onRun()
        }}>
          {tool.label}{tool.options && pro ? '…' : ''}{tool.pro && !pro && <small className="nimbus-pro">PRO</small>}
        </button>)}
    </div>}
    {pending && <div className="nimbus-answering" role="status">
      <span><b>Answering:</b> {pending.text}</span>
      <button type="button" className="nimbus-link" onClick={actions.cancelQuestion} aria-label="Stop answering">Cancel</button>
      {pending.quickReplies?.length > 0 && <div className="nimbus-quick">{pending.quickReplies.map(reply => <button key={reply} type="button" className="nimbus-chip" disabled={busy} onClick={() => onSend(reply)}>{reply}</button>)}</div>}
    </div>}
    <form className="nimbus-input" onSubmit={submit}>
      {tools.length > 0 && started && <button type="button" className={`nimbus-tools-toggle${showTools ? ' is-open' : ''}`} aria-expanded={showTools} aria-label="NIMBUS tools" title="Tools" disabled={!available} onClick={() => setShowTools(open => !open)}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11" /></svg>
      </button>}
      <textarea ref={inputRef} value={value} rows={1} maxLength={2000} disabled={!available}
        placeholder={available ? pending ? 'Type your answer…' : hints[placeholder % hints.length] : unavailableText} aria-label="Message NIMBUS"
        onChange={onChange}
        onInput={event => { const box = event.currentTarget; box.style.height = 'auto'; box.style.height = `${Math.min(box.scrollHeight, 150)}px`; box.classList.toggle('is-scrolling', box.scrollHeight > 150) }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) submit(event); if (event.key === 'Escape' && pending) actions.cancelQuestion() }} />
      {busy
        ? <button type="button" className="nimbus-send is-stop" onClick={onStop} aria-label="Stop"><span /></button>
        : <button type="submit" className="nimbus-send" disabled={!value.trim() || !available} aria-label="Send"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15.5v-11M5.5 9 10 4.5 14.5 9" /></svg></button>}
    </form>
  </section>
}
