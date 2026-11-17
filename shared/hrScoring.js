// Scores a resume against one HR job opening. Wraps the deterministic resume ↔ job scoring in
// shared/jdScoring.js and weights it for hiring. Used by the server (rankings) and documented in the portal.
import { scoreResumeAgainstJd, textHasTerm, resumeTextParts } from './jdScoring.js'

export const HR_WEIGHTS = Object.freeze({ skills: 50, experience: 30, education: 10, keywords: 10 })
export const HR_CATEGORY_LABELS = Object.freeze({ skills: 'Skills', experience: 'Experience', education: 'Education', keywords: 'Keywords' })

export const HR_BANDS = Object.freeze([
  { id: 'strong', label: 'Strong', min: 75 },
  { id: 'good', label: 'Good', min: 60 },
  { id: 'fair', label: 'Fair', min: 40 },
  { id: 'weak', label: 'Weak', min: 0 }
])

export const EMPLOYMENT_TYPES = Object.freeze(['Full-time', 'Part-time', 'Internship', 'Contract'])

/**
 * Title + description as one line per sentence, for shared/jdExtract.js: it reads requirement kinds per line,
 * so a single pasted paragraph containing "Nice to have" would otherwise mark every skill as nice-to-have.
 */
export function descriptionLines(title, description) {
  return `${title ?? ''}\n${String(description ?? '').replace(/([.;!?])\s+(?=[A-Z])/g, '$1\n')}`
}

export function bandOf(score) {
  return HR_BANDS.find(band => score >= band.min) ?? HR_BANDS.at(-1)
}

const list = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : []

/** The opening, in the shape shared/jdScoring.js scores against. */
export function openingToJd(opening = {}) {
  const years = Number(opening.minYears)
  return {
    title: String(opening.title ?? ''),
    mustHave: list(opening.mustHave),
    niceToHave: list(opening.niceToHave),
    keywords: list(opening.keywords),
    responsibilities: list(opening.responsibilities),
    yearsExperience: Number.isFinite(years) && years > 0 ? years : null,
    education: String(opening.education ?? '').trim() || null
  }
}

export const CANDIDATE_STATUSES = Object.freeze(['new', 'shortlisted', 'rejected'])
export const STATUS_LABELS = Object.freeze({ new: 'New', shortlisted: 'Shortlisted', rejected: 'Rejected' })

/**
 * HR's own weights for an opening ({ skills, experience, education, keywords }, whole numbers 0–100), or null for
 * the defaults. Throws a message HR can read when the input can't be used.
 */
export function validateWeights(input) {
  if (input === null || input === undefined) return null
  if (typeof input !== 'object') throw new Error('Weights must be numbers for skills, experience, education and keywords.')
  const weights = {}
  for (const key of Object.keys(HR_WEIGHTS)) {
    const value = Number(input[key] ?? 0)
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('Each weight must be between 0 and 100.')
    weights[key] = Math.round(value)
  }
  if (!Object.values(weights).some(value => value > 0)) throw new Error('At least one weight must be above 0.')
  return weights
}

/**
 * Weights in use for this opening, as whole percentages that add up to 100: HR's own weights when set, else the
 * defaults. Education drops out (and the rest re-weight) when the opening states no education requirement.
 */
export function weightsFor(opening = {}) {
  const source = opening.weights && Object.values(opening.weights).some(value => Number(value) > 0) ? opening.weights : HR_WEIGHTS
  const hasEducation = Boolean(String(opening.education ?? '').trim())
  let active = Object.keys(HR_WEIGHTS).filter(key => key !== 'education' || hasEducation).map(key => [key, Math.max(0, Number(source[key]) || 0)])
  if (!active.some(([, weight]) => weight > 0)) active = active.map(([key]) => [key, HR_WEIGHTS[key]])
  const total = active.reduce((sum, [, weight]) => sum + weight, 0)
  const percents = active.map(([key, weight]) => [key, Math.round(weight / total * 100)])
  // Rounding can leave 99 or 101: give the difference to the largest weight so the shown total is always 100.
  const drift = 100 - percents.reduce((sum, [, value]) => sum + value, 0)
  if (drift) { const largest = percents.reduce((best, item) => item[1] > best[1] ? item : best); largest[1] += drift }
  return Object.fromEntries(percents)
}

const strip = value => String(value ?? '').replace(/\[\/?[bius]\]/g, '').replace(/\s+/g, ' ').trim()

/** Every line of a resume with where it came from, for showing the evidence behind a matched skill. */
function resumeLines(resume = {}) {
  const lines = []
  const add = (where, text) => { const clean = strip(text); if (clean) lines.push({ where, text: clean }) }
  add('Headline', resume.headline)
  String(resume.summary ?? '').split(/(?<=[.!?])\s+/).forEach(sentence => add('Summary', sentence))
  const skills = Object.values(resume.skills ?? {}).flat().filter(Boolean)
  if (skills.length) add('Skills', skills.join(', '))
  ;(resume.experience ?? []).forEach(item => {
    const where = [item?.role, item?.company].filter(Boolean).join(' at ') || 'Experience'
    add(where, item?.role)
    ;(item?.bullets ?? []).forEach(bullet => add(where, bullet))
  })
  ;(resume.projects ?? []).forEach(item => {
    const where = item?.name ? `Project: ${item.name}` : 'Project'
    add(where, [item?.description, (item?.techStack ?? []).join(', ')].filter(Boolean).join(' · '))
    ;(item?.bullets ?? []).forEach(bullet => add(where, bullet))
  })
  ;(resume.education ?? []).forEach(item => add('Education', [item?.degree, item?.institution, ...(item?.details ?? [])].filter(Boolean).join(', ')))
  ;(resume.certifications ?? []).forEach(item => add('Certifications', item))
  return lines
}

/** The first resume line that mentions the term, trimmed for display; null when none does. */
function evidenceFor(lines, term) {
  const line = lines.find(item => textHasTerm(item.text, term))
  if (!line) return null
  return { where: line.where, text: line.text.length > 180 ? `${line.text.slice(0, 177)}…` : line.text }
}

/** One plain sentence on why the score is what it is, built only from the breakdown (no AI, nothing invented). */
export function whyLine(result) {
  const parts = []
  const { mustHave, years, minYears, categories } = result
  if (mustHave.total) {
    const missing = mustHave.items.filter(item => !item.found).map(item => item.term)
    parts.push(missing.length === 0 ? `meets all ${mustHave.total} must-haves` : `meets ${mustHave.met} of ${mustHave.total} must-haves (missing ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? ` and ${missing.length - 2} more` : ''})`)
  }
  parts.push(minYears ? `${years} years against ${minYears}+ asked` : `${years} years of experience`)
  const best = [...(categories.experience?.roles ?? [])].sort((a, b) => b.relevance - a.relevance)[0]
  parts.push(!best ? 'no work experience listed' : best.level === 'strong' ? `closely matching role: ${best.label}` : best.level === 'partial' ? `related role: ${best.label}` : 'no closely related role')
  if (categories.education) parts.push(categories.education.score >= 75 ? 'education requirement met' : 'education requirement not met')
  const sentence = parts.join('; ')
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`
}

/**
 * Full, explainable breakdown of one resume against one opening.
 * → { score, band, weights, categories: { skills, experience, education?, keywords }, mustHave, niceToHave, years, minYears, why }
 *   mustHave/niceToHave items carry { term, found, evidence: { where, text } | null }.
 */
export function scoreCandidate(resume = {}, opening = {}, { now = new Date() } = {}) {
  const jd = openingToJd(opening)
  const base = scoreResumeAgainstJd(resume, jd, { now })
  const weights = weightsFor(opening)
  const score = Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + (base.categories[key]?.score ?? 0) * weight, 0) / 100)
  const text = resumeTextParts(resume).all
  const lines = resumeLines(resume)
  const check = terms => terms.map(term => {
    const found = textHasTerm(text, term)
    return { term, found, evidence: found ? evidenceFor(lines, term) : null }
  })
  const mustHave = check(jd.mustHave)
  const niceToHave = check(jd.niceToHave)
  const categories = Object.fromEntries(Object.keys(weights).map(key => [key, { ...base.categories[key], weight: weights[key] }]))
  const result = {
    score: Math.max(0, Math.min(100, score)),
    weights,
    categories,
    mustHave: { items: mustHave, met: mustHave.filter(item => item.found).length, total: mustHave.length },
    niceToHave: { items: niceToHave, met: niceToHave.filter(item => item.found).length, total: niceToHave.length },
    keywords: base.keywords,
    years: base.years,
    minYears: jd.yearsExperience
  }
  return { ...result, band: bandOf(result.score), why: whyLine(result) }
}

/** The compact row the ranked table, chart and filters use. `serial` is the upload order (1 = first uploaded). */
export function candidateSummary(candidate, opening, options) {
  const result = scoreCandidate(candidate.resumeData, opening, options)
  const resume = candidate.resumeData ?? {}
  return {
    id: candidate.id,
    serial: candidate.serial ?? null,
    name: String(resume.fullName ?? '').trim() || candidate.fileName || 'Unnamed candidate',
    headline: String(resume.headline ?? '').trim() || String(resume.experience?.[0]?.role ?? '').trim(),
    email: String(resume.email ?? '').trim(),
    phone: String(resume.phone ?? '').trim(),
    fileName: candidate.fileName,
    parsedBy: candidate.parsedBy,
    createdAt: candidate.createdAt,
    status: CANDIDATE_STATUSES.includes(candidate.status) ? candidate.status : 'new',
    reason: candidate.reason ?? '',
    decidedAt: candidate.decidedAt ?? null,
    score: result.score,
    band: result.band.id,
    why: result.why,
    categories: Object.fromEntries(Object.entries(result.categories).map(([key, value]) => [key, value.score])),
    mustHaveMet: result.mustHave.met,
    mustHaveTotal: result.mustHave.total,
    missingMustHave: result.mustHave.items.filter(item => !item.found).map(item => item.term),
    // Every skill on the resume, for search by skill.
    skills: [...new Set(Object.values(resume.skills ?? {}).flat().map(strip).filter(Boolean))].slice(0, 60),
    years: result.years
  }
}

/** Header row + one row per candidate, RFC 4180 quoted, for the shortlist export. */
export function candidatesCsv(rows, weights) {
  const keys = Object.keys(weights)
  const quote = value => {
    const text = String(value ?? '')
    // A leading = + - @ would run as a formula when the file is opened in a spreadsheet.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const header = ['Rank', 'Name', 'Email', 'Phone', 'Headline', 'Overall score', ...keys.map(key => HR_CATEGORY_LABELS[key]), 'Must-haves met', 'Years', 'Status', 'Reason', 'File']
  const lines = rows.map((row, index) => [index + 1, row.name, row.email, row.phone, row.headline, row.score, ...keys.map(key => row.categories[key]), `${row.mustHaveMet}/${row.mustHaveTotal}`, row.years, STATUS_LABELS[row.status], row.reason, row.fileName].map(quote).join(','))
  return [header.map(quote).join(','), ...lines].join('\r\n')
}

/** Highest score first; ties by name. */
export function rankCandidates(summaries) {
  return [...summaries].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}
