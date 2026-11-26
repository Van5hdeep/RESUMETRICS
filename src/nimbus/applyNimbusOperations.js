// Turns validated NIMBUS operations into editor changes. Pure: the caller applies the result to state.
import { applyResumeEditPlan } from '../utils/applyResumeEditPlan.js'
import { CONTENT_OPERATIONS } from '../../shared/nimbusPlan.js'
import { LAYOUT_OPERATIONS, RESUME_CONTENT_OPERATIONS, SECTION_OPERATIONS, applyPresentationOperations, applyResumeOperations } from '../../shared/nimbusResumeOps.js'
import { rangeHasMark, stripMarks, toggleMarkInRange } from '../editor/inlineMarks.js'

const groupPatterns = {
  name: /^resume\.header\.name$/,
  headline: /^resume\.header\.headline$/,
  contact: /^resume\.header\.(email|phone|location|link\.\d+)$/,
  headings: /^section\.[^.]+\.heading$/,
  summary: /^summary$/,
  'job-titles': /^experience\.[^.]+\.role$/,
  companies: /^experience\.[^.]+\.company$/,
  dates: /\.(startDate|endDate)$/,
  bullets: /^(experience|projects|education)\.[^.]+\.(bullets|details)\.\d+$/,
  skills: /^skills(\.|$)/,
  'education-degrees': /^education\.[^.]+\.degree$/,
  'project-names': /^projects\.[^.]+\.name$/
}

/** Element ids a target ("group:headings" or one id) refers to, given the ids on the page. */
export function resolveTarget(target, elementIds) {
  if (!String(target).startsWith('group:')) return elementIds.includes(target) ? [target] : []
  const pattern = groupPatterns[target.slice(6)]
  return pattern ? elementIds.filter(id => pattern.test(id)) : []
}

const readPath = (source, path) => path.split('.').reduce((current, key) => current?.[/^\d+$/.test(key) ? Number(key) : key], source)
const writePath = (source, path, value) => {
  const next = structuredClone(source)
  const keys = path.split('.')
  const parent = keys.slice(0, -1).reduce((current, key) => current[/^\d+$/.test(key) ? Number(key) : key], next)
  parent[/^\d+$/.test(keys.at(-1)) ? Number(keys.at(-1)) : keys.at(-1)] = value
  return next
}

/**
 * state: { resumeData, presentation? }. Returns { resumeData, presentation, presentationOps, global, fitOnePage, changed }.
 * presentation carries section settings and page layout after section/layout operations (same object when untouched).
 * global may contain fontFamily, baseSize, textColor, accent, resetAll.
 * options.fontFamilyForId maps a catalogue font id to its CSS family string.
 * Throws StaleOperationError when an operation's `expect` text is no longer on the resume.
 */
export function applyNimbusOperations(state, operations, { elementIds = [], fontFamilyForId = id => id } = {}) {
  let resumeData = state.resumeData
  let presentation = state.presentation ?? {}
  const presentationOps = []
  const global = {}
  let fitOnePage = false
  const contentOps = []
  const flushContent = () => {
    if (!contentOps.length) return
    resumeData = applyResumeEditPlan({ resumeData, plan: { status: 'ready', message: 'NIMBUS', operations: contentOps.splice(0) } }).resumeData
  }
  for (const operation of operations) {
    if (CONTENT_OPERATIONS.has(operation.type)) { contentOps.push(operation); continue }
    flushContent()
    if (RESUME_CONTENT_OPERATIONS.has(operation.type)) { resumeData = applyResumeOperations(resumeData, [operation]); continue }
    if (SECTION_OPERATIONS.has(operation.type) || LAYOUT_OPERATIONS.has(operation.type)) { presentation = applyPresentationOperations(presentation, [operation]); continue }
    if (operation.type === 'apply_marks') {
      const value = readPath(resumeData, operation.path)
      if (typeof value !== 'string') continue
      const start = stripMarks(value).indexOf(operation.text)
      if (start < 0) continue
      const end = start + operation.text.length
      // NIMBUS only adds marks; it never toggles one off by accident.
      if (!rangeHasMark(value, start, end, operation.mark)) resumeData = writePath(resumeData, operation.path, toggleMarkInRange(value, start, end, operation.mark))
    } else if (operation.type === 'set_element_style') {
      const { fontId, ...rest } = operation.changes
      const changes = { ...rest, ...(fontId !== undefined ? { fontFamily: fontId === null ? null : fontFamilyForId(fontId) } : {}) }
      resolveTarget(operation.target, elementIds).forEach(target => presentationOps.push({ type: 'set_style', target, changes }))
    } else if (operation.type === 'set_resume_style') {
      if (operation.fontId) global.fontFamily = fontFamilyForId(operation.fontId)
      if (operation.baseSize) global.baseSize = operation.baseSize
      if (operation.textColor) global.textColor = operation.textColor
      const resumeChanges = {}
      if (operation.lineHeight != null) resumeChanges.lineHeight = operation.lineHeight
      if (operation.letterSpacing != null) resumeChanges.letterSpacing = operation.letterSpacing
      if (Object.keys(resumeChanges).length) presentationOps.push({ type: 'set_style', target: 'resume', changes: resumeChanges })
    } else if (operation.type === 'set_accent') {
      global.accent = operation.hex
    } else if (operation.type === 'reset_style') {
      if (operation.scope === 'all') { global.resetAll = true; presentationOps.push({ type: 'clear_style', target: '*' }) }
      else resolveTarget(operation.target, elementIds).forEach(target => presentationOps.push({ type: 'clear_style', target }))
    } else if (operation.type === 'fit_one_page') {
      fitOnePage = true
    } else if (operation.type === 'set_template') {
      // Only from a template option card the server validated (never a model operation on its own).
      global.templateId = operation.templateId
    }
  }
  flushContent()
  const presentationChanged = presentation !== (state.presentation ?? {})
  return { resumeData, presentation, presentationChanged, presentationOps, global, fitOnePage, changed: resumeData !== state.resumeData || presentationChanged || presentationOps.length > 0 || Object.keys(global).length > 0 }
}

/** The operations that apply one of NIMBUS's option cards. */
export function optionToOperations(options, choice) {
  const target = options.target ?? 'resume'
  const elementTarget = target.startsWith('element:') ? target.slice(8) : null
  if (options.kind === 'template') return [{ type: 'set_template', templateId: choice.templateId }]
  if (options.kind === 'font') {
    if (target === 'resume') return [{ type: 'set_resume_style', fontId: choice.fontId }]
    return [{ type: 'set_element_style', target: elementTarget ?? (target === 'name' ? 'group:name' : 'group:headings'), changes: { fontId: choice.fontId } }]
  }
  if (options.kind === 'colour') {
    if (target === 'accent') return [{ type: 'set_accent', hex: choice.hex }]
    if (target === 'text' || target === 'resume') return [{ type: 'set_resume_style', textColor: choice.hex }]
    return [{ type: 'set_element_style', target: elementTarget ?? (target === 'name' ? 'group:name' : 'group:headings'), changes: { color: choice.hex } }]
  }
  return [
    { type: 'set_element_style', target: 'group:headings', changes: { color: choice.heading } },
    { type: 'set_accent', hex: choice.accent },
    { type: 'set_resume_style', textColor: choice.text }
  ]
}
