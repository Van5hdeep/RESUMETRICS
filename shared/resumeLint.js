// Local resume checks (PLAN-034, D43): free, instant, no AI. Each finding is shaped like a NIMBUS suggestion item,
// so the chat shows it with the same arrow. Findings with `operations` are fixed deterministically; findings with
// `instruction` hand a precise request to NIMBUS; `question` asks the person for a fact; `pro` marks Pro-only fixes.
// The server also sends a short summary of these findings to the model so it doesn't spend tokens finding them.
import { resumeCompletion } from './resumeCompletion.js'
import { fingerprint } from './nimbusResumeOps.js'

const strip = value => String(value ?? '').replace(/\[\/?[bius]\]/g, '').trim()
const words = value => strip(value).split(/\s+/).filter(Boolean)
const list = value => Array.isArray(value) ? value : []
const quote = (value, max = 50) => { const text = strip(value); return text.length > max ? `${text.slice(0, max - 1)}…` : text }

// ---- Dates ----
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const PRESENT = /^(present|current|now|till date|to date|ongoing)$/i
/** { style, month (1-12), year } or null. Styles: 'Mon YYYY', 'Month YYYY', 'MM/YYYY', 'YYYY-MM', 'YYYY'. */
export function parseResumeDate(value) {
  const text = strip(value)
  let match = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/)
  if (match) {
    const name = match[1].toLowerCase()
    const month = MONTHS.findIndex(item => item === name || (name.length >= 3 && item.startsWith(name.slice(0, 3)) && (name.length === 3 || item.startsWith(name))))
    if (month < 0) return null
    return { style: name.length === 3 || name.length < MONTHS[month].length ? 'Mon YYYY' : 'Month YYYY', month: month + 1, year: Number(match[2]) }
  }
  match = text.match(/^(\d{1,2})\/(\d{4})$/)
  if (match && Number(match[1]) >= 1 && Number(match[1]) <= 12) return { style: 'MM/YYYY', month: Number(match[1]), year: Number(match[2]) }
  match = text.match(/^(\d{4})-(\d{1,2})$/)
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) return { style: 'YYYY-MM', month: Number(match[2]), year: Number(match[1]) }
  match = text.match(/^(\d{4})$/)
  if (match) return { style: 'YYYY', month: null, year: Number(match[1]) }
  return null
}
export function formatResumeDate({ month, year }, style) {
  if (!month || style === 'YYYY') return String(year)
  const name = MONTHS[month - 1]
  if (style === 'Mon YYYY') return `${name[0].toUpperCase()}${name.slice(1, 3)} ${year}`
  if (style === 'Month YYYY') return `${name[0].toUpperCase()}${name.slice(1)} ${year}`
  if (style === 'MM/YYYY') return `${String(month).padStart(2, '0')}/${year}`
  return `${year}-${String(month).padStart(2, '0')}`
}

function checkDates(resume) {
  const dated = ['experience', 'education'].flatMap(section => list(resume[section]).flatMap((item, itemIndex) =>
    ['startDate', 'endDate'].map(field => ({ section, itemIndex, field, value: strip(item[field]) })).filter(entry => entry.value)))
  const findings = []
  const parsed = dated.map(entry => ({ ...entry, date: parseResumeDate(entry.value) })).filter(entry => entry.date && entry.date.style !== 'YYYY')
  const counts = parsed.reduce((map, entry) => map.set(entry.date.style, (map.get(entry.date.style) ?? 0) + 1), new Map())
  if (counts.size > 1) {
    const style = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const operations = parsed.filter(entry => entry.date.style !== style).map(entry => ({ type: 'set_item_field', section: entry.section, itemIndex: entry.itemIndex, field: entry.field, value: formatResumeDate(entry.date, style) }))
    findings.push({ id: 'dates-format', title: `Dates are written ${counts.size} different ways`, why: `Pressing this writes every date as “${formatResumeDate({ month: 1, year: 2024 }, style)}”, which reads as careful work.`, kind: 'rewrite', impact: 'medium', target: 'experience', operations })
  }
  const presentWords = dated.filter(entry => PRESENT.test(entry.value))
  const presentForms = new Set(presentWords.map(entry => entry.value))
  if (presentForms.size > 1) {
    findings.push({ id: 'dates-present', title: 'Current roles say “Present” in different ways', why: `You use ${[...presentForms].map(value => `“${value}”`).join(' and ')}; pressing this makes them all “Present”.`, kind: 'rewrite', impact: 'low', target: 'experience', operations: presentWords.filter(entry => entry.value !== 'Present').map(entry => ({ type: 'set_item_field', section: entry.section, itemIndex: entry.itemIndex, field: entry.field, value: 'Present' })) })
  }
  return findings
}

// ---- Tense: finished roles in the past tense, the current role in the present ----
const PAST = { achieve: 'Achieved', analyse: 'Analysed', analyze: 'Analyzed', build: 'Built', collaborate: 'Collaborated', conduct: 'Conducted', coordinate: 'Coordinated', create: 'Created', deliver: 'Delivered', design: 'Designed', develop: 'Developed', drive: 'Drove', improve: 'Improved', implement: 'Implemented', increase: 'Increased', launch: 'Launched', lead: 'Led', maintain: 'Maintained', manage: 'Managed', mentor: 'Mentored', optimise: 'Optimised', optimize: 'Optimized', organise: 'Organised', organize: 'Organized', oversee: 'Oversaw', plan: 'Planned', reduce: 'Reduced', research: 'Researched', run: 'Ran', support: 'Supported', teach: 'Taught', test: 'Tested', train: 'Trained', write: 'Wrote', automate: 'Automated', architect: 'Architected', deploy: 'Deployed', handle: 'Handled', own: 'Owned', streamline: 'Streamlined' }
const presentVerb = word => {
  const lower = word.toLowerCase()
  if (PAST[lower]) return lower
  if (lower.endsWith('es') && PAST[lower.slice(0, -2)]) return lower.slice(0, -2)
  if (lower.endsWith('s') && PAST[lower.slice(0, -1)]) return lower.slice(0, -1)
  return null
}
function checkTense(resume) {
  const findings = []
  list(resume.experience).forEach((item, itemIndex) => {
    const ended = strip(item.endDate) && !PRESENT.test(strip(item.endDate))
    if (!ended) return
    const operations = list(item.bullets).flatMap((bullet, bulletIndex) => {
      const text = strip(bullet)
      const first = text.split(/\s+/)[0] ?? ''
      const verb = presentVerb(first.replace(/[^A-Za-z]/g, ''))
      // Bullets with bold/italic marks are left to NIMBUS, so a mechanical fix never drops a mark.
      if (!verb || text !== String(bullet).trim()) return []
      return [{ type: 'set_bullet', section: 'experience', itemIndex, bulletIndex, expect: text, value: `${PAST[verb]}${text.slice(first.length)}` }]
    })
    if (operations.length) findings.push({ id: `tense-${itemIndex}`, title: `${quote([item.role, item.company].filter(Boolean).join(' at '), 40)} reads in the present tense`, why: `This role has ended; pressing this puts ${operations.length === 1 ? 'its bullet' : `${operations.length} bullets`} in the past tense.`, kind: 'rewrite', impact: 'medium', target: 'experience', operations })
  })
  return findings
}

// ---- Punctuation: bullets either all end with a full stop or none do ----
function checkPunctuation(resume) {
  const bullets = ['experience', 'projects'].flatMap(section => list(resume[section]).flatMap((item, itemIndex) => list(item.bullets).map((bullet, bulletIndex) => ({ section, itemIndex, bulletIndex, text: strip(bullet), raw: bullet }))))
    .filter(entry => entry.text && entry.raw === entry.text)
  if (bullets.length < 4) return []
  const withStop = bullets.filter(entry => /[.!]$/.test(entry.text))
  if (!withStop.length || withStop.length === bullets.length) return []
  const addStops = withStop.length * 2 >= bullets.length
  const change = addStops ? bullets.filter(entry => !/[.!?]$/.test(entry.text)) : withStop
  return [{
    id: 'punctuation',
    title: 'Bullets mix full stops and none',
    why: `${withStop.length} of ${bullets.length} bullets end with a full stop; pressing this makes them all match.`,
    kind: 'rewrite', impact: 'low', target: 'experience',
    operations: change.map(entry => ({ type: 'set_bullet', section: entry.section, itemIndex: entry.itemIndex, bulletIndex: entry.bulletIndex, expect: entry.text, value: addStops ? `${entry.text}.` : entry.text.replace(/\.$/, '') }))
  }]
}

// ---- Wording and length ----
const WEAK = /^(responsible for|worked on|helped( with)?|assisted( with| in)?|involved in|tasked with|participated in|duties included|in charge of)\b/i
function checkWording(resume) {
  const findings = []
  const weak = ['experience', 'projects'].flatMap(section => list(resume[section]).flatMap(item => list(item.bullets).filter(bullet => WEAK.test(strip(bullet)))))
  if (weak.length) findings.push({ id: 'weak-openers', title: `${weak.length === 1 ? 'A bullet describes' : `${weak.length} bullets describe`} a duty, not a result`, why: `“${quote(weak[0], 40)}” says what you were responsible for. NIMBUS rewrites it around what you did.`, kind: 'rewrite', impact: 'high', target: 'experience', instruction: `Rewrite these bullets to start with a strong action verb, keeping every fact: ${weak.slice(0, 5).map(bullet => `“${quote(bullet, 80)}”`).join('; ')}` })
  const long = ['experience', 'projects'].flatMap(section => list(resume[section]).flatMap(item => list(item.bullets).filter(bullet => words(bullet).length > 32)))
  if (long.length) findings.push({ id: 'long-bullets', title: `${long.length === 1 ? 'A bullet runs' : `${long.length} bullets run`} past 30 words`, why: 'Long bullets get skimmed. NIMBUS shortens them, keeping the action, the result and every number.', kind: 'trim', impact: 'medium', target: 'experience', instruction: `Shorten these bullets to under 25 words each, keeping the action, the result and every number: ${long.slice(0, 4).map(bullet => `“${quote(bullet, 80)}”`).join('; ')}` })
  const bullets = list(resume.experience).flatMap(item => list(item.bullets))
  const numberless = bullets.filter(bullet => !/\d/.test(strip(bullet)))
  if (bullets.length >= 3 && numberless.length / bullets.length > 0.6) findings.push({ id: 'quantify', title: `${numberless.length} of ${bullets.length} experience bullets have no numbers`, why: 'Numbers (users, time saved, team size) make a result believable. NIMBUS asks you for each one.', kind: 'rewrite', impact: 'high', target: 'experience', pro: true, feature: 'quantify', instruction: 'Find my bullets without numbers and ask me for the number each one needs.' })
  return findings
}

// ---- Gaps and duplicates ----
function checkGaps(resume) {
  const findings = []
  if (!strip(resume.summary) && list(resume.experience).length) findings.push({ id: 'summary', title: 'There’s no summary yet', why: 'A two-line summary tells a recruiter who you are before the details. NIMBUS writes one from your resume.', kind: 'add', impact: 'medium', target: 'summary', instruction: 'Write a two-sentence summary from my experience, projects and skills, using only facts on the resume.' })
  if (!strip(resume.email) && !strip(resume.phone)) findings.push({ id: 'contact', title: 'No email or phone number to reach you', why: 'Without one, nobody can contact you.', kind: 'add', impact: 'high', target: 'contact', question: { text: 'What email address (or phone number) should be on your resume?', quickReplies: [] } })
  list(resume.experience).forEach((item, itemIndex) => {
    if (!list(item.bullets).length && (item.role || item.company)) findings.push({ id: `empty-${itemIndex}`, title: `${quote(item.role || item.company, 40)} has no bullets yet`, why: 'A role without bullets says nothing about your work. Tell NIMBUS what you did.', kind: 'add', impact: 'medium', target: 'experience', question: { text: `What were your two or three main achievements as ${strip(item.role || item.company)}?`, quickReplies: [] } })
  })
  const seen = new Map()
  const duplicates = []
  for (const [category, skills] of Object.entries(resume.skills ?? {})) {
    for (const skill of list(skills)) {
      const key = fingerprint(skill)
      if (!key) continue
      if (seen.has(key)) duplicates.push({ category, value: skill })
      else seen.set(key, category)
    }
  }
  if (duplicates.length) findings.push({ id: 'duplicate-skills', title: `${duplicates.length === 1 ? 'A skill is' : `${duplicates.length} skills are`} listed twice`, why: `${duplicates.slice(0, 3).map(item => item.value).join(', ')}; pressing this keeps one of each.`, kind: 'remove', impact: 'low', target: 'skills', operations: duplicates.map(item => ({ type: 'remove_skill', category: item.category, value: item.value })) })
  return findings
}

const IMPACT_POINTS = { high: 12, medium: 6, low: 3 }

/**
 * All local findings for a resume, most important first.
 * options.pages: page count from the editor (adds a fit-to-one-page finding for early careers).
 */
export function lintResume(resume = {}, { pages = null } = {}) {
  const findings = [...checkWording(resume), ...checkGaps(resume), ...checkDates(resume), ...checkTense(resume), ...checkPunctuation(resume)]
  if (pages > 1 && list(resume.experience).length < 3) findings.push({ id: 'one-page', title: `The resume runs to ${pages} pages`, why: 'With under three roles, one page is expected. This tightens spacing and size, never below 9pt.', kind: 'layout', impact: 'medium', target: 'resume', operations: [{ type: 'fit_one_page' }] })
  const rank = { high: 0, medium: 1, low: 2 }
  return findings.filter(finding => !finding.operations || finding.operations.length).sort((a, b) => rank[a.impact] - rank[b.impact])
}

/** Strength score 0–100 from completeness and the local findings; parts explain it. */
export function scoreResume(resume = {}, options = {}) {
  const findings = lintResume(resume, options)
  const completion = resumeCompletion(resume)
  const penalty = Math.min(70, findings.reduce((sum, finding) => sum + IMPACT_POINTS[finding.impact], 0))
  return { score: Math.max(0, Math.min(100, Math.round(completion * 0.45 + (100 - penalty) * 0.55))), completion, findings }
}

/** One line per finding for the model (CHECKS in the prompt). */
export const summarizeFindings = findings => findings.slice(0, 8).map(finding => `- ${finding.title} (${finding.impact})`).join('\n')
