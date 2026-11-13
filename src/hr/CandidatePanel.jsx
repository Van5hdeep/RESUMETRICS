import { useEffect, useRef, useState } from 'react'
import { HR_CATEGORY_LABELS } from '../../shared/hrScoring.js'
import { hrApi } from './hrApi.js'
import { Icon, Meter, ScoreMark, Tags } from './hrUi.jsx'

const LEVEL = { strong: 'Strong match', partial: 'Partial match', low: 'Little overlap' }

function Checklist({ items }) {
  if (!items.length) return <p className="hr-muted">None set for this opening.</p>
  return <ul className="hr-checklist">
    {items.map(item => <li key={item.term} className={item.found ? 'is-found' : 'is-missing'}><Icon name={item.found ? 'check' : 'cross'} />{item.term}<span className="hr-visually-hidden">{item.found ? ' found' : ' missing'}</span></li>)}
  </ul>
}

/** Right-side panel with the full, explainable breakdown of one resume against the opening. */
export default function CandidatePanel({ openingId, candidateId, rank, onClose, onRemoved }) {
  const [candidate, setCandidate] = useState(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const closeRef = useRef(null)

  useEffect(() => {
    let live = true
    setCandidate(null)
    setConfirm(false)
    hrApi.getCandidate(openingId, candidateId).then(next => live && setCandidate(next)).catch(problem => live && setError(problem.message))
    return () => { live = false }
  }, [openingId, candidateId])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const remove = async () => {
    try {
      await hrApi.deleteCandidate(openingId, candidateId)
      onRemoved()
    } catch (problem) {
      setError(problem.message)
    }
  }

  const resume = candidate?.resumeData ?? {}
  const evaluation = candidate?.evaluation
  const experience = evaluation?.categories.experience
  const education = evaluation?.categories.education
  const keywords = evaluation?.categories.keywords
  const contact = [resume.email, resume.phone, resume.location].filter(Boolean)

  return <>
    <div className="hr-scrim" onClick={onClose} aria-hidden="true" />
    <aside className="hr-drawer" role="dialog" aria-modal="true" aria-label={candidate ? `${candidate.name}, resume breakdown` : 'Resume breakdown'}>
      <div className="hr-drawer-head">
        <span className="hr-eyebrow">Rank {rank ?? '–'}</span>
        <button ref={closeRef} className="hr-icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </div>

      {error && <p className="hr-alert hr-alert--error" role="alert">{error}</p>}
      {!candidate ? !error && <div className="hr-loading"><span className="hr-spinner" /></div> : <div className="hr-drawer-body">
        <header className="hr-drawer-title">
          <div>
            <h2>{candidate.name}</h2>
            {candidate.headline && <p>{candidate.headline}</p>}
            {contact.length > 0 && <p className="hr-sub">{contact.join(' · ')}</p>}
          </div>
          <ScoreMark score={candidate.score} size="lg" />
        </header>

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
              <div><b>{role.label}</b>{role.skills?.length > 0 && <span className="hr-sub">Uses {role.skills.join(', ')}</span>}</div>
              <span className={`hr-level hr-level--${role.level}`}>{LEVEL[role.level]}</span>
            </li>)}
          </ul> : <p className="hr-muted">No work experience was found in this resume.</p>}
        </section>

        {education && <section className="hr-drawer-section">
          <h3>Education</h3>
          <p className="hr-note">{education.notes?.[0]}</p>
          <ul className="hr-plain">{(resume.education ?? []).map((item, index) => <li key={index}>{[item.degree, item.institution].filter(Boolean).join(', ')}</li>)}</ul>
        </section>}

        <section className="hr-drawer-section">
          <h3>Job keywords</h3>
          <p className="hr-note">{keywords.notes?.[0]?.replace('your summary', 'the summary')}</p>
          <div className="hr-kw"><span className="hr-label">Found</span><Tags items={keywords.matched} tone="found" /></div>
          <div className="hr-kw"><span className="hr-label">Missing</span><Tags items={keywords.missing.map(item => item.term)} tone="missing" /></div>
        </section>

        <footer className="hr-drawer-foot">
          <p className="hr-sub">{candidate.fileName}{candidate.parsedBy === 'basic' ? ' · Basic read (the AI reader was unavailable, so some details may be missed)' : ''}</p>
          {confirm
            ? <span className="hr-confirm"><span>Remove this resume?</span><button className="hr-btn hr-btn--danger" type="button" onClick={remove}>Remove</button><button className="hr-btn hr-btn--ghost" type="button" onClick={() => setConfirm(false)}>Cancel</button></span>
            : <button className="hr-btn hr-btn--ghost hr-btn--quiet-danger" type="button" onClick={() => setConfirm(true)}>Remove resume</button>}
        </footer>
      </div>}
    </aside>
  </>
}
