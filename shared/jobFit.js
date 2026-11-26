// Is this job a realistic target for this resume? (PLAN-034 follow-up, user 2026-11-26)
// The keyword score says how much of the posting the resume covers; it cannot tell "a few words away" from
// "a different field". This adds the context: key-skill coverage, how close the closest role or project is,
// years asked for against years shown, and how far honest fixes could take the score. When tailoring cannot
// close the gap, the page and NIMBUS say so plainly instead of urging the person on towards 85.
import { TARGET_SCORE } from './jdKeywords.js'
import { scoreResumeAgainstJd, textHasTerm, yearsOfExperience } from './jdScoring.js'
import { relatedRoles, roleFromResume } from './jobMatch.js'

const list = value => Array.isArray(value) ? value : []
const strip = value => String(value ?? '').replace(/\[\/?[bius]\]/g, '')
const TITLE_NOISE = /^(senior|junior|lead|principal|the|and|for|with|intern|internship|trainee|associate|level|entry|remote|hybrid)$/

/** How close each project is to the job: shared skills and title words (0–1), like the experience check. */
function projectRelevance(resume, jd) {
  const terms = [...list(jd?.mustHave), ...list(jd?.niceToHave), ...list(jd?.keywords)]
  const titleWords = (String(jd?.title ?? '').toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(word => !TITLE_NOISE.test(word))
  return list(resume?.projects).map(project => {
    const text = strip([project?.name, project?.description, ...list(project?.bullets), ...list(project?.techStack)].join(' '))
    const skillHits = terms.filter(term => textHasTerm(text, term)).length
    const titleHit = titleWords.some(word => text.toLowerCase().includes(word))
    return Math.min(1, (titleHit ? 0.25 : 0) + Math.min(0.6, skillHits * 0.15))
  })
}

// "A", "A and B", "A, B and C", "A, B, C and 2 more".
const listOf = (values, max = 3) => {
  const shown = values.slice(0, max)
  const rest = values.length - shown.length
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}` : shown.join('')
}

/**
 * match: scoreKeywords(resume, keywords) for the selected keywords. reachable: the score with every honest fix
 * applied (null while fixes are loading or unavailable).
 * Returns { level: 'fit'|'stretch'|'mismatch', title, text, reasons[], reachable, suggestedRoles[] }.
 */
export function assessJobFit({ resume = {}, jd = {}, match, reachable = null, now = new Date() }) {
  const rows = list(match?.rows)
  const keyRows = rows.filter(row => row.key)
  const keyMissing = keyRows.filter(row => !row.found).map(row => row.term)
  const keyCoverage = keyRows.length ? (keyRows.length - keyMissing.length) / keyRows.length : null
  const roles = scoreResumeAgainstJd(resume, jd, { now }).categories.experience.roles
  const best = Math.max(0, ...roles.map(role => role.relevance), ...projectRelevance(resume, jd))
  const years = yearsOfExperience(resume, now)
  const required = Number(jd?.yearsExperience)
  const yearsGap = Number.isFinite(required) && required > 0 ? required - years : 0
  const score = match?.score ?? 0
  const title = String(jd?.title ?? '').trim() || 'this job'

  const reasons = []
  if (keyRows.length >= 3 && keyCoverage < 0.4) reasons.push(`Only ${keyRows.length - keyMissing.length} of the ${keyRows.length} key skills it asks for are on your resume (missing ${listOf(keyMissing)}).`)
  if (best < 0.3) reasons.push(`None of your roles or projects is close to the work of a ${title}.`)
  if (yearsGap >= 2) reasons.push(`It asks for ${required}+ years of experience; your resume shows about ${years < 1 ? 'less than a year' : `${Math.round(years * 10) / 10} years`}.`)

  const mismatch = score < 50 && (
    (keyCoverage !== null && keyCoverage < 0.25 && best < 0.3) ||
    (reachable != null && reachable < 50 && keyCoverage !== null && keyCoverage < 0.4) ||
    (yearsGap >= 4 && (keyCoverage === null || keyCoverage < 0.5))
  )
  // A real gap (skills, experience or years) is needed for a warning. The fixes are a handful of suggestions,
  // not every possible change, so a low reachable score alone never triggers one; it only backs up a real gap.
  const level = mismatch ? 'mismatch' : reasons.length && score < 75 ? 'stretch' : 'fit'
  if (level !== 'fit' && reachable != null && reachable < TARGET_SCORE - 10 && score < TARGET_SCORE) reasons.push(`Even with every fix applied, the match only reaches about ${reachable}. Fixes can reword what you have done, not add what you haven't.`)
  const suggestedRoles = level === 'mismatch' ? relatedRoles(roleFromResume(resume)).slice(0, 3) : []

  if (level === 'mismatch') return {
    level, reasons, reachable, suggestedRoles,
    title: 'Your resume isn’t a good fit for this job',
    text: `Tailoring can reword what you have done, but it can’t add experience you don’t have, so fixes won’t turn this into a strong match. ${suggestedRoles.length ? `Roles closer to your background, like ${listOf(suggestedRoles)}, would suit this resume better.` : 'Roles closer to your background would suit this resume better.'}`
  }
  if (level === 'stretch') return {
    level, reasons, reachable, suggestedRoles,
    title: 'This job is a stretch for your resume',
    text: 'The fixes below help, but part of the gap needs real experience, not rewording. Apply if you meet most of the rest, and say how you’re closing the gap in your cover letter.'
  }
  return { level, reasons: [], reachable, suggestedRoles, title: '', text: '' }
}

/** The headline verdict, honest about fit: a poor fit is not told to "aim for 85". */
export function fitVerdict(fit, verdict) {
  if (fit?.level === 'mismatch') return { id: 'low', label: 'Not a good fit', text: 'This job asks for experience your resume doesn’t show, and rewording can’t close that gap.' }
  if (fit?.level === 'stretch' && verdict.id !== 'strong') return { ...verdict, text: `${verdict.text.replace(/ Aim for \d+ or higher\.$/, '')} Some of the gap needs experience, not just keywords.` }
  return verdict
}
