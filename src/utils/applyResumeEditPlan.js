import { validateResumeEditPlan } from '../../shared/resumeEditPlan.js'

export const resumeFontValues = {
  inter: 'Inter, sans-serif',
  'dm-sans': 'DM Sans, sans-serif',
  'space-grotesk': 'Space Grotesk, sans-serif',
  merriweather: 'Merriweather, serif',
  georgia: 'Georgia, serif',
  arial: 'Arial, sans-serif'
}

const cloneResumeData = resumeData => ({
  ...resumeData,
  links: Array.isArray(resumeData.links) ? resumeData.links.map(link => ({ ...link })) : [],
  skills: Object.fromEntries(Object.entries(resumeData.skills ?? {}).map(([category, values]) => [category, [...values]])),
  experience: (resumeData.experience ?? []).map(item => ({ ...item, bullets: [...(item.bullets ?? [])] })),
  projects: (resumeData.projects ?? []).map(item => ({ ...item, techStack: [...(item.techStack ?? [])], bullets: [...(item.bullets ?? [])], links: [...(item.links ?? [])] })),
  education: (resumeData.education ?? []).map(item => ({ ...item, details: [...(item.details ?? [])] })),
  certifications: [...(resumeData.certifications ?? [])],
  achievements: [...(resumeData.achievements ?? [])],
  missingFields: [...(resumeData.missingFields ?? [])],
  confidenceNotes: [...(resumeData.confidenceNotes ?? [])]
})

function appendUnique(existing, additions) {
  const known = new Set(existing.map(value => value.toLocaleLowerCase()))
  return [...existing, ...additions.filter(value => {
    const key = value.toLocaleLowerCase()
    if (known.has(key)) return false
    known.add(key)
    return true
  })]
}

export function applyResumeEditPlan({ resumeData, plan }) {
  const safePlan = validateResumeEditPlan(plan, resumeData)
  const nextResumeData = cloneResumeData(resumeData)
  const styleUpdates = {}
  let footerUpdate

  safePlan.operations.forEach(operation => {
    if (operation.type === 'set_field') nextResumeData[operation.target] = operation.value
    if (operation.type === 'clear_field') nextResumeData[operation.target] = ''

    if (operation.type === 'set_item_field') {
      nextResumeData[operation.section][operation.itemIndex][operation.field] = operation.value
    }

    if (operation.type === 'append_bullets' || operation.type === 'replace_bullets') {
      const item = nextResumeData[operation.section][operation.itemIndex]
      item.bullets = operation.type === 'append_bullets' ? appendUnique(item.bullets, operation.values) : [...operation.values]
    }

    if (operation.type === 'append_details' || operation.type === 'replace_details') {
      const item = nextResumeData.education[operation.itemIndex]
      item.details = operation.type === 'append_details' ? appendUnique(item.details, operation.values) : [...operation.values]
    }

    if (operation.type === 'append_skills' || operation.type === 'replace_skills') {
      const currentSkills = nextResumeData.skills[operation.category] ?? []
      nextResumeData.skills[operation.category] = operation.type === 'append_skills' ? appendUnique(currentSkills, operation.values) : [...operation.values]
    }

    if (operation.type === 'append_list' || operation.type === 'replace_list') {
      const currentItems = nextResumeData[operation.target] ?? []
      nextResumeData[operation.target] = operation.type === 'append_list' ? appendUnique(currentItems, operation.values) : [...operation.values]
    }

    if (operation.type === 'set_link') nextResumeData.links[operation.linkIndex] = { ...operation.value }
    if (operation.type === 'append_link') {
      const knownUrls = new Set(nextResumeData.links.map(link => link.url.toLocaleLowerCase()))
      if (!knownUrls.has(operation.value.url.toLocaleLowerCase())) nextResumeData.links.push({ ...operation.value })
    }
    if (operation.type === 'replace_links') nextResumeData.links = operation.values.map(link => ({ ...link }))

    if (operation.type === 'set_footer') footerUpdate = operation.value
    if (operation.type === 'clear_footer') footerUpdate = ''

    if (operation.type === 'set_style') {
      if (operation.fontFamily) styleUpdates.fontFamily = resumeFontValues[operation.fontFamily]
      if (operation.fontSize) styleUpdates.fontSize = operation.fontSize
      if (operation.textColor) styleUpdates.textColor = operation.textColor
    }

    if (operation.type === 'reset_style') {
      if (operation.target === 'fontFamily' || operation.target === 'all') styleUpdates.fontFamily = resumeFontValues.inter
      if (operation.target === 'fontSize' || operation.target === 'all') styleUpdates.fontSize = null
      if (operation.target === 'textColor' || operation.target === 'all') styleUpdates.textColor = null
    }
  })

  return { plan: safePlan, resumeData: nextResumeData, styleUpdates, footerUpdate }
}
