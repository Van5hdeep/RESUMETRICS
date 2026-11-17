import { useState } from 'react'
import { checkHrDetails, REGISTRATION_TYPES } from '../../shared/hrRegistration.js'
import { hrApi } from './hrApi.js'
import { useHrSession } from './HrApp.jsx'
import { CompanyFields, PersonFields } from './HrDetailsFields.jsx'
import { Icon, PageHeader } from './hrUi.jsx'

const EMPTY = { fullName: '', jobTitle: '', phone: '', companyName: '', website: '', industry: '', companySize: '', city: '', country: 'India', registrationType: 'none', registrationNumber: '' }

function Row({ label, children }) {
  return <div className="hr-profile-row"><dt>{label}</dt><dd>{children || <span className="hr-muted">Not added</span>}</dd></div>
}

/** Who is hiring and for which company: shown on the account, editable, with where verification stands. */
export default function HrProfile() {
  const { account, setAccount } = useHrSession()
  const details = account.details
  const [editing, setEditing] = useState(!details)
  const [values, setValues] = useState(() => ({ ...EMPTY, ...(details ?? {}), email: account.email }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const set = (key, value) => {
    setValues(current => ({ ...current, [key]: value }))
    setErrors(current => { if (!current[key]) return current; const { [key]: _gone, ...rest } = current; return rest })
  }

  const save = async event => {
    event.preventDefault()
    setError('')
    const { errors: found } = checkHrDetails(values)
    setErrors(found)
    if (Object.keys(found).length) return
    setBusy(true)
    try {
      const next = await hrApi.updateDetails(values)
      setAccount(next)
      setEditing(false)
      setSaved(true)
    } catch (problem) {
      setError(problem.message)
      if (problem.fields) setErrors(problem.fields)
    } finally {
      setBusy(false)
    }
  }

  const verification = account.verification
  return <div className="hr-page">
    <PageHeader eyebrow="Company profile" title={details?.companyName || 'Your company'} lede={details ? `${details.fullName} · ${details.jobTitle}` : 'Add who you are and who you hire for.'}>
      {!editing && <button className="hr-btn hr-btn--ghost" type="button" onClick={() => { setValues({ ...EMPTY, ...(details ?? {}), email: account.email }); setEditing(true); setSaved(false) }}>Edit details</button>}
    </PageHeader>

    {saved && <p className="hr-alert hr-alert--info" role="status">Details saved.</p>}
    {details?.demo && <p className="hr-alert hr-alert--info">This is the demo account. The company, website and registration number are made up for demonstrations.</p>}

    {verification && <section className={`hr-panel hr-verify hr-verify--${verification.status}`}>
      <span className="hr-verify-icon" aria-hidden="true"><Icon name={verification.status === 'verified' ? 'check' : 'plan'} /></span>
      <div><b>Company verification: {verification.label}</b><span>{verification.note}</span></div>
    </section>}

    {editing ? <form className="hr-panel hr-form hr-profile-form" onSubmit={save} noValidate>
      {error && <p className="hr-alert hr-alert--error" role="alert">{error}</p>}
      <fieldset><legend>About you</legend><PersonFields values={values} errors={errors} set={set} emailLocked /></fieldset>
      <fieldset><legend>Your company</legend><CompanyFields values={values} errors={errors} set={set} /></fieldset>
      <div className="hr-form-actions">
        {details && <button className="hr-btn hr-btn--ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>}
        <button className="hr-btn hr-btn--primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
      </div>
    </form> : <div className="hr-profile-grid">
      <section className="hr-panel hr-profile-card">
        <h2>About you</h2>
        <dl>
          <Row label="Full name">{details.fullName}</Row>
          <Row label="Job title">{details.jobTitle}</Row>
          <Row label="Work email">{account.email}</Row>
          <Row label="Phone">{details.phone}</Row>
        </dl>
      </section>
      <section className="hr-panel hr-profile-card">
        <h2>Company</h2>
        <dl>
          <Row label="Name">{details.companyName}</Row>
          <Row label="Website">{details.website && <a href={details.website} target="_blank" rel="noreferrer noopener">{details.website.replace(/^https?:\/\//, '')}</a>}</Row>
          <Row label="Industry">{details.industry}</Row>
          <Row label="Size">{details.companySize && `${details.companySize} employees`}</Row>
          <Row label="Location">{[details.city, details.country].filter(Boolean).join(', ')}</Row>
          <Row label="Registration">{REGISTRATION_TYPES[details.registrationType]}{details.registrationNumber && <code className="hr-reg-number">{details.registrationNumber}</code>}</Row>
        </dl>
      </section>
    </div>}
  </div>
}
