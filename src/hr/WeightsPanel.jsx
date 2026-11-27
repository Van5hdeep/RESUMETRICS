import { useEffect, useRef, useState } from 'react'
import { HR_CATEGORY_LABELS, HR_WEIGHTS, weightsFor } from '../../shared/hrScoring.js'
import { Icon } from './hrUi.jsx'

const HINTS = {
  keywords: 'How much of the job description’s language the resume uses',
  experience: 'How closely past roles match this job, and years against the minimum',
  skills: 'Must-haves (counted double) and nice-to-haves found in the resume',
  education: 'Meets the stated degree level and field',
  completeness: 'Contact details, summary, core sections and complete job and education entries'
}

/**
 * Lets HR decide how much each part of the score counts for this opening. The sliders are relative: whatever
 * the numbers, the weights shown (and used) always add up to 100%. Every resume re-ranks on save.
 */
export default function WeightsPanel({ opening, onSave, onClose }) {
  const keys = Object.keys(HR_WEIGHTS).filter(key => key !== 'education' || String(opening.education ?? '').trim())
  const [values, setValues] = useState(() => Object.fromEntries(Object.keys(HR_WEIGHTS).map(key => [key, Number(opening.weights?.[key] ?? HR_WEIGHTS[key])])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const firstRef = useRef(null)
  const preview = weightsFor({ ...opening, weights: values })
  const allZero = keys.every(key => !values[key])

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async weights => {
    setSaving(true)
    setError('')
    try {
      await onSave(weights)
      onClose()
    } catch (problem) {
      setError(problem.message)
      setSaving(false)
    }
  }

  return <>
    <div className="hr-scrim" onClick={onClose} aria-hidden="true" />
    <section className="hr-modal hr-weights-panel" role="dialog" aria-modal="true" aria-labelledby="hr-weights-title">
      <header className="hr-modal-head">
        <div><p className="hr-eyebrow">Scoring</p><h2 id="hr-weights-title">How much each part counts</h2></div>
        <button className="hr-icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </header>
      <div className="hr-modal-body">
        <p className="hr-muted">Move the sliders to match what matters for this role. The overall score uses these weights, and the ranking updates when you save.</p>
        {keys.map((key, index) => <div key={key} className="hr-weight-row">
          <label htmlFor={`hr-weight-${key}`}><b>{HR_CATEGORY_LABELS[key]}</b><span>{HINTS[key]}</span></label>
          <input ref={index === 0 ? firstRef : undefined} id={`hr-weight-${key}`} type="range" min="0" max="100" step="5" value={values[key]}
            onChange={event => setValues(current => ({ ...current, [key]: Number(event.target.value) }))}
            aria-valuetext={`${preview[key]} percent of the overall score`} />
          <output htmlFor={`hr-weight-${key}`}>{allZero ? '–' : `${preview[key]}%`}</output>
        </div>)}
        {!String(opening.education ?? '').trim() && <p className="hr-note-sm">Education isn’t scored because this job states no education requirement.</p>}
        {allZero && <p className="hr-alert hr-alert--error" role="alert">At least one part must count for more than 0.</p>}
        {error && <p className="hr-alert hr-alert--error" role="alert">{error}</p>}
      </div>
      <footer className="hr-modal-foot">
        <button className="hr-link" type="button" onClick={() => save(null)} disabled={saving}>Reset to default</button>
        <span className="hr-modal-actions">
          <button className="hr-btn hr-btn--ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="hr-btn hr-btn--primary" type="button" disabled={saving || allZero} onClick={() => save(values)}>{saving ? 'Saving…' : 'Save and re-rank'}</button>
        </span>
      </footer>
    </section>
  </>
}
