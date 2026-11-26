import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { describeResumeElement } from '../../editor/describeResumeElement.js'
import { rangeHasMark } from '../../editor/inlineMarks.js'
import { findFont } from '../../editor/fontRegistry.js'
import { accentColours, contrastVerdict, textColours } from '../../editor/colourCatalogue.js'
import FontPicker from './FontPicker.jsx'
import { DENSITIES, LAYOUT_MAX, LAYOUT_MIN, mergeLayout, normalizeLayout } from '../../../shared/resumeLayout.js'

const PHOTO_ID = 'resume.header.photo'
const FALLBACK_WEIGHTS = [400, 500, 600, 700]
const weightNames = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold' }
const swatches = [textColours[0].hex, textColours[3].hex, ...accentColours.filter(colour => ['Navy', 'Royal blue', 'Teal', 'Forest', 'Burgundy', 'Indigo'].includes(colour.name)).map(colour => colour.hex)]
const round = (value, step = 1) => Number((Math.round(value / step) * step).toFixed(4))
const rawPath = (source, path) => String(path ?? '').split('.').reduce((current, key) => current?.[/^\d+$/.test(key) ? Number(key) : key], source)

function readPath(source, path) {
  const value = rawPath(source, path)
  if (Array.isArray(value)) return value.join(', ')
  if (value && typeof value === 'object') return ''
  return value ?? ''
}

// The element's rendered style, so controls show what is on the page (whole resume: its body text).
function useComputedStyle(elementId, revision, documentSelector) {
  const [computed, setComputed] = useState(null)
  useLayoutEffect(() => {
    const node = elementId
      ? document.querySelector(`${documentSelector} [data-resume-element-id="${CSS.escape(elementId)}"]`)
      : document.querySelector(`${documentSelector} .resume-section li, ${documentSelector} .resume-section p, ${documentSelector} .letter-paragraph`)
    if (!node) { setComputed(null); return }
    const style = window.getComputedStyle(node)
    const page = node.closest('.generated-resume')
    const scale = parseFloat(page ? window.getComputedStyle(page).getPropertyValue('--page-scale') : '') || 1
    const lineHeightPx = parseFloat(style.lineHeight)
    const letterSpacingPx = parseFloat(style.letterSpacing)
    const block = node.closest('p, li, h1, h2, h3, div') ?? node
    setComputed({
      fontWeight: Number(style.fontWeight) || 400,
      fontStyle: style.fontStyle,
      textDecoration: style.textDecorationLine,
      color: style.color,
      lineHeight: Number.isFinite(lineHeightPx) ? round(lineHeightPx / parseFloat(style.fontSize), .05) : 1.2,
      letterSpacing: Number.isFinite(letterSpacingPx) ? round(letterSpacingPx / scale, .1) : 0,
      textAlign: window.getComputedStyle(block).textAlign
    })
  }, [elementId, revision, documentSelector])
  return computed
}

const toHex = value => {
  if (!value) return '#172033'
  if (value.startsWith('#')) return value.length === 4 ? `#${[...value.slice(1)].map(c => c + c).join('')}` : value.slice(0, 7)
  const match = value.match(/\d+(\.\d+)?/g)
  if (!match) return '#172033'
  return `#${match.slice(0, 3).map(part => Math.round(Number(part)).toString(16).padStart(2, '0')).join('')}`
}

function Field({ label, children, wide }) {
  return <div className={`fp-field${wide ? ' is-wide' : ''}`}><span className="fp-label">{label}</span>{children}</div>
}

// Page density presets plus the three multipliers behind them, as percentages of the template's spacing.
function PageSpacing({ layout, onLayout }) {
  const clean = normalizeLayout(layout)
  const values = { ...DENSITIES.standard, ...clean }
  const density = clean.density ?? 'standard'
  const set = change => onLayout(mergeLayout(layout, change))
  return <>
    <Field label="Page density" wide>
      <div className="fp-segmented" role="group" aria-label="Page density">{[['compact', 'Compact'], ['standard', 'Standard'], ['spacious', 'Spacious']].map(([id, label]) =>
        <button key={id} type="button" className={density === id ? 'is-active' : ''} aria-pressed={density === id} onClick={() => set({ density: id })}>{label}</button>)}</div>
    </Field>
    <div className="fp-row">
      <Field label="Sections"><Stepper label="Gap between sections" value={Math.round(values.sectionGap * 100)} min={LAYOUT_MIN * 100} max={LAYOUT_MAX * 100} step={5} suffix="%" onChange={value => set({ sectionGap: value / 100 })} /></Field>
      <Field label="Entries"><Stepper label="Gap between entries" value={Math.round(values.itemGap * 100)} min={LAYOUT_MIN * 100} max={LAYOUT_MAX * 100} step={5} suffix="%" onChange={value => set({ itemGap: value / 100 })} /></Field>
    </div>
    <Field label="Margins" wide><Stepper label="Page margins" value={Math.round(values.pageMargin * 100)} min={LAYOUT_MIN * 100} max={LAYOUT_MAX * 100} step={5} suffix="%" onChange={value => set({ pageMargin: value / 100 })} /></Field>
  </>
}

function Stepper({ label, value, min, max, step = 1, suffix, onChange }) {
  const [draft, setDraft] = useState(String(value ?? ''))
  useEffect(() => { setDraft(String(value ?? '')) }, [value])
  const commit = raw => {
    const number = Number(raw)
    if (!Number.isFinite(number)) { setDraft(String(value ?? '')); return }
    onChange(Math.min(max, Math.max(min, round(number, step))))
  }
  return <span className="fp-stepper">
    <button type="button" onClick={() => commit((Number(value) || 0) - step)} aria-label={`Decrease ${label}`}>−</button>
    <input type="number" inputMode="decimal" min={min} max={max} step={step} value={draft} aria-label={label} onChange={event => setDraft(event.target.value)} onBlur={event => commit(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') commit(event.currentTarget.value) }} />
    <button type="button" onClick={() => commit((Number(value) || 0) + step)} aria-label={`Increase ${label}`}>+</button>
    {suffix && <small>{suffix}</small>}
  </span>
}

function Colour({ label, value, onChange, role, palette = swatches }) {
  const hex = toHex(value)
  const verdict = role ? contrastVerdict(hex, role) : null
  return <>
    <div className="fp-swatches" role="group" aria-label={label}>
      {[...new Set(palette)].map(swatch => <button key={swatch} type="button" className={hex.toLowerCase() === swatch.toLowerCase() ? 'is-active' : ''} style={{ '--swatch': swatch }} onClick={() => onChange(swatch)} aria-label={`${label} ${swatch}`} title={swatch} />)}
      <label className="fp-custom-colour" title="Custom colour"><input type="color" value={hex} onChange={event => onChange(event.target.value)} aria-label={`Custom ${label.toLowerCase()}`} /><span style={{ '--swatch': hex }} /></label>
    </div>
    {verdict && !verdict.passes && <p className="fp-warning">Low contrast — may be hard to read in print.</p>}
  </>
}

const alignIcons = {
  left: 'M3 5h14M3 9h9M3 13h14M3 17h9', center: 'M3 5h14M5.5 9h9M3 13h14M5.5 17h9', right: 'M3 5h14M8 9h9M3 13h14M8 17h9', justify: 'M3 5h14M3 9h14M3 13h14M3 17h14'
}

/** Text the user can edit in place, committed after a pause so typing spaces is never lost. */
function EditText({ elementId, value, onCommit }) {
  const [draft, setDraft] = useState(value)
  const timerRef = useRef(0)
  useEffect(() => { setDraft(value) }, [elementId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(timerRef.current), [])
  const change = next => { setDraft(next); window.clearTimeout(timerRef.current); timerRef.current = window.setTimeout(() => onCommit(next), 450) }
  return <textarea className="fp-textarea" value={draft} rows={Math.min(5, Math.max(2, Math.ceil(draft.length / 36)))} onChange={event => change(event.target.value)} onBlur={() => { window.clearTimeout(timerRef.current); if (draft !== value) onCommit(draft) }} aria-label="Text" />
}

/**
 * Right container. Nothing selected → whole resume (font, size, colours, spacing).
 * A text element selected → that element (or the highlighted words for B/I/U/S). Photo selected → photo.
 */
export default function FormatPanel({
  selection, onClearSelection, resumeData, onEditText, onToggleMark,
  overrides = {}, onStyle, onClear, revision,
  fonts, fontFamily, onFontFamily, templateFontFamily,
  baseFontSize, onBaseFontSize, textColor, onTextColor,
  accentColor, onAccentColor, templateAccent,
  photo, onPhotoChange, onPhotoUpload, photoControls, onResetAll,
  // Page spacing (presentation.layout, shared/resumeLayout.js). Left out by the cover letter.
  layout = null, onLayout = null,
  // The cover letter reuses this panel: its own page selector, wording, extra whole-document sections and per-element panels.
  documentSelector = '.resume-page-document', scopeLabel = 'Whole resume', documentNoun = 'resume', wholeExtras = null, elementPanels = null
}) {
  const elementId = selection?.id ?? null
  const isPhoto = elementId === PHOTO_ID
  const customPanel = elementId && elementPanels?.[elementId] ? elementPanels[elementId] : null
  const computed = useComputedStyle(isPhoto || customPanel ? '__none__' : elementId, revision, documentSelector)
  const override = elementId ? overrides[elementId] ?? {} : {}
  const resumeOverride = overrides.resume ?? {}
  const description = elementId ? describeResumeElement(elementId) : null
  const editablePath = elementId && !isPhoto && selection?.path && !elementId.startsWith('section.') ? selection.path : null

  const setStyle = changes => onStyle(elementId, changes)
  const effective = key => override[key] ?? computed?.[key]
  const fontForWeights = findFont(override.fontFamily || fontFamily || templateFontFamily)
  const weights = fontForWeights?.weights ?? FALLBACK_WEIGHTS
  const weight = Number(effective('fontWeight')) || 400
  const decorations = String(effective('textDecoration') || '').split(' ').filter(word => word === 'underline' || word === 'line-through')
  const toggleDecoration = word => {
    const next = decorations.includes(word) ? decorations.filter(item => item !== word) : [...decorations, word]
    setStyle({ textDecoration: next.length ? next.join(' ') : 'none' })
  }
  const rawValue = editablePath ? rawPath(resumeData, editablePath) : null
  const rangeMode = Boolean(selection?.range && typeof rawValue === 'string' && rawValue && onToggleMark)
  const markActive = mark => rangeHasMark(rawValue, selection.range.start, selection.range.end, mark)
  const styleActive = {
    b: rangeMode ? markActive('b') : weight >= 600,
    i: rangeMode ? markActive('i') : effective('fontStyle') === 'italic',
    u: rangeMode ? markActive('u') : decorations.includes('underline'),
    s: rangeMode ? markActive('s') : decorations.includes('line-through')
  }
  const toggleStyle = mark => {
    if (rangeMode) { onToggleMark(mark); return }
    if (mark === 'b') setStyle({ fontWeight: weight >= 600 ? 400 : 700 })
    if (mark === 'i') setStyle({ fontStyle: effective('fontStyle') === 'italic' ? 'normal' : 'italic' })
    if (mark === 'u') toggleDecoration('underline')
    if (mark === 's') toggleDecoration('line-through')
  }
  const align = effective('textAlign') === 'start' ? 'left' : effective('textAlign') === 'end' ? 'right' : effective('textAlign') || 'left'
  const headingLike = description?.kind === 'heading' || elementId === 'resume.header.name'

  return <div className="format-panel fp">
    <header className="fp-head">
      <h2>Format</h2>
      <div className="fp-scope">
        <b>{elementId ? description.label : scopeLabel}</b>
        {elementId && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClearSelection} aria-label={`Back to ${scopeLabel.toLowerCase()}`} title={`Back to ${scopeLabel.toLowerCase()}`}>×</button>}
      </div>
    </header>

    {customPanel}

    {isPhoto && !customPanel && <section className="fp-group">
      <h3>Photo</h3>
      <div className="fp-row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onPhotoUpload}>{photo?.uploaded ? 'Replace' : 'Upload'}</button>
        {photo?.uploaded && <button type="button" className="btn btn-danger btn-sm" onClick={() => onPhotoChange(null)}>Remove</button>}
      </div>
      {photo?.uploaded && <>
        <Field label="Size"><Stepper label="Photo size" value={Math.max(Number(photo.width) || 72, 48)} min={48} max={96} step={4} suffix="px" onChange={value => onPhotoChange({ ...photo, width: value, height: value })} /></Field>
        <Field label="Shape">
          <div className="fp-segmented">{[['circle', 'Circle'], ['rounded', 'Rounded'], ['square', 'Square']].map(([id, label]) => {
            const current = photo.shape === 'circle' ? 'circle' : photo.borderRadius === 0 ? 'square' : 'rounded'
            return <button key={id} type="button" className={current === id ? 'is-active' : ''} aria-pressed={current === id} onClick={() => onPhotoChange({ ...photo, shape: id === 'circle' ? 'circle' : 'rounded', borderRadius: id === 'square' ? 0 : id === 'rounded' ? 10 : undefined })}>{label}</button>
          })}</div>
        </Field>
        <Field label="Outline"><Stepper label="Outline width" value={Number(photo.borderWidth) || 0} min={0} max={6} suffix="px" onChange={value => onPhotoChange({ ...photo, borderWidth: value })} /></Field>
        {photoControls}
      </>}
    </section>}

    {elementId && !isPhoto && !customPanel && <>
      {editablePath && <section className="fp-group"><h3>Text</h3><EditText elementId={elementId} value={String(readPath(resumeData, editablePath))} onCommit={value => onEditText(editablePath, value)} /></section>}
      <section className="fp-group">
        <h3>Style</h3>
        <div className="fp-toolbar" role="group" aria-label={rangeMode ? 'Style for the highlighted words' : 'Text style'} title={rangeMode ? 'Applies to the highlighted words' : 'Tip: highlight words on the resume to style only those'}>
          {[['b', 'Bold', <b key="b">B</b>], ['i', 'Italic', <i key="i">I</i>], ['u', 'Underline', <u key="u">U</u>], ['s', 'Strikethrough', <s key="s">S</s>]].map(([mark, label, icon]) => <button key={mark} type="button"
            aria-pressed={styleActive[mark]} className={styleActive[mark] ? 'is-active' : ''} onMouseDown={event => event.preventDefault()} onClick={() => toggleStyle(mark)} aria-label={label} title={label}>{icon}</button>)}
          <span className="fp-toolbar-gap" aria-hidden="true" />
          {Object.entries(alignIcons).map(([id, path]) => <button key={id} type="button" aria-pressed={align === id} className={align === id ? 'is-active' : ''} onClick={() => setStyle({ textAlign: id })} aria-label={`Align ${id}`} title={`Align ${id}`}><svg viewBox="0 0 20 20" aria-hidden="true"><path d={path} /></svg></button>)}
        </div>
        <Field label="Font" wide><FontPicker id="format-font" fonts={fonts} value={override.fontFamily ?? null} onChange={value => setStyle({ fontFamily: value })} defaultLabel={`Same as ${documentNoun}`} headingsAllowed={headingLike} /></Field>
        <Field label="Weight" wide>
          <select className="format-select" value={override.fontWeight ? String(override.fontWeight) : ''} onChange={event => setStyle({ fontWeight: event.target.value ? Number(event.target.value) : null })}>
            <option value="">Default</option>
            {weights.map(item => <option key={item} value={item}>{weightNames[item] ?? item}</option>)}
          </select>
        </Field>
        <Field label="Colour" wide><Colour label="Colour" role={headingLike ? 'heading' : 'body'} value={effective('color')} onChange={value => setStyle({ color: value })} /></Field>
      </section>
      <section className="fp-group">
        <h3>Spacing</h3>
        <div className="fp-row">
          <Field label="Line height"><Stepper label="Line height" value={Math.round((effective('lineHeight') || 1.2) * 100)} min={80} max={250} step={5} suffix="%" onChange={value => setStyle({ lineHeight: value / 100 })} /></Field>
          <Field label="Letters"><Stepper label="Letter spacing" value={effective('letterSpacing') ?? 0} min={-2} max={10} step={.1} suffix="px" onChange={value => setStyle({ letterSpacing: value })} /></Field>
        </div>
      </section>
      <div className="fp-foot"><button type="button" className="btn btn-link" disabled={!Object.keys(override).length} onClick={() => onClear(elementId)}>Reset this element</button></div>
    </>}

    {!elementId && <>
      <section className="fp-group">
        <h3>Text</h3>
        <Field label="Font" wide><FontPicker id="format-resume-font" fonts={fonts} value={fontFamily} onChange={onFontFamily} headingsAllowed={false} defaultLabel={findFont(templateFontFamily)?.name ?? 'Template font'} /></Field>
        <Field label="Size" wide><Stepper label="Text size" value={baseFontSize} min={9} max={18} step={.5} suffix="px" onChange={onBaseFontSize} /></Field>
        <Field label="Text colour" wide><Colour label="Text colour" role="body" value={textColor} onChange={onTextColor} palette={textColours.slice(0, 8).map(colour => colour.hex)} /></Field>
        <Field label="Accent" wide><Colour label="Accent colour" role="heading" value={accentColor || templateAccent} onChange={onAccentColor} palette={[templateAccent, ...accentColours.slice(0, 7).map(colour => colour.hex)]} /></Field>
      </section>
      <section className="fp-group">
        <h3>Spacing</h3>
        <div className="fp-row">
          <Field label="Line height"><Stepper label="Line height" value={Math.round((resumeOverride.lineHeight ?? computed?.lineHeight ?? 1.3) * 100)} min={80} max={250} step={5} suffix="%" onChange={value => onStyle('resume', { lineHeight: value / 100 })} /></Field>
          <Field label="Letters"><Stepper label="Letter spacing" value={resumeOverride.letterSpacing ?? computed?.letterSpacing ?? 0} min={-2} max={10} step={.1} suffix="px" onChange={value => onStyle('resume', { letterSpacing: value })} /></Field>
        </div>
        {onLayout && <PageSpacing layout={layout} onLayout={onLayout} />}
      </section>
      {wholeExtras}
      <p className="fp-hint">Click text on the {documentNoun} to style just that part.</p>
      <div className="fp-foot"><button type="button" className="btn btn-link" onClick={onResetAll}>Reset all formatting</button></div>
    </>}
  </div>
}
