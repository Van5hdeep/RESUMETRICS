// Scores a resume against one HR job opening. Wraps the deterministic resume ↔ job scoring in
// shared/jdScoring.js and weights it for hiring. Used by the server (rankings) and documented in the portal.
//
// The match follows the usual ATS model: a weighted score (keywords 40–50%, experience 20–25%, skills 15–20%,
// education 5–15%, section completeness 5–10%), a pass threshold (commonly 60–70%), and optional knockouts that
// screen a resume out whatever its score. Readability comes first and is a separate check: shared/atsStandard.js.
import { scoreResumeAgainstJd, textHasTerm, resumeTextParts } from './jdScoring.js'
import { atsSummary, evaluateAts, sectionCompleteness } from './atsStandard.js'

// Key order is the order categories are shown in.
export const HR_WEIGHTS = Object.freeze({ keywords: 40, experience: 25, skills: 20, education: 10, completeness: 5 })
export const HR_CATEGORY_LABELS = Object.freeze({ keywords: 'Keywords', experience: 'Experience', skills: 'Skills', education: 'Education', completeness: 'Completeness' })

/** Match score a resume needs to join the main ranking, unless the opening sets its own (40–90). */
export const HR_THRESHOLD = 65
export const HR_THRESHOLD_RANGE = Object.freeze({ min: 40, max: 90 })
/** Knockouts screen a resume out whatever its score. Both are off unless the opening turns them on. */
export const HR_KNOCKOUTS = Object.freeze({
  minYears: 'Below the minimum years of experience',
  mustHave: 'Missing a must-have skill'
})

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
  if (typeof input !== 'object') throw new Error('Weights must be numbers for keywords, experience, skills, education and completeness.')
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

/** The opening's pass threshold: its own when set and in range, else HR_THRESHOLD. */
export function thresholdFor(opening = {}) {
  const value = Number(opening.threshold)
  return Number.isFinite(value) && value >= HR_THRESHOLD_RANGE.min && value <= HR_THRESHOLD_RANGE.max ? Math.round(value) : HR_THRESHOLD
}

/** Which knockouts the opening uses: { minYears, mustHave }, each true or false. */
export function knockoutsFor(opening = {}) {
  const source = opening.knockouts && typeof opening.knockouts === 'object' ? opening.knockouts : {}
  return Object.fromEntries(Object.keys(HR_KNOCKOUTS).map(key => [key, source[key] === true]))
}

/**
 * Threshold and knockouts from the opening page: { threshold?, knockouts? } → the cleaned values. Throws a message HR
 * can read when a value can't be used.
 */
export function validateScreening(input = {}) {
  const settings = {}
  if (input.threshold !== undefined) {
    const value = Number(input.threshold)
    if (!Number.isFinite(value) || value < HR_THRESHOLD_RANGE.min || value > HR_THRESHOLD_RANGE.max) throw new Error(`The pass threshold must be between ${HR_THRESHOLD_RANGE.min} and ${HR_THRESHOLD_RANGE.max}.`)
    settings.threshold = Math.round(value)
  }
  if (input.knockouts !== undefined) {
    if (!input.knockouts || typeof input.knockouts !== 'object') throw new Error('Knockouts are a set of on/off switches.')
    settings.knockouts = Object.fromEntries(Object.keys(HR_KNOCKOUTS).map(key => [key, input.knockouts[key] === true]))
  }
  return settings
}

/** How many times a term appears in the text (whole words, any case). */
function countTerm(text, term) {
  const clean = String(term ?? '').trim().toLowerCase()
  if (!clean) return 0
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, 'g')
  return (String(text ?? '').toLowerCase().match(pattern) ?? []).length
}

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
  const completeness = sectionCompleteness(resume)
  base.categories.completeness = { score: completeness, matched: [], missing: [], notes: [`Sections and entries are ${completeness}% complete: contact details, summary, core sections, and full job and education entries.`] }
  // The exact weighted score is kept for tie-breaks; the total shown has one decimal, so near-ties stay apart.
  const exact = Math.max(0, Math.min(100, Object.entries(weights).reduce((sum, [key, weight]) => sum + (base.categories[key]?.score ?? 0) * weight, 0) / 100))
  const score = Math.round(exact * 10) / 10
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
    score,
    exact,
    weights,
    categories,
    mustHave: { items: mustHave, met: mustHave.filter(item => item.found).length, total: mustHave.length },
    niceToHave: { items: niceToHave, met: niceToHave.filter(item => item.found).length, total: niceToHave.length },
    keywords: base.keywords,
    // Finer detail for tie-breaks: how often the job's terms appear, and how many bullets show a number.
    depth: [...jd.mustHave, ...jd.niceToHave, ...jd.keywords].reduce((sum, term) => sum + countTerm(text, term), 0),
    quantified: [...(resume.experience ?? []), ...(resume.projects ?? [])].flatMap(item => item?.bullets ?? []).filter(bullet => /d/.test(String(bullet))).length,
    years: base.years,
    minYears: jd.yearsExperience
  }
  return { ...result, band: bandOf(result.score), why: whyLine(result), screening: screen(result, opening) }
}

/**
 * Threshold and knockouts for one scored resume:
 * { threshold, passed, knockouts: [{ id, label, detail }], qualifies } — qualifies when it passes and nothing knocks it out.
 */
export function screen(result, opening = {}) {
  const threshold = thresholdFor(opening)
  const use = knockoutsFor(opening)
  const knockouts = []
  if (use.minYears && result.minYears && result.years < result.minYears) knockouts.push({ id: 'minYears', label: HR_KNOCKOUTS.minYears, detail: `${result.years} years against ${result.minYears}+ asked` })
  const missing = result.mustHave.items.filter(item => !item.found).map(item => item.term)
  if (use.mustHave && missing.length) knockouts.push({ id: 'mustHave', label: HR_KNOCKOUTS.mustHave, detail: `Missing ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}` })
  const passed = result.score >= threshold
  return { threshold, passed, knockouts, qualifies: passed && knockouts.length === 0 }
}

/**
 * Where a resume belongs in an opening: 'ats' (failed the readability check, so not evaluated against the job),
 * 'below' (scored, but under the threshold or knocked out) or 'ranked' (the main ranking).
 */
export function groupOf(ats, screening) {
  if (ats && !ats.qualified) return 'ats'
  return screening.qualifies ? 'ranked' : 'below'
}

/** The candidate's stored ATS result, or one worked out from the resume alone for uploads made before it was kept. */
export function candidateAts(candidate = {}) {
  if (candidate.ats && typeof candidate.ats.score === 'number') return { ...candidate.ats, fileChecked: true }
  return { ...atsSummary(evaluateAts(candidate.resumeData ?? {})), fileChecked: false }
}

/** The compact row the ranked table, chart and filters use. `serial` is the upload order (1 = first uploaded). */
export function candidateSummary(candidate, opening, options) {
  const result = scoreCandidate(candidate.resumeData, opening, options)
  const resume = candidate.resumeData ?? {}
  const ats = candidateAts(candidate)
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
    exact: result.exact,
    mustHaveMet: result.mustHave.met,
    mustHaveTotal: result.mustHave.total,
    niceMet: result.niceToHave.met,
    depth: result.depth,
    quantified: result.quantified,
    missingMustHave: result.mustHave.items.filter(item => !item.found).map(item => item.term),
    ats,
    threshold: result.screening.threshold,
    passedThreshold: result.screening.passed,
    knockouts: result.screening.knockouts,
    group: groupOf(ats, result.screening),
    // Every skill on the resume, for search by skill.
    skills: [...new Set(Object.values(resume.skills ?? {}).flat().map(strip).filter(Boolean))].slice(0, 60),
    years: result.years
  }
}

/** Header row + one row per candidate, RFC 4180 quoted, for the shortlist export. */
export function candidatesCsv(rows, weights) {
  const keys = Object.keys(weights)
  const quote = value => {
    // A phone number like "+91 90000 12345" would start a formula, and the usual guard (a leading apostrophe) shows
    // up as text in Excel. Phone-shaped values become "(+91) 90000 12345" instead: same number, nothing to evaluate.
    const raw = String(value ?? '')
    const phone = /^\+(\d{1,4})[\s-]*([\d\s()-]+)$/.exec(raw)
    const text = phone ? `(+${phone[1]}) ${phone[2].trim()}` : raw
    // A leading = + - @ would run as a formula when the file is opened in a spreadsheet.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const header = ['Rank', 'Name', 'Email', 'Phone', 'Headline', 'Overall score', ...keys.map(key => HR_CATEGORY_LABELS[key]), 'Must-haves met', 'Years', 'Status', 'Reason', 'File']
  const lines = rows.map((row, index) => [index + 1, row.name, row.email, row.phone, row.headline, row.score, ...keys.map(key => row.categories[key]), `${row.mustHaveMet}/${row.mustHaveTotal}`, row.years, STATUS_LABELS[row.status], row.reason, row.fileName].map(quote).join(','))
  return [header.map(quote).join(','), ...lines].join('\r\n')
}

/**
 * What decides between two resumes, in order, when their totals match: each step compares finer detail until one is
 * ahead. The last step (uploaded first) only matters when every detail is the same; the same file or the same email
 * can't be uploaded twice, so that is two different people with word-for-word the same fit.
 */
function tieBreaks(weights) {
  const categoryKeys = Object.entries(weights).sort((a, b) => b[1] - a[1]).map(([key]) => key)
  return [
    { id: 'exact', reason: 'a higher exact score', value: row => row.exact ?? row.score },
    { id: 'mustHave', reason: 'more must-have skills', value: row => row.mustHaveMet ?? 0 },
    ...categoryKeys.map(key => ({ id: key, reason: `a higher ${HR_CATEGORY_LABELS[key]} score`, value: row => row.categories?.[key] ?? 0 })),
    { id: 'niceToHave', reason: 'more nice-to-have skills', value: row => row.niceMet ?? 0 },
    { id: 'years', reason: 'more years of experience', value: row => row.years ?? 0 },
    { id: 'ats', reason: 'a higher ATS score', value: row => row.ats?.score ?? 0 },
    { id: 'depth', reason: 'more mentions of the job’s terms', value: row => row.depth ?? 0 },
    { id: 'quantified', reason: 'more results shown with numbers', value: row => row.quantified ?? 0 },
    { id: 'serial', reason: 'being uploaded first', value: row => -(row.serial ?? Number.MAX_SAFE_INTEGER) }
  ]
}

/**
 * Orders two candidate rows: negative when `a` is the better fit. Never returns 0 for two different rows, so every
 * resume in an opening has its own place. `weights` orders the category steps (heaviest first).
 */
export function compareCandidates(a, b, weights = null) {
  const steps = tieBreaks(weights ?? Object.fromEntries(Object.keys(a.categories ?? {}).map((key, index, keys) => [key, keys.length - index])))
  if (b.score !== a.score) return b.score - a.score
  for (const step of steps) {
    const difference = step.value(b) - step.value(a)
    if (difference) return difference
  }
  return String(a.id ?? '').localeCompare(String(b.id ?? ''))
}

/** Why the first of two rows with the same total is ahead of the second, e.g. "more must-have skills"; null when the totals differ. */
export function tieBreakReason(a, b, weights = null) {
  if (a.score !== b.score) return null
  const steps = tieBreaks(weights ?? Object.fromEntries(Object.keys(a.categories ?? {}).map((key, index, keys) => [key, keys.length - index])))
  return steps.find(step => step.value(a) !== step.value(b))?.reason ?? 'its upload order'
}

/**
 * Best fit first, every resume in its own place. A row whose total equals the next row's says what put it ahead
 * (`aheadOn`), and that next row says what put it behind (`behindOn`).
 */
export function rankCandidates(summaries, weights = null) {
  const ranked = [...summaries].sort((a, b) => compareCandidates(a, b, weights)).map((row, index) => ({ ...row, rank: index + 1, aheadOn: null, behindOn: null }))
  ranked.forEach((row, index) => {
    const next = ranked[index + 1]
    const reason = next && tieBreakReason(row, next, weights)
    if (reason) { row.aheadOn = reason; next.behindOn = reason }
  })
  return ranked
}
