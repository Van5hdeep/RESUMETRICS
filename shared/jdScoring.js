// Deterministic, explainable resume ↔ job description scoring. Shared by server (first analysis) and
// client (instant re-score after a fix is executed). Category weights are shown in the UI.
import { knownSkillsIn } from './roleAnalysis.js'

export const CATEGORY_WEIGHTS = { skills: 60, experience: 40 }
export const CATEGORY_LABELS = { skills: 'Skills', experience: 'Experience', keywords: 'Keywords', education: 'Education', structure: 'Structure' }

const stripMarks = value => String(value ?? '').replace(/\[\/?[bius]\]/g, '')
const list = value => Array.isArray(value) ? value : []
const unique = values => [...new Map(values.filter(Boolean).map(value => [String(value).trim().toLowerCase(), String(value).trim()])).values()]
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ACTION_VERBS = /^(led|built|designed|developed|created|implemented|launched|delivered|improved|increased|reduced|cut|optimi[sz]ed|automated|managed|owned|drove|shipped|scaled|migrated|architected|engineered|analy[sz]ed|wrote|mentored|coordinated|organi[sz]ed|streamlined|resolved|researched|trained|established|introduced|refactored|integrated|deployed|maintained|supported|collaborated|partnered|negotiated|achieved|won|spearheaded|redesigned|accelerated|tested|configured|modelled|modeled|presented|produced|planned|executed|facilitated|guided)\b/i

/** All resume text in one string (marks stripped), plus the pieces scoring needs. */
export function resumeTextParts(resume = {}) {
  const experience = list(resume.experience)
  const projects = list(resume.projects)
  const bullets = [...experience.flatMap(item => list(item?.bullets)), ...projects.flatMap(item => list(item?.bullets))].map(stripMarks).filter(text => text.trim())
  const skills = Object.values(resume.skills ?? {}).flat().map(stripMarks).filter(Boolean)
  const experienceText = experience.map(item => [item?.role, item?.company, ...list(item?.bullets)].join(' ')).join('\n')
  const projectText = projects.map(item => [item?.name, item?.description, ...list(item?.techStack), ...list(item?.bullets)].join(' ')).join('\n')
  const educationText = list(resume.education).map(item => [item?.degree, item?.institution, ...list(item?.details)].join(' ')).join('\n')
  // Languages and the person's own sections count too: "English" listed only under Languages is still English.
  const customText = list(resume.customSections).map(section => [section?.title, section?.content].join(' ')).join('\n')
  const all = stripMarks([resume.headline, resume.summary, skills.join(', '), experienceText, projectText, educationText, list(resume.certifications).join(' '), list(resume.achievements).join(' '), list(resume.languages).join(', '), customText].join('\n'))
  return { all, bullets, skills, experienceText: stripMarks(experienceText), projectText: stripMarks(projectText), educationText: stripMarks(educationText), summary: stripMarks(resume.summary) }
}

/** Whether a skill/keyword appears in text, using the shared skill dictionary for synonyms (JS ↔ JavaScript). */
export function textHasTerm(text, term) {
  const known = knownSkillsIn(term)
  if (known.length) {
    const inText = new Set(knownSkillsIn(text).map(skill => skill.toLowerCase()))
    if (known.some(skill => inText.has(skill.toLowerCase()))) return true
  }
  const clean = String(term ?? '').trim()
  if (!clean) return false
  return new RegExp(`(^|[^a-z0-9+#])${escapeRegExp(clean.toLowerCase())}($|[^a-z0-9+#])`).test(String(text ?? '').toLowerCase())
}

const monthIndex = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
function parseDate(value, now) {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return null
  if (/present|current|now/.test(text)) return now
  const match = text.match(/([a-z]{3})[a-z]*\.?\s+(\d{4})/)
  if (match && monthIndex[match[1]] != null) return new Date(Number(match[2]), monthIndex[match[1]], 1)
  const year = text.match(/(19|20)\d{2}/)
  return year ? new Date(Number(year[0]), 0, 1) : null
}

/** Total years across experience entries (overlaps counted once), to one decimal. */
export function yearsOfExperience(resume = {}, now = new Date()) {
  const ranges = list(resume.experience).map(item => [parseDate(item?.startDate, now), parseDate(item?.endDate, now) ?? parseDate(item?.startDate, now)]).filter(([start, end]) => start && end && end >= start).sort((a, b) => a[0] - b[0])
  let total = 0
  let current = null
  ranges.forEach(([start, end]) => {
    if (!current || start > current[1]) { if (current) total += current[1] - current[0]; current = [start, end] } else if (end > current[1]) current[1] = end
  })
  if (current) total += current[1] - current[0]
  return Math.round(total / (365.25 * 24 * 3600 * 1000) * 10) / 10
}

const degreeLevel = text => {
  const value = String(text ?? '').toLowerCase()
  // Abbreviations only count as whole words ("Diploma" is not an M.A.); a bare B.E./M.E. needs its dot, so the word
  // "be" in "to be completed" is not a degree.
  if (/ph\.?\s?d\b|\bdoctor(ate)?\b/.test(value)) return 4
  if (/\bmasters?\b|\bm\.?\s?(s|sc|tech|eng|a|com|ca|ba|phil)\b|\bm\.e\b|\bmba\b|\bpgdm\b|\bpost[\s-]?graduat/.test(value)) return 3
  if (/\bbachelors?\b|\bbachelor['’]s\b|\bb\.?\s?(s|sc|tech|eng|a|com|ca|ba|ms|pharm|arch|des|ed)\b|\bb\.e\b|\bbba\b|\bbms\b|\bbca\b|\bundergrad|\bgraduat(e|ion)\b|\bdegree\b/.test(value)) return 2
  if (/\bdiploma\b|\bassociate\b/.test(value)) return 1
  return 0
}

/**
 * jd: { title, mustHave[], niceToHave[], yearsExperience, education, keywords[], responsibilities[] }
 * options.pages: rendered page count (for the length check).
 */
export function scoreResumeAgainstJd(resume, jd, { pages = null, now = new Date() } = {}) {
  const parts = resumeTextParts(resume)
  const mustHave = unique(list(jd?.mustHave))
  const niceToHave = unique(list(jd?.niceToHave)).filter(item => !mustHave.some(must => must.toLowerCase() === item.toLowerCase()))
  const categories = {}

  // Skills: must-haves count double.
  const mustMatched = mustHave.filter(skill => textHasTerm(parts.all, skill))
  const niceMatched = niceToHave.filter(skill => textHasTerm(parts.all, skill))
  const skillTotal = mustHave.length * 2 + niceToHave.length
  categories.skills = {
    score: skillTotal ? Math.round((mustMatched.length * 2 + niceMatched.length) / skillTotal * 100) : 100,
    matched: [...mustMatched, ...niceMatched],
    missing: [...mustHave.filter(skill => !mustMatched.includes(skill)).map(skill => ({ term: skill, required: true })), ...niceToHave.filter(skill => !niceMatched.includes(skill)).map(skill => ({ term: skill, required: false }))],
    notes: [`${mustMatched.length} of ${mustHave.length} must-have and ${niceMatched.length} of ${niceToHave.length} nice-to-have skills found.`]
  }

  // Experience: how relevant each job/internship is to the target role (title, skills and duties it shares).
  const years = yearsOfExperience(resume, now)
  const STOP = /^(with|that|this|from|into|will|work|team|across|using|and|the|for|our|your|their|ensure|help|able|strong|build|write)$/
  const roleTerms = [...new Set([
    ...String(jd?.title ?? '').toLowerCase().match(/[a-z][a-z+#.]{2,}/g) ?? [],
    ...list(jd?.responsibilities).flatMap(item => String(item).toLowerCase().match(/[a-z][a-z+#.]{3,}/g) ?? [])
  ].filter(word => !STOP.test(word)))]
  const roles = list(resume.experience).map(item => {
    const text = stripMarks([item?.role, item?.company, ...list(item?.bullets)].join(' '))
    const skillHits = [...mustHave, ...niceToHave, ...list(jd?.keywords)].filter(term => textHasTerm(text, term))
    const titleHit = (String(jd?.title ?? '').toLowerCase().match(/[a-z]{3,}/g) ?? []).some(word => !/^(senior|junior|lead|the|and)$/.test(word) && String(item?.role ?? '').toLowerCase().includes(word))
    const dutyHits = roleTerms.filter(word => text.toLowerCase().includes(word)).length
    const relevance = Math.min(1, (titleHit ? 0.35 : 0) + Math.min(0.45, skillHits.length * 0.12) + Math.min(0.2, dutyHits * 0.04))
    const label = `${stripMarks(item?.role) || 'Role'}${item?.company ? ` at ${stripMarks(item.company)}` : ''}`
    return { label, internship: /intern|trainee|apprentice/i.test(item?.role ?? ''), relevance, level: relevance >= 0.6 ? 'strong' : relevance >= 0.3 ? 'partial' : 'low', skills: skillHits.slice(0, 5) }
  })
  const best = [...roles].sort((a, b) => b.relevance - a.relevance)
  const roleScore = best.length ? (best[0].relevance * 0.6 + (best.slice(0, 3).reduce((sum, role) => sum + role.relevance, 0) / Math.min(3, best.length)) * 0.4) : 0
  const required = Number(jd?.yearsExperience)
  const yearsScore = Number.isFinite(required) && required > 0 ? Math.min(1, years / required) : 1
  categories.experience = {
    score: Math.round((roleScore * 0.8 + yearsScore * 0.2) * 100),
    roles,
    matched: roles.filter(role => role.level !== 'low').map(role => role.label),
    missing: roles.filter(role => role.level === 'low').map(role => ({ term: role.label, required: false })),
    notes: [Number.isFinite(required) && required > 0 ? `About ${years} years of experience listed; the role asks for ${required}+.` : `About ${years} years of experience listed.`]
  }

  // Keywords: everything the posting emphasises, and where they show up.
  const keywords = unique([...list(jd?.keywords), ...mustHave, ...niceToHave])
  const keywordMatched = keywords.filter(term => textHasTerm(parts.all, term))
  const prominent = keywordMatched.filter(term => textHasTerm(`${parts.summary}\n${resume?.headline ?? ''}\n${list(resume?.experience)[0] ? list(resume.experience)[0].bullets?.join(' ') : ''}`, term))
  categories.keywords = {
    score: keywords.length ? Math.round(Math.min(1, (keywordMatched.length + prominent.length * 0.25) / keywords.length) * 100) : 100,
    matched: keywordMatched,
    missing: keywords.filter(term => !keywordMatched.includes(term)).map(term => ({ term, required: mustHave.includes(term) })),
    notes: [`${keywordMatched.length} of ${keywords.length} keywords appear; ${prominent.length} of them in your summary or latest role.`]
  }

  // Education: only scored when the posting states a requirement.
  const educationRequirement = String(jd?.education ?? '').trim()
  if (educationRequirement) {
    const needed = degreeLevel(educationRequirement)
    const have = Math.max(0, ...list(resume.education).map(item => degreeLevel(`${item?.degree} ${item?.details?.join?.(' ') ?? ''}`)))
    const fieldWords = (educationRequirement.toLowerCase().match(/computer science|engineering|information technology|mathematics|statistics|business|design|finance|economics|data science/g) ?? [])
    const fieldOk = !fieldWords.length || fieldWords.some(word => parts.educationText.toLowerCase().includes(word))
    const score = have >= needed ? (fieldOk ? 100 : 75) : have > 0 ? 50 : 0
    categories.education = { score, matched: score >= 75 ? [educationRequirement] : [], missing: score < 75 ? [{ term: educationRequirement, required: true }] : [], notes: [score >= 75 ? 'Education requirement met.' : have ? 'Your degree level or field differs from what is asked.' : 'No education listed that meets the requirement.'] }
  }

  // Structure: ATS- and recruiter-friendly basics.
  const titleWords = String(jd?.title ?? '').toLowerCase().match(/[a-z]{3,}/g) ?? []
  const checks = [
    { id: 'summary', label: 'Has a summary', pass: parts.summary.trim().length >= 40 },
    { id: 'summary-target', label: 'Summary names the target role or its top skills', pass: titleWords.some(word => parts.summary.toLowerCase().includes(word)) || mustHave.slice(0, 3).some(skill => textHasTerm(parts.summary, skill)) },
    { id: 'experience', label: 'Experience or projects section', pass: list(resume.experience).length + list(resume.projects).length > 0 },
    { id: 'education', label: 'Education section', pass: list(resume.education).length > 0 },
    { id: 'skills', label: 'At least 6 listed skills', pass: parts.skills.length >= 6 },
    { id: 'contact', label: 'Email and phone present', pass: Boolean(String(resume?.email ?? '').trim() && String(resume?.phone ?? '').trim()) },
    { id: 'verbs', label: 'Most bullets start with an action verb', pass: parts.bullets.length > 0 && parts.bullets.filter(bullet => ACTION_VERBS.test(bullet.trim())).length / parts.bullets.length >= 0.7 },
    { id: 'metrics', label: 'Some bullets show results with numbers', pass: parts.bullets.length > 0 && parts.bullets.filter(bullet => /\d/.test(bullet)).length / parts.bullets.length >= 0.3 },
    { id: 'length', label: 'Bullets are concise (under 30 words)', pass: parts.bullets.every(bullet => bullet.split(/\s+/).length <= 30) },
    ...(pages ? [{ id: 'pages', label: years < 5 ? 'Fits on one page' : 'Two pages at most', pass: pages <= (years < 5 ? 1 : 2) }] : [])
  ]
  categories.structure = {
    score: Math.round(checks.filter(check => check.pass).length / checks.length * 100),
    matched: checks.filter(check => check.pass).map(check => check.label),
    missing: checks.filter(check => !check.pass).map(check => ({ term: check.label, required: false, id: check.id })),
    checks,
    notes: [`${checks.filter(check => check.pass).length} of ${checks.length} structure checks pass.`]
  }

  const weights = Object.fromEntries(Object.entries(CATEGORY_WEIGHTS).filter(([key]) => categories[key]))
  Object.keys(categories).forEach(key => { if (!weights[key]) categories[key].weight = 0 })
  const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0)
  const overall = Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + categories[key].score * weight, 0) / weightTotal)
  Object.keys(weights).forEach(key => { categories[key].weight = Math.round(weights[key] / weightTotal * 100) })
  return {
    score: overall,
    categories,
    keywords: { matched: keywordMatched, missing: categories.keywords.missing.map(item => item.term) },
    years
  }
}
