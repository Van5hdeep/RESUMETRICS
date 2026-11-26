// PLAN-034 resume operations NIMBUS (and job fixes) can use beyond the original content edits:
// one-bullet rewrites, removals, moving entries, section visibility/titles/order and page spacing.
// Every operation that changes or removes existing text carries `expect`, a short quote of that text.
// The validator checks it against the resume the model saw; the applier uses it to find the right
// entry even if earlier removals shifted indexes, and refuses (StaleOperationError) when the text is gone (D40).
import { CONFIGURABLE_SECTIONS, MAX_SECTION_TITLE, applySectionOrder, normalizeSectionSettings } from '../src/editor/sectionSettings.js'
import { DENSITIES, LAYOUT_MAX, LAYOUT_MIN, mergeLayout } from './resumeLayout.js'

export const RESUME_CONTENT_OPERATIONS = new Set(['set_bullet', 'remove_bullet', 'remove_item', 'move_item', 'remove_list_entry', 'remove_skill', 'remove_link'])
export const SECTION_OPERATIONS = new Set(['hide_section', 'show_section', 'rename_section', 'reorder_sections'])
export const LAYOUT_OPERATIONS = new Set(['set_layout'])
export const REMOVAL_OPERATIONS = new Set(['remove_bullet', 'remove_item', 'remove_list_entry', 'remove_skill', 'remove_link', 'hide_section'])

export class StaleOperationError extends Error {
  constructor(message = 'This part of the resume changed since NIMBUS suggested it.') {
    super(message)
    this.name = 'StaleOperationError'
  }
}

const ITEM_SECTIONS = ['experience', 'projects', 'education']
const LIST_TARGETS = ['certifications', 'achievements', 'languages']
const linesOf = section => section === 'education' ? 'details' : 'bullets'

/** Comparable form of a piece of resume text: no marks, lower case, single spaces, no trailing punctuation. */
export const fingerprint = value => String(value ?? '').replace(/\[\/?[bius]\]/g, '').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim().replace(/[.;,]+$/, '')

/** True when `expect` quotes `actual` (its start, or a long enough part of it). */
export function textMatches(actual, expect) {
  const a = fingerprint(actual)
  const e = fingerprint(expect)
  if (!a || !e) return false
  if (a === e) return true
  const probe = e.slice(0, 60)
  return probe.length >= 8 && (a.startsWith(probe) || (probe.length >= 20 && a.includes(probe)) || (a.length >= 8 && e.startsWith(a)))
}

export const itemLabel = (section, item = {}) => section === 'experience'
  ? [item.role, item.company].filter(Boolean).join(' at ')
  : section === 'projects' ? item.name || item.description || '' : [item.degree, item.institution].filter(Boolean).join(', ')

const itemMatches = (section, item, expect) => {
  const e = fingerprint(expect)
  if (!e || !item) return false
  const fields = section === 'experience' ? [item.role, item.company] : section === 'projects' ? [item.name, item.description] : [item.degree, item.institution]
  const whole = fingerprint(fields.filter(Boolean).join(' '))
  return fields.some(field => textMatches(field, expect)) || textMatches(itemLabel(section, item), expect) || (e.length >= 3 && whole.includes(e))
}

const index = (value, label, fail) => {
  if (!Number.isInteger(value) || value < 0) fail(`${label} must be a whole number from 0.`)
  return value
}
const cleanText = (value, label, max, fail) => {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be text.`)
  if (value.trim().length > max) fail(`${label} is too long.`)
  return value.trim()
}
const sectionOf = (value, allowed, fail) => {
  if (!allowed.includes(value)) fail(`section must be one of ${allowed.join(', ')}.`)
  return value
}

/**
 * Validate one operation from the sets above against the resume the model saw.
 * fail(message) must throw. Returns the cleaned operation.
 */
export function validateResumeOperation(op, { resumeData = {}, sections = {} } = {}, fail) {
  const items = section => Array.isArray(resumeData[section]) ? resumeData[section] : []
  switch (op.type) {
    case 'set_bullet':
    case 'remove_bullet': {
      const section = sectionOf(op.section, ITEM_SECTIONS, fail)
      const itemIndex = index(op.itemIndex, 'itemIndex', fail)
      const item = items(section)[itemIndex]
      if (!item) fail(`There is no ${section} entry ${itemIndex}.`)
      const lines = item[linesOf(section)] ?? []
      const bulletIndex = index(op.bulletIndex, 'bulletIndex', fail)
      if (bulletIndex >= lines.length) fail(`${section} ${itemIndex} has no bullet ${bulletIndex}.`)
      const expect = cleanText(op.expect, 'expect (the current bullet text)', 400, fail)
      if (!textMatches(lines[bulletIndex], expect)) fail(`expect does not match ${section}[${itemIndex}] bullet ${bulletIndex} ("${String(lines[bulletIndex]).slice(0, 60)}").`)
      if (op.type === 'remove_bullet') {
        if (lines.length <= 1) fail('That is the entry’s only bullet. Suggest removing the whole entry (remove_item) or rewriting it instead.')
        return { type: op.type, section, itemIndex, bulletIndex, expect }
      }
      return { type: op.type, section, itemIndex, bulletIndex, expect, value: cleanText(op.value, 'value', 1000, fail) }
    }
    case 'remove_item':
    case 'move_item': {
      const section = sectionOf(op.section, ITEM_SECTIONS, fail)
      const itemIndex = index(op.itemIndex, 'itemIndex', fail)
      const list = items(section)
      if (!list[itemIndex]) fail(`There is no ${section} entry ${itemIndex}.`)
      const expect = cleanText(op.expect ?? itemLabel(section, list[itemIndex]), 'expect (the entry title)', 300, fail)
      if (!itemMatches(section, list[itemIndex], expect)) fail(`expect does not match ${section}[${itemIndex}] ("${itemLabel(section, list[itemIndex])}").`)
      if (op.type === 'remove_item') {
        if (list.length <= 1) fail(`That is the only ${section} entry. Suggest hide_section instead, which keeps the content.`)
        return { type: op.type, section, itemIndex, expect }
      }
      const toIndex = index(op.toIndex, 'toIndex', fail)
      if (toIndex >= list.length) fail(`toIndex must be below ${list.length}.`)
      if (toIndex === itemIndex) fail('move_item must move the entry somewhere else.')
      return { type: op.type, section, itemIndex, toIndex, expect }
    }
    case 'remove_list_entry': {
      const target = sectionOf(op.target, LIST_TARGETS, fail)
      const expect = cleanText(op.expect, 'expect (the entry text)', 300, fail)
      if (!items(target).some(entry => textMatches(entry, expect))) fail(`"${expect}" is not in ${target}.`)
      return { type: op.type, target, expect }
    }
    case 'remove_skill': {
      const groups = resumeData.skills && typeof resumeData.skills === 'object' ? resumeData.skills : {}
      if (!Array.isArray(groups[op.category])) fail(`Unknown skill category ${op.category}.`)
      const value = cleanText(op.value, 'value', 100, fail)
      if (!groups[op.category].some(skill => fingerprint(skill) === fingerprint(value))) fail(`"${value}" is not in ${op.category}.`)
      return { type: op.type, category: op.category, value }
    }
    case 'remove_link': {
      const links = Array.isArray(resumeData.links) ? resumeData.links : []
      const linkIndex = index(op.linkIndex, 'linkIndex', fail)
      if (!links[linkIndex]) fail(`There is no link ${linkIndex}.`)
      const expect = cleanText(op.expect ?? links[linkIndex].url, 'expect', 500, fail)
      if (!textMatches(links[linkIndex].url, expect) && !textMatches(links[linkIndex].label, expect)) fail(`expect does not match link ${linkIndex}.`)
      return { type: op.type, linkIndex, expect }
    }
    case 'hide_section':
    case 'show_section': {
      const section = sectionOf(op.section, CONFIGURABLE_SECTIONS, fail)
      const hidden = Boolean(sections?.hidden?.[section])
      if (op.type === 'hide_section' && hidden) fail(`${section} is already hidden.`)
      if (op.type === 'show_section' && !hidden) fail(`${section} is not hidden.`)
      return { type: op.type, section }
    }
    case 'rename_section':
      return { type: op.type, section: sectionOf(op.section, CONFIGURABLE_SECTIONS, fail), title: cleanText(op.title, 'title', MAX_SECTION_TITLE, fail) }
    case 'reorder_sections': {
      if (!Array.isArray(op.order) || op.order.length < 2) fail('order must list at least two sections.')
      const order = [...new Set(op.order)]
      order.forEach(id => sectionOf(id, CONFIGURABLE_SECTIONS, fail))
      return { type: op.type, order }
    }
    case 'set_layout': {
      const output = {}
      if (op.density != null) {
        if (!DENSITIES[op.density]) fail('density must be compact, standard or spacious.')
        output.density = op.density
      }
      for (const key of ['sectionGap', 'itemGap', 'pageMargin']) {
        if (op[key] == null) continue
        if (!Number.isFinite(op[key]) || op[key] < LAYOUT_MIN || op[key] > LAYOUT_MAX) fail(`${key} must be between ${LAYOUT_MIN} and ${LAYOUT_MAX} (1 = the template's spacing).`)
        output[key] = op[key]
      }
      if (!Object.keys(output).length) fail('set_layout needs density or at least one of sectionGap, itemGap, pageMargin.')
      return { type: op.type, ...output }
    }
    default:
      return fail(`Unsupported operation ${op.type}.`)
  }
}

const findLine = (resumeData, op) => {
  const key = linesOf(op.section)
  const list = resumeData[op.section] ?? []
  const preferred = list[op.itemIndex]?.[key]?.[op.bulletIndex]
  if (preferred != null && textMatches(preferred, op.expect)) return [op.itemIndex, op.bulletIndex]
  // An earlier change may have shifted indexes: find the same text anywhere in the section.
  for (let i = 0; i < list.length; i += 1) {
    const at = (list[i][key] ?? []).findIndex(line => textMatches(line, op.expect))
    if (at >= 0) return [i, at]
  }
  throw new StaleOperationError()
}
const findItem = (resumeData, op) => {
  const list = resumeData[op.section] ?? []
  if (itemMatches(op.section, list[op.itemIndex], op.expect)) return op.itemIndex
  const at = list.findIndex(item => itemMatches(op.section, item, op.expect))
  if (at < 0) throw new StaleOperationError()
  return at
}

/** Apply content operations from RESUME_CONTENT_OPERATIONS. Pure; throws StaleOperationError when the target text is gone. */
export function applyResumeOperations(resumeData, operations) {
  let next = resumeData
  for (const op of operations) {
    next = structuredClone(next)
    if (op.type === 'set_bullet' || op.type === 'remove_bullet') {
      const [i, b] = findLine(next, op)
      const lines = next[op.section][i][linesOf(op.section)]
      if (op.type === 'set_bullet') lines[b] = op.value
      else {
        if (lines.length <= 1) throw new StaleOperationError('That entry has only one bullet left.')
        lines.splice(b, 1)
      }
    } else if (op.type === 'remove_item') {
      const at = findItem(next, op)
      if (next[op.section].length <= 1) throw new StaleOperationError('That is now the only entry in the section.')
      next[op.section].splice(at, 1)
    } else if (op.type === 'move_item') {
      const at = findItem(next, op)
      const [item] = next[op.section].splice(at, 1)
      next[op.section].splice(Math.min(op.toIndex, next[op.section].length), 0, item)
    } else if (op.type === 'remove_list_entry') {
      const list = next[op.target] ?? []
      const at = list.findIndex(entry => textMatches(entry, op.expect))
      if (at < 0) throw new StaleOperationError()
      list.splice(at, 1)
    } else if (op.type === 'remove_skill') {
      const list = next.skills?.[op.category] ?? []
      // The exact spelling first, so removing a duplicate "git" keeps "Git".
      const exact = list.lastIndexOf(op.value)
      const at = exact >= 0 ? exact : list.findIndex(skill => fingerprint(skill) === fingerprint(op.value))
      if (at < 0) throw new StaleOperationError()
      list.splice(at, 1)
    } else if (op.type === 'remove_link') {
      const links = next.links ?? []
      const at = textMatches(links[op.linkIndex]?.url, op.expect) || textMatches(links[op.linkIndex]?.label, op.expect)
        ? op.linkIndex
        : links.findIndex(link => textMatches(link.url, op.expect) || textMatches(link.label, op.expect))
      if (at < 0) throw new StaleOperationError()
      links.splice(at, 1)
    }
  }
  return next
}

/** Apply section and layout operations to a presentation object. Pure. */
export function applyPresentationOperations(presentation = {}, operations) {
  let next = presentation
  for (const op of operations) {
    if (SECTION_OPERATIONS.has(op.type)) {
      const current = normalizeSectionSettings(next.sections)
      const settings = { hidden: { ...(current.hidden ?? {}) }, titles: { ...(current.titles ?? {}) }, order: current.order ?? [] }
      if (op.type === 'hide_section') settings.hidden[op.section] = true
      if (op.type === 'show_section') delete settings.hidden[op.section]
      if (op.type === 'rename_section') settings.titles[op.section] = op.title
      if (op.type === 'reorder_sections') settings.order = applySectionOrder(CONFIGURABLE_SECTIONS, op.order)
      const sections = normalizeSectionSettings(settings)
      const { sections: _old, ...rest } = next
      next = Object.keys(sections).length ? { ...rest, sections } : rest
    } else if (op.type === 'set_layout') {
      const layout = mergeLayout(next.layout, op)
      const { layout: _old, ...rest } = next
      next = Object.keys(layout).length ? { ...rest, layout } : rest
    }
  }
  return next
}

/** Removal counts for a list of operations, used to cap how much one turn may remove. */
export function countRemovals(operations) {
  return operations.reduce((counts, op) => {
    if (op.type === 'remove_bullet') counts.bullets += 1
    else if (op.type === 'remove_item') counts.items += 1
    else if (REMOVAL_OPERATIONS.has(op.type)) counts.other += 1
    return counts
  }, { bullets: 0, items: 0, other: 0 })
}
