import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { extractJd } from '../../shared/jdExtract.js'
import { descriptionLines, EMPLOYMENT_TYPES, HR_CATEGORY_LABELS, weightsFor } from '../../shared/hrScoring.js'
import { hrApi } from './hrApi.js'
import { useHrSession } from './HrApp.jsx'
import { Icon, PageHeader, Tags } from './hrUi.jsx'

const EMPTY = { title: '', employmentType: EMPLOYMENT_TYPES[0], location: '', minYears: '', education: '', mustHave: [], niceToHave: [], description: '' }

/** Type a skill and press Enter (or a comma) to add it; × removes one. */
function TagInput({ id, value, onChange, placeholder, tone }) {
  const [draft, setDraft] = useState('')
  const add = raw => {
    const items = raw.split(',').map(item => item.trim()).filter(Boolean)
    if (!items.length) return
    const seen = new Set(value.map(item => item.toLowerCase()))
    onChange([...value, ...items.filter(item => !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()))].slice(0, 20))
    setDraft('')
  }
  return <div className="hr-taginput">
    {value.map(item => <span key={item} className={`hr-tag hr-tag--${tone}`}>{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => onChange(value.filter(other => other !== item))}>×</button></span>)}
    <input id={id} value={draft} placeholder={value.length ? '' : placeholder}
      onChange={event => event.target.value.includes(',') ? add(event.target.value) : setDraft(event.target.value)}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); add(draft) }
        if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
      }}
      onBlur={() => add(draft)} />
  </div>
}

export default function HrOpeningForm() {
  const { openingId } = useParams()
  const editing = Boolean(openingId)
  const navigate = useNavigate()
  const { refreshAccount } = useHrSession()
  const [form, setForm] = useState(editing ? null : EMPTY)
  const [error, setError] = useState('')
  const [limitReached, setLimitReached] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pulled, setPulled] = useState('')

  useEffect(() => {
    if (!editing) return
    hrApi.getOpening(openingId)
      .then(({ opening }) => setForm({ ...EMPTY, ...opening, minYears: opening.minYears ? String(opening.minYears) : '' }))
      .catch(problem => { setError(problem.message); setForm(EMPTY) })
  }, [editing, openingId])

  if (!form) return <div className="hr-loading"><span className="hr-spinner" /></div>
  const set = key => value => setForm(current => ({ ...current, [key]: value }))

  const pullRequirements = () => {
    const read = extractJd(descriptionLines(form.title, form.description))
    const lower = new Set(form.mustHave.map(item => item.toLowerCase()))
    const mustHave = [...form.mustHave, ...read.mustHave.filter(item => !lower.has(item.toLowerCase()))].slice(0, 20)
    const taken = new Set(mustHave.map(item => item.toLowerCase()))
    const niceToHave = [...form.niceToHave, ...read.niceToHave.filter(item => !taken.has(item.toLowerCase()) && !form.niceToHave.some(other => other.toLowerCase() === item.toLowerCase()))].slice(0, 20)
    const added = mustHave.length - form.mustHave.length + niceToHave.length - form.niceToHave.length
    setForm(current => ({ ...current, mustHave, niceToHave, title: current.title || read.title || '' }))
    setPulled(added ? `Added ${added} requirement${added === 1 ? '' : 's'} from the description. Check them before saving.` : 'No new requirements found in the description.')
  }

  const submit = async event => {
    event.preventDefault()
    setError('')
    setLimitReached(false)
    setSaving(true)
    try {
      const fields = { ...form, minYears: form.minYears === '' ? 0 : Number(form.minYears) }
      const saved = editing ? await hrApi.updateOpening(openingId, fields) : await hrApi.createOpening(fields)
      await refreshAccount()
      navigate(`/hr/openings/${saved.id}`, { replace: true })
    } catch (problem) {
      setError(problem.message)
      setLimitReached(problem.code === 'plan_limit')
      setSaving(false)
    }
  }

  const weights = weightsFor(form)
  const back = editing ? `/hr/openings/${openingId}` : '/hr/openings'

  return <div className="hr-page">
    <Link className="hr-back" to={back}><Icon name="back" />{editing ? 'Back to the opening' : 'Job openings'}</Link>
    <PageHeader eyebrow={editing ? 'Edit opening' : 'New opening'} title={editing ? form.title || 'Edit the job' : 'Describe the job'} lede="Resumes in this opening are scored only against what you write here." />

    <form className="hr-form-grid" onSubmit={submit} noValidate>
      <div className="hr-panel hr-form">
        {error && <p className="hr-alert hr-alert--error" role="alert">{error}{limitReached && <> <Link to="/hr/plan">See Hiring Pro</Link></>}</p>}

        <fieldset>
          <legend>The role</legend>
          <label className="hr-field"><span>Job title <i>required</i></span><input value={form.title} onChange={event => set('title')(event.target.value)} placeholder="e.g. Frontend Developer" maxLength={120} required /></label>
          <div className="hr-field-row">
            <label className="hr-field"><span>Employment type</span>
              <select value={form.employmentType} onChange={event => set('employmentType')(event.target.value)}>{EMPLOYMENT_TYPES.map(type => <option key={type}>{type}</option>)}</select>
            </label>
            <label className="hr-field"><span>Location</span><input value={form.location} onChange={event => set('location')(event.target.value)} placeholder="e.g. Pune · Hybrid" maxLength={80} /></label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Job description</legend>
          <label className="hr-field"><span>What the role involves</span>
            <textarea rows={8} value={form.description} onChange={event => set('description')(event.target.value)} maxLength={8000} placeholder="Paste or write the job description: responsibilities, requirements, nice-to-haves." />
          </label>
          <div className="hr-inline">
            <button className="hr-btn hr-btn--ghost" type="button" onClick={pullRequirements} disabled={!form.description.trim()}>Pull requirements from description</button>
            {pulled && <span className="hr-muted" role="status">{pulled}</span>}
          </div>
        </fieldset>

        <fieldset>
          <legend>Requirements</legend>
          <div className="hr-field"><label htmlFor="hr-must">Must-have skills <i>required</i></label>
            <TagInput id="hr-must" value={form.mustHave} onChange={set('mustHave')} placeholder="Type a skill and press Enter" tone="must" />
            <small>Each must-have counts double in the skills score.</small>
          </div>
          <div className="hr-field"><label htmlFor="hr-nice">Nice-to-have skills</label>
            <TagInput id="hr-nice" value={form.niceToHave} onChange={set('niceToHave')} placeholder="Optional" tone="nice" />
          </div>
          <div className="hr-field-row">
            <label className="hr-field"><span>Minimum experience (years)</span><input type="number" min="0" max="30" step="0.5" inputMode="decimal" value={form.minYears} onChange={event => set('minYears')(event.target.value)} placeholder="0" /></label>
            <label className="hr-field"><span>Education requirement</span><input value={form.education} onChange={event => set('education')(event.target.value)} placeholder="e.g. Bachelor’s in Computer Science" maxLength={120} /></label>
          </div>
        </fieldset>

        <div className="hr-form-actions">
          <Link className="hr-btn hr-btn--ghost" to={back}>Cancel</Link>
          <button className="hr-btn hr-btn--primary" type="submit" disabled={saving || !form.title.trim() || !form.mustHave.length}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create opening'}</button>
        </div>
      </div>

      <aside className="hr-panel hr-preview" aria-label="How resumes will be scored">
        <p className="hr-eyebrow">Resumes will be scored against</p>
        <h2>{form.title || 'This job'}</h2>
        <ul className="hr-weights">
          {Object.entries(weights).map(([key, weight]) => <li key={key}><span>{HR_CATEGORY_LABELS[key]}</span><span className="hr-weight-bar"><i style={{ width: `${weight}%` }} /></span><b>{weight}%</b></li>)}
        </ul>
        <dl className="hr-preview-list">
          <div><dt>Must-have</dt><dd><Tags items={form.mustHave} tone="must" empty="Add at least one" /></dd></div>
          <div><dt>Nice-to-have</dt><dd><Tags items={form.niceToHave} tone="nice" /></dd></div>
          <div><dt>Experience</dt><dd>{Number(form.minYears) > 0 ? `${form.minYears}+ years, and how closely past roles match the title and duties` : 'How closely past roles match the title and duties'}</dd></div>
          <div><dt>Education</dt><dd>{form.education.trim() || <span className="hr-muted">Not scored (none stated)</span>}</dd></div>
          <div><dt>Keywords</dt><dd>{form.description.trim() ? 'Read from the description when you save' : <span className="hr-muted">Add a description</span>}</dd></div>
        </dl>
      </aside>
    </form>
  </div>
}
