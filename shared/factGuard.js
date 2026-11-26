// Rejects AI-written resume text that introduces facts the user never gave: numbers/metrics, years,
// known skills/technologies, links or emails that appear in neither the resume nor the user's request.
// Wording changes are fine; new facts are not.
import { knownSkillsIn } from './roleAnalysis.js'

const stripMarks = value => String(value ?? '').replace(/\[\/?[bius]\]/g, '')
const normalise = value => stripMarks(value).toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ')

// Numbers as people write them: 40%, 1.5k, $2M, 2023, 3x, 10+.
const NUMBER = /(?:[$€£₹]\s?)?\d[\d,]*(?:\.\d+)?\s?(?:%|\+|x|k|m|bn|b|lakh|crore|million|billion|thousand)?/gi
const LINK = /\b(?:https?:\/\/|www\.)[^\s)]+|\b[\w.+-]+@[\w-]+\.[\w.]+/gi

// "Data modeling" is not a new skill when the resume says "data model": compare word stems, not exact endings.
const stem = word => word.length > 5 ? word.replace(/(ling|ing|ed|es|s)$/, '') : word
const stemsIn = (skill, source) => {
  const words = skill.toLowerCase().split(/[^a-z0-9+#]+/).filter(word => word.length > 1)
  return words.length > 0 && words.every(word => source.includes(stem(word)))
}

const digitsOf = value => value.replace(/[^\d.]/g, '').replace(/^\.|\.$/g, '')

/** Collect every text value in a resume (or any JSON) into one searchable string. */
export function sourceTextOf(...sources) {
  const parts = []
  const walk = value => {
    if (value == null) return
    if (typeof value === 'string' || typeof value === 'number') parts.push(String(value))
    else if (Array.isArray(value)) value.forEach(walk)
    else if (typeof value === 'object') Object.values(value).forEach(walk)
  }
  sources.forEach(walk)
  return normalise(parts.join('\n'))
}

/**
 * Facts in `proposed` that are not supported by `source` (a string from sourceTextOf).
 * Returns [{ kind: 'number'|'skill'|'link', value }].
 */
export function findInventedFacts(proposed, source) {
  const text = normalise(proposed)
  const sourceDigits = new Set((source.match(NUMBER) ?? []).map(digitsOf).filter(Boolean))
  const invented = []
  for (const match of text.match(NUMBER) ?? []) {
    const digits = digitsOf(match)
    if (!digits) continue
    // Ordinals and list markers like "1." in prose are not claims; single digits written as words are fine too.
    if (sourceDigits.has(digits) || source.includes(match.trim())) continue
    invented.push({ kind: 'number', value: match.trim() })
  }
  const sourceSkills = new Set(knownSkillsIn(source).map(skill => skill.toLowerCase()))
  for (const skill of knownSkillsIn(text)) {
    if (!sourceSkills.has(skill.toLowerCase()) && !source.includes(skill.toLowerCase()) && !stemsIn(skill, source)) invented.push({ kind: 'skill', value: skill })
  }
  for (const link of text.match(LINK) ?? []) {
    if (!source.includes(link.toLowerCase())) invented.push({ kind: 'link', value: link })
  }
  return [...new Map(invented.map(item => [`${item.kind}:${item.value}`, item])).values()]
}

export function describeInventedFacts(facts) {
  return facts.map(fact => fact.kind === 'number' ? `the figure “${fact.value}”` : fact.kind === 'skill' ? `the skill “${fact.value}”` : `the link “${fact.value}”`).join(', ')
}
