// What a fix will change, as Before → After pairs for the fix card (PLAN-031).
// Works on the operation list a fix carries; text marks ([b]…[/b]) are stripped for display.
import { skillGroupLabel } from '../../shared/skillGroups.js'

const strip = value => String(value ?? '').replace(/\[\/?[bius]\]/g, '')
const list = value => Array.isArray(value) ? value : []
const fieldNames = { summary: 'Summary', headline: 'Headline', fullName: 'Name', email: 'Email', phone: 'Phone', location: 'Location' }
const sectionNames = { experience: 'Experience', projects: 'Projects', education: 'Education' }

function itemName(resume, section, index) {
  const item = list(resume?.[section])[index]
  if (!item) return `${sectionNames[section] ?? section} ${index + 1}`
  if (section === 'experience') return [strip(item.role), strip(item.company)].filter(Boolean).join(' at ') || 'Role'
  if (section === 'projects') return strip(item.name) || 'Project'
  return strip(item.degree || item.institution) || 'Entry'
}

/**
 * → [{ label, kind: 'text'|'list'|'added', before, after }]
 * text: before/after strings; list: before/after string arrays (order or wording); added: after only.
 */
export function describeFixChanges(resume = {}, operations = []) {
  return list(operations).flatMap(operation => {
    switch (operation?.type) {
      case 'set_field': return [{ label: fieldNames[operation.target] ?? operation.target, kind: 'text', before: strip(resume?.[operation.target]), after: strip(operation.value) }]
      case 'clear_field': return [{ label: fieldNames[operation.target] ?? operation.target, kind: 'text', before: strip(resume?.[operation.target]), after: '' }]
      case 'set_item_field': {
        const item = list(resume?.[operation.section])[operation.itemIndex] ?? {}
        return [{ label: `${itemName(resume, operation.section, operation.itemIndex)} · ${operation.field}`, kind: 'text', before: strip(item[operation.field]), after: strip(operation.value) }]
      }
      case 'replace_bullets':
      case 'append_bullets': {
        const before = list(list(resume?.[operation.section])[operation.itemIndex]?.bullets).map(strip)
        const values = list(operation.values).map(strip)
        return [{ label: `${itemName(resume, operation.section, operation.itemIndex)} · bullets`, kind: 'list', before, after: operation.type === 'append_bullets' ? [...before, ...values] : values }]
      }
      case 'replace_details':
      case 'append_details': {
        const before = list(list(resume?.[operation.section])[operation.itemIndex]?.details).map(strip)
        const values = list(operation.values).map(strip)
        return [{ label: `${itemName(resume, operation.section, operation.itemIndex)} · details`, kind: 'list', before, after: operation.type === 'append_details' ? [...before, ...values] : values }]
      }
      case 'append_skills': {
        const existing = new Set(list(resume?.skills?.[operation.category]).map(value => strip(value).toLowerCase()))
        const added = list(operation.values).map(strip).filter(value => !existing.has(value.toLowerCase()))
        return added.length ? [{ label: `Skills · ${skillGroupLabel(operation.category)}`, kind: 'added', before: [], after: added }] : []
      }
      case 'replace_skills': return [{ label: `Skills · ${skillGroupLabel(operation.category)}`, kind: 'list', before: list(resume?.skills?.[operation.category]).map(strip), after: list(operation.values).map(strip) }]
      case 'append_list': return [{ label: operation.target === 'certifications' ? 'Certifications' : 'Achievements', kind: 'added', before: [], after: list(operation.values).map(strip) }]
      case 'replace_list': return [{ label: operation.target === 'certifications' ? 'Certifications' : 'Achievements', kind: 'list', before: list(resume?.[operation.target]).map(strip), after: list(operation.values).map(strip) }]
      // PLAN-034 operations: one bullet rewritten or something removed.
      case 'set_bullet': return [{ label: `${itemName(resume, operation.section, operation.itemIndex)} · bullet`, kind: 'text', before: strip(operation.expect), after: strip(operation.value) }]
      case 'remove_bullet': return [{ label: `${itemName(resume, operation.section, operation.itemIndex)} · bullet`, kind: 'removed', before: strip(operation.expect), after: '' }]
      case 'remove_item': return [{ label: sectionNames[operation.section] ?? operation.section, kind: 'removed', before: strip(operation.expect), after: '' }]
      case 'remove_list_entry': return [{ label: operation.target[0].toUpperCase() + operation.target.slice(1), kind: 'removed', before: strip(operation.expect), after: '' }]
      case 'remove_skill': return [{ label: `Skills · ${skillGroupLabel(operation.category)}`, kind: 'removed', before: strip(operation.value), after: '' }]
      case 'remove_link': return [{ label: 'Links', kind: 'removed', before: strip(operation.expect), after: '' }]
      default: return []
    }
  })
}

/** Words in `after` that are not in `before`, for highlighting what a rewrite adds. */
export function addedWords(before = '', after = '') {
  const known = new Set(String(before).toLowerCase().match(/[a-z0-9+#.]+/g) ?? [])
  return new Set((String(after).toLowerCase().match(/[a-z0-9+#.]+/g) ?? []).filter(word => !known.has(word) && word.length > 2))
}
