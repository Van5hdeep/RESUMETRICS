import { useEffect, useMemo, useRef, useState } from 'react'
import { getTemplateSectionPlan } from '../templates/ResumeTemplateLayout.jsx'
import { blockingSections, formSectionsFor, isBlankEntry, percentColour, sectionInfo, sectionProgress, SUMMARY_MIN } from '../../form/sectionProgress.js'
import { announce, BulletListField, CustomSectionsEditor, EntryCard, focusFirstMissing, MonthYearField, SkillGroupsEditor, TagField, TextField } from './FormFields.jsx'
import LanguagePicker from './LanguagePicker.jsx'
import { templateSectionNotes } from './templateSectionNotes.js'
import { CONFIGURABLE_SECTIONS, isSectionHidden, MAX_SECTION_TITLE, moveSection, normalizeSectionSettings } from '../../editor/sectionSettings.js'

const list = value => Array.isArray(value) ? value : []
const emptyEntry = {
  experience: () => ({ role: '', company: '', location: '', startDate: '', endDate: '', bullets: [''] }),
  education: () => ({ degree: '', institution: '', location: '', startDate: '', endDate: '', details: [] }),
  projects: () => ({ name: '', description: '', techStack: [], bullets: [] })
}

function setPath(source, path, value) {
  const next = structuredClone(source ?? {})
  const parts = path.split('.')
  let target = next
  parts.slice(0, -1).forEach((part, index) => {
    const key = /^\d+$/.test(part) ? Number(part) : part
    if (target[key] == null || typeof target[key] !== 'object') target[key] = /^\d+$/.test(parts[index + 1]) ? [] : {}
    target = target[key]
  })
  const last = parts.at(-1)
  target[/^\d+$/.test(last) ? Number(last) : last] = value
  return next
}

const icons = {
  personal: <path d="M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 7c.6-3.2 3-5 6-5s5.4 1.8 6 5" />,
  summary: <path d="M5 3h7l3 3v11H5V3Zm7 0v3h3M7.5 9.5h5M7.5 12.5h5M7.5 15h3" />,
  experience: <path d="M3 7h14v9H3V7Zm4.5 0V5h5v2M3 11h14" />,
  education: <path d="m2 7 8-4 8 4-8 4-8-4Zm3 1.6V13c1.4 1.3 3 2 5 2s3.6-.7 5-2V8.6M18 7v5" />,
  projects: <path d="M3 5h5l1.5 2H17v9H3V5Z" />,
  skills: <path d="M10 2.5 12 7l5 .5-3.7 3.3 1 4.9L10 13.3l-4.3 2.4 1-4.9L3 7.5 8 7l2-4.5Z" />,
  languages: <path d="M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm-7-7h14M10 3c2 2 2.8 4.4 2.8 7S12 15 10 17c-2-2-2.8-4.4-2.8-7S8 5 10 3Z" />,
  certifications: <path d="M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-2.5 0-1 5.5L10 16l3.5 1.5-1-5.5" />,
  achievements: <path d="M6 3h8v4a4 4 0 0 1-8 0V3Zm0 1H3.5c0 2.5 1 4 2.8 4.2M14 4h2.5c0 2.5-1 4-2.8 4.2M10 11v3m-3 3h6l-.6-3H7.6L7 17Z" />,
  customSections: <path d="M4 4h12v12H4V4Zm6 3v6M7 10h6" />,
  eye: <><path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10Z" /><path d="M10 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" /></>,
  eyeOff: <><path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10Z" /><path d="M3 3l14 14" /></>
}

function SectionIcon({ id, className = 'form-section-icon' }) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true">{icons[id]}</svg>
}

function StatusBadge({ complete, progress }) {
  if (complete) return <span className="form-status is-complete" title="Section complete"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3L15 6.5" /></svg><span className="visually-hidden">Complete</span></span>
  if (progress.empty && !progress.required) return <span className="form-status is-optional">Optional</span>
  return <span className="form-status is-percent" style={{ '--status-colour': percentColour(progress.percent) }}>{progress.percent}%<span className="visually-hidden"> complete</span></span>
}

/**
 * The scratch-resume form: a list of section cards; "+" opens a section's questions; "Complete section"
 * is enabled once the section's mandatory fields are valid. Continuing to the editor is blocked until
 * every mandatory field in every section is filled.
 */
export default function SectionForm({ template, resumeData, onChange, supportsPhoto, hasPhoto, onPhotoUpload, onPhotoRemove, photoControls, photoError, confirmed, onConfirm, activeSection, onActiveSectionChange, onContinue, sectionSettings, onSectionSettingsChange }) {
  const sections = useMemo(() => formSectionsFor(getTemplateSectionPlan(template?.id, sectionSettings)), [template?.id, sectionSettings?.order]) // eslint-disable-line react-hooks/exhaustive-deps
  const canConfigure = Boolean(onSectionSettingsChange)
  const settings = sectionSettings ?? {}
  const isHidden = id => canConfigure && isSectionHidden(settings, id)
  const changeSettings = patch => onSectionSettingsChange(normalizeSectionSettings({ ...settings, ...patch }))
  const toggleHidden = id => {
    changeSettings({ hidden: { ...settings.hidden, [id]: !settings.hidden?.[id] } })
    announce(isHidden(id) ? `${sectionInfo[id].title} will show on your resume` : `${sectionInfo[id].title} is hidden from your resume`)
  }
  const shiftSection = (id, delta) => {
    const order = moveSection(sections, id, delta)
    if (!order) return
    changeSettings({ order })
    announce(`Moved ${sectionInfo[id].title} ${delta < 0 ? 'up' : 'down'}`)
  }
  const canShift = (id, delta) => Boolean(moveSection(sections, id, delta))
  const options = { supportsPhoto, hasPhoto }
  const [showMissing, setShowMissing] = useState(false)
  const [openEntries, setOpenEntries] = useState({})
  const [blockers, setBlockers] = useState(null)
  const detailRef = useRef(null)
  const notes = templateSectionNotes[template?.id] ?? {}
  const active = sections.find(section => section.id === activeSection) ?? null
  const progress = active ? sectionProgress(active.id, resumeData, options) : null
  const errors = useMemo(() => showMissing && progress ? Object.fromEntries(progress.missing.map(item => [item.path, item.message])) : {}, [progress, showMissing])

  const update = (path, value) => onChange(setPath(resumeData, path, value))
  const updateList = (key, callback) => onChange({ ...resumeData, [key]: callback(list(resumeData[key])) })

  const openSection = (id, highlight = false) => {
    setShowMissing(highlight)
    onActiveSectionChange(id)
    if (highlight) {
      // Open every entry that still has a mandatory field missing.
      const missing = sectionProgress(id, resumeData, options).missing
      setOpenEntries(current => ({ ...current, ...Object.fromEntries(missing.map(item => item.path.split('.').slice(0, 2).join('.')).map(key => [key, true])) }))
    }
  }

  useEffect(() => {
    if (!active) return
    detailRef.current?.scrollTo({ top: 0 })
    if (!showMissing) return
    setTimeout(() => focusFirstMissing(detailRef.current), 60)
  }, [active?.id, showMissing]) // eslint-disable-line react-hooks/exhaustive-deps

  const tryContinue = () => {
    // A section hidden from the resume cannot hold the person back.
    const blocking = blockingSections(sections.filter(section => !isHidden(section.id)), resumeData, options)
    if (blocking.length) setBlockers(blocking)
    else onContinue()
  }

  const entryKey = (sectionId, index) => `${sectionId}.${index}`
  const isEntryOpen = (sectionId, index) => openEntries[entryKey(sectionId, index)] ?? index === list(resumeData[sectionId]).length - 1
  const addEntry = sectionId => {
    const nextIndex = list(resumeData[sectionId]).length
    updateList(sectionId, items => [...items, emptyEntry[sectionId]()])
    setOpenEntries(current => ({ ...current, [entryKey(sectionId, nextIndex)]: true }))
  }
  const moveEntry = (sectionId, index, delta) => updateList(sectionId, items => {
    const next = [...items]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    return next
  })
  const entryHasError = (sectionId, index) => Object.keys(errors).some(path => path.startsWith(`${sectionId}.${index}.`))

  const renderEntries = (sectionId, renderFields, describe, addLabel) => {
    const items = list(resumeData[sectionId])
    return <>
      {errors[`${sectionId}.0`] && !items.length && <p className="form-error form-section-error" data-field-path={`${sectionId}.0`}>{errors[`${sectionId}.0`]}</p>}
      {items.map((item, index) => {
        const [title, subtitle] = describe(item, index)
        return <EntryCard key={item.id || index} title={title} subtitle={subtitle} index={index} count={items.length}
          open={isEntryOpen(sectionId, index)} hasError={entryHasError(sectionId, index)}
          onToggle={() => setOpenEntries(current => ({ ...current, [entryKey(sectionId, index)]: !isEntryOpen(sectionId, index) }))}
          onMove={delta => moveEntry(sectionId, index, delta)}
          onRemove={() => updateList(sectionId, current => current.filter((_, itemIndex) => itemIndex !== index))}>
          {renderFields(item, index, field => `${sectionId}.${index}.${field}`)}
        </EntryCard>
      })}
      <button type="button" className="form-add-entry" onClick={() => addEntry(sectionId)}>+ {addLabel}</button>
    </>
  }

  const renderSectionFields = id => {
    if (id === 'personal') {
      const links = list(resumeData.links).map(link => typeof link === 'string' ? { label: '', url: link } : { label: link?.label ?? '', url: link?.url ?? '' })
      const setLinks = next => update('links', next)
      return <>
        <div className="form-grid">
          <TextField label="Full name" path="fullName" value={resumeData.fullName} onChange={value => update('fullName', value)} required error={errors.fullName} autoFocus />
          <TextField label="Professional headline" path="headline" value={resumeData.headline} onChange={value => update('headline', value)} optional placeholder="e.g. Registered Nurse, Sales Manager, Teacher" />
          <TextField label="Email" path="email" type="email" value={resumeData.email} onChange={value => update('email', value)} required error={errors.email} placeholder="you@example.com" />
          <TextField label="Phone" path="phone" type="tel" value={resumeData.phone} onChange={value => update('phone', value)} required error={errors.phone} placeholder="+91 98765 43210" />
          <TextField label="Location" path="location" value={resumeData.location} onChange={value => update('location', value)} optional placeholder="City, Country" />
        </div>
        <fieldset className={`form-field form-links${errors.links ? ' is-missing' : ''}`} data-field-path="links">
          <legend><span className="form-label">Links<span className="form-optional"> (optional)</span></span></legend>
          {links.map((link, index) => <div className="form-link-row" key={index}>
            <input value={link.label} placeholder="Label, e.g. LinkedIn" aria-label={`Link ${index + 1} label`} onChange={event => setLinks(links.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
            <input value={link.url} type="url" placeholder="https://" aria-label={`Link ${index + 1} address`} onChange={event => setLinks(links.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value.trim() } : item))} />
            <button type="button" className="form-icon-button" onClick={() => setLinks(links.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove link ${index + 1}`}>×</button>
          </div>)}
          <button type="button" className="form-add-inline" onClick={() => setLinks([...links, { label: '', url: '' }])}>+ Add link</button>
          {errors.links && <small className="form-error">{errors.links}</small>}
        </fieldset>
        {supportsPhoto && <fieldset className="form-field form-photo">
          <legend><span className="form-label">Photo<span className="form-optional"> (optional)</span></span></legend>
          <div className="form-photo-actions">
            <button type="button" className="btn btn-secondary" onClick={onPhotoUpload}>{hasPhoto ? 'Replace photo' : 'Upload JPEG photo'}</button>
            {hasPhoto && <button type="button" className="form-text-button" onClick={onPhotoRemove}>Remove</button>}
          </div>
          {photoError && <small className="form-error">{photoError}</small>}
          {photoControls}
        </fieldset>}
      </>
    }
    if (id === 'summary') {
      const length = String(resumeData.summary ?? '').trim().length
      return <TextField label="Summary" path="summary" multiline value={resumeData.summary} onChange={value => update('summary', value)} required error={errors.summary}
        hint={`${length} characters${length < SUMMARY_MIN ? ` — at least ${SUMMARY_MIN} needed` : ''}. Say what you do, your strongest skills and what you are looking for.`} />
    }
    if (id === 'experience') return renderEntries('experience', (item, index, at) => <>
      <div className="form-grid">
        <TextField label="Job title or role" path={at('role')} value={item.role} onChange={value => update(at('role'), value)} required error={errors[at('role')]} />
        <TextField label="Company or organisation" path={at('company')} value={item.company} onChange={value => update(at('company'), value)} required error={errors[at('company')]} />
        <MonthYearField label="Start date" path={at('startDate')} value={item.startDate} onChange={value => update(at('startDate'), value)} required error={errors[at('startDate')]} allowNoMonth={false} />
        <MonthYearField label="End date" path={at('endDate')} value={item.endDate} onChange={value => update(at('endDate'), value)} required error={errors[at('endDate')]} allowNoMonth={false}
          current onCurrentChange={checked => update(at('endDate'), checked ? 'Present' : '')} currentLabel="I currently work here" />
        <TextField label="Location" path={at('location')} value={item.location} onChange={value => update(at('location'), value)} optional />
      </div>
      <BulletListField label="Achievements" path={at('bullets')} items={list(item.bullets)} onChange={value => update(at('bullets'), value)} required error={errors[at('bullets')]} placeholder="Start with a verb: Led, Cared for, Taught, Sold, Built…" addLabel="Add achievement" />
    </>, (item, index) => [item.role || `Position ${index + 1}`, [item.company, [item.startDate, item.endDate].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')], 'Add experience')
    if (id === 'education') return renderEntries('education', (item, index, at) => <>
      <div className="form-grid">
        <TextField label="Degree or qualification" path={at('degree')} value={item.degree} onChange={value => update(at('degree'), value)} required error={errors[at('degree')]} placeholder="e.g. B.Sc Nursing, Diploma in Hospitality" />
        <TextField label="School or institution" path={at('institution')} value={item.institution} onChange={value => update(at('institution'), value)} required error={errors[at('institution')]} />
        <MonthYearField label="Start" path={at('startDate')} value={item.startDate} onChange={value => update(at('startDate'), value)} optional />
        <MonthYearField label="End (or expected)" path={at('endDate')} value={item.endDate} onChange={value => update(at('endDate'), value)} required error={errors[at('endDate')]}
          current onCurrentChange={checked => update(at('endDate'), checked ? 'Present' : '')} currentLabel="I'm currently studying here" />
        <TextField label="Location" path={at('location')} value={item.location} onChange={value => update(at('location'), value)} optional />
      </div>
      <BulletListField label="GPA, coursework or honours" path={at('details')} items={list(item.details)} onChange={value => update(at('details'), value)} optional placeholder="e.g. First-class honours, CGPA 8.6/10" addLabel="Add detail" />
    </>, (item, index) => [item.degree || `Education ${index + 1}`, [item.institution, item.endDate].filter(Boolean).join(' · ')], 'Add education')
    if (id === 'projects') return renderEntries('projects', (item, index, at) => <>
      <TextField label="Project name" path={at('name')} value={item.name} onChange={value => update(at('name'), value)} required error={errors[at('name')]} />
      <TextField label="Description" path={at('description')} multiline value={item.description} onChange={value => update(at('description'), value)} required error={errors[at('description')]} hint="Work you are proud of (a campaign, research, event, design or build): what it was and what it achieved." />
      <TagField label="Tools, skills or methods used" path={at('techStack')} values={list(item.techStack)} onChange={value => update(at('techStack'), value)} optional placeholder="Type and press Enter" />
      <BulletListField label="Contributions or results" path={at('bullets')} items={list(item.bullets)} onChange={value => update(at('bullets'), value)} optional addLabel="Add result" />
    </>, (item, index) => [item.name || `Project ${index + 1}`, list(item.techStack).slice(0, 3).join(', ')], 'Add project')
    if (id === 'skills') return <SkillGroupsEditor skills={resumeData.skills ?? {}} onChange={value => onChange({ ...resumeData, skills: value })} error={errors.skills} />
    if (id === 'customSections') return <CustomSectionsEditor sections={resumeData.customSections} onChange={value => onChange({ ...resumeData, customSections: value })} errors={errors} />
    if (id === 'languages') return <LanguagePicker value={list(resumeData.languages).filter(Boolean)} onChange={value => update('languages', value)} />
    if (id === 'certifications' || id === 'achievements') return <BulletListField label={id === 'certifications' ? 'Certification' : 'Achievement'} path={id} items={list(resumeData[id])} onChange={value => update(id, value)} optional addLabel={id === 'certifications' ? 'Add certification' : 'Add achievement'} placeholder={id === 'certifications' ? 'e.g. CPR and First Aid (2025)' : 'e.g. Employee of the Month, March 2025'} />
    return null
  }

  if (active) {
    const complete = progress.valid && !progress.empty
    const skip = progress.empty && !progress.required
    return <div className="section-form is-detail">
      <p id="form-live-region" className="visually-hidden" aria-live="polite" />
      <header className="form-detail-header">
        <button type="button" className="form-back" onClick={() => onActiveSectionChange(null)} aria-label="Back to all sections">←</button>
        <SectionIcon id={active.id} />
        <div><h2>{active.title}</h2><small>{active.required ? 'Required section' : 'Optional section'} · <span className="form-required">*</span> mandatory field</small></div>
      </header>
      {canConfigure && CONFIGURABLE_SECTIONS.includes(active.id) && <div className="form-resume-options">
        <label className="form-field" htmlFor="form-section-heading">
          <span className="form-label">Heading on your resume<span className="form-optional"> (optional)</span></span>
          <input id="form-section-heading" value={settings.titles?.[active.id] ?? ''} maxLength={MAX_SECTION_TITLE} placeholder={active.title}
            onChange={event => changeSettings({ titles: { ...settings.titles, [active.id]: event.target.value } })} />
        </label>
        <label className="form-check"><input type="checkbox" checked={!isHidden(active.id)} onChange={() => toggleHidden(active.id)} />Show this section on my resume</label>
      </div>}
      {notes[active.id] && <p className="form-template-note">{notes[active.id]}</p>}
      <div className="form-detail-body" ref={detailRef}>{renderSectionFields(active.id)}</div>
      <footer className="form-detail-footer">
        {!progress.valid && <p className="form-still-needed">
          {progress.missing.length} mandatory {progress.missing.length === 1 ? 'field' : 'fields'} left.{' '}
          {!showMissing && <button type="button" className="form-text-button" onClick={() => openSection(active.id, true)}>Show me</button>}
        </p>}
        <button type="button" className="btn btn-primary form-complete" disabled={!complete && !skip}
          onClick={() => {
            if (complete) onConfirm(active.id)
            // Skipping drops entries that were added but never filled, so they don't show on the resume.
            if (skip && Array.isArray(resumeData[active.id])) onChange({ ...resumeData, [active.id]: resumeData[active.id].filter(item => typeof item !== 'object' || !isBlankEntry(item)) })
            onActiveSectionChange(null)
          }}>
          {skip ? 'Skip section' : 'Complete section'}
        </button>
      </footer>
    </div>
  }

  const states = sections.map(section => {
    const sectionState = sectionProgress(section.id, resumeData, options)
    return { ...section, progress: sectionState, complete: Boolean(confirmed[section.id]) && sectionState.valid && !sectionState.empty }
  })
  const required = states.filter(section => section.required && !isHidden(section.id))
  const overall = Math.round(required.reduce((sum, section) => sum + (section.progress.valid ? 100 : section.progress.percent), 0) / Math.max(required.length, 1))

  return <div className="section-form is-list">
    <p id="form-live-region" className="visually-hidden" aria-live="polite" />
    <header className="form-list-header">
      <h2>Fill in your resume</h2>
      <p>Open a section with <b>+</b>. The preview updates as you type.{canConfigure && <> Use the eye to hide a section and the arrows to reorder.{settings.order?.length > 0 && <> <button type="button" className="form-text-button" onClick={() => changeSettings({ order: undefined })}>Reset order</button></>}</>}</p>
    </header>
    <ul className="form-section-list">{states.map(section => <li key={section.id}>
      <div className={`form-section-card${section.complete ? ' is-complete' : ''}${canConfigure ? ' has-tools' : ''}${isHidden(section.id) ? ' is-hidden' : ''}`}>
        <StatusBadge complete={section.complete} progress={section.progress} />
        <SectionIcon id={section.id} />
        <span className="form-section-text"><b>{section.title}{section.required && !isHidden(section.id) && <span className="form-required" title="Required section"> *</span>}</b><small>{isHidden(section.id) ? 'Hidden from your resume' : settings.titles?.[section.id]?.trim() ? `Prints as “${settings.titles[section.id].trim()}”` : section.hint}</small></span>
        {canConfigure && <span className="form-card-tools">{CONFIGURABLE_SECTIONS.includes(section.id) && <>
          <button type="button" aria-pressed={isHidden(section.id)} onClick={() => toggleHidden(section.id)} title={isHidden(section.id) ? 'Show on resume' : 'Hide from resume'}
            aria-label={isHidden(section.id) ? `Show ${section.title} on your resume` : `Hide ${section.title} from your resume`}><SectionIcon className="form-tool-icon" id={isHidden(section.id) ? 'eyeOff' : 'eye'} /></button>
          <button type="button" disabled={!canShift(section.id, -1)} onClick={() => shiftSection(section.id, -1)} aria-label={`Move ${section.title} up`} title="Move up">↑</button>
          <button type="button" disabled={!canShift(section.id, 1)} onClick={() => shiftSection(section.id, 1)} aria-label={`Move ${section.title} down`} title="Move down">↓</button>
        </>}</span>}
        <button type="button" className={section.complete ? 'form-section-edit' : 'form-section-open'} onClick={() => openSection(section.id)}
          aria-label={section.complete ? `Edit ${section.title}` : `Fill in ${section.title}`}>{section.complete ? 'Edit section' : '+'}</button>
      </div>
    </li>)}</ul>
    <footer className="form-list-footer">
      <div className="form-overall"><span>Required sections</span><b style={{ color: percentColour(overall) }}>{overall}%</b><span className="form-overall-bar"><span style={{ width: `${overall}%`, background: percentColour(overall) }} /></span></div>
      <button type="button" className="btn btn-primary" onClick={tryContinue}>Continue to editor <span aria-hidden="true">→</span></button>
    </footer>
    {blockers && <div className="form-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setBlockers(null) }}>
      <section className="form-dialog" role="alertdialog" aria-modal="true" aria-labelledby="form-blockers-title" aria-describedby="form-blockers-text">
        <span className="form-dialog-icon" aria-hidden="true">!</span>
        <h2 id="form-blockers-title">Mandatory fields are still empty</h2>
        <p id="form-blockers-text">Fill these in before moving to the editor. Click a section to see exactly what is missing.</p>
        <ul className="form-blocker-list">{blockers.map(section => <li key={section.id}>
          <button type="button" onClick={() => { setBlockers(null); openSection(section.id, true) }}>
            <SectionIcon id={section.id} /><span><b>{section.title}</b><small>{section.progress.missing.length} mandatory {section.progress.missing.length === 1 ? 'field' : 'fields'} left</small></span><span aria-hidden="true">→</span>
          </button>
        </li>)}</ul>
        <div className="form-dialog-actions"><button type="button" className="btn btn-secondary" onClick={() => setBlockers(null)} autoFocus>Keep filling</button></div>
      </section>
    </div>}
  </div>
}
