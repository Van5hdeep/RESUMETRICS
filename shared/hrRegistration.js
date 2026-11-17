// HR account details: what the sign-up form asks, and the checks the browser and the server both run on it.
// Modelled on Indian recruiter sign-ups (contact person, company, industry, location, GST status) and kept short:
// two steps, the registration number optional but format-checked when given.

export const INDUSTRIES = Object.freeze([
  'Information Technology', 'Software & SaaS', 'Banking & Financial Services', 'Consulting', 'E-commerce & Retail',
  'Education & EdTech', 'Healthcare & Pharma', 'Manufacturing', 'Media & Marketing', 'Staffing & Recruitment', 'Other'
])
export const COMPANY_SIZES = Object.freeze(['1–10', '11–50', '51–200', '201–1,000', '1,001–5,000', '5,000+'])
export const REGISTRATION_TYPES = Object.freeze({
  cin: 'Registered company (CIN)',
  gstin: 'GST registered (GSTIN)',
  other: 'Registered outside India',
  none: 'Not registered yet'
})

/** GSTIN: state code, PAN (5 letters, 4 digits, 1 letter), entity number, "Z", check character. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
/** CIN: listed/unlisted, industry code, state, year, ownership type, registration number (21 characters). */
export const CIN_PATTERN = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/
// Sign-ups from these need company documents before they're verified, since the address proves nothing about the employer.
export const PERSONAL_EMAIL_DOMAINS = Object.freeze(['gmail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'rediffmail.com', 'proton.me', 'protonmail.com', 'aol.com'])

export const isPersonalEmail = email => PERSONAL_EMAIL_DOMAINS.includes(String(email ?? '').split('@')[1]?.toLowerCase() ?? '')

const text = (value, max) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''

/**
 * Checks the details. → { value, errors } where errors maps a field name to a message HR can act on (empty when valid).
 * withPassword: also check password + confirmPassword (sign-up); profile edits leave the password alone.
 */
export function checkHrDetails(input = {}, { withPassword = false } = {}) {
  const errors = {}
  const value = {
    fullName: text(input.fullName, 80),
    email: text(input.email, 120).toLowerCase(),
    phone: text(input.phone, 20),
    jobTitle: text(input.jobTitle, 80),
    companyName: text(input.companyName, 120),
    website: text(input.website, 200),
    industry: text(input.industry, 60),
    companySize: text(input.companySize, 20),
    city: text(input.city, 60),
    country: text(input.country, 60) || 'India',
    registrationType: Object.hasOwn(REGISTRATION_TYPES, input.registrationType) ? input.registrationType : 'none',
    registrationNumber: text(input.registrationNumber, 40).toUpperCase().replace(/\s/g, '')
  }

  if (value.fullName.length < 2) errors.fullName = 'Enter your full name.'
  // Domain labels can't contain dots, so the pattern has one way to match and can't backtrack on long input.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value.email)) errors.email = 'Enter a valid work email.'
  if (!/^\+?[0-9][0-9 -]{7,17}$/.test(value.phone)) errors.phone = 'Enter a phone number with country code, e.g. +91 98765 43210.'
  if (value.jobTitle.length < 2) errors.jobTitle = 'Enter your job title, e.g. HR Manager.'
  if (value.companyName.length < 2) errors.companyName = 'Enter the company you hire for.'
  if (value.website && !/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value.website)) errors.website = 'Enter a website like example.com, or leave it empty.'
  if (value.website && !/^https?:\/\//i.test(value.website)) value.website = `https://${value.website}`
  if (!INDUSTRIES.includes(value.industry)) errors.industry = 'Choose an industry.'
  if (!COMPANY_SIZES.includes(value.companySize)) errors.companySize = 'Choose the company size.'
  if (value.city.length < 2) errors.city = 'Enter the city you hire from.'

  // The number is optional, but when a type is chosen and a number given, it must have the right shape.
  if (value.registrationType === 'none') value.registrationNumber = ''
  if (value.registrationType === 'cin' && value.registrationNumber && !CIN_PATTERN.test(value.registrationNumber)) errors.registrationNumber = 'A CIN is 21 characters, like U72900MH2024PTC000001.'
  if (value.registrationType === 'gstin' && value.registrationNumber && !GSTIN_PATTERN.test(value.registrationNumber)) errors.registrationNumber = 'A GSTIN is 15 characters, like 27AAACR0000A1Z5.'
  if (value.registrationType === 'other' && value.registrationNumber && value.registrationNumber.length < 4) errors.registrationNumber = 'Enter the registration number, or leave it empty.'

  if (withPassword) {
    const passwordErrors = checkNewPassword(input.password, input.confirmPassword)
    if (passwordErrors.newPassword) errors.password = passwordErrors.newPassword
    if (passwordErrors.confirmPassword) errors.confirmPassword = passwordErrors.confirmPassword
    if (input.agree !== true) errors.agree = 'Confirm that you hire for this company and accept the Terms and Privacy Policy.'
  }
  return { value, errors }
}

/** The password rule, for sign-up and for changing a password. → { newPassword?, confirmPassword? } messages. */
export function checkNewPassword(password, confirmPassword) {
  const errors = {}
  const value = typeof password === 'string' ? password : ''
  if (value.length < 8 || !/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) errors.newPassword = 'Use at least 8 characters with a letter and a number.'
  else if (value.length > 128) errors.newPassword = 'Use at most 128 characters.'
  if (value !== (typeof confirmPassword === 'string' ? confirmPassword : '')) errors.confirmPassword = 'The passwords don’t match.'
  return errors
}

/**
 * Where verification stands. Nothing is checked against government records here, so a real sign-up is "pending"
 * until someone reviews it; a personal email or a missing registration number says what is still needed.
 */
export function verificationFor(details) {
  if (details?.verification === 'verified') return { status: 'verified', label: 'Verified', note: 'Company details checked.' }
  const needs = []
  if (isPersonalEmail(details?.email)) needs.push('a company email or company documents')
  if (details?.registrationType !== 'none' && !details?.registrationNumber) needs.push('the registration number')
  if (details?.registrationType === 'none') needs.push('proof of the business (e.g. PAN and address)')
  const next = needs.length ? ` To verify it, we’ll need ${needs.join(' and ')}.` : ''
  return { status: 'pending', label: 'Pending review', note: `Not verified yet; the account works normally in the meantime.${next}` }
}
