import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { checkHrDetails } from '../../shared/hrRegistration.js'
import { getSession, register } from './hrApi.js'
import { HrAuthSide } from './HrLogin.jsx'
import { CompanyFields, PersonFields } from './HrDetailsFields.jsx'

const STEP_ONE = ['fullName', 'jobTitle', 'email', 'phone', 'password', 'confirmPassword']
const EMPTY = { fullName: '', jobTitle: '', email: '', phone: '', password: '', confirmPassword: '', companyName: '', website: '', industry: '', companySize: '', city: '', country: 'India', registrationType: 'gstin', registrationNumber: '', agree: false }

/** Two short steps, you then your company, checked with the same rules the server uses. */
export default function HrRegister() {
  const navigate = useNavigate()
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (getSession()) return <Navigate to="/hr" replace />

  const set = (key, value) => {
    setValues(current => ({ ...current, [key]: value }))
    setErrors(current => { if (!current[key]) return current; const { [key]: _gone, ...rest } = current; return rest })
  }
  const stepErrors = (all, fields) => Object.fromEntries(Object.entries(all).filter(([key]) => fields.includes(key)))

  const next = event => {
    event.preventDefault()
    const found = stepErrors(checkHrDetails(values, { withPassword: true }).errors, STEP_ONE)
    setErrors(found)
    if (!Object.keys(found).length) { setStep(2); window.scrollTo({ top: 0 }) }
  }

  const submit = async event => {
    event.preventDefault()
    setError('')
    const { errors: found } = checkHrDetails(values, { withPassword: true })
    setErrors(found)
    if (Object.keys(found).length) {
      if (Object.keys(stepErrors(found, STEP_ONE)).length) setStep(1)
      return
    }
    setBusy(true)
    try {
      await register(values)
      navigate('/hr', { replace: true })
    } catch (problem) {
      setBusy(false)
      setError(problem.message)
      if (problem.fields) {
        setErrors(problem.fields)
        if (Object.keys(stepErrors(problem.fields, STEP_ONE)).length) setStep(1)
      }
    }
  }

  return <main className="hr-login">
    <HrAuthSide title={<>Set up hiring<br /><em>in two steps.</em></>} lede="Tell us who you are and who you hire for. Your first 2 job openings are free, and you can add your company’s registration now or later." />

    <section className="hr-login-main">
      <form className="hr-login-form hr-register-form" onSubmit={step === 1 ? next : submit} noValidate>
        <p className="hr-eyebrow">Create an HR account</p>
        <ol className="hr-stepper" aria-label="Sign-up steps">
          <li className={step === 1 ? 'is-current' : 'is-done'} aria-current={step === 1 ? 'step' : undefined}><span>1</span>About you</li>
          <li className={step === 2 ? 'is-current' : ''} aria-current={step === 2 ? 'step' : undefined}><span>2</span>Your company</li>
        </ol>
        {error && <p className="hr-alert hr-alert--error" role="alert">{error}</p>}

        {step === 1 ? <>
          <PersonFields values={values} errors={errors} set={set} withPassword />
          <button className="hr-btn hr-btn--primary hr-btn--block" type="submit">Continue</button>
        </> : <>
          <CompanyFields values={values} errors={errors} set={set} />
          <label className={`hr-check hr-agree${errors.agree ? ' has-error' : ''}`}>
            <input type="checkbox" checked={values.agree} onChange={event => set('agree', event.target.checked)} />
            <span>I hire for this company and I’m allowed to share its details.</span>
          </label>
          {errors.agree && <small className="hr-field-error" role="alert">{errors.agree}</small>}
          <div className="hr-register-actions">
            <button className="hr-btn hr-btn--ghost" type="button" onClick={() => setStep(1)}>Back</button>
            <button className="hr-btn hr-btn--primary" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
          </div>
        </>}
        <p className="hr-login-switch">Already have an account? <Link to="/hr/login">Sign in</Link></p>
      </form>
    </section>
  </main>
}
