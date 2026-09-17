import { useEffect, useRef, useState } from 'react'
import BloubAIIcon from './BloubAIIcon.jsx'

function resolveRestingState(value, isFocused, isHovered) {
  if (value.trim().length > 0) return 'exploring'
  if (isFocused || isHovered) return 'curious'
  return 'idle'
}

export default function AIAssistantEditor({
  value,
  onChange,
  onSubmit,
  busy,
  feedback,
  messages = [],
  inputRef,
  animationState,
  isAvailable = true
}) {
  const feedbackId = 'ai-edit-feedback'
  const lockMessageId = 'ai-edit-lock-message'
  const sectionRef = useRef(null)
  const conversationRef = useRef(null)
  const [isFocused, setIsFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const resolvedAnimationState = isAvailable ? animationState || resolveRestingState(value, isFocused, isHovered) : 'idle'

  useEffect(() => {
    const conversation = conversationRef.current
    if (conversation) conversation.scrollTo({ top: conversation.scrollHeight, behavior: 'smooth' })
  }, [busy, messages])

  const handleKeyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSubmit(event)
    }
  }

  return <section
    ref={sectionRef}
    className={`ai-edit-minimal panel${isAvailable ? '' : ' is-locked'}`}
    aria-label="Edit with NIMBUS"
    aria-busy={busy}
    aria-disabled={!isAvailable}
    data-ai-animation-state={resolvedAnimationState}
    onPointerEnter={() => setIsHovered(true)}
    onPointerLeave={() => setIsHovered(false)}
  >
    <header className="ai-edit-identity">
      <span className="eyebrow">EDIT WITH <strong className="ai-edit-name">NIMBUS</strong></span>
      <svg className="ai-edit-sparkle" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8 11.5 8.5 18.2 10l-6.7 1.5L10 18.2l-1.5-6.7L1.8 10l6.7-1.5L10 1.8Z" /><path d="m16.1 2.2.4 1.3 1.3.4-1.3.4-.4 1.3-.4-1.3-1.3-.4 1.3-.4.4-1.3Z" /></svg>
      {!isAvailable && <span className="ai-edit-lock" title="NIMBUS is locked until a resume is in the workspace" aria-label="NIMBUS locked"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.3" y="8.7" width="11.4" height="8" rx="1.8" /><path d="M6.8 8.7V6.3a3.2 3.2 0 0 1 6.4 0v2.4" /></svg></span>}
    </header>
    <div className="ai-edit-stage">
      <div className="ai-edit-animation" aria-hidden="true">
        <BloubAIIcon state={resolvedAnimationState} followRegionRef={sectionRef} />
      </div>
      <div ref={conversationRef} className="ai-edit-conversation" role="log" aria-live="polite" aria-label="Conversation with NIMBUS">
        {messages.map((message, index) => <p className={`ai-edit-message ${message.role}`} key={`${message.role}-${index}`}>{message.text}</p>)}
        {busy && <p className="ai-edit-message assistant is-thinking">Thinking…</p>}
      </div>
      <form className="ai-edit-composer" onSubmit={event => { if (!isAvailable) { event.preventDefault(); return } onSubmit(event) }}>
        <label className="ai-edit-label" htmlFor="ai-edit-request">Ask NIMBUS to edit your resume or start a brief conversation</label>
        <textarea
          id="ai-edit-request"
          ref={inputRef}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={busy || !isAvailable}
          maxLength="2000"
          rows="2"
          placeholder={isAvailable ? 'Ask for an edit, advice, or say hello…' : 'Add a resume to unlock NIMBUS'}
          aria-describedby={feedback ? feedbackId : !isAvailable ? lockMessageId : undefined}
        />
        <button className="ai-edit-send" disabled={busy || !isAvailable} aria-label={busy ? 'NIMBUS is responding' : !isAvailable ? 'NIMBUS is locked until a resume is in the workspace' : 'Send message to NIMBUS'} type="submit">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h12M10.5 5.5 15 10l-4.5 4.5" /></svg>
        </button>
      </form>
    </div>
    {!isAvailable && <p id={lockMessageId} className="ai-edit-lock-message" role="status">Create or import a resume, then choose a template to unlock NIMBUS.</p>}
    {feedback?.text && <p id={feedbackId} className={`ai-edit-feedback ${feedback.tone || 'info'}`} role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback.text}</p>}
  </section>
}
