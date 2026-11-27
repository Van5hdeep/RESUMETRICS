// Instant job-post reading (PLAN-031): no network, works for any profession.
// Produces the same jd shape the AI parser did, so scoring and fixes are unchanged.
import { knownSkillsIn } from './roleAnalysis.js'
import { countTerm } from './jdKeywords.js'
import { generalSkillsIn } from './generalSkills.js'

const STOP = new Set(('a about above across after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each either etc ever every few for from further get gets given good great had has have having he her here hers him his how i if in into is it its itself just least less like make makes many may me might more most must my need needed needs new no nor not now of off on once one only or other our ours out over own part per plus please prefer preferred previous related relevant required requirements requirement responsibilities responsibility role same set shall she should so some such strong than that the their them then there these they this those through to too under until up upon us use used using very via was we well were what when where which while who whom why will with within without work working would year years yes you your yours ability able experience experienced knowledge skills skill team teams candidate candidates company job position opportunity including include includes ensure ensuring provide providing within based day days time full looking join apply benefits salary pay hours week weeks month months environment level levels high highly excellent proven demonstrated equivalent minimum plus bonus ideal ideally duties duty key core various other others well-being people person').split(' '))
const SOFT_SKILLS = ['communication', 'written communication', 'verbal communication', 'teamwork', 'collaboration', 'leadership', 'problem solving', 'problem-solving', 'critical thinking', 'time management', 'attention to detail', 'adaptability', 'flexibility', 'customer service', 'interpersonal skills', 'organisation', 'organization', 'organizational skills', 'multitasking', 'decision making', 'decision-making', 'creativity', 'empathy', 'mentoring', 'coaching', 'negotiation', 'conflict resolution', 'stakeholder management', 'presentation skills', 'self-motivated', 'reliability', 'work ethic', 'integrity', 'patience', 'professionalism', 'initiative', 'accountability', 'emotional intelligence', 'active listening']
const REQUIRED_LINE = /\b(must|required|requirements?|you have|you'll have|you will have|essential|mandatory|need to have|qualifications?|minimum|proficien|experience (with|in))\b/i
const NICE_LINE = /\b(nice to have|preferred|bonus|a plus|desirable|advantage|ideally)\b/i
const DUTY_LINE = /\b(responsibilit|you will|you'll|duties|what you('ll| will) do|day to day|role involves)\b/i
/** Most must-haves a post is read as having from its skills (requirements always count; duties fill the rest). */
const MAX_MUST = 8
// Soft skills that count as must-haves when the requirements ask for them; the rest stay soft skills.
const MUST_SOFT = new Set(['communication', 'written communication', 'verbal communication', 'customer service'])
// Phrases ending in a job title ("executive assistant") describe a role, not a skill to look for.
const TITLE_END = /\b(assistant|manager|executive|secretary|officer|engineer|developer|analyst|intern|director|head|coordinator|associate|representative|specialist|consultant|administrator|receptionist|clerk|lead|supervisor|technician|designer|accountant|nurse|teacher|chef|driver|guard|agent|operator)s?$/i
const EDUCATION_LINE = /\b(bachelor|master|degree|graduat|diploma|b\.?\s?(?:com|tech|sc|a|e)\b|m\.?\s?(?:com|tech|sc|a|ba)\b|mba|bba|bca|ph\.?\s?d|12th|10th|hsc|ssc|higher secondary)/i

// Words that make a phrase a sentence fragment rather than a skill ("reporting and access", "build microservices").
const JOINERS = new Set(['and', 'or', 'with', 'the', 'a', 'an', 'to', 'for', 'in', 'on', 'at', 'by', 'from', 'our', 'your', 'their', 'as', 'is', 'are', 'be', 'will'])
const VERBS = new Set(['build', 'own', 'manage', 'monitor', 'respond', 'complete', 'create', 'develop', 'lead', 'maintain', 'support', 'work', 'help', 'provide', 'ensure', 'deliver', 'design', 'write', 'handle', 'perform', 'conduct', 'assist', 'prepare', 'review', 'patrol', 'join', 'keep', 'take', 'make', 'use', 'run', 'drive', 'report', 'track', 'plan', 'coordinate', 'communicate', 'collaborate', 'partner', 'oversee', 'implement', 'improve', 'operate', 'serve', 'greet', 'answer', 'process', 'record', 'follow', 'check'])
const HEADING = /^(requirements?|qualifications?|what you('ll| will) (do|need|bring)|what we('re| are) looking for|responsibilities|key responsibilities|duties|about you|skills|you have|nice to have|preferred|bonus|desirable|education(al qualifications?)?|about (the role|us|the company)|what we offer|benefits|perks)\b.*:?$|:$/i
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const words = line => (line.toLowerCase().match(/[a-z][a-z0-9+#./-]*[a-z0-9+#]|[a-z]/g) ?? []).map(word => word.replace(/[./-]+$/, ''))

/** Lines of the post, with list markers removed. */
function linesOf(text) {
  return String(text ?? '').split(/\r?\n/).map(line => clean(line.replace(/^(?:\s*(?:[•●▪◦*·>\-–—]|\d{1,2}[.)](?=\s)))+\s*/, ''))).filter(Boolean)
}

/** Title and company from the opening lines ("Security Officer, Sentinel Protection" / "… at …" / "Company: …"). */
function titleAndCompany(lines) {
  const head = lines.slice(0, 6)
  const named = head.map(line => line.match(/^(?:job title|title|position|role)\s*[:\-–]\s*(.+)$/i)?.[1]).find(Boolean)
  const companyLine = lines.slice(0, 12).map(line => line.match(/^(?:company|employer|organi[sz]ation)\s*[:\-–]\s*(.+)$/i)?.[1]).find(Boolean)
  const first = clean(named || head.find(line => line.length <= 90 && !/[.!?]$/.test(line)) || head[0] || 'Role')
  const split = first.match(/^(.+?)\s+(?:at|@|[-–—|,])\s+(.+)$/i)
  const title = clean(split ? split[1] : first).slice(0, 80)
  const company = clean(companyLine || (split ? split[2] : '')).slice(0, 80)
  return { title, company }
}

/** Minimum years of experience the post asks for ("2+ years", "3-5 years of experience"), or null. */
function yearsIn(lines, kinds) {
  const pattern = /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?\+?\s*years?\b/i
  const asks = line => pattern.test(line) && /experience|\bexp\b|years? (?:as|in|of)\b|working/i.test(line)
  const ordered = [...lines.filter((line, index) => kinds[index].kind === 'req'), ...lines]
  const line = ordered.find(asks)
  const years = line ? Number(line.match(pattern)[1]) : null
  return years && years <= 30 ? years : null
}

/** The education the post asks for: the first line under an Education heading, else a requirement naming a degree. */
function educationIn(lines, kinds) {
  const under = lines.find((line, index) => kinds[index].kind === 'edu' && !kinds[index].heading && EDUCATION_LINE.test(line))
  const asked = under ?? lines.find((line, index) => (kinds[index].kind === 'req' || /^education/i.test(line)) && EDUCATION_LINE.test(line))
  // "B.Com or M.Com with 3+ years of accounting experience" → "B.Com or M.Com": the experience part is read separately.
  return asked ? clean(asked.replace(/^education(al qualifications?)?\s*[:\-–]\s*/i, '').replace(/\s*(?:,|\band\b|\bwith\b|\bhaving\b)\s+(?:at least\s+|minimum\s+)?\d.*$/i, '')).slice(0, 120) : null
}

/** 1–3 word phrases without stop words at either end. */
function phrasesIn(line) {
  // Phrases never cross punctuation: "React, Node.js, Docker" is three items, not one phrase.
  return String(line).split(/[,;:()|!?]|\.(?:\s|$)|\s[-–—]\s/).flatMap(phrasesInChunk)
}

function phrasesInChunk(chunk) {
  const tokens = words(chunk)
  const out = []
  for (let size = 3; size >= 1; size -= 1) {
    for (let index = 0; index + size <= tokens.length; index += 1) {
      const slice = tokens.slice(index, index + size)
      if (STOP.has(slice[0]) || STOP.has(slice.at(-1)) || slice.some(word => word.length < 2 || /^\d+$/.test(word))) continue
      if (slice.slice(1, -1).some(word => JOINERS.has(word)) || (size > 1 && VERBS.has(slice[0]))) continue
      if (size === 1 && slice[0].length < 4) continue
      out.push(slice.join(' '))
    }
  }
  return out
}

/**
 * jobText → { title, company, mustHave, niceToHave, keywords, softSkills, responsibilities }.
 * Hard skills come from the shared skill dictionary; requirement phrases come from repetition and from
 * requirement/duty lines, so posts for nurses, chefs or guards work as well as engineering posts.
 */
export function extractJd(jobText = '') {
  const text = String(jobText ?? '')
  const lines = linesOf(text)
  const { title, company } = titleAndCompany(lines)
  const lower = text.toLowerCase()
  const titleWords = new Set(words(title))

  // Each line inherits the kind of the heading above it ("Requirements:", "What you will do:", "Nice to have:",
  // "Education:"). Lines under "About us" or "Benefits" are information, not requirements.
  let section = null
  const kinds = lines.map(line => {
    if (HEADING.test(line) && line.length < 60 && (line.endsWith(':') || !line.includes(':'))) {
      section = /^education/i.test(line) ? 'edu' : /^(about (the role|us|the company)|what we offer|benefits|perks)/i.test(line) ? 'info' : NICE_LINE.test(line) ? 'nice' : REQUIRED_LINE.test(line) || /about you|you have|skills|looking for|need|bring/i.test(line) ? 'req' : DUTY_LINE.test(line) ? 'duty' : section
      return { heading: true, kind: section }
    }
    const own = NICE_LINE.test(line) ? 'nice' : REQUIRED_LINE.test(line) ? 'req' : DUTY_LINE.test(line) ? 'duty' : null
    return { heading: false, kind: own ?? section }
  })
  // Where a skill is named: a requirement makes it a must-have; only "nice to have" lines make it a nice-to-have;
  // a skill named only in the duties is core to the job, so it is a must-have too. The title line doesn't count.
  const placeOf = finder => {
    const where = lines.map((line, index) => ({ line, ...kinds[index], index })).filter(item => !item.heading && item.index > 0 && item.kind !== 'info' && item.kind !== 'edu' && finder(item.line))
    if (!where.length) return null
    const at = where[0].index
    if (where.some(item => item.kind === 'req')) return { place: 'req', at }
    if (where.some(item => item.kind === 'nice')) return { place: 'nice', at }
    return { place: 'duty', at }
  }

  // Hard skills: the tech dictionary and the general one (office, languages, sales, finance, operations…).
  const softSet = new Set(SOFT_SKILLS)
  // Only skills the post actually names (the tech dictionary also infers, e.g. JavaScript from Node.js).
  const techSkills = knownSkillsIn(text).filter(skill => countTerm(text, skill) > 0)
  const general = generalSkillsIn(text).filter(skill => !techSkills.some(item => item.toLowerCase() === skill.toLowerCase()))
  const found = [
    ...techSkills.map(skill => ({ skill, ...placeOf(line => knownSkillsIn(line).includes(skill)) })),
    ...general.map(skill => ({ skill, ...placeOf(line => generalSkillsIn(line).includes(skill)) }))
  ].filter(item => item.place).sort((a, b) => a.at - b.at)
  const isSoft = skill => softSet.has(skill.toLowerCase())
  const hard = found.filter(item => !isSoft(item.skill) || (MUST_SOFT.has(item.skill.toLowerCase()) && item.place !== 'nice'))
  // Every stated requirement is a must-have; duties fill the list up to MAX_MUST in the order the post names them,
  // and the rest become nice-to-haves (each missing must-have weighs heavily in the score).
  const required = hard.filter(item => item.place === 'req').map(item => item.skill)
  const duties = hard.filter(item => item.place === 'duty').map(item => item.skill)
  const room = Math.max(0, MAX_MUST - required.length)
  const mustHave = [...required, ...duties.slice(0, room)]
  const niceToHave = [...hard.filter(item => item.place === 'nice').map(item => item.skill), ...duties.slice(room)]

  // Soft skills from a curated list.
  const softSkills = [...new Set(SOFT_SKILLS.filter(skill => new RegExp(`(^|[^a-z])${skill.replace(/[-/]/g, '[- ]?')}([^a-z]|$)`).test(lower)).map(skill => skill.replace('organisation', 'organization').replace('problem-solving', 'problem solving').replace('decision-making', 'decision making')))]

  // Requirement phrases: count each phrase, boost those in requirement/duty lines, drop ones covered by skills.
  const scores = new Map()
  const lineCounts = new Map()
  const inRequirement = new Set()
  const inNice = new Set()
  lines.forEach((line, index) => {
    const { kind, heading } = kinds[index]
    if (heading) return
    const boost = kind === 'req' || kind === 'duty' || kind === 'nice' ? 1 : 0
    new Set(phrasesIn(line.replace(/^[^:]{0,40}:\s*/, ''))).forEach(phrase => {
      scores.set(phrase, (scores.get(phrase) ?? 0) + 1 + boost)
      lineCounts.set(phrase, (lineCounts.get(phrase) ?? 0) + 1)
      if (kind === 'req') inRequirement.add(phrase)
      if (kind === 'nice') inNice.add(phrase)
    })
  })
  const covered = new Set([...found.map(item => item.skill), ...softSkills].map(item => item.toLowerCase()))
  const candidates = [...scores.entries()]
    .filter(([phrase, score]) => score >= 2 && (phrase.includes(' ') || lineCounts.get(phrase) >= 2) && !VERBS.has(phrase) && !covered.has(phrase) && !phrase.split(' ').every(word => titleWords.has(word)) && ![...covered].some(item => item.includes(phrase) || countTerm(phrase, item) > 0) && !generalSkillsIn(phrase).length)
    .sort((a, b) => b[1] - a[1] || b[0].split(' ').length - a[0].split(' ').length)
  // Prefer the longer phrase when a shorter one is inside it with a similar score.
  const keywords = []
  for (const [phrase, score] of candidates) {
    if (keywords.some(kept => kept.phrase.includes(phrase) && kept.score >= score - 1)) continue
    keywords.push({ phrase, score })
    if (keywords.length >= 14) break
  }
  // Job titles stay keywords (a matching past title helps) but are never skills to require.
  const skillLike = phrase => !TITLE_END.test(phrase)
  const keyPhrases = keywords.filter(item => !inNice.has(item.phrase) && (inRequirement.has(item.phrase) || item.score >= 4) && skillLike(item.phrase)).map(item => item.phrase)
  const nicePhrases = keywords.filter(item => inNice.has(item.phrase) && !inRequirement.has(item.phrase) && skillLike(item.phrase) && item.phrase.includes(' ') && !/^(another|other|any|some|basic|good|strong)\b/.test(item.phrase)).map(item => item.phrase)
  // Posts the dictionaries already cover well need few phrases; posts they don't (a chef, a nurse) lean on them.
  const phraseRoom = mustHave.length >= 5 ? 2 : 6

  return {
    title,
    company,
    mustHave: [...mustHave, ...keyPhrases.slice(0, phraseRoom)].slice(0, 15),
    niceToHave: [...niceToHave, ...nicePhrases].slice(0, 15),
    keywords: keywords.map(item => item.phrase).filter(phrase => !keyPhrases.slice(0, phraseRoom).includes(phrase) && !nicePhrases.includes(phrase)).slice(0, 12),
    yearsExperience: yearsIn(lines, kinds),
    education: educationIn(lines, kinds),
    softSkills: softSkills.slice(0, 8),
    responsibilities: lines.filter((line, index) => !kinds[index].heading && kinds[index].kind === 'duty' && line.length < 200).slice(0, 8),
    parsedBy: 'instant'
  }
}
