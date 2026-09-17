const editStatuses = new Set(['ready', 'needs_clarification', 'rejected', 'no_changes', 'conversation'])
const topLevelFields = new Map([
  ['fullName', 160],
  ['headline', 200],
  ['email', 320],
  ['phone', 80],
  ['location', 200],
  ['summary', 4_000]
])
const itemFields = {
  experience: new Map([['role', 200], ['company', 200], ['location', 200], ['startDate', 80], ['endDate', 80]]),
  projects: new Map([['name', 200], ['description', 2_000]]),
  education: new Map([['degree', 240], ['institution', 240], ['location', 200], ['startDate', 80], ['endDate', 80]])
}
const bulletSections = new Set(['experience', 'projects'])
const detailSections = new Set(['education'])
const listTargets = new Set(['certifications', 'achievements'])
const skillCategories = new Set(['languages', 'frameworks', 'tools', 'databases', 'softSkills', 'other'])
const fontFamilies = new Set(['inter', 'dm-sans', 'space-grotesk', 'merriweather', 'georgia', 'arial'])
const fontSizes = new Set([12, 14, 16, 18, 20, 24])
const resetStyleTargets = new Set(['fontFamily', 'fontSize', 'textColor', 'all'])

export class ResumeEditPlanError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ResumeEditPlanError'
  }
}

const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null

function cleanText(value, fieldName, maxLength, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw new ResumeEditPlanError(`${fieldName} must be text.`)
  const cleaned = value.trim()
  if (!allowEmpty && !cleaned) throw new ResumeEditPlanError(`${fieldName} cannot be empty.`)
  if (cleaned.length > maxLength) throw new ResumeEditPlanError(`${fieldName} is too long.`)
  return cleaned
}

function cleanTextList(value, fieldName, { maxItems = 24, maxLength = 1_000 } = {}) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
    throw new ResumeEditPlanError(`${fieldName} must contain between 1 and ${maxItems} entries.`)
  }
  return value.map((item, index) => cleanText(item, `${fieldName}[${index}]`, maxLength))
}

function cleanLink(value, fieldName) {
  const link = asObject(value)
  if (!link) throw new ResumeEditPlanError(`${fieldName} must be a link object.`)
  const url = cleanText(link.url, `${fieldName}.url`, 500)
  const label = cleanText(link.label ?? url, `${fieldName}.label`, 160)
  return { label, url }
}

function cleanLinks(value, fieldName) {
  if (!Array.isArray(value) || value.length > 12) throw new ResumeEditPlanError(`${fieldName} must contain at most 12 links.`)
  return value.map((item, index) => cleanLink(item, `${fieldName}[${index}]`))
}

function cleanIndex(value, section, resumeData) {
  if (!Number.isInteger(value) || value < 0) throw new ResumeEditPlanError('itemIndex must be a non-negative integer.')
  const items = resumeData?.[section]
  if (!Array.isArray(items) || value >= items.length) throw new ResumeEditPlanError(`The requested ${section} item does not exist.`)
  return value
}

function normalizeOperation(value, resumeData) {
  const operation = asObject(value)
  if (!operation || typeof operation.type !== 'string') throw new ResumeEditPlanError('Each edit operation must have a valid type.')

  if (operation.type === 'set_field') {
    if (!topLevelFields.has(operation.target)) throw new ResumeEditPlanError('The edit plan targeted an unsupported resume field.')
    return { type: operation.type, target: operation.target, value: cleanText(operation.value, 'value', topLevelFields.get(operation.target)) }
  }

  if (operation.type === 'clear_field') {
    if (!topLevelFields.has(operation.target)) throw new ResumeEditPlanError('The edit plan targeted an unsupported resume field.')
    return { type: operation.type, target: operation.target }
  }

  if (operation.type === 'set_item_field') {
    const fields = itemFields[operation.section]
    if (!fields?.has(operation.field)) throw new ResumeEditPlanError('The edit plan targeted an unsupported section field.')
    return {
      type: operation.type,
      section: operation.section,
      itemIndex: cleanIndex(operation.itemIndex, operation.section, resumeData),
      field: operation.field,
      value: cleanText(operation.value, 'value', fields.get(operation.field))
    }
  }

  if (operation.type === 'append_bullets' || operation.type === 'replace_bullets') {
    if (!bulletSections.has(operation.section)) throw new ResumeEditPlanError('Bullet edits are only supported for experience and projects.')
    return {
      type: operation.type,
      section: operation.section,
      itemIndex: cleanIndex(operation.itemIndex, operation.section, resumeData),
      values: cleanTextList(operation.values, 'values', { maxItems: 12, maxLength: 1_000 })
    }
  }

  if (operation.type === 'append_details' || operation.type === 'replace_details') {
    if (!detailSections.has(operation.section)) throw new ResumeEditPlanError('Detail edits are only supported for education.')
    return {
      type: operation.type,
      section: operation.section,
      itemIndex: cleanIndex(operation.itemIndex, operation.section, resumeData),
      values: cleanTextList(operation.values, 'values', { maxItems: 12, maxLength: 1_000 })
    }
  }

  if (operation.type === 'append_skills' || operation.type === 'replace_skills') {
    if (!skillCategories.has(operation.category)) throw new ResumeEditPlanError('The edit plan used an unsupported skill category.')
    return { type: operation.type, category: operation.category, values: cleanTextList(operation.values, 'values', { maxItems: 30, maxLength: 100 }) }
  }

  if (operation.type === 'append_list' || operation.type === 'replace_list') {
    if (!listTargets.has(operation.target)) throw new ResumeEditPlanError('The edit plan used an unsupported list.')
    return { type: operation.type, target: operation.target, values: cleanTextList(operation.values, 'values', { maxItems: 30, maxLength: 300 }) }
  }

  if (operation.type === 'set_link') {
    return { type: operation.type, linkIndex: cleanIndex(operation.linkIndex, 'links', resumeData), value: cleanLink(operation.value, 'value') }
  }

  if (operation.type === 'append_link') return { type: operation.type, value: cleanLink(operation.value, 'value') }

  if (operation.type === 'replace_links') return { type: operation.type, values: cleanLinks(operation.values, 'values') }

  if (operation.type === 'set_footer') {
    return { type: operation.type, value: cleanText(operation.value, 'value', 240) }
  }

  if (operation.type === 'clear_footer') return { type: operation.type }

  if (operation.type === 'set_style') {
    const normalized = { type: operation.type }
    if (operation.fontFamily !== undefined) {
      if (!fontFamilies.has(operation.fontFamily)) throw new ResumeEditPlanError('The edit plan selected an unsupported font.')
      normalized.fontFamily = operation.fontFamily
    }
    if (operation.fontSize !== undefined) {
      if (!fontSizes.has(operation.fontSize)) throw new ResumeEditPlanError('The edit plan selected an unsupported font size.')
      normalized.fontSize = operation.fontSize
    }
    if (operation.textColor !== undefined) {
      if (typeof operation.textColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(operation.textColor)) throw new ResumeEditPlanError('The edit plan selected an invalid text colour.')
      normalized.textColor = operation.textColor.toLowerCase()
    }
    if (Object.keys(normalized).length === 1) throw new ResumeEditPlanError('A style edit must include at least one supported setting.')
    return normalized
  }

  if (operation.type === 'reset_style') {
    if (!resetStyleTargets.has(operation.target)) throw new ResumeEditPlanError('The edit plan targeted an unsupported style reset.')
    return { type: operation.type, target: operation.target }
  }

  throw new ResumeEditPlanError(`Unsupported edit operation: ${operation.type}`)
}

export function validateResumeEditPlan(value, resumeData) {
  const plan = asObject(value)
  if (!plan || !editStatuses.has(plan.status)) throw new ResumeEditPlanError('The AI returned an invalid edit-plan status.')
  const message = cleanText(plan.message, 'message', 600)
  const operations = Array.isArray(plan.operations) ? plan.operations : []
  if (operations.length > 40) throw new ResumeEditPlanError('The AI returned too many changes in one request.')
  if (plan.status === 'ready' && operations.length === 0) throw new ResumeEditPlanError('A ready edit plan must contain at least one change.')
  if (plan.status !== 'ready' && operations.length > 0) throw new ResumeEditPlanError('A non-ready edit plan cannot contain changes.')
  return { status: plan.status, message, operations: operations.map(operation => normalizeOperation(operation, resumeData)) }
}

export const resumeEditPlanCapabilities = {
  topLevelFields: [...topLevelFields.keys()],
  itemFields: Object.fromEntries(Object.entries(itemFields).map(([section, fields]) => [section, [...fields.keys()]])),
  bulletSections: [...bulletSections],
  detailSections: [...detailSections],
  listTargets: [...listTargets],
  linkOperations: ['set_link', 'append_link', 'replace_links'],
  skillCategories: [...skillCategories],
  fontFamilies: [...fontFamilies],
  fontSizes: [...fontSizes]
}
