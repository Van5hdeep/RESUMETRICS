const validColors = value => typeof value === 'string' && (/^#[0-9a-f]{3,8}$/i.test(value) || /^rgb(a)?\(/.test(value))
const validStyleProperties = new Set(['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'textAlign', 'lineHeight', 'letterSpacing', 'marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'gap', 'backgroundColor', 'borderColor', 'borderWidth', 'borderRadius', 'visibility', 'width', 'height', 'objectFit', 'objectPosition', 'pageSize', 'density', 'spacing', 'alignment'])

const readPath = (target, path) => path.split('.').reduce((value, key) => value?.[key], target)
const writePath = (target, path, value) => {
  const keys = path.split('.')
  const last = keys.pop()
  const parent = keys.reduce((current, key) => (current[key] ||= {}), target)
  parent[last] = value
}

export class ResumeEditingError extends Error {}

/** A constrained mutation layer shared by manual controls and future AI tools. */
export function applyResumeEditingOperations(document, operations = []) {
  const next = structuredClone(document)
  next.presentation ||= {}
  next.presentation.elementOverrides ||= {}
  next.presentation.sectionStyles ||= {}

  operations.forEach(operation => {
    if (!operation?.type) throw new ResumeEditingError('Every resume operation needs a type.')
    if (operation.type === 'set_content') {
      if (!operation.path || typeof operation.value !== 'string') throw new ResumeEditingError('Invalid content edit.')
      writePath(next.content, operation.path, operation.value)
      return
    }
    if (operation.type === 'set_style') {
      if (!operation.target || !operation.changes || typeof operation.changes !== 'object') throw new ResumeEditingError('Invalid style edit.')
      Object.entries(operation.changes).forEach(([property, value]) => {
        if (!validStyleProperties.has(property)) throw new ResumeEditingError(`Unsupported style property: ${property}`)
        if ((property === 'color' || property.endsWith('Color')) && !validColors(value)) throw new ResumeEditingError(`Invalid color for ${property}`)
        if (property === 'fontSize' && (!Number.isFinite(value) || value < 7 || value > 48)) throw new ResumeEditingError('Font size must be between 7 and 48.')
      })
      next.presentation.elementOverrides[operation.target] = { ...(next.presentation.elementOverrides[operation.target] ?? {}), ...operation.changes }
      return
    }
    if (operation.type === 'set_theme') {
      next.presentation = { ...next.presentation, ...(operation.changes ?? {}), theme: { ...(next.presentation.theme ?? {}), ...(operation.changes ?? {}) } }
      return
    }
    if (operation.type === 'change_template') {
      if (typeof operation.templateId !== 'string') throw new ResumeEditingError('Invalid template.')
      next.presentation.template = operation.templateId
      return
    }
    if (operation.type === 'set_image' || operation.type === 'set_image_style') {
      next.presentation.photo = { ...(next.presentation.photo ?? {}), ...(operation.changes ?? {}) }
      return
    }
    if (operation.type === 'reorder_sections') {
      if (!Array.isArray(operation.order)) throw new ResumeEditingError('Invalid section order.')
      next.presentation.sectionOrder = operation.order
      return
    }
    throw new ResumeEditingError(`Unsupported resume operation: ${operation.type}`)
  })
  return next
}

export const getElementOverride = (presentation, elementId) => presentation?.elementOverrides?.[elementId] ?? {}
export const getPathValue = (document, path) => readPath(path.startsWith('presentation.') ? document.presentation : document.content, path.replace(/^presentation\./, ''))
