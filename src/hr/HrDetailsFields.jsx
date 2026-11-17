import { COMPANY_SIZES, INDUSTRIES, isPersonalEmail, REGISTRATION_TYPES } from '../../shared/hrRegistration.js'

const NUMBER_HINT = {
  cin: { label: 'CIN', placeholder: 'U72900MH2024PTC000001', help: '21 characters, from the certificate of incorporation (MCA).' },
  gstin: { label: 'GSTIN', placeholder: '27AAACR0000A1Z5', help: '15 characters, from the GST registration certificate.' },
  other: { label: 'Registration number', placeholder: 'Company number', help: 'The number from your country’s company register.' }
}

/** One labelled input with its error message underneath, wired for screen readers. */
export function Field({ id, label, error, hint, optional, children }) {
  return <div className={`hr-field${error ? ' has-error' : ''}`}>
    <label htmlFor={id}>{label}{optional && <i className="hr-optional">optional</i>}</label>
    {children}
    {error ? <small className="hr-field-error" id={`${id}-error`} role="alert">{error}</small> : hint ? <small id={`${id}-hint`}>{hint}</small> : null}
  </div>
}

const input = (id, values, errors, set, extra = {}) => ({
  id,
  value: values[id] ?? '',
  onChange: event => set(id, event.target.value),
  'aria-invalid': errors[id] ? 'true' : undefined,
  'aria-describedby': errors[id] ? `${id}-error` : undefined,
  ...extra
})

/** About the person: name, email, phone, job title (and the password pair on sign-up). */
export function PersonFields({ values, errors, set, withPassword = false, emailLocked = false }) {
  const personal = isPersonalEmail(values.email)
  return <>
    <div className="hr-field-row">
      <Field id="fullName" label="Full name" error={errors.fullName}><input {...input('fullName', values, errors, set, { autoComplete: 'name', placeholder: 'e.g. Vanshdeep Mishra' })} /></Field>
      <Field id="jobTitle" label="Job title" error={errors.jobTitle}><input {...input('jobTitle', values, errors, set, { autoComplete: 'organization-title', placeholder: 'e.g. HR Manager' })} /></Field>
    </div>
    <Field id="email" label="Work email" error={errors.email} hint={emailLocked ? 'Your sign-in email can’t be changed here.' : personal ? 'Personal email addresses need company documents before the account is verified.' : 'Use your company email; it speeds up verification.'}>
      <input {...input('email', values, errors, set, { type: 'email', autoComplete: 'email', placeholder: 'name@company.com', readOnly: emailLocked })} />
    </Field>
    <Field id="phone" label="Phone" error={errors.phone}><input {...input('phone', values, errors, set, { type: 'tel', autoComplete: 'tel', placeholder: '+91 98765 43210' })} /></Field>
    {withPassword && <div className="hr-field-row">
      <Field id="password" label="Password" error={errors.password} hint="At least 8 characters, with a letter and a number."><input {...input('password', values, errors, set, { type: 'password', autoComplete: 'new-password' })} /></Field>
      <Field id="confirmPassword" label="Confirm password" error={errors.confirmPassword}><input {...input('confirmPassword', values, errors, set, { type: 'password', autoComplete: 'new-password' })} /></Field>
    </div>}
  </>
}

/** About the company: name, website, industry, size, location, and its registration. */
export function CompanyFields({ values, errors, set }) {
  const hint = NUMBER_HINT[values.registrationType]
  return <>
    <div className="hr-field-row">
      <Field id="companyName" label="Company name" error={errors.companyName}><input {...input('companyName', values, errors, set, { autoComplete: 'organization', placeholder: 'Registered or trading name' })} /></Field>
      <Field id="website" label="Company website" optional error={errors.website}><input {...input('website', values, errors, set, { type: 'url', inputMode: 'url', autoComplete: 'url', placeholder: 'company.com' })} /></Field>
    </div>
    <div className="hr-field-row">
      <Field id="industry" label="Industry" error={errors.industry}>
        <select {...input('industry', values, errors, set)}><option value="">Choose an industry</option>{INDUSTRIES.map(item => <option key={item}>{item}</option>)}</select>
      </Field>
      <Field id="companySize" label="Company size" error={errors.companySize}>
        <select {...input('companySize', values, errors, set)}><option value="">Number of employees</option>{COMPANY_SIZES.map(item => <option key={item}>{item}</option>)}</select>
      </Field>
    </div>
    <div className="hr-field-row">
      <Field id="city" label="City" error={errors.city}><input {...input('city', values, errors, set, { autoComplete: 'address-level2', placeholder: 'e.g. Pune' })} /></Field>
      <Field id="country" label="Country" error={errors.country}><input {...input('country', values, errors, set, { autoComplete: 'country-name' })} /></Field>
    </div>
    <fieldset className="hr-reg-types">
      <legend>Is the company registered?</legend>
      <div className="hr-reg-options">
        {Object.entries(REGISTRATION_TYPES).map(([key, label]) => <label key={key} className={`hr-reg-option${values.registrationType === key ? ' is-on' : ''}`}>
          <input type="radio" name="registrationType" value={key} checked={values.registrationType === key} onChange={() => set('registrationType', key)} />{label}
        </label>)}
      </div>
    </fieldset>
    {hint ? <Field id="registrationNumber" label={hint.label} optional error={errors.registrationNumber} hint={`${hint.help} You can add it later; it’s needed before verification.`}>
      <input {...input('registrationNumber', values, errors, set, { placeholder: hint.placeholder, autoCapitalize: 'characters', spellCheck: false })} />
    </Field> : <p className="hr-note-sm">Not registered yet (e.g. a startup or a freelance recruiter)? You can still sign up; we’ll ask for PAN and address proof before verifying.</p>}
  </>
}
