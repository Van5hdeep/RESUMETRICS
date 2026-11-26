// Page spacing for every template (PLAN-034, D41). Stored in the saved presentation as `presentation.layout`
// ({ density, sectionGap, itemGap, pageMargin }). The numbers are multipliers on a standard spacing; 1 everywhere
// means "the template's own spacing", so the layout is dropped and the template renders exactly as designed.
// Pure: the format panel, NIMBUS and the page renderer all share it.

export const DENSITIES = Object.freeze({
  compact: Object.freeze({ sectionGap: 0.7, itemGap: 0.7, pageMargin: 0.8 }),
  standard: Object.freeze({ sectionGap: 1, itemGap: 1, pageMargin: 1 }),
  spacious: Object.freeze({ sectionGap: 1.35, itemGap: 1.3, pageMargin: 1.15 })
})
export const LAYOUT_KEYS = Object.freeze(['sectionGap', 'itemGap', 'pageMargin'])
export const LAYOUT_MIN = 0.6
export const LAYOUT_MAX = 1.6

const clamp = value => Math.round(Math.max(LAYOUT_MIN, Math.min(LAYOUT_MAX, value)) * 20) / 20

/** Cleaned layout: known keys only, bounded, and {} when nothing differs from the template. */
export function normalizeLayout(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const preset = DENSITIES[raw.density] ?? DENSITIES.standard
  const values = Object.fromEntries(LAYOUT_KEYS.map(key => [key, Number.isFinite(raw[key]) ? clamp(raw[key]) : preset[key]]))
  if (LAYOUT_KEYS.every(key => values[key] === 1)) return {}
  const density = Object.entries(DENSITIES).find(([, item]) => LAYOUT_KEYS.every(key => item[key] === values[key]))?.[0] ?? 'custom'
  return { density, ...values }
}

/** Merge a change ({ density } and/or numbers) into the current layout. A density resets the numbers to its preset first. */
export function mergeLayout(current, change = {}) {
  const base = change.density && DENSITIES[change.density] ? { ...DENSITIES[change.density] } : { ...DENSITIES.standard, ...normalizeLayout(current) }
  for (const key of LAYOUT_KEYS) if (Number.isFinite(change[key])) base[key] = change[key]
  return normalizeLayout(base)
}

/** CSS custom properties for the page; empty when the template's own spacing applies. */
export function layoutStyle(layout) {
  const clean = normalizeLayout(layout)
  if (!Object.keys(clean).length) return {}
  return { '--rt-layout': 1, '--rt-section-gap': clean.sectionGap, '--rt-item-gap': clean.itemGap, '--rt-page-margin': clean.pageMargin }
}

export const describeLayout = layout => {
  const clean = normalizeLayout(layout)
  if (!Object.keys(clean).length) return 'template spacing'
  if (clean.density !== 'custom') return `${clean.density} spacing`
  return `section gaps ${Math.round(clean.sectionGap * 100)}%, entry gaps ${Math.round(clean.itemGap * 100)}%, margins ${Math.round(clean.pageMargin * 100)}%`
}
