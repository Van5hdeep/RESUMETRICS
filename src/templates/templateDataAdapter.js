const asArray = value => Array.isArray(value) ? value : []

const clean = value => String(value ?? '').trim()

const unique = values => [...new Set(values.map(clean).filter(Boolean))]

/**
 * Presentation-only adapter between Resumetrics' normalized resume data and a
 * template. It deliberately does not mutate the source object: parsing, AI
 * edits, persistence, and templates can therefore keep using the same schema.
 */
export function adaptResumeForTemplate(resumeData = {}) {
  const links = asArray(resumeData.links)
    .map((link, index) => typeof link === 'string'
      ? { index, label: link, url: link }
      : { index, label: clean(link?.label) || clean(link?.url), url: clean(link?.url) })
    .filter(link => link.label || link.url)

  const skillsByCategory = Object.entries(resumeData.skills ?? {})
    .map(([category, values]) => ({ category, values: unique(asArray(values)) }))
    .filter(group => group.values.length)

  return {
    ...resumeData,
    contactItems: [
      { path: 'email', value: clean(resumeData.email), kind: 'email' },
      { path: 'phone', value: clean(resumeData.phone), kind: 'phone' },
      { path: 'location', value: clean(resumeData.location), kind: 'location' },
      ...links.map(link => ({ path: `links.${link.index}.url`, value: link.url || link.label, kind: 'link', href: link.url, label: link.label }))
    ].filter(item => item.value),
    links,
    skillsByCategory,
    allSkills: unique(skillsByCategory.flatMap(group => group.values)),
    // These optional groups let a template render future normalized fields
    // without forcing the current parser or editor to add them.
    languages: unique(asArray(resumeData.languages)),
    customSections: asArray(resumeData.customSections).filter(section => section && typeof section === 'object')
  }
}
