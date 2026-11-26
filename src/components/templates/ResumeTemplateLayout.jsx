import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { adaptResumeForTemplate, linkDisplayLabel } from '../../templates/templateDataAdapter.js'
import { findFont, loadFontsForPresentation, loadResumeFont } from '../../editor/fontRegistry.js'
import { applySectionOrder, shapeSections } from '../../editor/sectionSettings.js'
import { parseMarks, rangeOffsetsWithin, readMarkedText } from '../../editor/inlineMarks.js'
import { skillGroupLabel } from '../../../shared/skillGroups.js'
import { layoutStyle } from '../../../shared/resumeLayout.js'

const valueOr = (value, fallback) => value || fallback
const asArray = value => Array.isArray(value) ? value : []
const allSkills = skills => Object.values(skills ?? {}).flat().filter(Boolean)
const period = item => [item?.startDate, item?.endDate].filter(Boolean).join(' — ')
export const A4_RATIO = 297 / 210
const PAGE_EDGE_TOLERANCE = 4
// Height a block really takes in the flow: its box plus its own vertical margins.
const outerHeight = element => {
  if (!element) return 0
  const style = window.getComputedStyle(element)
  return element.offsetHeight + parseFloat(style.marginTop || 0) + parseFloat(style.marginBottom || 0)
}
export const MAX_A4_WIDTH = 794

// LaTeX template clones (PLAN-027). Each entry switches on the few markup differences CSS cannot make;
// everything else lives in latex-templates.css. `base` is the body size in px on an A4 page.
//   nameSplit       first name and the rest in separate spans (still one editable fullName)
//   contactSection  contact details print as a section (so they paginate) instead of in the header
//   contactLabels   a label beside each contact line (from CSS); links show their address, as with linkAddress
//   entryLayout     arrangement of experience / education / project entries
//   skillChips      each skill in its own box; skillSeparator joins a group's skills
//   leadSections    sections printed full width above the two columns
//   sidebarIds      sections in the second column; sidebarSide is where that column sits
export const latexTemplateFeatures = {
  'minimal-academic': { base: 13.3333, nameSplit: true, contactSection: { title: 'Contact info' }, contactLabels: true, entryLayout: 'academic', dash: '-' },
  'libre-cv': { base: 16, linkAddress: true, entryLayout: 'libre', dash: ' – ', skillSeparator: ' · ', sidebarSide: 'right', sidebarIds: ['skills', 'languages', 'certifications', 'achievements'] },
  'simple-hipster': { base: 12, nameSplit: true, contactSection: { title: 'Contact' }, entryLayout: 'hipster', dash: '–', skillChips: true, sidebarSide: 'left', sidebarIds: ['summary', 'languages', 'contact'] },
  'keywords-cv': { base: 13.3333, nameSplit: true, contactLabels: true, entryLayout: 'keywords', dash: ' - ', leadSections: ['summary'], sidebarSide: 'right', sidebarIds: ['projects', 'education', 'certifications', 'achievements'] },
  'elegant-resume': { base: 13.3333, entryLayout: 'elegant', dash: ' – ' },
  'developer-cv': { base: 12, entryLayout: 'developer', dash: ' – ' }
}
export const featuresFor = variant => latexTemplateFeatures[variant] ?? {}
export const isLatexVariant = variant => Object.hasOwn(latexTemplateFeatures, variant)
const inCloneSidebar = (features, id) => Boolean(features.sidebarIds) && (features.sidebarIds.includes(id) || (String(id).startsWith('custom-') && features.sidebarSide !== 'none'))

// Per-element formatting from the editor's format panel (presentation.elementOverrides) and the current selection.
export const ResumeStyleContext = createContext({ overrides: {}, selectedId: null, focusSectionId: null, features: {} })

// Sizes are stored as they print on an A4 page; --page-scale shrinks them with the on-screen page.
export function overrideToStyle(override = {}) {
  const style = {}
  if (override.fontFamily) style.fontFamily = findFont(override.fontFamily)?.family ?? override.fontFamily
  if (override.fontWeight) style.fontWeight = override.fontWeight
  if (override.fontStyle) style.fontStyle = override.fontStyle
  if (override.textDecoration) style.textDecoration = override.textDecoration
  if (override.color) style.color = override.color
  if (Number.isFinite(override.lineHeight)) style.lineHeight = override.lineHeight
  // One element's size relative to the template's (NIMBUS: "make my name bigger"), so it scales with the page.
  if (Number.isFinite(override.fontScale) && override.fontScale !== 1) style.fontSize = `${override.fontScale}em`
  if (Number.isFinite(override.letterSpacing)) style.letterSpacing = `calc(${override.letterSpacing}px * var(--page-scale, 1))`
  if (override.textAlign) {
    style.textAlign = override.textAlign
    style.display = 'block'
  }
  return style
}

const markTags = { b: 'strong', i: 'em', u: 'u', s: 's' }

// Text with inline marks becomes nested <strong>/<em>/<u>/<s>; plain strings render unchanged.
export function MarkedText({ text }) {
  const runs = parseMarks(text)
  if (!runs.some(run => run.marks.length)) return runs.map(run => run.text).join('')
  return runs.map((run, index) => <span key={index}>{run.marks.reduceRight((child, mark) => {
    const Tag = markTags[mark]
    return <Tag>{child}</Tag>
  }, run.text)}</span>)
}

export function StyledElement({ as: Tag = 'span', elementId, path, children }) {
  const { overrides, selectedId } = useContext(ResumeStyleContext)
  const override = overrides?.[elementId]
  return <Tag
    data-resume-path={path}
    data-resume-element-id={elementId}
    data-selected={selectedId && selectedId === elementId ? 'true' : undefined}
    style={override ? overrideToStyle(override) : undefined}
  >{typeof children === 'string' ? <MarkedText text={children} /> : children}</Tag>
}

function EditableText({ path, elementId = path, children }) {
  return <StyledElement path={path} elementId={elementId}>{children}</StyledElement>
}

const itemKey = (item, itemIndex) => item?.id || itemIndex

// "Jane van Doe" → <span.name-first>Jane</span> <span.name-rest>van Doe</span>, still one editable name.
function SplitName({ name }) {
  const [first, ...rest] = String(name).trim().split(/\s+/)
  return <><span className="name-first">{first}</span>{rest.length > 0 && <>{' '}<span className="name-rest">{rest.join(' ')}</span></>}</>
}

const addressOf = item => String(item.address || item.href || item.value).replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')

export function ContactList({ items, blankPreview, inSection = false }) {
  const { features } = useContext(ResumeStyleContext)
  return <address className={`generated-contact${inSection ? ' generated-contact-section' : ''}`}>
    {items.length
      ? items.map((item, index) => item.kind === 'link' && item.href
        ? <a className="generated-contact-link" href={item.href} key={item.path || index} target="_blank" rel="noreferrer" title={item.address || item.href}><EditableText path={item.path} elementId={`resume.header.link.${index}`}>{features.contactLabels || features.linkAddress ? addressOf(item) : item.value}</EditableText></a>
        : <EditableText path={item.path} elementId={`resume.header.${item.kind}`} key={item.path || index}>{item.value}</EditableText>)
      : !blankPreview && <EditableText path="email" elementId="resume.header.email">email@example.com</EditableText>}
  </address>
}

// A name never wraps or breaks mid-word: when it is wider than its space, the whole name shrinks
// (through --name-fit) until its widest line fits. Split-name designs keep their own line per part.
function useOneLineName(ref, name) {
  useLayoutEffect(() => {
    const heading = ref.current
    if (!heading) return undefined
    let frame = 0
    const fit = () => {
      heading.style.setProperty('--name-fit', '1')
      let scale = 1
      for (let pass = 0; pass < 4; pass += 1) {
        const room = heading.clientWidth
        const natural = heading.scrollWidth
        if (!room || natural <= room) break
        scale = Math.max(.3, Math.floor(scale * room / natural * 1000) / 1000 - .002)
        heading.style.setProperty('--name-fit', String(scale))
      }
    }
    fit()
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit) }
    const observer = new ResizeObserver(schedule)
    observer.observe(heading)
    heading.addEventListener('input', schedule)
    document.fonts?.ready.then(schedule)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); heading.removeEventListener('input', schedule) }
  }, [ref, name])
}

export function ResumeHeader({ resumeData, presentation = {}, blankPreview = false, onProfilePhotoClick }) {
  const { selectedId, focusSectionId, features } = useContext(ResumeStyleContext)
  const nameRef = useRef(null)
  useOneLineName(nameRef, `${resumeData.fullName ?? ''}|${presentation?.fontFamily ?? ''}|${presentation?.nameScale ?? ''}`)
  const contactItems = resumeData.contactItems ?? []
  const photo = presentation.photo
  const requestedPhotoSize = Math.max(Number(photo?.width) || 64, Number(photo?.height) || 64)
  // A real image can have any natural dimensions. Keep its frame predictable
  // and crop within it so a portrait/landscape upload never changes header flow.
  const photoSize = Math.max(48, Math.min(requestedPhotoSize, 96))
  return <header className={`generated-resume-header${focusSectionId === 'personal' ? ' is-form-focus' : ''}`} data-page-header>
    {(resumeData.fullName || resumeData.headline || !blankPreview) && <div className="generated-resume-identity">
      {(resumeData.fullName || !blankPreview) && <h1 ref={nameRef}><EditableText path="fullName" elementId="resume.header.name">{features.nameSplit ? <SplitName name={valueOr(resumeData.fullName, 'YOUR NAME')} /> : valueOr(resumeData.fullName, 'YOUR NAME')}</EditableText></h1>}
      {(resumeData.headline || !blankPreview) && <p><EditableText path="headline" elementId="resume.header.headline">{valueOr(resumeData.headline, 'Professional headline')}</EditableText></p>}
    </div>}
    {!features.contactSection && <ContactList items={contactItems} blankPreview={blankPreview} />}
    {photo?.source && photo.visible !== false && <img
      className="generated-resume-photo"
      data-resume-element-id="resume.header.photo"
      data-selected={selectedId === 'resume.header.photo' ? 'true' : undefined}
      alt="Profile"
      src={photo.source}
      style={{ width: photoSize, height: photoSize, objectFit: photo.objectFit || 'cover', objectPosition: photo.objectPosition || 'center', borderRadius: photo.shape === 'circle' ? '50%' : photo.borderRadius ?? 6, border: photo.borderWidth ? `${photo.borderWidth}px solid ${photo.borderColor || '#d8dce5'}` : undefined }}
    />}
    {photo?.uploadPlaceholder && <button className="generated-resume-photo-upload" type="button" onClick={onProfilePhotoClick} aria-label="Add a profile photo" title="Add a profile photo" style={{ width: photoSize, height: photoSize, borderRadius: '50%' }}><span aria-hidden="true">+</span></button>}
  </header>
}

// The same editable fields arranged per template. `layout` comes from latexTemplateFeatures; without one the original markup is used.
function EntryShell({ layout, title, period, org, location, list }) {
  const at = location ? <span className="resume-entry-location">{location}</span> : null
  if (layout === 'libre') return <article className="resume-entry resume-entry-libre">
    <div className="resume-entry-heading"><strong className="resume-entry-title">{org}</strong>{at}</div>
    <div className="resume-entry-heading resume-entry-second"><span className="resume-entry-role">{title}</span><span className="resume-entry-period">{period}</span></div>
    {list}
  </article>
  if (layout === 'elegant') return <article className="resume-entry resume-entry-elegant">
    <div className="resume-entry-heading"><strong className="resume-entry-title">{org}</strong><strong className="resume-entry-role">{title}</strong></div>
    <div className="resume-entry-heading resume-entry-second">{at ?? <span />}<span className="resume-entry-period">{period}</span></div>
    {list}
  </article>
  if (layout === 'academic') return <article className="resume-entry resume-entry-academic">
    <div className="resume-entry-heading"><strong className="resume-entry-title">{title}</strong><span className="resume-entry-period">{period}</span></div>
    <p className="resume-entry-subtitle"><em className="resume-entry-org">{org}</em>{at && <span className="resume-entry-sep"> | </span>}{at}</p>
    {list}
  </article>
  if (layout === 'keywords') return <article className="resume-entry resume-entry-keywords">
    <div className="resume-entry-heading"><strong className="resume-entry-title">{title}<span className="resume-entry-sep"> / </span>{period}</strong></div>
    <p className="resume-entry-subtitle"><span className="resume-entry-org">{org}</span>{at && <span className="resume-entry-sep"> - </span>}{at}</p>
    {list}
  </article>
  if (layout === 'hipster') return <article className="resume-entry resume-entry-hipster">
    <span className="resume-entry-period">{period}</span>
    <div className="resume-entry-body">
      <strong className="resume-entry-title">{title}</strong>
      <p className="resume-entry-subtitle"><span className="resume-entry-org">{org}</span>{at && <span className="resume-entry-sep"> · </span>}{at}</p>
      {list}
    </div>
  </article>
  if (layout === 'developer') return <article className="resume-entry resume-entry-developer">
    <span className="resume-entry-period">{period}</span>
    <div className="resume-entry-body"><strong className="resume-entry-title">{title}</strong>{list}</div>
    <span className="resume-entry-org">{org}{at && <><br />{at}</>}</span>
  </article>
  return null
}

function Period({ section, item, itemIndex, dash = ' — ' }) {
  const key = itemKey(item, itemIndex)
  return <><EditableText path={`${section}.${itemIndex}.startDate`} elementId={`${section}.${key}.startDate`}>{item?.startDate || 'Start date'}</EditableText>{dash}<EditableText path={`${section}.${itemIndex}.endDate`} elementId={`${section}.${key}.endDate`}>{item?.endDate || 'End date'}</EditableText></>
}

function ExperienceEntry({ item, itemIndex }) {
  const { features } = useContext(ResumeStyleContext)
  const role = <EditableText path={`experience.${itemIndex}.role`} elementId={`experience.${item?.id || itemIndex}.role`}>{item?.role || 'Role'}</EditableText>
  const company = <EditableText path={`experience.${itemIndex}.company`} elementId={`experience.${item?.id || itemIndex}.company`}>{item?.company || 'Company'}</EditableText>
  const location = item?.location ? <EditableText path={`experience.${itemIndex}.location`} elementId={`experience.${item?.id || itemIndex}.location`}>{item.location}</EditableText> : null
  const bullets = <ul>{asArray(item?.bullets).length ? item.bullets.map((bullet, index) => <li key={index}><EditableText path={`experience.${itemIndex}.bullets.${index}`} elementId={`experience.${itemKey(item, itemIndex)}.bullets.${index}`}>{bullet}</EditableText></li>) : <li><EditableText path={`experience.${itemIndex}.bullets.0`} elementId={`experience.${itemKey(item, itemIndex)}.bullets.0`}>Add an achievement or responsibility.</EditableText></li>}</ul>
  if (features.entryLayout) return <EntryShell layout={features.entryLayout} title={role} org={company} location={location} list={bullets} period={<Period section="experience" item={item} itemIndex={itemIndex} dash={features.dash} />} />
  return <article className="resume-entry">
    <div className="resume-entry-heading">
      <strong className="resume-entry-title">{role}</strong>
      <span className="resume-entry-period"><Period section="experience" item={item} itemIndex={itemIndex} /></span>
    </div>
    {/* An empty location is left out instead of printing the word "Location" on the resume. */}
    <p className="resume-entry-subtitle">{company}{location && <> · {location}</>}</p>
    {bullets}
  </article>
}

function ProjectEntry({ item, itemIndex }) {
  const { features } = useContext(ResumeStyleContext)
  const layout = features.entryLayout
  const name = <EditableText path={`projects.${itemIndex}.name`} elementId={`projects.${item?.id || itemIndex}.name`}>{item?.name || 'Project'}</EditableText>
  const tech = <EditableText path={`projects.${itemIndex}.techStack`} elementId={`projects.${item?.id || itemIndex}.techStack`}>{asArray(item?.techStack).join(', ') || 'Add technologies'}</EditableText>
  const description = <p className="resume-project-description"><EditableText path={`projects.${itemIndex}.description`} elementId={`projects.${item?.id || itemIndex}.description`}>{item?.description || 'Describe the project and its outcome.'}</EditableText></p>
  const links = asArray(item?.links).length > 0 && <p className="resume-project-links">{item.links.map((link, index) => <a className="generated-contact-link" href={/^https?:\/\//i.test(link) ? link : `https://${link}`} target="_blank" rel="noreferrer" title={link} key={index}>{linkDisplayLabel(link)}</a>)}</p>
  // The LaTeX samples have no empty bullet under a project, so clones only print bullets that exist.
  const bullets = asArray(item?.bullets).length
    ? <ul>{item.bullets.map((bullet, index) => <li key={index}><EditableText path={`projects.${itemIndex}.bullets.${index}`} elementId={`projects.${itemKey(item, itemIndex)}.bullets.${index}`}>{bullet}</EditableText></li>)}</ul>
    : layout ? null : <ul><li><EditableText path={`projects.${itemIndex}.bullets.0`} elementId={`projects.${itemKey(item, itemIndex)}.bullets.0`}>Add a project contribution.</EditableText></li></ul>
  if (layout === 'developer') return <article className="resume-entry resume-entry-developer resume-entry-project">
    <span className="resume-entry-period resume-project-technologies">{tech}</span>
    <div className="resume-entry-body"><strong className="resume-entry-title">{name}</strong>{description}{bullets}</div>
    <span className="resume-entry-org">{links}</span>
  </article>
  if (layout === 'hipster') return <article className="resume-entry resume-entry-hipster resume-entry-project">
    <span className="resume-entry-period" />
    <div className="resume-entry-body">
      <strong className="resume-entry-title">{name}</strong>
      <p className="resume-entry-subtitle resume-project-technologies">{tech}</p>
      {description}{links}{bullets}
    </div>
  </article>
  return <article className={`resume-entry${layout ? ` resume-entry-${layout} resume-entry-project` : ''}`}>
    <div className="resume-entry-heading">
      <strong className="resume-entry-title">{name}</strong>
    </div>
    <p className="resume-entry-meta resume-project-technologies">{!layout && <span>Technologies: </span>}{tech}</p>
    {description}
    {links}
    {bullets}
  </article>
}

function EducationEntry({ item, itemIndex }) {
  const { features } = useContext(ResumeStyleContext)
  const key = itemKey(item, itemIndex)
  const layout = features.entryLayout
  const degree = <EditableText path={`education.${itemIndex}.degree`} elementId={`education.${item?.id || itemIndex}.degree`}>{item?.degree || 'Degree'}</EditableText>
  const institution = <EditableText path={`education.${itemIndex}.institution`} elementId={`education.${key}.institution`}>{item?.institution || 'Institution'}</EditableText>
  const location = item?.location ? <EditableText path={`education.${itemIndex}.location`} elementId={`education.${key}.location`}>{item.location}</EditableText> : null
  const details = <ul>{asArray(item?.details).length ? item.details.map((detail, index) => <li key={index}><EditableText path={`education.${itemIndex}.details.${index}`} elementId={`education.${key}.details.${index}`}>{detail}</EditableText></li>) : <li><EditableText path={`education.${itemIndex}.details.0`} elementId={`education.${key}.details.0`}>Add coursework, honors, or relevant details.</EditableText></li>}</ul>
  // Keywords, Developer and Hipster date education by its end year only, like their samples.
  const endOnly = ['keywords', 'developer', 'hipster'].includes(layout)
  if (layout) return <EntryShell layout={layout} title={degree} org={institution} location={location} list={details} period={endOnly
    ? <EditableText path={`education.${itemIndex}.endDate`} elementId={`education.${key}.endDate`}>{item?.endDate || 'End date'}</EditableText>
    : <Period section="education" item={item} itemIndex={itemIndex} dash={features.dash} />} />
  return <article className="resume-entry">
    <div className="resume-entry-heading">
      <strong className="resume-entry-title">{degree}</strong>
      <span className="resume-entry-period"><Period section="education" item={item} itemIndex={itemIndex} /></span>
    </div>
    <p className="resume-entry-subtitle">{institution}{location && <> · {location}</>}</p>
    {details}
  </article>
}

function EntryListContinuation({ item, itemIndex, valueIndex, section, listKey }) {
  const value = asArray(item?.[listKey])[valueIndex]
  if (!value) return null
  return <div className="resume-entry resume-entry-continuation">
    <ul><li><EditableText path={`${section}.${itemIndex}.${listKey}.${valueIndex}`} elementId={`${section}.${itemKey(item, itemIndex)}.${listKey}.${valueIndex}`}>{value}</EditableText></li></ul>
  </div>
}

function buildEntryBlocks(items, type, listKey) {
  return items.flatMap((item, itemIndex) => {
    const values = asArray(item?.[listKey])
    if (values.length < 2) return [{ id: `${type}-${itemIndex}`, type, value: item, itemIndex }]
    return [
      { id: `${type}-${itemIndex}`, type, value: { ...item, [listKey]: values.slice(0, 1) }, itemIndex },
      ...values.slice(1).map((_, continuationIndex) => ({
        id: `${type}-${itemIndex}-${listKey}-${continuationIndex + 1}`,
        type: `${type}-continuation`,
        value: item,
        itemIndex,
        valueIndex: continuationIndex + 1,
        listKey
      }))
    ]
  })
}

const sectionOrderByVariant = {
  'navy-professional': ['education', 'experience', 'summary', 'skills', 'languages', 'projects', 'certifications', 'achievements'],
  // LaTeX clones (PLAN-027): the order of each sample, then the sections it does not show.
  'minimal-academic': ['contact', 'summary', 'experience', 'education', 'projects', 'skills', 'languages', 'certifications', 'achievements'],
  'libre-cv': ['summary', 'education', 'experience', 'projects', 'skills', 'languages', 'achievements', 'certifications'],
  'simple-hipster': ['summary', 'languages', 'contact', 'experience', 'education', 'skills', 'projects', 'certifications', 'achievements'],
  'keywords-cv': ['summary', 'experience', 'skills', 'languages', 'projects', 'education', 'achievements', 'certifications'],
  'elegant-resume': ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'achievements', 'languages'],
  'developer-cv': ['summary', 'skills', 'projects', 'education', 'experience', 'languages', 'certifications', 'achievements'],
  'curve-academic': ['experience', 'education', 'summary', 'projects', 'skills', 'certifications', 'achievements', 'languages'],
  receive: ['summary', 'skills', 'languages', 'education', 'experience', 'projects', 'achievements', 'certifications'],
  // Reactive Resume's default layout order: the main column, then the sidebar column.
  // Single-column designs print the sidebar sections after the main ones; Bronzor follows its gallery sample.
  ...Object.fromEntries(['azurill', 'chikorita', 'ditgar', 'ditto', 'gengar', 'glalie', 'kakuna', 'lapras', 'leafish', 'meowth', 'onyx', 'pikachu', 'rhyhorn', 'scizor']
    .map(id => [id, ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'languages']])),
  bronzor: ['summary', 'skills', 'education', 'experience', 'projects', 'certifications', 'achievements', 'languages'],
  'classic-professional': ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'achievements', 'languages'],
  'harvard-traditional': ['education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'languages'],
  'modern-minimal': ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'languages'],
  'tech-focused': ['summary', 'skills', 'projects', 'experience', 'education', 'certifications', 'achievements', 'languages'],
  'compact-ats': ['summary', 'experience', 'skills', 'projects', 'education', 'certifications', 'achievements', 'languages'],
  'executive-brief': ['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'achievements', 'languages'],
  'skills-first': ['skills', 'summary', 'projects', 'experience', 'education', 'certifications', 'achievements', 'languages'],
  'career-transition': ['summary', 'skills', 'education', 'experience', 'projects', 'certifications', 'achievements', 'languages'],
  'academic-standard': ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'languages'],
  'product-startup': ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'languages']
}

function buildSections(resumeData, variant, blankPreview = false, sectionSettings = null) {
  const features = featuresFor(variant)
  const skills = resumeData.allSkills ?? allSkills(resumeData.skills)
  const experience = asArray(resumeData.experience)
  const projects = asArray(resumeData.projects)
  const education = asArray(resumeData.education)
  const certifications = asArray(resumeData.certifications)
  const achievements = asArray(resumeData.achievements)

  const sections = [
    {
      id: 'summary',
      title: 'Summary',
      blocks: resumeData.summary ? [{ id: 'summary-copy', type: 'summary', value: resumeData.summary }] : blankPreview ? [] : [{ id: 'summary-copy', type: 'summary', value: 'Write a focused summary that explains the value you bring.' }],
    },
    {
      id: 'experience',
      title: 'Experience',
      blocks: experience.length
        ? buildEntryBlocks(experience, 'experience', 'bullets')
        : blankPreview ? [] : [{ id: 'experience-placeholder', type: 'placeholder', value: 'Add your work experience here.' }],
    },
    {
      id: 'projects',
      title: 'Projects',
      blocks: projects.length
        ? buildEntryBlocks(projects, 'project', 'bullets')
        : blankPreview ? [] : [{ id: 'project-placeholder', type: 'placeholder', value: 'Add a project that shows your impact.' }],
    },
    {
      id: 'education',
      title: 'Education',
      blocks: education.length
        ? buildEntryBlocks(education, 'education', 'details')
        : blankPreview ? [] : [{ id: 'education-placeholder', type: 'placeholder', value: 'Add your education details here.' }],
    },
    {
      id: 'skills',
      title: 'Skills',
      blocks: resumeData.skillsByCategory?.length || skills.length || !blankPreview ? [{ id: 'skills-copy', type: 'skills', value: resumeData.skillsByCategory?.length ? resumeData.skillsByCategory : skills }] : [],
    },
    ...(certifications.length ? [{
      id: 'certifications',
      title: 'Certifications',
      blocks: certifications.map((item, index) => ({ id: `certification-${index}`, type: 'list-item', value: item, itemIndex: index, target: 'certifications' })),
    }] : []),
    ...(achievements.length ? [{
      id: 'achievements',
      title: 'Achievements',
      blocks: achievements.map((item, index) => ({ id: `achievement-${index}`, type: 'list-item', value: item, itemIndex: index, target: 'achievements' })),
    }] : []),
    ...(asArray(resumeData.languages).length ? [{
      id: 'languages',
      title: 'Languages',
      blocks: [{ id: 'languages-copy', type: 'languages', value: resumeData.languages.join(' · ') }],
    }] : []),
    ...asArray(resumeData.customSections).map((section, index) => ({
      id: `custom-${index}`,
      title: section.title || 'Additional Information',
      blocks: [{ id: `custom-${index}-copy`, type: 'custom', value: section.content || section.description || '' }],
    })),
    // Templates that print contact details as their own section (latexTemplateFeatures.contactSection).
    ...(features.contactSection && (asArray(resumeData.contactItems).length || !blankPreview) ? [{
      id: 'contact',
      title: features.contactSection.title,
      blocks: [{ id: 'contact-copy', type: 'contact', value: asArray(resumeData.contactItems) }],
    }] : [])
  ]
  const order = sectionOrderByVariant[variant] ?? sectionOrderByVariant['classic-professional']
  // Sections the person hid, renamed or moved (presentation.sections) are applied after the template's own order.
  return shapeSections(sections.filter(section => section.blocks.length), sectionSettings, order)
}

// One box per skill. The separators stay in the text (visually hidden) so editing the line still splits on them.
function SkillChips({ values, separator }) {
  return values.map((value, index) => <span key={`${value}-${index}`}><span className="skill-chip">{value}</span>{index < values.length - 1 && <span className="skill-chip-sep">{separator}</span>}</span>)
}

function RenderBlock({ block }) {
  const { features } = useContext(ResumeStyleContext)
  if (block.type === 'experience') return <ExperienceEntry item={block.value} itemIndex={block.itemIndex} />
  if (block.type === 'experience-continuation') return <EntryListContinuation item={block.value} itemIndex={block.itemIndex} valueIndex={block.valueIndex} section="experience" listKey="bullets" />
  if (block.type === 'project') return <ProjectEntry item={block.value} itemIndex={block.itemIndex} />
  if (block.type === 'project-continuation') return <EntryListContinuation item={block.value} itemIndex={block.itemIndex} valueIndex={block.valueIndex} section="projects" listKey="bullets" />
  if (block.type === 'education') return <EducationEntry item={block.value} itemIndex={block.itemIndex} />
  if (block.type === 'education-continuation') return <EntryListContinuation item={block.value} itemIndex={block.itemIndex} valueIndex={block.valueIndex} section="education" listKey="details" />
  if (block.type === 'placeholder') return <p className="resume-placeholder">{block.value}</p>
  if (block.type === 'skills') {
    if (block.value.some?.(group => group && typeof group === 'object')) return <div className="resume-skill-groups">{block.value.map(group => <p key={group.category}><strong>{skillGroupLabel(group.category)}<span className="skill-sep">:</span> </strong><EditableText path={`skills.${group.category}`}>{features.skillChips ? <SkillChips values={group.values} separator=", " /> : group.values.join(features.skillSeparator ?? ', ')}</EditableText></p>)}</div>
    return <p className="resume-skills"><EditableText path="skills">{features.skillChips && block.value.length ? <SkillChips values={block.value} separator=" · " /> : block.value.join(' · ') || 'Add the skills most relevant to your target role.'}</EditableText></p>
  }
  if (block.type === 'contact') return <ContactList items={block.value} inSection />
  if (block.type === 'languages') return <p className="resume-skills"><EditableText path="languages">{block.value}</EditableText></p>
  if (block.type === 'custom') return <p>{block.value}</p>
  if (block.type === 'list-item') return <ul className="resume-single-item-list"><li><EditableText path={`${block.target}.${block.itemIndex}`}>{block.value}</EditableText></li></ul>
  return <p><EditableText path="summary">{block.value}</EditableText></p>
}

function ResumeSection({ section, blockIndexes, headingSuffix = '', continued = false }) {
  const { focusSectionId } = useContext(ResumeStyleContext)
  const headingId = `section-${section.id}${headingSuffix}`
  return <section className={`resume-section resume-section-${section.id}${continued ? ' resume-section-continued' : ''}${focusSectionId === section.id ? ' is-form-focus' : ''}`} aria-labelledby={headingId}>
    <h2 id={headingId}><StyledElement elementId={`section.${section.id}.heading`}>{section.title}</StyledElement>{continued && <span className="resume-continuation-label"> continued</span>}</h2>
    {blockIndexes.filter(index => section.blocks[index]).map(index => <div className="resume-page-block" data-block-index={index} key={section.blocks[index].id}>
      <RenderBlock block={section.blocks[index]} />
    </div>)}
  </section>
}

// Reactive Resume (MIT) templates. Two-column designs keep its default page layout:
// main = summary, education, experience, projects; sidebar = skills, certifications, awards, languages, extras.
export const reactiveSidebarPositions = {
  azurill: 'left', chikorita: 'right', ditgar: 'left', ditto: 'left', gengar: 'left', glalie: 'left', leafish: 'right', pikachu: 'left',
  bronzor: 'none', kakuna: 'none', lapras: 'none', meowth: 'none', onyx: 'none', rhyhorn: 'none', scizor: 'none'
}
export const isReactiveVariant = variant => Object.hasOwn(reactiveSidebarPositions, variant)
export const reactiveClassName = variant => isReactiveVariant(variant) ? ` template-reactive template-reactive-sidebar-${reactiveSidebarPositions[variant]}` : ''
const reactiveSidebarSectionIds = new Set(['skills', 'certifications', 'achievements', 'languages'])
const isReactiveSidebarSection = id => reactiveSidebarSectionIds.has(id) || String(id).startsWith('custom-')

export const visualColumnVariants = new Set(['product-startup', ...Object.entries(latexTemplateFeatures).filter(([, features]) => features.sidebarIds).map(([id]) => id), ...Object.entries(reactiveSidebarPositions).filter(([, side]) => side !== 'none').map(([id]) => id)])
const sidebarSectionIds = new Set(['skills', 'education', 'certifications', 'achievements', 'languages'])
const overleafSidebarSectionIds = new Set(['summary', 'skills', 'languages', 'certifications'])

const plannedSectionTitles = { summary: 'Summary', experience: 'Experience', projects: 'Projects', education: 'Education', skills: 'Skills', certifications: 'Certifications', achievements: 'Achievements', languages: 'Languages' }

/**
 * The order and placement of every section exactly as this template draws them.
 * The scratch form is built from this so its structure always matches the page.
 */
export function getTemplateSectionPlan(variant, sectionSettings = null) {
  const order = sectionOrderByVariant[variant] ?? sectionOrderByVariant['classic-professional']
  const ids = applySectionOrder([...order, ...Object.keys(plannedSectionTitles).filter(id => !order.includes(id))], sectionSettings?.order)
  // Simple Hipster and ReCeiVe draw one ATS-safe column, so only true column variants have a sidebar.
  const clone = featuresFor(variant)
  const sidebarSide = isReactiveVariant(variant) ? reactiveSidebarPositions[variant] : clone.sidebarSide ?? (visualColumnVariants.has(variant) ? 'left' : 'none')
  const inSidebar = id => {
    if (sidebarSide === 'none') return false
    if (isReactiveVariant(variant)) return isReactiveSidebarSection(id)
    if (clone.sidebarIds) return inCloneSidebar(clone, id)
    return sidebarSectionIds.has(id)
  }
  return {
    sidebarSide,
    sections: ids.filter(id => plannedSectionTitles[id]).map(id => ({ id, title: plannedSectionTitles[id], placement: inSidebar(id) ? 'sidebar' : 'main' }))
  }
}

function ResumeSectionFlow({ sections, variant, renderSection }) {
  if (!visualColumnVariants.has(variant)) return <>{sections.map(renderSection)}</>
  const clone = featuresFor(variant)
  const sectionId = section => section.id || section.sectionId
  const sidebarIds = variant === 'receive' ? overleafSidebarSectionIds : sidebarSectionIds
  const inSidebar = section => isReactiveVariant(variant) ? isReactiveSidebarSection(sectionId(section)) : clone.sidebarIds ? inCloneSidebar(clone, sectionId(section)) : sidebarIds.has(sectionId(section))
  // Lead sections (Keywords' summary) run full width above both columns.
  const isLead = section => Boolean(clone.leadSections?.includes(sectionId(section)))
  const lead = sections.filter(isLead)
  const sidebar = sections.filter(section => !isLead(section) && inSidebar(section))
  const main = sections.filter(section => !isLead(section) && !inSidebar(section))
  return <>
    {lead.map(renderSection)}
    <div className={`resume-columns-flow resume-columns-${variant}`} data-layout="columns">
      <div className="resume-column resume-sidebar-column">{sidebar.map(renderSection)}</div>
      <div className="resume-column resume-main-column">{main.map(renderSection)}</div>
    </div>
  </>
}

function SingleResume({ resumeData, sections, variant, editorStyle, useGlobalTextColor, footerText, editorRef, preview, onManualEdit, presentation, blankPreview, onProfilePhotoClick }) {
  return <article
    ref={editorRef}
    style={editorStyle}
    className={`generated-resume template-${variant}${reactiveClassName(variant)}${isLatexVariant(variant) ? ' template-latex' : ''} ${useGlobalTextColor ? 'ai-global-text-color' : ''} ${preview ? 'template-live-preview' : ''} ${blankPreview ? 'scratch-resume-preview' : ''}`}
    contentEditable={!preview}
    role="textbox"
    aria-multiline="true"
    aria-label={preview ? 'Resume template preview' : 'Generated editable resume'}
    suppressContentEditableWarning
    spellCheck
  >
    <ResumeHeader resumeData={resumeData} presentation={presentation} blankPreview={blankPreview} onProfilePhotoClick={onProfilePhotoClick} />
    <div className="generated-resume-main">
      <ResumeSectionFlow sections={sections} variant={variant} renderSection={section => <ResumeSection
        section={section}
        blockIndexes={section.blocks.map((_, index) => index)}
        headingSuffix="-preview"
        key={section.id}
      />} />
    </div>
    {footerText && <footer className="generated-resume-footer"><EditableText path="footerText">{footerText}</EditableText></footer>}
  </article>
}

function initialPages(sections) {
  return [{
    showHeader: true,
    groups: sections.map(section => ({
      sectionId: section.id,
      blockIndexes: section.blocks.map((_, index) => index),
      continued: false,
    })),
    showFooter: true,
  }]
}

/**
 * Splits sections into A4 pages using where each block really sits in a full-length measurement copy
 * (so margins, card borders, side headings and two-column grids are all accounted for). A block moves
 * to the next page only when its real bottom would cross the page's printable edge.
 */
function paginateMeasurement(measurement, sections) {
  if (!measurement) return initialPages(sections)
  const styles = window.getComputedStyle(measurement)
  const box = measurement.getBoundingClientRect()
  const contentTop = box.top + parseFloat(styles.borderTopWidth || 0) + parseFloat(styles.paddingTop)
  const contentHeight = measurement.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom) - PAGE_EDGE_TOLERANCE
  const limit = contentTop + contentHeight
  const footerHeight = outerHeight(measurement.querySelector('[data-page-footer]'))

  const flow = list => {
    const pages = []
    let page = { groups: [] }
    let shift = 0
    let lastBottom = contentTop
    list.forEach(section => {
      const sectionElement = measurement.querySelector(`[data-measure-section="${section.id}"]`)
      if (!sectionElement) return
      const sectionRect = sectionElement.getBoundingClientRect()
      const sectionStyle = window.getComputedStyle(sectionElement)
      const sectionTop = sectionRect.top - parseFloat(sectionStyle.marginTop || 0)
      const headingHeight = outerHeight(sectionElement.querySelector('[data-measure-heading]'))
      let group = null
      section.blocks.forEach((_, blockIndex) => {
        const block = sectionElement.querySelector(`[data-block-index="${blockIndex}"]`)
        if (!block) return
        const rect = block.getBoundingClientRect()
        const isFirst = blockIndex === 0
        const isLast = blockIndex === section.blocks.length - 1
        const top = isFirst ? sectionTop : rect.top - parseFloat(window.getComputedStyle(block).marginTop || 0)
        // The last block also has to fit the section's own bottom padding/border (card layouts).
        const bottom = isLast ? Math.max(rect.bottom, sectionRect.bottom) : rect.bottom
        if (bottom - shift > limit && page.groups.length) {
          pages.push(page)
          page = { groups: [] }
          group = null
          // On the new page this block starts at the top, under a "continued" heading when mid-section.
          shift = top - contentTop - (isFirst ? 0 : headingHeight)
        }
        if (!group) {
          group = { sectionId: section.id, blockIndexes: [], continued: !isFirst }
          page.groups.push(group)
        }
        group.blockIndexes.push(blockIndex)
        lastBottom = bottom - shift
      })
    })
    if (footerHeight && lastBottom + footerHeight > limit && page.groups.length) {
      pages.push(page)
      page = { groups: [] }
    }
    pages.push(page)
    return pages
  }

  const columnFlow = measurement.querySelector('.resume-columns-flow')
  const columnDisplay = columnFlow ? window.getComputedStyle(columnFlow).display : ''
  const isColumns = Boolean(columnFlow) && (columnDisplay === 'grid' || columnDisplay === 'flex' || (columnFlow.dataset.layout === 'columns' && columnDisplay === 'contents'))
  // Two-column designs paginate each column on its own and then pair pages up.
  // Sections outside the columns (full-width lead sections) flow with the main column, which they sit above.
  const leadIds = isColumns ? new Set([...measurement.querySelectorAll('[data-measure-section]')].filter(element => !columnFlow.contains(element)).map(element => element.dataset.measureSection)) : new Set()
  const columnPages = isColumns
    ? [...columnFlow.children].map(column => {
      const ids = new Set([...column.querySelectorAll('[data-measure-section]')].map(section => section.dataset.measureSection))
      if (column.classList.contains('resume-main-column')) leadIds.forEach(id => ids.add(id))
      return flow(sections.filter(section => ids.has(section.id)))
    })
    : [flow(sections)]
  const count = Math.max(1, ...columnPages.map(pages => pages.length))
  return Array.from({ length: count }, (_, index) => ({
    showHeader: index === 0,
    groups: columnPages.flatMap(pages => pages[index]?.groups || []),
    showFooter: index === count - 1
  }))
}

export default function ResumeTemplateLayout({ resumeData = {}, editorRef, variant, editorStyle, useGlobalTextColor = false, footerText = '', preview = false, readOnly = false, onManualEdit, presentation, onElementSelect, selectedElementId = null, focusSectionId = null, pageWidthOverride = null, blankPreview = false, onProfilePhotoClick }) {
  const templateResume = useMemo(() => adaptResumeForTemplate(resumeData), [resumeData])
  const templateStyle = {
    ...editorStyle,
    // Section gaps, entry gaps and page margins chosen in the format panel or by NIMBUS (src/resume-layout.css).
    ...layoutStyle(presentation?.layout),
    ...(presentation?.accentColor ? { '--template-accent-color': presentation.accentColor } : {}),
    ...(presentation?.fontFamily ? { fontFamily: findFont(presentation.fontFamily)?.family ?? presentation.fontFamily } : {}),
    ...(Number.isFinite(presentation?.sidebarWidth) ? { '--template-sidebar-width': `${Math.max(24, Math.min(presentation.sidebarWidth, 42))}%` } : {}),
    ...(Number.isFinite(presentation?.contactScale) ? { '--template-contact-text-scale': `${Math.max(.75, Math.min(presentation.contactScale, 1))}em` } : {}),
    ...(Number.isFinite(presentation?.nameScale) ? { '--template-name-text-scale': `${Math.max(.72, Math.min(presentation.nameScale, 1))}em` } : {}),
    ...(Number.isFinite(presentation?.projectDescriptionScale) ? {
      '--template-project-description-size': `${.9 * Math.max(.78, Math.min(presentation.projectDescriptionScale, 1))}em`,
      '--template-project-description-carousel-size': `${.86 * Math.max(.78, Math.min(presentation.projectDescriptionScale, 1))}em`
    } : {})
  }
  const sections = useMemo(() => buildSections(templateResume, variant, blankPreview, presentation?.sections), [templateResume, variant, blankPreview, presentation?.sections])
  const overrides = presentation?.elementOverrides
  const styleContext = useMemo(() => ({ overrides: overrides ?? {}, selectedId: selectedElementId, focusSectionId, features: featuresFor(variant) }), [overrides, selectedElementId, focusSectionId, variant])
  const shellRef = useRef(null)
  const measurementRef = useRef(null)
  const [pageWidth, setPageWidth] = useState(MAX_A4_WIDTH)
  const [pages, setPages] = useState(() => initialPages(sections))
  const [fontLoadRevision, setFontLoadRevision] = useState(0)
  const pageHeight = Math.round(pageWidth * A4_RATIO)
  // Preserve A4 proportions when the editor is narrower than a desktop sheet.
  if (!preview && ['navy-professional', 'curve-academic', 'receive'].includes(variant)) {
    templateStyle.fontSize = `${(parseFloat(editorStyle?.fontSize) || 13.3333) * pageWidth / MAX_A4_WIDTH}px`
    templateStyle.padding = `${pageWidth * .055}px`
  }
  // Reactive Resume designs are sized in em from a 10pt body, so scaling the font scales the whole page.
  if (!preview && isReactiveVariant(variant)) {
    templateStyle.fontSize = `${(parseFloat(editorStyle?.fontSize) || 13.3333) * pageWidth / MAX_A4_WIDTH}px`
  }
  // LaTeX clones are sized in em from their class's body size, so the whole page scales with it.
  if (isLatexVariant(variant)) {
    templateStyle.fontSize = `${(parseFloat(editorStyle?.fontSize) || latexTemplateFeatures[variant].base) * (preview ? 1 : pageWidth / MAX_A4_WIDTH)}px`
  }
  templateStyle['--page-scale'] = preview ? 1 : pageWidth / MAX_A4_WIDTH
  // Whole-resume formatting (line height, letter spacing) from the format panel.
  const { display: _ignoredDisplay, ...resumeWideStyle } = overrideToStyle(overrides?.resume)
  Object.assign(templateStyle, resumeWideStyle)

  useEffect(() => {
    Promise.all([loadFontsForPresentation(presentation), variant === 'receive' && loadResumeFont('Roboto Mono')].filter(Boolean))
      .then(() => setFontLoadRevision(revision => revision + 1))
  }, [presentation?.fontFamily, presentation?.elementOverrides, variant]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (preview || !shellRef.current) return undefined
    // Printing renders at exactly 794px (A4 at 96 dpi), whatever the window size.
    if (pageWidthOverride) {
      setPageWidth(pageWidthOverride)
      return undefined
    }

    const updatePageWidth = () => {
      const availableWidth = shellRef.current?.clientWidth || MAX_A4_WIDTH
      setPageWidth(Math.max(240, Math.min(MAX_A4_WIDTH, availableWidth - 32)))
    }
    updatePageWidth()

    const observer = new ResizeObserver(updatePageWidth)
    observer.observe(shellRef.current)
    return () => observer.disconnect()
  }, [pageWidthOverride, preview])

  useLayoutEffect(() => {
    if (preview) return
    const nextPages = paginateMeasurement(measurementRef.current, sections)
    setPages(nextPages)
  }, [editorStyle, footerText, fontLoadRevision, pageHeight, preview, sections, useGlobalTextColor, variant, presentation])

  // The element under the caret/highlight decides what the format panel edits. A highlight that ends
  // on a gap between elements still belongs to the element where it started.
  const describeSelection = (fallbackTarget = null) => {
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    const container = range ? range.startContainer : null
    const startNode = container?.nodeType === 1 ? container : container?.parentElement
    const element = (range && editorDocumentRef.current?.contains(startNode) ? startNode?.closest('[data-resume-element-id]') : null)
      || fallbackTarget?.closest?.('[data-resume-element-id]')
    if (!element) return null
    const offsets = range && !range.collapsed ? rangeOffsetsWithin(element, range) : null
    return {
      id: element.dataset.resumeElementId,
      path: element.dataset.resumePath,
      range: offsets && offsets.end > offsets.start ? offsets : null,
      text: element.textContent?.slice(0, 200) ?? ''
    }
  }
  const selectResumeElement = event => {
    if (!onElementSelect) return
    const next = describeSelection(event.target)
    // Clicking empty page space (no highlight) clears the selection: the panel formats the whole resume.
    onElementSelect(next)
  }
  const editorDocumentRef = useRef(null)
  const setEditorDocument = node => {
    editorDocumentRef.current = node
    if (typeof editorRef === 'function') editorRef(node)
    else if (editorRef) editorRef.current = node
  }
  useEffect(() => {
    if (!onElementSelect || preview || readOnly) return undefined
    // Keyboard selection (Shift+arrows, caret moves) updates the selection too.
    const onSelectionChange = () => {
      const selection = window.getSelection()
      const anchor = selection?.anchorNode
      if (!anchor || !editorDocumentRef.current?.contains(anchor)) return
      const next = describeSelection()
      if (next) onElementSelect(next)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [onElementSelect, preview, readOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  if (preview) {
    return <ResumeStyleContext.Provider value={styleContext}><SingleResume
      resumeData={templateResume}
      sections={sections}
      variant={variant}
      editorStyle={templateStyle}
      useGlobalTextColor={useGlobalTextColor}
      footerText={footerText}
      editorRef={editorRef}
      preview
      onManualEdit={onManualEdit}
      presentation={presentation}
      blankPreview={blankPreview}
      onProfilePhotoClick={onProfilePhotoClick}
    /></ResumeStyleContext.Provider>
  }

  const commitManualEdit = event => {
    const selection = window.getSelection()
    const anchor = selection?.anchorNode
    const anchorElement = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement
    const field = anchorElement?.closest?.('[data-resume-path]') || event.target.closest?.('[data-resume-path]')
    if (!field || !onManualEdit) return
    onManualEdit({ path: field.dataset.resumePath, value: readMarkedText(field) })
  }


  return <ResumeStyleContext.Provider value={styleContext}><div className="resume-document-shell" ref={shellRef}>
    <div className="resume-page-scroller">
      <div
        ref={setEditorDocument}
        className="resume-page-document"
        contentEditable={!readOnly}
        role={readOnly ? 'document' : 'textbox'}
        aria-multiline={readOnly ? undefined : 'true'}
        aria-label={readOnly ? 'Resume preview' : 'Generated editable resume'}
        suppressContentEditableWarning
        spellCheck
        onBlur={commitManualEdit}
        onMouseUp={selectResumeElement}
      >
        {pages.map((page, pageIndex) => <div
          className="resume-page-frame"
          style={{ width: pageWidth, height: pageHeight }}
          data-page-number={pageIndex + 1}
          key={`${pageIndex}-${page.groups.map(group => `${group.sectionId}:${group.blockIndexes.join(',')}`).join('|')}`}
        >
          <article
            style={{ ...templateStyle, width: pageWidth, height: pageHeight }}
            className={`generated-resume resume-a4-page template-${variant}${reactiveClassName(variant)}${isLatexVariant(variant) ? ' template-latex' : ''} ${useGlobalTextColor ? 'ai-global-text-color' : ''} ${blankPreview ? 'scratch-resume-preview' : ''}${pageIndex > 0 ? ' resume-page-continued' : ''}`}
          >
            {page.showHeader && <ResumeHeader resumeData={templateResume} presentation={presentation} blankPreview={blankPreview} onProfilePhotoClick={onProfilePhotoClick} />}
            <div className="generated-resume-main">
              <ResumeSectionFlow variant={variant} sections={page.groups} renderSection={group => {
                const section = sections.find(item => item.id === group.sectionId)
                return section ? <ResumeSection
                  section={section}
                  blockIndexes={group.blockIndexes}
                  continued={group.continued}
                  headingSuffix={`-page-${pageIndex}-${group.blockIndexes[0]}`}
                  key={`${group.sectionId}-${group.blockIndexes[0]}`}
                /> : null
              }} />
            </div>
            {page.showFooter && footerText && <footer className="generated-resume-footer"><EditableText path="footerText">{footerText}</EditableText></footer>}
          </article>
        </div>)}
      </div>
    </div>

    <article
      ref={measurementRef}
      style={{ ...templateStyle, width: pageWidth, height: pageHeight }}
      className={`generated-resume resume-a4-page resume-pagination-measure template-${variant}${reactiveClassName(variant)}${isLatexVariant(variant) ? ' template-latex' : ''} ${useGlobalTextColor ? 'ai-global-text-color' : ''}`}
      aria-hidden="true"
    >
      <ResumeHeader resumeData={templateResume} presentation={presentation} />
      <div className="generated-resume-main">
        <ResumeSectionFlow variant={variant} sections={sections} renderSection={section => <section className={`resume-section resume-section-${section.id}`} data-measure-section={section.id} key={section.id}>
          <h2 data-measure-heading><StyledElement elementId={`section.${section.id}.heading`}>{section.title}</StyledElement></h2>
          {section.blocks.map((block, blockIndex) => <div className="resume-page-block" data-block-index={blockIndex} key={block.id}>
            <RenderBlock block={block} />
          </div>)}
        </section>} />
      </div>
      {footerText && <footer className="generated-resume-footer" data-page-footer>{footerText}</footer>}
    </article>
  </div></ResumeStyleContext.Provider>
}
