// NIMBUS v2 turn contract, validated on the server (and re-checked on the client before applying).
// A turn is one of: edit (ordered steps of operations), options (visual choices), question, conversation, refuse.
import { validateResumeEditPlan } from './resumeEditPlan.js'
import { describeInventedFacts, findInventedFacts } from './factGuard.js'
import { LAYOUT_OPERATIONS, RESUME_CONTENT_OPERATIONS, SECTION_OPERATIONS, countRemovals, validateResumeOperation } from './nimbusResumeOps.js'

export class NimbusPlanError extends Error {
  constructor(message) {
    super(message)
    this.name = 'NimbusPlanError'
  }
}

export const MODES = ['edit', 'suggest', 'options', 'question', 'conversation', 'refuse']
export const ITEM_KINDS = ['rewrite', 'trim', 'remove', 'add', 'reorder', 'style', 'layout', 'info']
export const MAX_ITEMS = 8
export const MAX_ITEM_OPERATIONS = 6
export const CONTENT_OPERATIONS = new Set(['set_field', 'clear_field', 'set_item_field', 'append_bullets', 'replace_bullets', 'append_details', 'replace_details', 'append_skills', 'replace_skills', 'append_list', 'replace_list', 'set_link', 'append_link', 'replace_links', 'set_footer', 'clear_footer'])
export const STYLE_OPERATIONS = new Set(['set_element_style', 'apply_marks', 'set_resume_style', 'set_accent', 'reset_style', 'fit_one_page'])
// Named groups the client resolves to element ids on the page (see src/nimbus/elementGroups.js).
export const ELEMENT_GROUPS = ['name', 'headline', 'contact', 'headings', 'summary', 'job-titles', 'companies', 'dates', 'bullets', 'skills', 'education-degrees', 'project-names']
export const STYLE_PROPERTIES = ['fontId', 'fontWeight', 'fontStyle', 'textDecoration', 'color', 'textAlign', 'lineHeight', 'letterSpacing', 'fontScale']
export const MIN_READABLE_BASE_SIZE = 12 // px on an A4 page = 9pt
export const MAX_STEPS = 8
// Operations that only change the resume's words or structure (the rest change its design).
export const RESUME_OPERATIONS = new Set([...CONTENT_OPERATIONS, ...RESUME_CONTENT_OPERATIONS])
const isExtraOperation = type => RESUME_CONTENT_OPERATIONS.has(type) || SECTION_OPERATIONS.has(type) || LAYOUT_OPERATIONS.has(type)

const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null
const text = (value, field, max = 600, allowEmpty = false) => {
  if (typeof value !== 'string') throw new NimbusPlanError(`${field} must be text.`)
  const cleaned = value.trim()
  if (!allowEmpty && !cleaned) throw new NimbusPlanError(`${field} cannot be empty.`)
  if (cleaned.length > max) throw new NimbusPlanError(`${field} is too long.`)
  return cleaned
}
const isHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())
const luminance = hex => {
  const channel = value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const [r, g, b] = [1, 3, 5].map(index => channel(parseInt(hex.slice(index, index + 2), 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrastOnWhite = hex => 1.05 / (luminance(hex) + 0.05)

function textValuesOf(operation) {
  const values = []
  if (typeof operation.value === 'string') values.push(operation.value)
  if (Array.isArray(operation.values)) values.push(...operation.values.filter(item => typeof item === 'string'))
  if (operation.value && typeof operation.value === 'object') values.push(operation.value.url ?? '', operation.value.label ?? '')
  if (Array.isArray(operation.values)) operation.values.forEach(item => { if (item && typeof item === 'object') values.push(item.url ?? '', item.label ?? '') })
  return values.filter(Boolean)
}

function validateStyleChanges(changes, { fontIds, headingLike }) {
  const input = asObject(changes)
  if (!input) throw new NimbusPlanError('changes must be an object.')
  const output = {}
  for (const [key, value] of Object.entries(input)) {
    if (!STYLE_PROPERTIES.includes(key)) throw new NimbusPlanError(`Unsupported style property ${key}. For one element's size use fontScale (0.7–1.6); the whole resume's size is set_resume_style.baseSize.`)
    if (value === null) { output[key] = null; continue }
    if (key === 'fontId' && !fontIds.has(value)) throw new NimbusPlanError(`Unknown fontId ${value}; use an id from the font catalogue.`)
    if (key === 'fontWeight' && ![300, 400, 500, 600, 700, 800].includes(value)) throw new NimbusPlanError('fontWeight must be 300–800 in steps of 100.')
    if (key === 'fontStyle' && !['normal', 'italic'].includes(value)) throw new NimbusPlanError('fontStyle must be normal or italic.')
    if (key === 'textDecoration' && !['none', 'underline', 'line-through', 'underline line-through'].includes(value)) throw new NimbusPlanError('Invalid textDecoration.')
    if (key === 'textAlign' && !['left', 'center', 'right', 'justify'].includes(value)) throw new NimbusPlanError('Invalid textAlign.')
    if (key === 'lineHeight' && !(Number.isFinite(value) && value >= 0.9 && value <= 2.5)) throw new NimbusPlanError('lineHeight must be between 0.9 and 2.5.')
    if (key === 'letterSpacing' && !(Number.isFinite(value) && value >= -1 && value <= 4)) throw new NimbusPlanError('letterSpacing must be between -1 and 4 px.')
    if (key === 'fontScale' && !(Number.isFinite(value) && value >= 0.7 && value <= 1.6)) throw new NimbusPlanError('fontScale must be between 0.7 and 1.6 (1 = the template size).')
    if (key === 'color') {
      if (!isHex(value)) throw new NimbusPlanError('color must be #rrggbb.')
      const needed = headingLike ? 3 : 4.5
      if (contrastOnWhite(value) < needed) throw new NimbusPlanError(`Colour ${value} is too light to read (contrast ${contrastOnWhite(value).toFixed(1)}:1, needs ${needed}:1).`)
    }
    output[key] = value
  }
  if (!Object.keys(output).length) throw new NimbusPlanError('changes cannot be empty.')
  return output
}

function validateOperation(operation, context) {
  const op = asObject(operation)
  if (!op || typeof op.type !== 'string') throw new NimbusPlanError('Every operation needs a type.')
  if (context.contentOnly && !CONTENT_OPERATIONS.has(op.type)) throw new NimbusPlanError(`${op.type} is not available here. Answer in conversation mode and point the user to the Format panel.`)
  if (isExtraOperation(op.type)) {
    const clean = validateResumeOperation(op, { resumeData: context.resumeData, sections: context.sections }, message => { throw new NimbusPlanError(message) })
    if (typeof clean.value === 'string') {
      const invented = findInventedFacts(clean.value, context.sourceText)
      if (invented.length) throw new NimbusPlanError(`This change adds ${describeInventedFacts(invented)}, which is not in the resume or the request. Only reword existing facts or ask the user.`)
    }
    return clean
  }
  if (CONTENT_OPERATIONS.has(op.type)) {
    const [clean] = validateResumeEditPlan({ status: 'ready', message: 'step', operations: [op] }, context.resumeData).operations
    // A few words replacing a full summary is almost always a heading rename gone wrong ("About Me").
    const words = value => String(value ?? '').replace(/\[\/?[bius]\]/g, '').trim().split(/\s+/).filter(Boolean).length
    if (clean.type === 'set_field' && clean.target === 'summary' && words(clean.value) <= 5 && words(context.resumeData?.summary) >= 12) {
      throw new NimbusPlanError(`This would replace the whole summary with "${clean.value}". To rename the Summary heading use rename_section; to shorten the summary keep at least one full sentence.`)
    }
    const invented = textValuesOf(clean).flatMap(value => findInventedFacts(value, context.sourceText))
    if (invented.length) throw new NimbusPlanError(`This change adds ${describeInventedFacts(invented)}, which is not in the resume or the request. Only reword existing facts or ask the user.`)
    return clean
  }
  if (op.type === 'set_element_style') {
    const target = text(op.target, 'target', 200)
    const isGroup = target.startsWith('group:')
    if (isGroup && !ELEMENT_GROUPS.includes(target.slice(6))) throw new NimbusPlanError(`Unknown element group ${target}.`)
    if (!isGroup && !context.elementIds.has(target)) throw new NimbusPlanError(`Element ${target} is not on the resume.`)
    const headingLike = /heading|name|headline|job-titles|project-names|education-degrees/.test(target)
    return { type: op.type, target, changes: validateStyleChanges(op.changes, { fontIds: context.fontIds, headingLike }) }
  }
  if (op.type === 'apply_marks') {
    const path = text(op.path, 'path', 200)
    const value = String(path).split('.').reduce((current, key) => current?.[/^\d+$/.test(key) ? Number(key) : key], context.resumeData)
    if (typeof value !== 'string') throw new NimbusPlanError(`apply_marks path ${path} must point to a text field.`)
    const phrase = text(op.text, 'text', 300)
    if (!value.replace(/\[\/?[bius]\]/g, '').includes(phrase)) throw new NimbusPlanError(`"${phrase}" does not appear in ${path}.`)
    if (!['b', 'i', 'u', 's'].includes(op.mark)) throw new NimbusPlanError('mark must be b, i, u or s.')
    return { type: op.type, path, text: phrase, mark: op.mark }
  }
  if (op.type === 'set_resume_style') {
    const output = {}
    if (op.fontId != null) { if (!context.fontIds.has(op.fontId) || !context.bodyFontIds.has(op.fontId)) throw new NimbusPlanError(`fontId ${op.fontId} is not a body font in the catalogue.`); output.fontId = op.fontId }
    if (op.baseSize != null) {
      if (!Number.isFinite(op.baseSize) || op.baseSize > 18) throw new NimbusPlanError('baseSize must be a number up to 18 (px; 13.33px = 10pt).')
      if (op.baseSize < MIN_READABLE_BASE_SIZE) throw new NimbusPlanError(`baseSize below ${MIN_READABLE_BASE_SIZE}px is too small to read; keep it at or above that and tell the user.`)
      output.baseSize = Math.round(op.baseSize * 2) / 2
    }
    if (op.textColor != null) {
      if (!isHex(op.textColor) || contrastOnWhite(op.textColor) < 4.5) throw new NimbusPlanError('textColor must be a dark #rrggbb with at least 4.5:1 contrast.')
      output.textColor = op.textColor
    }
    if (op.lineHeight != null) { if (!(op.lineHeight >= 0.9 && op.lineHeight <= 2.5)) throw new NimbusPlanError('lineHeight must be between 0.9 and 2.5.'); output.lineHeight = op.lineHeight }
    if (op.letterSpacing != null) { if (!(op.letterSpacing >= -1 && op.letterSpacing <= 4)) throw new NimbusPlanError('letterSpacing must be between -1 and 4.'); output.letterSpacing = op.letterSpacing }
    if (!Object.keys(output).length) throw new NimbusPlanError('set_resume_style needs at least one change.')
    return { type: op.type, ...output }
  }
  if (op.type === 'set_accent') {
    if (!isHex(op.hex) || contrastOnWhite(op.hex) < 3) throw new NimbusPlanError('Accent must be #rrggbb with at least 3:1 contrast on white.')
    return { type: op.type, hex: op.hex }
  }
  if (op.type === 'reset_style') {
    const scope = op.scope === 'element' ? 'element' : 'all'
    if (scope === 'element' && !context.elementIds.has(op.target) && !String(op.target ?? '').startsWith('group:')) throw new NimbusPlanError('reset_style element target is not on the resume.')
    return scope === 'element' ? { type: op.type, scope, target: op.target } : { type: op.type, scope }
  }
  if (op.type === 'fit_one_page') return { type: op.type }
  throw new NimbusPlanError(`Unsupported operation ${op.type}.`)
}

function validateOptions(options, context) {
  const input = asObject(options)
  if (!input) throw new NimbusPlanError('options must be an object.')
  const kind = input.kind
  if (!['font', 'colour', 'palette', 'template'].includes(kind)) throw new NimbusPlanError('options.kind must be font, colour, palette or template.')
  if (kind === 'template') {
    const ids = context.templateIds ?? new Set()
    if (!ids.size) throw new NimbusPlanError('Template options are not available for this request.')
    const choices = Array.isArray(input.choices) ? input.choices : []
    if (choices.length < 2 || choices.length > 4) throw new NimbusPlanError('Give between 2 and 4 templates.')
    const clean = choices.map((choice, index) => {
      const item = asObject(choice) ?? {}
      if (!ids.has(item.templateId)) throw new NimbusPlanError(`choices[${index}].templateId ${item.templateId} is not in TEMPLATES.`)
      if (item.templateId === context.currentTemplateId) throw new NimbusPlanError('Do not offer the template already in use.')
      return { templateId: item.templateId, why: text(item.why ?? '', `choices[${index}].why`, 160, true) }
    })
    if (new Set(clean.map(choice => choice.templateId)).size !== clean.length) throw new NimbusPlanError('Choices must all be different.')
    return { kind, target: 'resume', prompt: text(input.prompt ?? 'Hover to preview, press to switch.', 'options.prompt', 200), choices: clean }
  }
  const target = text(input.target ?? 'resume', 'options.target', 120)
  const choices = Array.isArray(input.choices) ? input.choices : []
  if (choices.length < 3 || choices.length > 6) throw new NimbusPlanError('Give between 3 and 6 choices.')
  const cleanChoices = choices.map((choice, index) => {
    const item = asObject(choice)
    if (!item) throw new NimbusPlanError(`choices[${index}] must be an object.`)
    const why = text(item.why ?? '', `choices[${index}].why`, 160, true)
    if (kind === 'font') {
      if (!context.fontIds.has(item.fontId)) throw new NimbusPlanError(`choices[${index}].fontId ${item.fontId} is not in the font catalogue.`)
      if (target === 'resume' && !context.bodyFontIds.has(item.fontId)) throw new NimbusPlanError(`${item.fontId} is a display font; offer body fonts for the whole resume.`)
      if (item.fontId === context.currentFontId) throw new NimbusPlanError('Do not offer the font that is already in use.')
      return { fontId: item.fontId, why }
    }
    if (kind === 'colour') {
      if (!isHex(item.hex)) throw new NimbusPlanError(`choices[${index}].hex must be #rrggbb.`)
      const needed = /text|body|resume/.test(target) ? 4.5 : 3
      if (contrastOnWhite(item.hex) < needed) throw new NimbusPlanError(`choices[${index}] ${item.hex} is too light for ${target}.`)
      return { hex: item.hex.toLowerCase(), name: text(item.name ?? item.hex, `choices[${index}].name`, 40), why }
    }
    for (const key of ['heading', 'accent', 'text']) if (!isHex(item[key])) throw new NimbusPlanError(`choices[${index}].${key} must be #rrggbb.`)
    if (contrastOnWhite(item.text) < 4.5 || contrastOnWhite(item.heading) < 3 || contrastOnWhite(item.accent) < 3) throw new NimbusPlanError(`choices[${index}] has a colour that is too light.`)
    return { heading: item.heading, accent: item.accent, text: item.text, name: text(item.name ?? 'Palette', `choices[${index}].name`, 40), why }
  })
  const keys = cleanChoices.map(choice => choice.fontId ?? choice.hex ?? `${choice.heading}${choice.accent}${choice.text}`)
  if (new Set(keys).size !== keys.length) throw new NimbusPlanError('Choices must all be different.')
  return { kind, target, prompt: text(input.prompt ?? 'Pick one to apply.', 'options.prompt', 200), choices: cleanChoices }
}

// Models sometimes write a step as a bare operation, a list of operations, or a plain string. Accept the first two
// (wrapped into a step) and drop strings, rather than rejecting the whole turn.
function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return []
  return steps.flatMap(step => {
    if (Array.isArray(step)) return step.length ? [{ title: 'Change', operations: step }] : []
    const item = asObject(step)
    if (!item) return []
    if (typeof item.type === 'string' && !item.operations) return [{ title: typeof item.title === 'string' ? item.title : 'Change', operations: [item] }]
    if (item.operation && !item.operations) return [{ ...item, operations: [item.operation] }]
    return [item]
  })
}

// One turn may not strip the resume: at most 40% of its bullets and half of its entries (always at least one).
function checkRemovalLimits(operations, resumeData = {}) {
  const removed = countRemovals(operations)
  const sections = ['experience', 'projects', 'education']
  const totalItems = sections.reduce((sum, key) => sum + (resumeData[key]?.length ?? 0), 0)
  const totalBullets = sections.reduce((sum, key) => sum + (resumeData[key] ?? []).reduce((count, item) => count + (item.bullets?.length ?? item.details?.length ?? 0), 0), 0)
  if (removed.bullets > Math.max(1, Math.floor(totalBullets * 0.4))) throw new NimbusPlanError('That removes too many bullets at once. Suggest trimming instead, or fewer removals.')
  if (removed.items > Math.max(1, Math.floor(totalItems * 0.5))) throw new NimbusPlanError('That removes too many entries at once. Suggest fewer removals, or hiding a section.')
}

const cleanQuestion = (value, fallback) => {
  const question = asObject(value) ?? {}
  const quickReplies = Array.isArray(question.quickReplies) ? question.quickReplies.filter(item => typeof item === 'string' && item.trim()).slice(0, 4).map(item => item.trim().slice(0, 60)) : []
  return { text: text(question.text ?? fallback, 'question.text', 400), quickReplies }
}

/**
 * Suggestion items (D38), each applied by the user with its arrow. An item carries exactly one of
 * operations (ready: applied with no AI call), instruction (deferred: one focused turn on press) or question (needs a fact).
 * A ready item whose operations fail validation becomes deferred, unless most items fail (then the model repairs the list).
 * Pro items (pro: true) are locked for free accounts: they keep their title and why, and lose their action.
 */
// Suggestions NIMBUS may not make on its own, whatever the model says (a person can still ask for them directly).
// Education entries of every level, achievements and extracurriculars, whole sections and genuine skills stay.
const REMOVES_KEPT_CONTENT = /\b(remove|delete|drop|hide|cut)\b[^.]*\b(school|class\s*(x|10|xii|12)|education|degree|extra-?curricular|activities|achievements?|section)\b/i
function illegitimate(raw, resumeData = {}) {
  if (typeof raw.instruction === 'string' && REMOVES_KEPT_CONTENT.test(raw.instruction)) return true
  if (typeof raw.title === 'string' && /^(remove|delete|drop|hide)\b/i.test(raw.title) && REMOVES_KEPT_CONTENT.test(raw.title)) return true
  return (Array.isArray(raw.operations) ? raw.operations : []).some(op => {
    if (!op || typeof op !== 'object') return false
    if (op.type === 'remove_item' || op.type === 'hide_section') return true
    if (op.type === 'remove_list_entry' && op.target === 'achievements') return true
    if (op.type === 'remove_skill') {
      // Only a duplicate or a generic soft skill may be suggested for removal.
      const all = Object.values(resumeData.skills ?? {}).flat().map(skill => String(skill).toLowerCase().trim())
      return op.category !== 'softSkills' && all.filter(skill => skill === String(op.value ?? '').toLowerCase().trim()).length < 2
    }
    return false
  })
}

function validateItems(items, context, { min = 1, max = MAX_ITEMS } = {}) {
  if (!Array.isArray(items) || items.length < min || items.length > max) throw new NimbusPlanError(`items must hold ${min}–${max} entries.`)
  const allowed = items.filter(raw => !(raw && typeof raw === 'object' && illegitimate(raw, context.resumeData)))
  if (!allowed.length) throw new NimbusPlanError('Those suggestions remove content that stays on a resume (education entries of any level, achievements and extracurriculars, whole sections, genuine skills). Suggest real improvements instead, or say nothing needs removing.')
  items = allowed
  let failures = 0
  const errors = []
  const output = items.map((raw, index) => {
    const item = asObject(raw)
    if (!item) throw new NimbusPlanError(`items[${index}] must be an object.`)
    const base = {
      id: `i${index + 1}`,
      title: text(item.title, `items[${index}].title`, 120),
      why: text(item.why ?? '', `items[${index}].why`, 240, true),
      kind: ITEM_KINDS.includes(item.kind) ? item.kind : 'rewrite',
      impact: ['high', 'medium', 'low'].includes(item.impact) ? item.impact : 'medium',
      ...(typeof item.target === 'string' && item.target.trim() ? { target: item.target.trim().slice(0, 160) } : {})
    }
    const actions = ['operations', 'instruction', 'question'].filter(key => item[key] != null && item[key] !== '' && !(Array.isArray(item[key]) && !item[key].length))
    if (actions.length !== 1) throw new NimbusPlanError(`items[${index}] needs exactly one of operations, instruction or question.`)
    if (item.pro === true && context.plan !== 'pro') return { ...base, locked: true }
    if (actions[0] === 'question') return { ...base, question: cleanQuestion(typeof item.question === 'string' ? { text: item.question } : item.question, base.title) }
    if (actions[0] === 'instruction') return { ...base, instruction: text(item.instruction, `items[${index}].instruction`, 600) }
    const operations = item.operations
    if (!Array.isArray(operations) || operations.length > MAX_ITEM_OPERATIONS) throw new NimbusPlanError(`items[${index}].operations must hold 1–${MAX_ITEM_OPERATIONS} operations.`)
    try {
      return { ...base, operations: operations.map(operation => validateOperation(operation, context)) }
    } catch (error) {
      if (!(error instanceof NimbusPlanError)) throw error
      failures += 1
      errors.push(`items[${index}]: ${error.message}`)
      return { ...base, instruction: `${base.title}. ${base.why}`.trim().slice(0, 600) }
    }
  })
  if (failures && failures * 2 > output.length) throw new NimbusPlanError(errors.slice(0, 3).join(' '))
  checkRemovalLimits(output.flatMap(item => item.operations ?? []), context.resumeData)
  return output
}

/**
 * context: { resumeData, sourceText, elementIds:Set, fontIds:Set, bodyFontIds:Set, currentFontId, sections, plan, contentOnly }
 */
export function validateNimbusTurn(value, context) {
  const turn = asObject(value)
  if (!turn || !MODES.includes(turn.mode)) throw new NimbusPlanError(`mode must be one of ${MODES.join(', ')}.`)
  // An "options" reply that carries steps instead of real option cards (e.g. kind "layout") is an edit.
  if (turn.mode === 'options' && Array.isArray(turn.steps) && turn.steps.length && !['font', 'colour', 'palette', 'template'].includes(turn.options?.kind)) turn.mode = 'edit'
  const message = text(turn.message ?? '', 'message', 900, turn.mode === 'edit')
  if (turn.mode === 'edit') {
    const steps = normalizeSteps(turn.steps)
    if (!steps.length || steps.length > MAX_STEPS) throw new NimbusPlanError(`An edit needs 1–${MAX_STEPS} steps, each {"title","operations":[...]}.`)
    // Each step stands alone: a step the checks reject is dropped and reported (skipped), so one bad part of a
    // multi-part request never throws away the parts that were fine. Only when every step fails must the model repair.
    const cleanSteps = []
    const skipped = []
    steps.forEach((item, index) => {
      const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim().slice(0, 120) : `Step ${index + 1}`
      try {
        const operations = Array.isArray(item.operations) ? item.operations : []
        if (!operations.length || operations.length > 20) throw new NimbusPlanError(`steps[${index}] needs 1–20 operations.`)
        cleanSteps.push({ title, operations: operations.map(operation => validateOperation(operation, context)) })
      } catch (error) {
        if (!(error instanceof NimbusPlanError)) throw error
        skipped.push({ title, reason: error.message, index })
      }
    })
    if (!cleanSteps.length || (skipped.length && context.strictSteps)) throw new NimbusPlanError(skipped.map(step => `steps[${step.index}] (${step.title}): ${step.reason}`).slice(0, 3).join(' '))
    checkRemovalLimits(cleanSteps.flatMap(step => step.operations), context.resumeData)
    // Parts of a request that need confirming (a removal) or a fact ride along as up to 3 items.
    let items = []
    try {
      items = Array.isArray(turn.items) && turn.items.length && !context.contentOnly ? validateItems(turn.items, context, { max: 3 }) : []
    } catch (error) {
      if (!(error instanceof NimbusPlanError)) throw error
    }
    return { mode: 'edit', message, steps: cleanSteps, ...(items.length ? { items } : {}), ...(skipped.length ? { skipped: skipped.map(({ title, reason }) => ({ title, reason })) } : {}) }
  }
  if (turn.mode === 'suggest') {
    if (context.contentOnly) throw new NimbusPlanError('Suggestion lists are not available here; use edit, question or conversation.')
    if (!message) throw new NimbusPlanError('message cannot be empty.')
    return { mode: 'suggest', message, items: validateItems(turn.items, context) }
  }
  if (turn.mode === 'options') {
    if (context.contentOnly) throw new NimbusPlanError('Design options are not offered; use conversation mode and point to the Format panel.')
    return { mode: 'options', message, options: validateOptions(turn.options, context) }
  }
  if (turn.mode === 'question') return { mode: 'question', message, question: cleanQuestion(turn.question, message) }
  if (!message) throw new NimbusPlanError('message cannot be empty.')
  return { mode: turn.mode, message }
}

/** Validate one operation outside a turn (JD fixes reuse NIMBUS operations). */
export const validateNimbusOperation = validateOperation
