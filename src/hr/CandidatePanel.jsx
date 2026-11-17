import { useEffect, useRef, useState } from 'react'
import { HR_CATEGORY_LABELS } from '../../shared/hrScoring.js'
import { hrApi } from './hrApi.js'
import { displayName, Icon, isHidden, Meter, ScoreMark, StatusBadge, Tags } from './hrUi.jsx'

const LEVEL = { strong: 'Strong match', partial: 'Partial match', low: 'Little overlap' }

/** Each skill found or missing; a found skill shows the resume line it was found in. */
function Checklist({ items }) {
  if (!items.length) return <p className="hr-muted">None set for this opening.</p>
  return <ul className="hr-evidence">
    {items.map(item => <li key={item.term} className={item.found ? 'is-found' : 'is-missing'}>
      <span className="hr-evidence-term"><Icon name={item.found ? 'check' : 'cross'} />{item.term}<span className="hr-visually-hidden">{item.found ? ' found' : ' missing'}</span></span>
      {item.found && item.evidence ? <q className="hr-evidence-line"><b>{item.evidence.where}</b> {item.evidence.text}</q> : !item.found && <span className="hr-evidence-line hr-muted">Not mentioned in the resume</span>}
    </li>)}
  </ul>
}

/**
 * Right-side panel with the full, explainable breakdown of one resume, the decision buttons, and next/previous
 * (also ← and →) through the resumes currently in view.
 */
export default function CandidatePanel({ openingId, candidateId, rank, order, blind, closed, onNavigate, onClose, onDecide, onRemoved }) {
  const [candidate, setCandidate] = useState(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState(null)       // 'reject' | 'remove'
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const closeRef = useRef(null)
  const position = order.indexOf(candidateId)
  const previous = position > 0 ? order[position - 1] : null
  const next = position >= 0 && position < order.length - 1 ? order[position + 1] : null

  useEffect(() => {
    let live = true
    setMode(null)
    setReason('')
    setError('')
    hrApi.getCandidate(openingId, candidateId).then(found => live && setCandidate(found)).catch(problem => live && setError(problem.message))
    return () => { live = false }
  }, [openingId, candidateId, refresh])

  useEffect(() => { closeRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape') return onClose()
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return undefined
      if (event.key === 'ArrowLeft' && previous) onNavigate(previous)
      if (event.key === 'ArrowRight' && next) onNavigate(next)
      return undefined
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNavigate, previous, next])

  const decide = async (status, why = '') => {
    setSaving(true)
    const ok = await onDecide(candidateId, status, why)
    setSaving(false)
    if (ok) { setMode(null); setReason(''); setRefresh(value => value + 1) }
  }

  const remove = async () => {
    try {
      await hrApi.deleteCandidate(openingId, candidateId)
      onRemoved()
    } catch (problem) {
      setError(problem.message)
    }
  }

  const hidden = candidate ? isHidden(candidate, blind) : false
  const resume = candidate?.resumeData ?? {}
  const evaluation = candidate?.evaluation
  const experience = evaluation?.categories.experience
  const education = evaluation?.categories.education
  const keywords = evaluation?.categories.keywords
  const contact = hidden ? [] : [resume.email, resume.phone, resume.location].filter(Boolean)

  return <>
    <div className="hr-scrim" onClick={onClose} aria-hidden="true" />
    <aside className="hr-drawer" role="dialog" aria-modal="true" aria-label={candidate ? `${displayName(candidate, blind)}, resume breakdown` : 'Resume breakdown'}>
      <div className="hr-drawer-head">
        <span className="hr-eyebrow">Rank {rank ?? '–'}{order.length ? ` · ${position + 1} of ${order.length} in view` : ''}</span>
        <span className="hr-drawer-nav">
          <button className="hr-icon-btn" type="button" onClick={() => previous && onNavigate(previous)} disabled={!previous} aria-label="Previous resume (left arrow)" title="Previous (←)"><Icon name="back" /></button>
          <button className="hr-icon-btn hr-icon-btn--flip" type="button" onClick={() => next && onNavigate(next)} disabled={!next} aria-label="Next resume (right arrow)" title="Next (→)"><Icon name="back" /></button>
          <button ref={closeRef} className="hr-icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </span>
      </div>

      {error && <p className="hr-alert hr-alert--error" role="alert">{error}</p>}
      {!candidate ? !error && <div className="hr-loading"><span className="hr-spinner" /></div> : <div className="hr-drawer-body">
        <header className="hr-drawer-title">
          <div>
            <h2>{displayName(candidate, blind)}</h2>
            {candidate.headline && <p>{candidate.headline}</p>}
            {contact.length > 0 && <p className="hr-sub">{contact.join(' · ')}</p>}
            {hidden && <p className="hr-sub">Blind screening: name and contact details appear once you decide.</p>}
          </div>
          <ScoreMark score={candidate.score} size="lg" />
        </header>

        <p className="hr-why"><b>Why this score</b>{evaluation.why}</p>

        <section className="hr-decision" aria-label="Decision">
          <span className="hr-decision-now">Decision <StatusBadge status={candidate.status} />{candidate.reason && <span className="hr-sub">“{candidate.reason}”</span>}</span>
          {closed ? <p className="hr-sub">This opening is closed. Reopen it to change decisions.</p>
            : mode === 'reject' ? <div className="hr-decision-reason">
              <input value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason (optional), e.g. needs 3+ years of React" maxLength={200} aria-label="Reason for rejecting" autoFocus
                onKeyDown={event => { if (event.key === 'Enter') decide('rejected', reason) }} />
              <button className="hr-btn hr-btn--danger" type="button" disabled={saving} onClick={() => decide('rejected', reason)}>Reject</button>
              <button className="hr-btn hr-btn--ghost" type="button" onClick={() => setMode(null)}>Cancel</button>
            </div>
              : <div className="hr-decision-buttons">
                <button className="hr-btn hr-btn--primary" type="button" disabled={saving || candidate.status === 'shortlisted'} onClick={() => decide('shortlisted')}><Icon name="check" />Shortlist</button>
                <button className="hr-btn hr-btn--ghost" type="button" disabled={saving || candidate.status === 'rejected'} onClick={() => setMode('reject')}><Icon name="cross" />Reject</button>
                {candidate.status !== 'new' && <button className="hr-link" type="button" disabled={saving} onClick={() => decide('new')}>Back to New</button>}
              </div>}
        </section>

        <section className="hr-drawer-section">
          <h3>Score breakdown</h3>
          <ul className="hr-breakdown">
            {Object.entries(evaluation.categories).map(([key, category]) => <li key={key}>
              <span>{HR_CATEGORY_LABELS[key]} <i>{category.weight}%</i></span>
              <Meter value={category.score} label={HR_CATEGORY_LABELS[key]} />
              <b>{category.score}</b>
            </li>)}
          </ul>
        </section>

        <section className="hr-drawer-section">
          <h3>Must-have skills <span className="hr-count">{evaluation.mustHave.met}/{evaluation.mustHave.total}</span></h3>
          <Checklist items={evaluation.mustHave.items} />
          <h3>Nice-to-have skills <span className="hr-count">{evaluation.niceToHave.met}/{evaluation.niceToHave.total}</span></h3>
          <Checklist items={evaluation.niceToHave.items} />
        </section>

        <section className="hr-drawer-section">
          <h3>Experience</h3>
          <p className="hr-note">{evaluation.minYears ? `About ${evaluation.years} years listed; the opening asks for ${evaluation.minYears}+.` : `About ${evaluation.years} years listed.`}</p>
          {experience.roles?.length ? <ul className="hr-roles">
            {experience.roles.map((role, index) => <li key={`${role.label}-${index}`}>
              <div><b>{hidden ? role.label.replace(/ at .*$/, '') : role.label}</b>{role.skills?.length > 0 && <span className="hr-sub">Uses {role.skills.join(', ')}</span>}</div>
              <span className={`hr-level hr-level--${role.level}`}>{LEVEL[role.level]}</span>
            </li>)}
          </ul> : <p className="hr-muted">No work experience was found in this resume.</p>}
        </section>

        {education && <section className="hr-drawer-section">
          <h3>Education</h3>
          <p className="hr-note">{education.notes?.[0]}</p>
          <ul className="hr-plain">{(resume.education ?? []).map((item, index) => <li key={index}>{hidden ? item.degree : [item.degree, item.institution].filter(Boolean).join(', ')}</li>)}</ul>
        </section>}

        <section className="hr-drawer-section">
          <h3>Job keywords</h3>
          <p className="hr-note">{keywords.notes?.[0]?.replace('your summary', 'the summary')}</p>
          <div className="hr-kw"><span className="hr-label">Found</span><Tags items={keywords.matched} tone="found" /></div>
          <div className="hr-kw"><span className="hr-label">Missing</span><Tags items={keywords.missing.map(item => item.term)} tone="missing" /></div>
        </section>

        <footer className="hr-drawer-foot">
          <p className="hr-sub">{hidden ? 'Resume file' : candidate.fileName}{candidate.parsedBy === 'basic' ? ' · Basic read (the AI reader was unavailable, so some details may be missed)' : ''}</p>
          {!closed && (mode === 'remove'
            ? <span className="hr-confirm"><span>Remove this resume?</span><button className="hr-btn hr-btn--danger" type="button" onClick={remove}>Remove</button><button className="hr-btn hr-btn--ghost" type="button" onClick={() => setMode(null)}>Cancel</button></span>
            : <button className="hr-btn hr-btn--ghost hr-btn--quiet-danger" type="button" onClick={() => setMode('remove')}>Remove resume</button>)}
        </footer>
      </div>}
    </aside>
  </>
}
