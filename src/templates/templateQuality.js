import { resumeFonts } from '../editor/fontRegistry.js'

const sidebarTemplates = new Set(['azurill', 'bronzor', 'ditgar', 'gengar', 'glalie', 'leafish', 'scizor', 'product-startup'])
const photoForwardTemplates = new Set(['azurill', 'bronzor', 'chikorita', 'ditgar', 'ditto', 'gengar', 'glalie', 'lapras', 'leafish', 'meowth', 'onyx', 'pikachu', 'scizor'])
const visualTemplates = new Set(['azurill', 'bronzor', 'chikorita', 'ditgar', 'ditto', 'gengar', 'glalie', 'kakuna', 'lapras', 'leafish', 'meowth', 'onyx', 'pikachu', 'rhyhorn', 'scizor', 'product-startup'])

const values = value => Array.isArray(value) ? value.filter(Boolean) : []
const trim = value => String(value ?? '').trim()
const contactValues = resumeData => [resumeData?.email, resumeData?.phone, resumeData?.location, ...values(resumeData?.links).map(link => typeof link === 'string' ? link : link?.url || link?.label)].map(trim).filter(Boolean)

export const templateStressScenarios = Object.freeze([
  'Long name and headline',
  'Long email and profile URLs',
  'No photo and portrait photo',
  'Dense skills and five-plus experience entries',
  'Long bullets, projects, custom sections, and multi-page flow',
])

export function getAtsLabel(template) {
  if (template?.atsFriendly) return 'ATS Safe'
  return visualTemplates.has(template?.id) ? 'Visual' : 'ATS Moderate'
}

export function estimateResumePages(resumeData = {}) {
  const experience = values(resumeData.experience)
  const projects = values(resumeData.projects)
  const bullets = [...experience, ...projects].flatMap(item => values(item?.bullets)).join(' ').length
  const skills = Object.values(resumeData.skills ?? {}).flat().join(' ').length
  const details = [resumeData.summary, resumeData.fullName, ...contactValues(resumeData), ...values(resumeData.education).flatMap(item => [item?.degree, item?.institution, ...values(item?.details)]), ...values(resumeData.customSections).flatMap(item => [item?.title, item?.content, item?.description])].join(' ').length
  const density = details + bullets + skills + experience.length * 130 + projects.length * 100
  return Math.max(1, Math.ceil(density / 1450))
}

export function assessTemplateContent({ template, resumeData = {}, presentation = {}, renderAudit = null } = {}) {
  const issues = []
  const suggestedPresentation = {}
  const contacts = contactValues(resumeData)
  const links = contacts.filter(value => /@|\.|\//.test(value))
  const skills = Object.values(resumeData.skills ?? {}).flat().filter(Boolean)
  const experience = values(resumeData.experience)
  const projects = values(resumeData.projects)
  const customSections = values(resumeData.customSections)
  const isSidebar = sidebarTemplates.has(template?.id)
  const hasPhoto = Boolean(presentation?.photo?.source || resumeData?.photo?.source)
  const pages = estimateResumePages(resumeData)
  const fontFamily = presentation?.fontFamily || template?.defaultTheme?.fontFamily || ''
  const knownFont = !fontFamily || resumeFonts.some(font => font.family === fontFamily)

  const add = (code, severity, title, detail, fix = null) => {
    issues.push({ code, severity, title, detail })
    if (fix) Object.entries(fix).forEach(([key, value]) => {
      if (value === undefined) return
      if (key === 'sidebarWidth') suggestedPresentation[key] = Math.max(Number(suggestedPresentation[key]) || 0, value)
      else if (key.endsWith('Scale')) suggestedPresentation[key] = Math.min(Number(suggestedPresentation[key]) || 1, value)
      else suggestedPresentation[key] = value
    })
  }

  if (trim(resumeData.fullName).length > 30) add('long-name', 'warning', 'Long name will reflow', 'The header uses balanced wrapping and a smaller name scale when needed.', { nameScale: .86 })
  if (links.some(value => value.length > 38)) add('long-contact', 'warning', 'Long contact value detected', 'URLs and emails will break safely inside their container; sidebar layouts also compact contact type.', isSidebar ? { sidebarWidth: Math.max(Number(presentation.sidebarWidth) || 0, 36), contactScale: .88 } : { contactScale: .9 })
  if (isSidebar && contacts.join('').length > 96) add('sidebar-density', 'warning', 'Sidebar content is dense', 'Contacts, skills, and credentials may need more horizontal room in this visual layout.', { sidebarWidth: Math.max(Number(presentation.sidebarWidth) || 0, 36), contactScale: .88 })
  if (skills.length > 12) add('dense-skills', 'info', 'Skills will wrap into compact lines', 'Long skill groups use safe wrapping and never extend beyond the column.', isSidebar ? { sidebarWidth: Math.max(Number(presentation.sidebarWidth) || 0, 35) } : null)
  if (experience.length >= 5 || projects.length >= 4) add('multi-page', 'info', `${pages} pages estimated`, 'The editor keeps a heading with its first item and moves blocks onto the next A4 page when required.')
  if (!hasPhoto && photoForwardTemplates.has(template?.id)) add('missing-photo', 'info', 'Photo is optional', 'This template supports a profile photo, but its header remains balanced without one.')
  if (customSections.length) add('custom-sections', 'info', 'Additional sections retained', 'Custom sections stay in the logical reading order; nothing is silently hidden.')
  if (!knownFont) add('font-fallback', 'warning', 'Font fallback will be used', 'The selected font is not in the export-safe font registry. Choose a registered font before export.')
  if (renderAudit?.overflowCount) add('render-overflow', 'warning', `${renderAudit.overflowCount} overflow risk${renderAudit.overflowCount === 1 ? '' : 's'} detected`, 'Auto-fix increases available sidebar space and reduces presentation-only text scales.', { sidebarWidth: isSidebar ? Math.max(Number(presentation.sidebarWidth) || 0, 36) : undefined, contactScale: .88, nameScale: .9, projectDescriptionScale: .9 })
  if (renderAudit?.lowContrastCount) add('low-contrast', 'warning', 'Low contrast detected', 'The template will raise text contrast for the affected presentation-only area.')

  return {
    atsLabel: getAtsLabel(template),
    estimatedPages: pages,
    issues,
    suggestedPresentation: Object.fromEntries(Object.entries(suggestedPresentation).filter(([, value]) => value !== undefined)),
    stressScenarios: templateStressScenarios,
    contrastStatus: renderAudit?.lowContrastCount ? 'Needs attention' : 'Checked',
    renderFits: !renderAudit?.overflowCount,
  }
}

const parseRgb = value => {
  const match = String(value || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/i)
  if (match?.[4] !== undefined && Number(match[4]) <= 0.01) return null
  return match ? match.slice(1, 4).map(Number) : null
}

const luminance = rgb => rgb.map(channel => {
  const normalized = channel / 255
  return normalized <= .03928 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4
}).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)

const contrastRatio = (foreground, background) => {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + .05) / (darker + .05)
}

/** Browser-side audit of the rendered preview. It intentionally examines only
 * geometry and computed styles; no resume content is changed. */
export function auditTemplateRender(root) {
  if (!root || typeof window === 'undefined') return { overflowCount: 0, lowContrastCount: 0 }
  const rootRect = root.getBoundingClientRect()
  const candidates = [...root.querySelectorAll('[data-resume-path], .resume-entry, .resume-section h2, .generated-contact')]
  const overflowCount = candidates.filter(node => {
    const rect = node.getBoundingClientRect()
    return node.scrollWidth > node.clientWidth + 1 || rect.left < rootRect.left - 1 || rect.right > rootRect.right + 1
  }).length
  const lowContrastCount = candidates.filter(node => {
    const foreground = parseRgb(window.getComputedStyle(node).color)
    if (!foreground) return false
    let parent = node
    let background = null
    while (parent && parent !== root.parentElement && !background) {
      const candidate = parseRgb(window.getComputedStyle(parent).backgroundColor)
      if (candidate) background = candidate
      parent = parent.parentElement
    }
    return background ? contrastRatio(foreground, background) < 3.2 : false
  }).length
  return { overflowCount, lowContrastCount }
}
