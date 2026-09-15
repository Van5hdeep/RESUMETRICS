const editable = (...properties) => Object.freeze(properties)
const itemKinds = ['experience', 'education', 'projects']

const idFor = (kind, index, item) => item?.id || `${kind}_${index + 1}`

/** Give legacy parsed records stable ids once they enter the editor. */
export function ensureResumeElementIds(resume = {}) {
  const next = structuredClone(resume)
  itemKinds.forEach(kind => {
    next[kind] = (next[kind] ?? []).map((item, index) => ({ ...item, id: idFor(kind, index, item) }))
  })
  return next
}

const textCapabilities = editable('content', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'textAlign', 'lineHeight', 'letterSpacing', 'spacing', 'visibility')

/**
 * Semantic bridge used by rendered DOM, manual selection, and AI context.
 * `path` stays compatible with Resumetrics' normalized content shape while
 * `id` remains stable as records are reordered.
 */
export function buildResumeElementRegistry(resume = {}, presentation = {}) {
  const elements = [
    { id: 'resume.header.name', path: 'fullName', type: 'text', role: 'person_name', capabilities: textCapabilities },
    { id: 'resume.header.headline', path: 'headline', type: 'text', role: 'headline', capabilities: textCapabilities },
    ...['email', 'phone', 'location'].map(field => ({ id: `resume.header.${field}`, path: field, type: 'text', role: field, capabilities: textCapabilities })),
    { id: 'resume.header.photo', path: 'presentation.photo', type: 'image', role: 'profile_photo', capabilities: editable('image', 'visibility', 'width', 'height', 'objectFit', 'objectPosition', 'borderRadius', 'borderColor', 'borderWidth', 'spacing') },
    { id: 'section.summary', path: 'summary', type: 'text', role: 'summary', capabilities: textCapabilities },
    { id: 'section.skills', path: 'skills', type: 'text', role: 'skills', capabilities: textCapabilities },
    { id: 'layout.page', path: 'presentation.page', type: 'layout', role: 'page', capabilities: editable('backgroundColor', 'pageSize', 'margin', 'density', 'spacing') },
    { id: 'layout.header', path: 'presentation.layout.header', type: 'layout', role: 'header', capabilities: editable('alignment', 'backgroundColor', 'spacing', 'visibility') },
    { id: 'layout.sidebar', path: 'presentation.layout.sidebar', type: 'layout', role: 'sidebar', capabilities: editable('width', 'backgroundColor', 'spacing', 'visibility') }
  ]

  ;(resume.links ?? []).forEach((link, index) => elements.push({ id: `resume.header.link.${index}`, path: `links.${index}.url`, type: 'link', role: link?.label || 'social_link', capabilities: editable('content', 'url', 'icon', 'visibility', 'color', 'fontSize', 'spacing') }))
  itemKinds.forEach(kind => (resume[kind] ?? []).forEach((item, index) => {
    const itemId = idFor(kind, index, item)
    elements.push({ id: `${kind}.${itemId}`, path: `${kind}.${index}`, type: 'container', role: kind.slice(0, -1), capabilities: editable('visibility', 'spacing', 'ordering', 'duplicate', 'remove') })
    const fields = kind === 'experience' ? ['role', 'company', 'location', 'startDate', 'endDate'] : kind === 'education' ? ['degree', 'institution', 'location', 'startDate', 'endDate'] : ['name', 'description', 'techStack']
    fields.forEach(field => elements.push({ id: `${kind}.${itemId}.${field}`, path: `${kind}.${index}.${field}`, type: 'text', role: field, parentId: `${kind}.${itemId}`, capabilities: textCapabilities }))
  }))

  return Object.freeze({
    elements: Object.freeze(elements),
    presentation: { template: presentation.template, pageSize: presentation.pageSize || 'A4' },
    get: id => elements.find(element => element.id === id) || null,
    byPath: path => elements.find(element => element.path === path) || null
  })
}
