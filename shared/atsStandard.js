// Refile ATS Standard v1: the one rulebook both sides of Refile use. The resume workspace holds every resume to it
// before "Download for applying", and the HR portal runs every uploaded resume through it before scoring it against
// a job. Deterministic and free: no AI, so a result can always be explained rule by rule.
//
// evaluateAts(resume, context) checks what it can from what it is given:
//   resume   the structured resume (server/services/resumeData.js shape)
//   context  { file, layout, text, headings, order, pages, now } — every part optional
//     file     facts about an uploaded file: { type: 'pdf'|'docx'|'txt', name, textLayer, unreadablePages, encrypted, pages }
//     layout   how the page is drawn: { columns, images, contactInBody, font, bodySize, textColor }
//              (the workspace knows these from the template; the HR portal measures them from the file)
//     text     the file's extracted text, for finding its section headings and their order (HR uploads)
//     headings { [sectionId]: printed heading } and order [sectionId, …] as printed (workspace)
// A rule whose inputs are missing is "unchecked": it is left out of the score instead of guessed.
// Sources for the rules: career-centre ATS guides (University at Buffalo, Santa Clara University, Toptal, Adobe).
import { parseResumeDate } from './resumeLint.js'
import { yearsOfExperience } from './jdScoring.js'

export const ATS_STANDARD = Object.freeze({ id: 'refile-ats-v1', name: 'Refile ATS Standard', version: 1, label: 'Refile ATS Standard v1' })
/** A resume is ATS-qualified when every required rule passes and its ATS score is at least this. */
export const ATS_PASS_SCORE = 70

/** Section ids in the standard order, with the heading the standard prints for each. */
export const STANDARD_HEADINGS = Object.freeze({
  summary: 'Summary', experience: 'Experience', projects: 'Projects', education: 'Education',
  skills: 'Skills', certifications: 'Certifications', achievements: 'Achievements', languages: 'Languages'
})
export const STANDARD_ORDER = Object.freeze(Object.keys(STANDARD_HEADINGS))
/** Headings an ATS recognises for each section (lower case). Custom sections may also use "Additional Information". */
export const HEADING_ALIASES = Object.freeze({
  summary: ['summary', 'professional summary', 'career summary', 'profile', 'professional profile', 'objective', 'career objective'],
  experience: ['experience', 'work experience', 'professional experience', 'employment history', 'work history', 'employment', 'internships', 'internship experience'],
  projects: ['projects', 'academic projects', 'personal projects', 'key projects'],
  education: ['education', 'academic background', 'educational qualifications', 'qualifications', 'academic qualifications'],
  skills: ['skills', 'technical skills', 'key skills', 'core skills', 'skills and tools', 'core competencies'],
  certifications: ['certifications', 'certificates', 'licenses and certifications', 'licences and certifications'],
  achievements: ['achievements', 'awards', 'honors', 'honours', 'awards and achievements', 'accomplishments'],
  languages: ['languages']
})
export const ADDITIONAL_HEADING = 'Additional Information'

/** Fonts an ATS reads reliably (first family in a CSS font stack is the one checked). */
export const ATS_SAFE_FONTS = Object.freeze(['Arial', 'Helvetica', 'Calibri', 'Carlito', 'Cambria', 'Georgia', 'Times New Roman', 'Tinos', 'Garamond', 'EB Garamond', 'Lato', 'Open Sans', 'Roboto', 'Source Sans 3', 'Source Sans Pro', 'Noto Sans', 'Inter'])
export const ATS_BODY_SIZE = Object.freeze({ min: 10, max: 12 })
export const ATS_FILE_TYPES = Object.freeze(['pdf', 'docx', 'txt'])

const GROUPS = Object.freeze({ file: 'File', layout: 'Layout', sections: 'Sections', content: 'Content' })
// Rule weights in the ATS score: a required rule counts three times a recommended one.
const WEIGHT = { required: 3, recommended: 1 }

const strip = value => String(value ?? '').replace(/\[\/?[bius]\]/g, '').replace(/\s+/g, ' ').trim()
const list = value => (Array.isArray(value) ? value : [])
const normaliseHeading = value => strip(value).toLowerCase().replace(/[:：]$/, '').replace(/&/g, 'and').replace(/\s+/g, ' ').trim()
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

export const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
/** 10–15 digits once spaces, dashes, dots, brackets and a leading + are set aside. */
export const isPhone = value => { const digits = String(value ?? '').replace(/[\s\-().]/g, '').replace(/^\+/, ''); return /^\d{10,15}$/.test(digits) }
// Emoji and the decorative marks parsers drop or garble. The plain bullet • and dashes are fine.
const DECORATIVE = /[\p{Extended_Pictographic}★☆✓✔✗✘➤►▶◆◇■□●○♦❖→⇒➔➜⭐✦✧☐☑☒-]/u
const CURRENT = /^(present|current|now|till date|to date|ongoing)$/i
const RATING =/(\d+\s*\/\s*(5|10)\b|\d{1,3}\s*%|[★☆●○■□]{2,}|\(\s*\d+\s*\))/
const ACTION_VERB = /^(led|built|designed|developed|created|implemented|launched|delivered|improved|increased|reduced|cut|optimi[sz]ed|automated|managed|owned|drove|shipped|scaled|migrated|architected|engineered|analy[sz]ed|wrote|mentored|coordinated|organi[sz]ed|streamlined|resolved|researched|trained|established|introduced|refactored|integrated|deployed|maintained|supported|collaborated|partnered|negotiated|achieved|won|spearheaded|redesigned|accelerated|tested|configured|modell?ed|presented|produced|planned|executed|facilitated|guided|conducted|prepared|handled|assisted|contributed|enhanced|generated|secured|reviewed|taught|ran|set|added|made|grew|saved|raised|converted|published|documented|monitored|debugged|prototyped)\b/i

/** Every skill on the resume, across all groups. */
const allSkills = resume => Object.values(resume?.skills ?? {}).flatMap(list).map(strip).filter(Boolean)
const allBullets = resume => [...list(resume?.experience).flatMap(item => list(item?.bullets)), ...list(resume?.projects).flatMap(item => list(item?.bullets))].map(strip).filter(Boolean)

/** Sections that have content, in the standard order. */
export function presentSections(resume = {}) {
  const has = {
    summary: Boolean(strip(resume.summary)),
    experience: list(resume.experience).length > 0,
    projects: list(resume.projects).length > 0,
    education: list(resume.education).length > 0,
    skills: allSkills(resume).length > 0,
    certifications: list(resume.certifications).filter(item => strip(item)).length > 0,
    achievements: list(resume.achievements).filter(item => strip(item)).length > 0,
    languages: list(resume.languages).filter(item => strip(item)).length > 0
  }
  return STANDARD_ORDER.filter(id => has[id])
}

/** The section a printed heading names, or null when an ATS would not recognise it. */
export function sectionForHeading(heading) {
  const name = normaliseHeading(heading)
  return Object.entries(HEADING_ALIASES).find(([, aliases]) => aliases.includes(name))?.[0] ?? null
}

/** Standard headings found as lines of a document's text: [{ id, line }] in document order, first of each. */
export function headingsInText(text) {
  const found = []
  String(text ?? '').split(/\r?\n/).forEach((raw, line) => {
    const value = raw.trim()
    if (!value || value.length > 40) return
    const id = sectionForHeading(value)
    if (id && !found.some(item => item.id === id)) found.push({ id, line })
  })
  return found
}

/** True when `order` keeps the standard order, letting Education come straight after the summary for freshers. */
export function followsStandardOrder(order, { fresher = false } = {}) {
  const rank = id => STANDARD_ORDER.indexOf(id)
  const known = order.filter(id => rank(id) >= 0)
  const inOrder = ids => ids.every((id, index) => index === 0 || rank(ids[index - 1]) < rank(id))
  if (inOrder(known)) return true
  if (!fresher) return false
  // Fresher: Education may move up to just after the summary; everything else keeps the standard order.
  const rest = known.filter(id => id !== 'education')
  const at = known.indexOf('education')
  const before = known.slice(0, at)
  return inOrder(rest) && before.every(id => id === 'summary')
}

// ---------------------------------------------------------------------------------------------------------------
// Rules. Each returns { status: 'pass' | 'fail' | 'unchecked', score 0–1, detail, fix }.
const pass = (detail = '') => ({ status: 'pass', score: 1, detail, fix: '' })
const fail = (detail, fix, score = 0) => ({ status: 'fail', score: Math.max(0, Math.min(.99, score)), detail, fix })
const unchecked = detail => ({ status: 'unchecked', score: null, detail, fix: '' })

const RULES = [
  // File
  {
    id: 'F1', group: 'file', level: 'required', label: 'Readable file: a PDF with selectable text, or a DOCX',
    check: ({ file }) => {
      if (!file) return unchecked('Checked on uploaded files.')
      const type = String(file.type ?? '').toLowerCase()
      if (!ATS_FILE_TYPES.includes(type)) return fail(`${type ? type.toUpperCase() : 'This'} files are not read by an ATS.`, 'Send the resume as a PDF or DOCX.')
      if (type === 'pdf' && file.textLayer === false) return fail('The PDF has no selectable text, so it is probably a scan or a photo.', 'Export the resume as a PDF from a word processor or Refile instead of scanning it.')
      const unreadable = list(file.unreadablePages)
      if (unreadable.length) return fail(`No selectable text on page${unreadable.length === 1 ? '' : 's'} ${unreadable.join(', ')}.`, 'Export every page as text, not as an image.', .5)
      return pass(type === 'txt' ? 'Plain text reads, but loses all structure; PDF or DOCX is preferred.' : '')
    }
  },
  {
    id: 'F2', group: 'file', level: 'required', label: 'Not password-protected',
    check: ({ file }) => (!file ? unchecked('Checked on uploaded files.') : file.encrypted ? fail('The file is locked with a password.', 'Send an unlocked copy.') : pass())
  },
  {
    id: 'F3', group: 'file', level: 'required', label: 'Two pages at most',
    check: ({ pages }) => (!pages ? unchecked('Page count is not known.') : pages <= 2 ? pass(plural(pages, 'page')) : fail(`${plural(pages, 'page')} long.`, 'Cut it to two pages: older roles and long bullets go first.', 2 / pages))
  },
  {
    id: 'F3b', group: 'file', level: 'recommended', label: 'One page with under 5 years of experience',
    check: ({ pages, years }) => (!pages ? unchecked('Page count is not known.') : years >= 5 || pages <= 1 ? pass() : fail(`${plural(pages, 'page')} with about ${years} years of experience.`, 'Recruiters expect one page early in a career.'))
  },
  {
    id: 'F4', group: 'file', level: 'recommended', label: 'File named Firstname-Lastname-Resume',
    check: ({ file, resume }) => {
      if (!file?.name) return unchecked('Checked on uploaded files.')
      const name = String(file.name).toLowerCase()
      const first = strip(resume.fullName).toLowerCase().split(' ')[0]
      return first && name.includes(first) && /resume|cv/.test(name) ? pass() : fail(`“${file.name}” doesn’t say whose resume it is.`, 'Name the file like Asha-Rao-Resume.pdf.')
    }
  },
  // Layout
  {
    id: 'L1', group: 'layout', level: 'required', label: 'One column, read top to bottom (no sidebars, columns, tables or text boxes)',
    check: ({ layout }) => (typeof layout?.columns !== 'boolean' ? unchecked('Layout is not known.') : layout.columns ? fail('Text is laid out in columns or a table, which an ATS reads out of order.', 'Use a one-column layout.') : pass())
  },
  {
    id: 'L2', group: 'layout', level: 'required', label: 'No photo, icons, logos, charts or skill bars',
    check: ({ layout }) => (layout?.images === undefined || layout?.images === null ? unchecked('Images are not known.') : layout.images ? fail('The page has images or icons; an ATS ignores them and anything written inside them.', 'Remove the photo, icons and charts.') : pass())
  },
  {
    id: 'L3', group: 'layout', level: 'required', label: 'Name and contact details in the page body, not a header or footer',
    check: ({ layout, text, resume }) => {
      if (typeof layout?.contactInBody === 'boolean') return layout.contactInBody ? pass() : fail('Contact details sit in the page header or footer, which most ATSs skip.', 'Move your name, email and phone into the page body.')
      if (!text) return unchecked('Layout is not known.')
      const email = strip(resume.email).toLowerCase()
      return email && String(text).toLowerCase().includes(email) ? pass() : fail('The email address is not in the document body, so it is probably in a header or footer.', 'Move your contact details into the page body.')
    }
  },
  {
    id: 'L4', group: 'layout', level: 'recommended', label: 'Standard font, 10–12 pt body text, dark text colour',
    check: ({ layout }) => {
      if (!layout?.font && !layout?.bodySize && !layout?.textColor) return unchecked('Fonts are not known.')
      const problems = []
      const family = String(layout.font ?? '').split(',')[0].replace(/["']/g, '').trim()
      if (family && !ATS_SAFE_FONTS.some(font => font.toLowerCase() === family.toLowerCase())) problems.push(`${family} is not a standard font`)
      if (layout.bodySize && (layout.bodySize < ATS_BODY_SIZE.min || layout.bodySize > ATS_BODY_SIZE.max)) problems.push(`body text is ${layout.bodySize} pt`)
      if (layout.textColor && !isDarkColour(layout.textColor)) problems.push('body text is too light')
      return problems.length ? fail(`${problems.join('; ')}.`, `Use ${ATS_SAFE_FONTS.slice(0, 4).join(', ')} or similar at 10–12 pt in black or dark grey.`, 1 - problems.length / 3) : pass()
    }
  },
  // Sections
  {
    id: 'S1', group: 'sections', level: 'required', label: 'Standard section headings',
    check: ({ resume, headings, text, present }) => {
      const custom = list(resume.customSections).map(section => strip(section?.title)).filter(Boolean)
      const odd = custom.filter(title => normaliseHeading(title) !== normaliseHeading(ADDITIONAL_HEADING) && !sectionForHeading(title))
      if (headings) {
        Object.entries(headings).forEach(([id, title]) => { if (present.includes(id) && strip(title) && sectionForHeading(title) !== id) odd.push(strip(title)) })
      } else if (text) {
        const found = headingsInText(text).map(item => item.id)
        const core = present.filter(id => ['experience', 'projects', 'education', 'skills'].includes(id))
        const missing = core.filter(id => !found.includes(id))
        if (missing.length) return fail(`No standard heading found for ${missing.map(id => STANDARD_HEADINGS[id]).join(', ')}.`, `Head each section with a standard name such as ${missing.map(id => STANDARD_HEADINGS[id]).join(', ')}.`, 1 - missing.length / Math.max(1, core.length))
      }
      if (odd.length) return fail(`Headings an ATS won’t recognise: ${odd.slice(0, 3).map(title => `“${title}”`).join(', ')}.`, `Rename them to a standard heading, or to “${ADDITIONAL_HEADING}”.`, .5)
      return pass()
    }
  },
  {
    id: 'S2', group: 'sections', level: 'required', label: 'Sections in the standard order',
    check: ({ order, text, years, resume }) => {
      const printed = order ?? (text ? headingsInText(text).map(item => item.id) : null)
      if (!printed) return unchecked('Section order is not known.')
      const fresher = years < 2 || !list(resume.experience).length
      return followsStandardOrder(printed, { fresher }) ? pass() : fail(`Sections run ${printed.map(id => STANDARD_HEADINGS[id]).filter(Boolean).join(' → ')}.`, `Use the order ${STANDARD_ORDER.map(id => STANDARD_HEADINGS[id]).join(' → ')}${fresher ? ' (Education may come right after the summary)' : ''}.`)
    }
  },
  {
    id: 'S3', group: 'sections', level: 'required', label: 'Has Experience or Projects, Education and Skills',
    check: ({ present }) => {
      const missing = [
        !present.includes('experience') && !present.includes('projects') ? 'Experience or Projects' : null,
        !present.includes('education') ? 'Education' : null,
        !present.includes('skills') ? 'Skills' : null
      ].filter(Boolean)
      return missing.length ? fail(`Missing ${missing.join(', ')}.`, `Add ${missing.join(' and ')}.`, 1 - missing.length / 3) : pass()
    }
  },
  // Content
  {
    id: 'C1', group: 'content', level: 'required', label: 'Contact details: full name, email, phone and city',
    check: ({ resume }) => {
      const name = strip(resume.fullName)
      const missing = [
        !name || name.length > 60 || /[@\d]/.test(name) ? 'full name' : null,
        !EMAIL.test(strip(resume.email)) ? 'a valid email' : null,
        !isPhone(resume.phone) ? 'a valid phone number' : null,
        !strip(resume.location) ? 'city' : null
      ].filter(Boolean)
      return missing.length ? fail(`Missing ${missing.join(', ')}.`, `Add ${missing.join(', ')} at the top of the resume.`, 1 - missing.length / 4) : pass()
    }
  },
  {
    id: 'C2', group: 'content', level: 'required', label: 'Each job has title, company and dates in one format, newest first',
    check: ({ resume }) => {
      const jobs = list(resume.experience)
      if (!jobs.length) return pass('No jobs listed.')
      const problems = []
      const dates = []
      jobs.forEach((job, index) => {
        const label = strip(job?.role) || strip(job?.company) || `Job ${index + 1}`
        const missing = [!strip(job?.role) && 'title', !strip(job?.company) && 'company'].filter(Boolean)
        const start = parseResumeDate(job?.startDate)
        const current = CURRENT.test(strip(job?.endDate))
        if (current && strip(job?.endDate) !== 'Present') problems.push(`${label}: write the end date as Present`)
        const end = current ? 'present' : parseResumeDate(job?.endDate)
        if (!start?.month) missing.push('start month and year')
        if (!end || (end !== 'present' && !end.month)) missing.push('end month and year (or Present)')
        if (missing.length) problems.push(`${label}: no ${missing.join(', ')}`)
        dates.push({ start, end })
      })
      const styles = new Set(dates.flatMap(({ start, end }) => [start?.style, end === 'present' ? null : end?.style]).filter(style => style && style !== 'YYYY'))
      if (styles.size > 1) problems.push('dates are written in more than one format')
      const key = date => (date === 'present' ? Infinity : date ? date.year * 12 + (date.month ?? 1) : null)
      const starts = dates.map(({ start, end }) => key(start) ?? key(end)).filter(value => value !== null)
      if (starts.some((value, index) => index > 0 && value > starts[index - 1])) problems.push('jobs are not newest first')
      const complete = jobs.length - problems.filter(item => item.includes(': no ')).length
      return problems.length ? fail(`${problems.slice(0, 3).join('; ')}.`, 'Give every job a title, company and dates like “Jan 2024 – Present”, newest first.', complete / jobs.length * .9) : pass()
    }
  },
  {
    id: 'C3', group: 'content', level: 'required', label: 'Each education entry has degree, institution and end year',
    check: ({ resume }) => {
      const entries = list(resume.education)
      if (!entries.length) return pass('No education listed.')
      const incomplete = entries.filter(item => !strip(item?.degree) || !strip(item?.institution) || !(parseResumeDate(item?.endDate) || /present|expected|pursuing/i.test(strip(item?.endDate))))
      return incomplete.length ? fail(`${plural(incomplete.length, 'entry')} without a degree, institution or end year.`, 'Give each entry its degree, institution and the year it ends (or Expected 2027).', 1 - incomplete.length / entries.length) : pass()
    }
  },
  {
    id: 'C4', group: 'content', level: 'required', label: 'At least 6 skills, as plain text with no ratings',
    check: ({ resume }) => {
      const skills = allSkills(resume)
      const rated = skills.filter(skill => RATING.test(skill))
      const long = skills.filter(skill => skill.split(' ').length > 5)
      const problems = [skills.length < 6 && `${plural(skills.length, 'skill')} listed`, rated.length && `ratings on ${rated.slice(0, 2).join(', ')}`, long.length && `${plural(long.length, 'skill')} written as sentences`].filter(Boolean)
      return problems.length ? fail(`${problems.join('; ')}.`, 'List at least 6 skills as short names, without scores, stars or percentages.', Math.min(skills.length, 6) / 6 * (rated.length || long.length ? .6 : 1)) : pass(`${skills.length} skills`)
    }
  },
  {
    id: 'C5', group: 'content', level: 'required', label: 'Plain characters only: no emoji or decorative symbols',
    check: ({ resume }) => {
      const found = textFields(resume).filter(value => DECORATIVE.test(value))
      return found.length ? fail(`Symbols in ${plural(found.length, 'line')}, e.g. “${found[0].slice(0, 40)}”.`, 'Remove emoji, stars, ticks and arrows; use plain words and the • bullet.') : pass()
    }
  },
  {
    id: 'C6', group: 'content', level: 'recommended', label: 'Bullets start with an action verb, stay under 30 words, and 30% show a number',
    check: ({ resume }) => {
      const bullets = allBullets(resume)
      if (!bullets.length) return unchecked('No bullets to check.')
      const verbs = bullets.filter(bullet => ACTION_VERB.test(bullet)).length / bullets.length
      const short = bullets.filter(bullet => bullet.split(' ').length < 30).length / bullets.length
      const numbers = bullets.filter(bullet => /\d/.test(bullet)).length / bullets.length
      const problems = [verbs < .7 && `${Math.round(verbs * 100)}% start with an action verb`, short < 1 && `${Math.round((1 - short) * 100)}% are 30 words or longer`, numbers < .3 && `${Math.round(numbers * 100)}% show a number`].filter(Boolean)
      return problems.length ? fail(`${problems.join('; ')}.`, 'Open each bullet with a verb like Built or Led, keep it to one line or two, and add a result with a number.', (Math.min(1, verbs / .7) + short + Math.min(1, numbers / .3)) / 3) : pass()
    }
  },
  {
    id: 'C7', group: 'content', level: 'recommended', label: 'A 2–4 line summary that names the target role',
    check: ({ resume }) => {
      const summary = strip(resume.summary)
      if (!summary) return fail('No summary.', 'Add two to four lines on who you are and the role you want.')
      const role = strip(resume.headline || list(resume.experience)[0]?.role).toLowerCase().split(/[\s|,/]+/).filter(word => word.length > 3)
      const problems = [summary.length < 120 && 'is shorter than two lines', summary.length > 600 && 'is longer than four lines', role.length && !role.some(word => summary.toLowerCase().includes(word)) && 'doesn’t name the role'].filter(Boolean)
      return problems.length ? fail(`The summary ${problems.join(' and ')}.`, 'Write 2–4 lines that start with the role you are applying for.', .5) : pass()
    }
  }
]

/** Every rule with its id, group, level and label, for documentation and the editor's checklist. */
export const ATS_RULES = Object.freeze(RULES.map(({ id, group, level, label }) => Object.freeze({ id, group, groupLabel: GROUPS[group], level, label })))

function textFields(resume = {}) {
  return [
    resume.fullName, resume.headline, resume.email, resume.phone, resume.location, resume.summary,
    ...allSkills(resume),
    ...list(resume.experience).flatMap(item => [item?.role, item?.company, item?.location, ...list(item?.bullets)]),
    ...list(resume.projects).flatMap(item => [item?.name, item?.description, ...list(item?.techStack), ...list(item?.bullets)]),
    ...list(resume.education).flatMap(item => [item?.degree, item?.institution, ...list(item?.details)]),
    ...list(resume.certifications), ...list(resume.achievements), ...list(resume.languages),
    ...list(resume.customSections).flatMap(section => [section?.title, section?.content])
  ].map(strip).filter(Boolean)
}

/** #rrggbb or #rgb darker than mid grey (relative luminance under .35). */
export function isDarkColour(value) {
  const hex = String(value ?? '').trim().replace(/^#/, '')
  const full = hex.length === 3 ? hex.split('').map(char => char + char).join('') : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) return true
  const [r, g, b] = [0, 2, 4].map(at => parseInt(full.slice(at, at + 2), 16) / 255).map(c => (c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4))
  return .2126 * r + .7152 * g + .0722 * b < .35
}

/**
 * How complete the resume's sections are (0–100): contact details, a summary, the core sections, and complete job
 * and education entries. The HR portal weights this as "Section completeness".
 */
export function sectionCompleteness(resume = {}, rules = null) {
  const results = rules ?? Object.fromEntries(['S3', 'C1', 'C2', 'C3'].map(id => [id, RULES.find(rule => rule.id === id).check(baseContext(resume, {}))]))
  // Job and education entries count only when there are some: a missing section is already counted by S3.
  const parts = [results.C1.score, strip(resume.summary) ? 1 : 0, results.S3.score,
    ...(list(resume.experience).length ? [results.C2.score] : []), ...(list(resume.education).length ? [results.C3.score] : [])]
  return Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length * 100)
}

function baseContext(resume, context) {
  const years = Number.isFinite(context.years) ? context.years : yearsOfExperience(resume, context.now ?? new Date())
  return {
    resume, years,
    file: context.file ?? null,
    layout: context.layout ?? null,
    text: context.text ?? '',
    headings: context.headings ?? null,
    order: context.order ?? null,
    pages: context.pages ?? context.file?.pages ?? null,
    present: presentSections(resume)
  }
}

/**
 * The resume against Refile ATS Standard v1.
 * → { standard, score, qualified, passScore, required: { passed, failed, total }, completeness, rules: [...], failures: [...] }
 *   Each rule: { id, group, groupLabel, level, label, status: 'pass'|'fail'|'unchecked', score, detail, fix }.
 */
export function evaluateAts(resume = {}, context = {}) {
  const ctx = baseContext(resume ?? {}, context)
  const rules = RULES.map(rule => ({ id: rule.id, group: rule.group, groupLabel: GROUPS[rule.group], level: rule.level, label: rule.label, ...rule.check(ctx) }))
  const checked = rules.filter(rule => rule.status !== 'unchecked')
  const weight = rule => WEIGHT[rule.level]
  const total = checked.reduce((sum, rule) => sum + weight(rule), 0)
  const score = total ? Math.round(checked.reduce((sum, rule) => sum + weight(rule) * rule.score, 0) / total * 100) : 0
  const required = checked.filter(rule => rule.level === 'required')
  const failures = required.filter(rule => rule.status === 'fail')
  const byId = Object.fromEntries(rules.map(rule => [rule.id, rule]))
  return {
    standard: ATS_STANDARD.label,
    score,
    passScore: ATS_PASS_SCORE,
    qualified: failures.length === 0 && score >= ATS_PASS_SCORE,
    required: { passed: required.length - failures.length, failed: failures.length, total: required.length },
    completeness: sectionCompleteness(resume ?? {}, byId),
    rules,
    failures
  }
}

/** The short result stored with an HR candidate or shown on a card: { score, qualified, failed: [{ id, label, detail }] }. */
export function atsSummary(result) {
  return { standard: result.standard, score: result.score, qualified: result.qualified, failed: result.failures.map(({ id, label, detail }) => ({ id, label, detail })) }
}
