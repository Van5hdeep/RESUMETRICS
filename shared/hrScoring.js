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

/** Weights in use for this opening: education drops out (and the rest re-weight) when no requirement is stated. */
export function weightsFor(opening = {}) {
  const active = Object.entries(HR_WEIGHTS).filter(([key]) => key !== 'education' || String(opening.education ?? '').trim())
  const total = active.reduce((sum, [, weight]) => sum + weight, 0)
  return Object.fromEntries(active.map(([key, weight]) => [key, Math.round(weight / total * 100)]))
}

/**
 * Full, explainable breakdown of one resume against one opening.
 * → { score, band, weights, categories: { skills, experience, education?, keywords }, mustHave, niceToHave, years, minYears }
 */
export function scoreCandidate(resume = {}, opening = {}, { now = new Date() } = {}) {
  const jd = openingToJd(opening)
  const base = scoreResumeAgainstJd(resume, jd, { now })
  const weights = weightsFor(opening)
  const raw = Object.entries(HR_WEIGHTS).filter(([key]) => weights[key] !== undefined)
  const rawTotal = raw.reduce((sum, [, weight]) => sum + weight, 0)
  const score = Math.round(raw.reduce((sum, [key, weight]) => sum + (base.categories[key]?.score ?? 0) * weight, 0) / rawTotal)
  const text = resumeTextParts(resume).all
  const check = terms => terms.map(term => ({ term, found: textHasTerm(text, term) }))
  const mustHave = check(jd.mustHave)
  const niceToHave = check(jd.niceToHave)
  const categories = Object.fromEntries(Object.keys(weights).map(key => [key, { ...base.categories[key], weight: weights[key] }]))
  return {
    score,
    band: bandOf(score),
    weights,
    categories,
    mustHave: { items: mustHave, met: mustHave.filter(item => item.found).length, total: mustHave.length },
    niceToHave: { items: niceToHave, met: niceToHave.filter(item => item.found).length, total: niceToHave.length },
    keywords: base.keywords,
    years: base.years,
    minYears: jd.yearsExperience
  }
}

/** The compact row the ranked table shows. */
export function candidateSummary(candidate, opening, options) {
  const result = scoreCandidate(candidate.resumeData, opening, options)
  const resume = candidate.resumeData ?? {}
  return {
    id: candidate.id,
    name: String(resume.fullName ?? '').trim() || candidate.fileName || 'Unnamed candidate',
    headline: String(resume.headline ?? '').trim() || String(resume.experience?.[0]?.role ?? '').trim(),
    fileName: candidate.fileName,
    parsedBy: candidate.parsedBy,
    createdAt: candidate.createdAt,
    score: result.score,
    band: result.band.id,
    categories: Object.fromEntries(Object.entries(result.categories).map(([key, value]) => [key, value.score])),
    mustHaveMet: result.mustHave.met,
    mustHaveTotal: result.mustHave.total,
    missingMustHave: result.mustHave.items.filter(item => !item.found).map(item => item.term),
    years: result.years
  }
}

/** Highest score first; ties by name. */
export function rankCandidates(summaries) {
  return [...summaries].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}
