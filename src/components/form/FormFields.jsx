import { useLayoutEffect, useRef, useState } from 'react'
import { formGroupLabel, isBuiltInSkillGroup, newGroupKey, renameSkillGroup } from '../../../shared/skillGroups.js'

const fieldId = path => `form-${String(path).replace(/[^a-z0-9]+/gi, '-')}`
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const thisYear = new Date().getFullYear()
const YEARS = Array.from({ length: thisYear + 6 - 1970 + 1 }, (_, index) => thisYear + 6 - index)

/** Polite screen-reader message through the form's live region (rendered once by SectionForm). */
export function announce(message) {
  const region = typeof document !== 'undefined' && document.getElementById('form-live-region')
  if (!region) return
  region.textContent = ''
  setTimeout(() => { region.textContent = message }, 60)
}

/** "Show me": move focus to the first missing field so keyboard and screen-reader users land on it. */
export function focusFirstMissing(container) {
  const field = container?.querySelector('.is-missing, .has-missing, .form-section-error')
  if (!field) return
  field.scrollIntoView({ block: 'center', behavior: 'smooth' })
  // A section-level message (e.g. too few skills) sends focus to the first input after it.
  const target = field.matches('.form-section-error') ? field.parentElement?.querySelector('input, textarea, select') : field.querySelector('input, textarea, select, button')
  target?.focus({ preventScroll: true })
}

function Label({ children, required, optional }) {
  return <span className="form-label">{children}{required && <span className="form-required" aria-hidden="true"> *</span>}{optional && <span className="form-optional"> (optional)</span>}</span>
}

function ErrorText({ id, error }) {
  return error ? <small className="form-error" id={id}>{error}</small> : null
}

const AUTOSIZE_MAX = 360

/** Grows a textarea to fit what is typed, up to a cap, so long text never hides behind a tiny scrolling box. */
function useAutosize(ref, value, enabled) {
  useLayoutEffect(() => {
    const node = ref.current
    if (!enabled || !node) return
    node.style.height = 'auto'
    const border = node.offsetHeight - node.clientHeight
    const wanted = node.scrollHeight + border
    node.style.height = `${Math.min(wanted, AUTOSIZE_MAX)}px`
    node.classList.toggle('is-capped', wanted > AUTOSIZE_MAX)
  }, [ref, value, enabled])
}

export function TextField({ label, path, value, onChange, required, optional, error, type = 'text', placeholder, multiline, hint, autoFocus }) {
  const id = fieldId(path)
  const Input = multiline ? 'textarea' : 'input'
  const inputRef = useRef(null)
  useAutosize(inputRef, value, Boolean(multiline))
  return <label className={`form-field${error ? ' is-missing' : ''}`} htmlFor={id} data-field-path={path}>
    <Label required={required} optional={optional}>{label}</Label>
    <Input id={id} ref={inputRef} className={multiline ? 'form-autosize' : undefined} type={multiline ? undefined : type} value={value ?? ''} rows={multiline ? 4 : undefined} placeholder={placeholder} autoFocus={autoFocus}
      aria-required={required || undefined} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      onChange={event => onChange(event.target.value)} />
    {hint && !error && <small className="form-hint" id={`${id}-hint`}>{hint}</small>}
    <ErrorText id={`${id}-error`} error={error} />
  </label>
}

function parseMonthYear(value) {
  const raw = String(value ?? '').trim()
  const full = raw.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/)
  if (full) {
    const month = MONTHS.findIndex(item => item.toLowerCase() === full[1].toLowerCase())
    return { month: month >= 0 ? MONTHS[month] : '', year: full[2], known: true }
  }
  const year = raw.match(/^(\d{4})$/)
  if (year) return { month: '', year: year[1], known: true }
  return { month: '', year: '', known: !raw }
}

/** Month + year pickers that store "Mon YYYY" (or "YYYY" when no month is chosen). */
export function MonthYearField({ label, path, value, onChange, required, optional, error, allowNoMonth = true, current, onCurrentChange, currentLabel }) {
  const id = fieldId(path)
  const isCurrent = current !== undefined && /^present$/i.test(String(value ?? '').trim())
  const parsed = parseMonthYear(isCurrent ? '' : value)
  const emit = (month, year) => onChange(year ? (month ? `${month} ${year}` : allowNoMonth ? year : `${MONTHS[0]} ${year}`) : '')
  return <fieldset className={`form-field form-month-year${error ? ' is-missing' : ''}`} data-field-path={path} aria-describedby={error ? `${id}-error` : undefined}>
    <legend><Label required={required} optional={optional}>{label}</Label></legend>
    <div className="form-month-year-row">
      <select aria-label={`${label} month`} value={parsed.month} disabled={isCurrent} onChange={event => emit(event.target.value, parsed.year || String(thisYear))}>
        <option value="">Month</option>
        {MONTHS.map(month => <option key={month} value={month}>{month}</option>)}
      </select>
      <select aria-label={`${label} year`} value={parsed.year} disabled={isCurrent} onChange={event => emit(parsed.month, event.target.value)}>
        <option value="">Year</option>
        {YEARS.map(year => <option key={year} value={year}>{year}</option>)}
      </select>
    </div>
    {!parsed.known && <small className="form-hint">Currently “{value}”. Pick a month and year to replace it.</small>}
    {onCurrentChange && <label className="form-check"><input type="checkbox" checked={isCurrent} onChange={event => onCurrentChange(event.target.checked)} />{currentLabel}</label>}
    <ErrorText id={`${id}-error`} error={error} />
  </fieldset>
}

/** One line per bullet, with add, remove and reorder. Enter adds the next bullet. */
export function BulletListField({ label, path, items, onChange, required, optional, error, placeholder, addLabel = 'Add bullet' }) {
  const id = fieldId(path)
  const rows = items.length ? items : ['']
  const inputsRef = useRef([])
  const update = next => onChange(next)
  const focusRow = index => requestAnimationFrame(() => inputsRef.current[index]?.focus())
  const move = (index, delta) => {
    const next = [...rows]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    update(next)
    focusRow(index + delta)
  }
  return <fieldset className={`form-field form-bullets${error ? ' is-missing' : ''}`} data-field-path={path} aria-describedby={error ? `${id}-error` : undefined}>
    <legend><Label required={required} optional={optional}>{label}</Label></legend>
    <ol>{rows.map((item, index) => <li key={index}>
      <span className="form-bullet-dot" aria-hidden="true" />
      <input ref={node => { inputsRef.current[index] = node }} value={item} placeholder={placeholder} aria-label={`${label} ${index + 1}`}
        onChange={event => update(rows.map((row, rowIndex) => rowIndex === index ? event.target.value : row))}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            update([...rows.slice(0, index + 1), '', ...rows.slice(index + 1)])
            focusRow(index + 1)
          }
          if (event.key === 'Backspace' && !item && rows.length > 1) {
            event.preventDefault()
            update(rows.filter((_, rowIndex) => rowIndex !== index))
            focusRow(Math.max(0, index - 1))
          }
        }} />
      <span className="form-row-actions">
        <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${label.toLowerCase()} ${index + 1} up`}>↑</button>
        <button type="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${label.toLowerCase()} ${index + 1} down`}>↓</button>
        <button type="button" onClick={() => update(rows.filter((_, rowIndex) => rowIndex !== index))} aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}>×</button>
      </span>
    </li>)}</ol>
    <button type="button" className="form-add-inline" onClick={() => { update([...rows, '']); focusRow(rows.length) }}>+ {addLabel}</button>
    <ErrorText id={`${id}-error`} error={error} />
  </fieldset>
}

/** Type a value and press Enter or comma to add it as a chip. Adds and removals are announced. */
export function TagField({ label, path, values, onChange, required, optional, error, placeholder, hint = 'Press Enter or type a comma after each one.', actions }) {
  const id = fieldId(path)
  const [draft, setDraft] = useState('')
  const add = raw => {
    const parts = raw.split(',').map(item => item.trim()).filter(Boolean)
    if (!parts.length) return
    const known = new Set(values.map(item => item.toLowerCase()))
    const added = parts.filter(item => !known.has(item.toLowerCase()))
    onChange([...values, ...added])
    setDraft('')
    if (added.length) announce(`Added ${added.join(', ')} to ${label}`)
  }
  const remove = value => {
    onChange(values.filter(item => item !== value))
    announce(`Removed ${value} from ${label}`)
  }
  return <div className={`form-field form-tags${error ? ' is-missing' : ''}`} data-field-path={path}>
    <span className="form-tags-head"><label htmlFor={id}><Label required={required} optional={optional}>{label}</Label></label>{actions}</span>
    <div className="form-tags-box">
      {values.map(value => <span className="form-tag" key={value}>{value}<button type="button" onClick={() => remove(value)} aria-label={`Remove ${value} from ${label}`}>×</button></span>)}
      <input id={id} value={draft} placeholder={values.length ? '' : placeholder} aria-invalid={error ? 'true' : undefined} aria-describedby={[error && `${id}-error`, `${id}-hint`].filter(Boolean).join(' ')}
        onChange={event => event.target.value.includes(',') ? add(event.target.value) : setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); add(draft) }
          if (event.key === 'Backspace' && !draft && values.length) remove(values.at(-1))
        }}
        onBlur={() => add(draft)} />
    </div>
    <small className="form-hint" id={`${id}-hint`}>{hint}</small>
    <ErrorText id={`${id}-error`} error={error} />
  </div>
}

// Groups anyone can start with; technical ones are offered as suggestions instead.
const STARTER_GROUPS = ['other', 'tools', 'softSkills']
const GROUP_SUGGESTIONS = ['Clinical skills', 'Teaching', 'Sales & negotiation', 'Customer service', 'Design tools', 'Trades & equipment', 'Research methods', 'Programming languages', 'Frameworks & libraries', 'Databases']

/**
 * Skills as named groups the person controls: starter groups, any group they add (custom names
 * print on the resume as typed), rename and remove. Data stays resumeData.skills = { group: [skill] }.
 */
export function SkillGroupsEditor({ skills = {}, onChange, error }) {
  const [revealed, setRevealed] = useState(() => new Set())
  const [dismissed, setDismissed] = useState(() => new Set())
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const list = key => Array.isArray(skills[key]) ? skills[key] : []
  const visible = Object.keys({ ...Object.fromEntries(STARTER_GROUPS.map(key => [key, []])), ...skills }).filter(key =>
    list(key).length > 0 || !isBuiltInSkillGroup(key) || revealed.has(key) || (STARTER_GROUPS.includes(key) && !dismissed.has(key)))
  const label = key => formGroupLabel(key)
  const visibleGroups = () => Object.fromEntries(visible.map(item => [item, list(item)]))

  const addGroup = name => {
    const { key, error: problem } = newGroupKey(name, visibleGroups())
    if (problem) { setMessage(problem); return }
    setMessage('')
    setDraft('')
    if (isBuiltInSkillGroup(key)) {
      setRevealed(current => new Set(current).add(key))
      setDismissed(current => { const next = new Set(current); next.delete(key); return next })
    } else onChange({ ...skills, [key]: [] })
    announce(`Added the skill group ${label(key)}`)
    requestAnimationFrame(() => document.getElementById(fieldId(`skills.${key}`))?.focus())
  }
  const removeGroup = key => {
    if (isBuiltInSkillGroup(key)) {
      onChange({ ...skills, [key]: [] })
      setRevealed(current => { const next = new Set(current); next.delete(key); return next })
      setDismissed(current => new Set(current).add(key))
    } else onChange(Object.fromEntries(Object.entries(skills).filter(([name]) => name !== key)))
    announce(`Removed the skill group ${label(key)}`)
  }
  const saveRename = key => {
    const name = renameDraft.trim()
    if (!name || name === label(key)) { setRenaming(null); return }
    // Starter groups that are still empty may not be in the data yet, so rename from what is shown.
    const result = renameSkillGroup({ ...visibleGroups(), ...skills }, key, name)
    if (result.error) { setMessage(result.error); return }
    setMessage('')
    setRenaming(null)
    if (isBuiltInSkillGroup(key)) setDismissed(current => new Set(current).add(key))
    onChange(result.skills)
    announce(`Renamed ${label(key)} to ${name}`)
  }

  return <div className="form-skill-groups">
    {error && <p className="form-error form-section-error" data-field-path="skills" role="alert">{error}</p>}
    {visible.map(key => renaming === key
      ? <div className="form-field form-skill-rename" key={key}>
        <label htmlFor="form-skill-rename"><Label>Rename “{label(key)}”</Label></label>
        <div className="form-inline-row">
          <input id="form-skill-rename" autoFocus value={renameDraft} maxLength={40} onChange={event => setRenameDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveRename(key) } if (event.key === 'Escape') setRenaming(null) }} />
          <button type="button" className="btn btn-secondary" onClick={() => saveRename(key)}>Save</button>
          <button type="button" className="form-text-button" onClick={() => setRenaming(null)}>Cancel</button>
        </div>
      </div>
      : <TagField key={key} label={label(key)} path={`skills.${key}`} values={list(key)} onChange={value => onChange({ ...skills, [key]: value })} placeholder="Type a skill and press Enter"
        actions={<span className="form-group-actions">
          <button type="button" className="form-text-button" onClick={() => { setRenaming(key); setRenameDraft(label(key)) }} aria-label={`Rename the ${label(key)} group`}>Rename</button>
          <button type="button" className="form-text-button" onClick={() => removeGroup(key)} aria-label={`Remove the ${label(key)} group${list(key).length ? ` and its ${list(key).length} skills` : ''}`}>Remove</button>
        </span>} />)}
    <fieldset className="form-field form-add-group">
      <legend><Label optional>Add a skill group</Label></legend>
      <div className="form-inline-row">
        <input id="form-new-skill-group" value={draft} maxLength={40} placeholder="e.g. Patient care, Culinary skills" aria-label="New skill group name" aria-describedby="form-new-skill-group-hint"
          onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addGroup(draft) } }} />
        <button type="button" className="btn btn-secondary" onClick={() => addGroup(draft)}>Add group</button>
      </div>
      <small className="form-hint" id="form-new-skill-group-hint">Name it after your field. It prints on your resume exactly as you type it.</small>
      {message && <small className="form-error" role="alert">{message}</small>}
      <div className="form-group-suggestions" role="group" aria-label="Suggested skill groups">
        {GROUP_SUGGESTIONS.filter(name => !visible.some(key => label(key).toLowerCase() === name.toLowerCase())).map(name =>
          <button type="button" className="form-suggestion" key={name} onClick={() => addGroup(name)}>+ {name}</button>)}
      </div>
    </fieldset>
  </div>
}

/** Free-text sections with a title (Volunteering, Licences, Publications…), printed by every template. */
export function CustomSectionsEditor({ sections = [], onChange, errors = {} }) {
  const rows = Array.isArray(sections) ? sections : []
  const update = (index, field, value) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row))
  return <div className="form-custom-sections">
    {rows.map((row, index) => <section className={`form-entry is-open${errors[`customSections.${index}.title`] || errors[`customSections.${index}.content`] ? ' has-missing' : ''}`} key={index} aria-label={row.title || `Section ${index + 1}`}>
      <div className="form-entry-body">
        <TextField label="Section title" path={`customSections.${index}.title`} value={row.title} onChange={value => update(index, 'title', value)} required error={errors[`customSections.${index}.title`]} placeholder="e.g. Volunteering" />
        <TextField label="Text" path={`customSections.${index}.content`} multiline value={row.content} onChange={value => update(index, 'content', value)} required error={errors[`customSections.${index}.content`]} hint="Write it as it should appear on the resume." />
        <button type="button" className="form-text-button" onClick={() => { onChange(rows.filter((_, rowIndex) => rowIndex !== index)); announce(`Removed ${row.title || `section ${index + 1}`}`) }}>Remove this section</button>
      </div>
    </section>)}
    <button type="button" className="form-add-entry" onClick={() => { onChange([...rows, { title: '', content: '' }]); announce('Added a new section') }}>+ Add a section</button>
    <p className="form-hint">Ideas: Volunteering, Licences, Publications, Portfolio, Interests, References.</p>
  </div>
}

/** Collapsible card for one experience, education or project entry. */
export function EntryCard({ title, subtitle, index, count, open, onToggle, onMove, onRemove, hasError, children }) {
  return <section className={`form-entry${open ? ' is-open' : ''}${hasError ? ' has-missing' : ''}`}>
    <header>
      <button type="button" className="form-entry-toggle" aria-expanded={open} onClick={onToggle}>
        <span className="form-entry-chevron" aria-hidden="true">▸</span>
        <span><b>{title}</b>{subtitle && <small>{subtitle}</small>}</span>
      </button>
      <span className="form-row-actions">
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${title} up`}>↑</button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${title} down`}>↓</button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${title}`}>×</button>
      </span>
    </header>
    {open && <div className="form-entry-body">{children}</div>}
  </section>
}
