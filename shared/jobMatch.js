// Job tracker matching (server/jobs/jobSearch.js): what to search for from a resume, which job board a posting is
// on, and how well a posting fits. Deterministic, so it is cheap to run on every result and easy to test.
import { explicitResumeSkills, knownSkillsIn } from './roleAnalysis.js'
import { resumeTextParts, textHasTerm, yearsOfExperience } from './jdScoring.js'

/** Job boards in the order their rows appear. `company` is the employer's own site; `other` is everything else. */
export const PLATFORMS = Object.freeze([
  { id: 'linkedin', name: 'LinkedIn', pattern: /linkedin/i },
  { id: 'naukri', name: 'Naukri', pattern: /naukri/i },
  { id: 'indeed', name: 'Indeed', pattern: /indeed/i },
  { id: 'glassdoor', name: 'Glassdoor', pattern: /glassdoor/i },
  { id: 'foundit', name: 'Foundit', pattern: /foundit|monster/i },
  { id: 'internshala', name: 'Internshala', pattern: /internshala/i },
  { id: 'wellfound', name: 'Wellfound', pattern: /wellfound|angel\.co|angellist/i },
  { id: 'instahyre', name: 'Instahyre', pattern: /instahyre/i },
  { id: 'cutshort', name: 'Cutshort', pattern: /cutshort/i },
  { id: 'apna', name: 'Apna', pattern: /\bapna\b/i },
  { id: 'shine', name: 'Shine', pattern: /\bshine\b/i },
  { id: 'company', name: 'Company websites', pattern: null },
  { id: 'other', name: 'Other job boards', pattern: null }
])
export const PLATFORM_NAMES = Object.freeze(Object.fromEntries(PLATFORMS.map(platform => [platform.id, platform.name])))

export function platformOf(publisher = '', url = '', { direct = false } = {}) {
  const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
  const known = PLATFORMS.find(platform => platform.pattern && (platform.pattern.test(publisher) || platform.pattern.test(host)))
  if (known) return known.id
  return direct ? 'company' : 'other'
}

const clean = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const lower = value => String(value).toLowerCase()

/** "Full Stack Developer | React, Node" → "Full Stack Developer". */
export function roleFromResume(resume = {}) {
  const fromHeadline = clean(resume.headline).split(/\s+[|•·–—-]\s+|\s*[|•·]\s*/)[0]?.trim()
  if (fromHeadline && fromHeadline.length >= 3 && fromHeadline.length <= 60) return fromHeadline
  const latestRole = (Array.isArray(resume.experience) ? resume.experience : []).map(item => clean(item?.role, 60)).find(Boolean)
  return latestRole || 'Software Developer'
}

/** First part of "Pune, Maharashtra, India"; remote-only locations fall back to India. */
export function cityFromResume(resume = {}) {
  const city = clean(resume.location, 80).split(',')[0]?.trim()
  return city && !/^remote$/i.test(city) ? city : 'India'
}

export const DATE_POSTED = ['all', 'today', '3days', 'week', 'month']

/** Where a saved job is in the application process, in board order. */
export const JOB_STATUSES = Object.freeze(['saved', 'applied', 'interview', 'offer', 'rejected'])

/**
 * What a search looks for. overrides: { role, location, remote, datePosted } from the search bar. Only these derived
 * terms leave the server (to the job APIs) — never the resume text or contact details.
 */
export function buildSearchProfile(resume = {}, overrides = {}, now = new Date()) {
  const explicit = explicitResumeSkills(resume)
  const skills = (explicit.length ? explicit : knownSkillsIn(resumeTextParts(resume).all)).slice(0, 15)
  const years = yearsOfExperience(resume, now)
  return {
    role: clean(overrides.role, 80) || roleFromResume(resume),
    location: clean(overrides.location, 80) || cityFromResume(resume),
    remote: overrides.remote === true,
    datePosted: DATE_POSTED.includes(overrides.datePosted) ? overrides.datePosted : 'month',
    skills,
    years,
    level: years < 1 ? 'Entry level' : years < 3 ? 'Junior' : years < 6 ? 'Mid level' : 'Senior'
  }
}

const TITLE_NOISE = new Set(['and', 'of', 'the', 'for', 'in', 'a', 'an', 'to', 'with', 'senior', 'junior', 'sr', 'jr', 'lead', 'i', 'ii', 'iii', 'intern', 'trainee', 'fresher'])
const titleTokens = text => lower(text).replace(/[^a-z0-9+#.]+/g, ' ').split(' ').filter(token => token && !TITLE_NOISE.has(token))

/** Share of the searched role's words that appear in the job title (0–1). */
export function titleFit(role, title) {
  const wanted = titleTokens(role)
  if (!wanted.length) return .5
  const have = new Set(titleTokens(title))
  return wanted.filter(token => have.has(token) || have.has(token.replace(/s$/, ''))).length / wanted.length
}

// Company names without legal suffixes, so "Zeta Pvt Ltd" and "Zeta" are the same employer.
const COMPANY_SUFFIX = /\b(private|pvt|limited|ltd|llp|inc|incorporated|corp|corporation|co|company|india|technologies|technology|tech|solutions|services|labs)\b\.?/g

/**
 * The same opening across sources: its title and employer, normalised ("Sr. React Developer @ Zeta Pvt Ltd" and
 * "React Developer at Zeta" match). Empty without both, so unknown jobs never merge.
 */
export function jobIdentity(job) {
  const title = titleTokens(job?.title ?? '').filter(token => !/^(sr|senior|jr|junior)\.?$/.test(token)).join(' ').replace(/[^a-z0-9+# ]/g, '').trim()
  const company = lower(job?.company ?? '').replace(COMPANY_SUFFIX, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
  return title && company ? `${title}@${company}` : ''
}

// Job titles that hiring teams use for the same work. A role matching a family's pattern searches its other titles too.
const ROLE_FAMILIES = [
  [/\b(react|frontend|front[- ]end|ui developer|angular|vue|next\.?js)\b/, ['Frontend Developer', 'Frontend Engineer', 'React Developer', 'UI Developer', 'Full Stack Developer']],
  [/\b(full[- ]?stack|mern|mean)\b/, ['Full Stack Developer', 'Full Stack Engineer', 'MERN Stack Developer']],
  [/\b(backend|back[- ]end|node(\.?js)?|django|spring|golang)\b/, ['Backend Developer', 'Backend Engineer', 'Node.js Developer']],
  [/\b(android|ios|flutter|react native|mobile)\b/, ['Mobile Developer', 'Android Developer', 'Flutter Developer', 'React Native Developer']],
  [/\b(data scien|machine learning|ml engineer|ai engineer|deep learning)/, ['Data Scientist', 'Machine Learning Engineer', 'AI Engineer']],
  [/\b(data analyst|business analyst|bi analyst|analytics|power bi|tableau)\b/, ['Data Analyst', 'Business Analyst', 'BI Analyst']],
  [/\b(data engineer|etl|big data)\b/, ['Data Engineer', 'Big Data Engineer', 'ETL Developer']],
  [/\b(devops|sre|site reliability|cloud engineer|platform engineer)\b/, ['DevOps Engineer', 'Site Reliability Engineer', 'Cloud Engineer']],
  [/\b(qa|quality|test(er|ing)?|sdet|automation)\b/, ['QA Engineer', 'Test Engineer', 'SDET', 'Automation Tester']],
  [/\b(ui\/ux|ux|product designer|ui designer|interaction designer)\b/, ['UI/UX Designer', 'Product Designer', 'UX Designer']],
  [/\b(product manager|product owner)\b/, ['Product Manager', 'Associate Product Manager', 'Product Owner']],
  [/\b(java)\b(?!script)/, ['Java Developer', 'Backend Developer', 'Software Engineer']],
  [/\b(python)\b/, ['Python Developer', 'Backend Developer', 'Software Engineer']],
  [/\b(software (engineer|developer)|sde|programmer)\b/, ['Software Engineer', 'Software Developer', 'SDE']]
]

/** Other titles for the same work as `role` (never the role itself), most common first: "React Developer" → ["Frontend Developer", …]. */
export function relatedRoles(role) {
  const text = lower(role)
  const family = ROLE_FAMILIES.find(([pattern]) => pattern.test(text))?.[1] ?? []
  const own = new Set(titleTokens(role).join(' ').split(' '))
  return family.filter(title => lower(title) !== text && titleTokens(title).join(' ') !== [...own].join(' '))
}

/** "2-4 years", "3+ yrs", "5 to 8 years" in the posting, against the resume's years (0–1; .7 when the posting says nothing). */
export function experienceFit(years, text) {
  const match = String(text ?? '').match(/(\d{1,2})\s*(?:\+|-|–|to)?\s*(\d{1,2})?\s*\+?\s*(?:years?|yrs?)/i)
  if (!match) return .7
  const min = Number(match[1])
  const max = match[2] ? Number(match[2]) : min + 3
  if (years >= min && years <= max + 1) return 1
  if (years < min) return Math.max(0, 1 - (min - years) / 3)
  return .8
}

/**
 * 0–100 with the resume skills the posting mentions and the posting's known skills the resume lacks.
 * 55% skills, 35% title, 10% experience.
 */
export function scoreJob(profile, job) {
  const text = `${job.title ?? ''}\n${job.description ?? ''}\n${job.qualifications ?? ''}`
  const jobSkills = knownSkillsIn(text)
  const matched = profile.skills.filter(skill => textHasTerm(text, skill))
  const resumeKeys = new Set(profile.skills.flatMap(skill => [skill, ...knownSkillsIn(skill)]).map(lower))
  const missing = jobSkills.filter(skill => !resumeKeys.has(lower(skill)))
  const skillFit = jobSkills.length ? (jobSkills.length - missing.length) / jobSkills.length : Math.min(1, matched.length / 4)
  const score = Math.round(100 * (.55 * skillFit + .35 * titleFit(profile.role, job.title) + .1 * experienceFit(profile.years, `${job.qualifications ?? ''}\n${job.description ?? ''}`)))
  return { score: Math.max(0, Math.min(100, score)), matched: matched.slice(0, 8), missing: missing.slice(0, 6) }
}

const oneDecimal = value => String(Math.round(value * 10) / 10)

/** Rupee pay for display: yearly in lakhs ("₹5–8 LPA"), monthly in thousands ("₹40k–60k a month"), hourly as is. */
export function formatPay({ min = null, max = null, period = 'YEAR' } = {}) {
  const low = min || max
  const high = max && min && max !== min ? max : null
  if (!low) return ''
  if (period === 'MONTH') return `₹${Math.round(low / 1000)}k${high ? `–${Math.round(high / 1000)}k` : ''} a month`
  if (period === 'HOUR') return `₹${Math.round(low)}${high ? `–${Math.round(high)}` : ''} an hour`
  return `₹${oneDecimal(low / 1e5)}${high ? `–${oneDecimal(high / 1e5)}` : ''} LPA`
}
