import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { adaptResumeForTemplate } from '../../templates/templateDataAdapter.js'
import { loadResumeFont, resumeFonts } from '../../editor/fontRegistry.js'

const valueOr = (value, fallback) => value || fallback
const asArray = value => Array.isArray(value) ? value : []
const allSkills = skills => Object.values(skills ?? {}).flat().filter(Boolean)
const period = item => [item?.startDate, item?.endDate].filter(Boolean).join(' — ')
const A4_RATIO = 297 / 210
const MAX_A4_WIDTH = 794

function EditableText({ path, elementId = path, children }) {
  return <span data-resume-path={path} data-resume-element-id={elementId}>{children}</span>
}

function ResumeHeader({ resumeData, presentation = {} }) {
  const contactItems = resumeData.contactItems ?? []
  const photo = presentation.photo
  const requestedPhotoSize = Math.max(Number(photo?.width) || 64, Number(photo?.height) || 64)
  // A real image can have any natural dimensions. Keep its frame predictable
  // and crop within it so a portrait/landscape upload never changes header flow.
  const photoSize = Math.max(48, Math.min(requestedPhotoSize, 96))
  return <header className="generated-resume-header" data-page-header>
    <div className="generated-resume-identity">
      <h1><EditableText path="fullName" elementId="resume.header.name">{valueOr(resumeData.fullName, 'YOUR NAME')}</EditableText></h1>
      <p><EditableText path="headline" elementId="resume.header.headline">{valueOr(resumeData.headline, 'Professional headline')}</EditableText></p>
    </div>
    <address className="generated-contact">
      {contactItems.length
        ? contactItems.map((item, index) => item.kind === 'link' && item.href
          ? <a className="generated-contact-link" href={item.href} key={item.path || index} target="_blank" rel="noreferrer" title={item.value}><EditableText path={item.path} elementId={`resume.header.link.${index}`}>{item.value}</EditableText></a>
          : <EditableText path={item.path} elementId={`resume.header.${item.kind}`} key={item.path || index}>{item.value}</EditableText>)
        : <EditableText path="email" elementId="resume.header.email">email@example.com</EditableText>}
    </address>
    {photo?.source && photo.visible !== false && <img
      className="generated-resume-photo"
      data-resume-element-id="resume.header.photo"
      alt="Profile"
      src={photo.source}
      style={{ width: photoSize, height: photoSize, objectFit: photo.objectFit || 'cover', objectPosition: photo.objectPosition || 'center', borderRadius: photo.shape === 'circle' ? '50%' : photo.borderRadius ?? 6, border: photo.borderWidth ? `${photo.borderWidth}px solid ${photo.borderColor || '#d8dce5'}` : undefined }}
    />}
  </header>
}

function ExperienceEntry({ item, itemIndex }) {
  return <article className="resume-entry">
    <div className="resume-entry-heading">
      <strong className="resume-entry-title"><EditableText path={`experience.${itemIndex}.role`} elementId={`experience.${item?.id || itemIndex}.role`}>{item?.role || 'Role'}</EditableText></strong>
      <span className="resume-entry-period"><EditableText path={`experience.${itemIndex}.startDate`} elementId={`experience.${item?.id || itemIndex}.startDate`}>{item?.startDate || 'Start date'}</EditableText> — <EditableText path={`experience.${itemIndex}.endDate`} elementId={`experience.${item?.id || itemIndex}.endDate`}>{item?.endDate || 'End date'}</EditableText></span>
    </div>
    <p className="resume-entry-subtitle"><EditableText path={`experience.${itemIndex}.company`} elementId={`experience.${item?.id || itemIndex}.company`}>{item?.company || 'Company'}</EditableText> · <EditableText path={`experience.${itemIndex}.location`} elementId={`experience.${item?.id || itemIndex}.location`}>{item?.location || 'Location'}</EditableText></p>
    <ul>{asArray(item?.bullets).length ? item.bullets.map((bullet, index) => <li key={index}><EditableText path={`experience.${itemIndex}.bullets.${index}`} elementId={`experience.${item?.id || itemIndex}.bullet.${index}`}>{bullet}</EditableText></li>) : <li><EditableText path={`experience.${itemIndex}.bullets.0`} elementId={`experience.${item?.id || itemIndex}.bullet.0`}>Add an achievement or responsibility.</EditableText></li>}</ul>
  </article>
}

function ProjectEntry({ item, itemIndex }) {
  return <article className="resume-entry">
    <div className="resume-entry-heading">
      <strong className="resume-entry-title"><EditableText path={`projects.${itemIndex}.name`} elementId={`projects.${item?.id || itemIndex}.name`}>{item?.name || 'Project'}</EditableText></strong>
      <span className="resume-entry-meta"><EditableText path={`projects.${itemIndex}.techStack`} elementId={`projects.${item?.id || itemIndex}.techStack`}>{asArray(item?.techStack).join(' · ') || 'Tech stack'}</EditableText></span>
    </div>
    <p className="resume-project-description"><EditableText path={`projects.${itemIndex}.description`} elementId={`projects.${item?.id || itemIndex}.description`}>{item?.description || 'Describe the project and its outcome.'}</EditableText></p>
    {asArray(item?.links).length > 0 && <p className="resume-project-links">{item.links.map((link, index) => <a href={link} target="_blank" rel="noreferrer" key={index}><EditableText path={`projects.${itemIndex}.links.${index}`}>{link}</EditableText></a>)}</p>}
    <ul>{asArray(item?.bullets).length ? item.bullets.map((bullet, index) => <li key={index}><EditableText path={`projects.${itemIndex}.bullets.${index}`}>{bullet}</EditableText></li>) : <li><EditableText path={`projects.${itemIndex}.bullets.0`}>Add a project contribution.</EditableText></li>}</ul>
  </article>
}

function EducationEntry({ item, itemIndex }) {
  return <article className="resume-entry">
    <div className="resume-entry-heading">
      <strong className="resume-entry-title"><EditableText path={`education.${itemIndex}.degree`} elementId={`education.${item?.id || itemIndex}.degree`}>{item?.degree || 'Degree'}</EditableText></strong>
      <span className="resume-entry-period"><EditableText path={`education.${itemIndex}.startDate`}>{item?.startDate || 'Start date'}</EditableText> — <EditableText path={`education.${itemIndex}.endDate`}>{item?.endDate || 'End date'}</EditableText></span>
    </div>
    <p className="resume-entry-subtitle"><EditableText path={`education.${itemIndex}.institution`}>{item?.institution || 'Institution'}</EditableText> · <EditableText path={`education.${itemIndex}.location`}>{item?.location || 'Location'}</EditableText></p>
    <ul>{asArray(item?.details).length ? item.details.map((detail, index) => <li key={index}><EditableText path={`education.${itemIndex}.details.${index}`}>{detail}</EditableText></li>) : <li><EditableText path={`education.${itemIndex}.details.0`}>Add coursework, honors, or relevant details.</EditableText></li>}</ul>
  </article>
}

function EntryListContinuation({ item, itemIndex, valueIndex, section, listKey }) {
  const value = asArray(item?.[listKey])[valueIndex]
  if (!value) return null
  return <div className="resume-entry resume-entry-continuation">
    <ul><li><EditableText path={`${section}.${itemIndex}.${listKey}.${valueIndex}`} elementId={`${section}.${item?.id || itemIndex}.${listKey}.${valueIndex}`}>{value}</EditableText></li></ul>
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
  azurill: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'languages'],
  bronzor: ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'achievements', 'languages'],
  chikorita: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'languages'],
  ditto: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'languages'],
  ditgar: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'languages'],
  gengar: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'languages'],
  glalie: ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'achievements', 'languages'],
  kakuna: ['summary', 'experience', 'education', 'projects', 'skills', 'certifications', 'achievements', 'languages'],
  lapras: ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'achievements', 'languages'],
  leafish: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'languages'],
  meowth: ['summary', 'experience', 'skills', 'projects', 'education', 'certifications', 'achievements', 'languages'],
  onyx: ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'achievements', 'languages'],
  pikachu: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'languages'],
  rhyhorn: ['summary', 'experience', 'education', 'projects', 'skills', 'certifications', 'achievements', 'languages'],
  scizor: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'languages'],
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

function buildSections(resumeData, variant) {
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
      blocks: [{ id: 'summary-copy', type: 'summary', value: valueOr(resumeData.summary, 'Write a focused summary that explains the value you bring.') }],
    },
    {
      id: 'experience',
      title: 'Experience',
      blocks: experience.length
        ? buildEntryBlocks(experience, 'experience', 'bullets')
        : [{ id: 'experience-placeholder', type: 'placeholder', value: 'Add your work experience here.' }],
    },
    {
      id: 'projects',
      title: 'Projects',
      blocks: projects.length
        ? buildEntryBlocks(projects, 'project', 'bullets')
        : [{ id: 'project-placeholder', type: 'placeholder', value: 'Add a project that shows your impact.' }],
    },
    {
      id: 'education',
      title: 'Education',
      blocks: education.length
        ? buildEntryBlocks(education, 'education', 'details')
        : [{ id: 'education-placeholder', type: 'placeholder', value: 'Add your education details here.' }],
    },
    {
      id: 'skills',
      title: 'Skills',
      blocks: [{ id: 'skills-copy', type: 'skills', value: skills.length ? skills.join(' · ') : 'Add the skills most relevant to your target role.' }],
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
    }))
  ]
  const order = sectionOrderByVariant[variant] ?? sectionOrderByVariant['classic-professional']
  return sections.sort((left, right) => {
    const leftIndex = order.indexOf(left.id)
    const rightIndex = order.indexOf(right.id)
    return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex)
  })
}

function RenderBlock({ block }) {
  if (block.type === 'experience') return <ExperienceEntry item={block.value} itemIndex={block.itemIndex} />
  if (block.type === 'experience-continuation') return <EntryListContinuation item={block.value} itemIndex={block.itemIndex} valueIndex={block.valueIndex} section="experience" listKey="bullets" />
  if (block.type === 'project') return <ProjectEntry item={block.value} itemIndex={block.itemIndex} />
  if (block.type === 'project-continuation') return <EntryListContinuation item={block.value} itemIndex={block.itemIndex} valueIndex={block.valueIndex} section="projects" listKey="bullets" />
  if (block.type === 'education') return <EducationEntry item={block.value} itemIndex={block.itemIndex} />
  if (block.type === 'education-continuation') return <EntryListContinuation item={block.value} itemIndex={block.itemIndex} valueIndex={block.valueIndex} section="education" listKey="details" />
  if (block.type === 'placeholder') return <p className="resume-placeholder">{block.value}</p>
  if (block.type === 'skills') return <p className="resume-skills"><EditableText path="skills">{block.value}</EditableText></p>
  if (block.type === 'languages') return <p className="resume-skills"><EditableText path="languages">{block.value}</EditableText></p>
  if (block.type === 'custom') return <p>{block.value}</p>
  if (block.type === 'list-item') return <ul className="resume-single-item-list"><li><EditableText path={`${block.target}.${block.itemIndex}`}>{block.value}</EditableText></li></ul>
  return <p><EditableText path="summary">{block.value}</EditableText></p>
}

function ResumeSection({ section, blockIndexes, headingSuffix = '', continued = false }) {
  const headingId = `section-${section.id}${headingSuffix}`
  return <section className={`resume-section resume-section-${section.id}${continued ? ' resume-section-continued' : ''}`} aria-labelledby={headingId}>
    <h2 id={headingId}>{section.title}{continued && <span className="resume-continuation-label"> continued</span>}</h2>
    {blockIndexes.map(index => <div className="resume-page-block" data-block-index={index} key={section.blocks[index].id}>
      <RenderBlock block={section.blocks[index]} />
    </div>)}
  </section>
}

const visualColumnVariants = new Set(['azurill', 'bronzor', 'ditgar', 'gengar', 'glalie', 'ditto', 'leafish', 'scizor', 'product-startup'])
const sidebarSectionIds = new Set(['skills', 'education', 'certifications', 'achievements', 'languages'])

function ResumeSectionFlow({ sections, variant, renderSection }) {
  if (!visualColumnVariants.has(variant)) return <>{sections.map(renderSection)}</>
  const sidebar = sections.filter(section => sidebarSectionIds.has(section.id || section.sectionId))
  const main = sections.filter(section => !sidebarSectionIds.has(section.id || section.sectionId))
  return <div className={`resume-columns-flow resume-columns-${variant}`}>
    <div className="resume-column resume-sidebar-column">{sidebar.map(renderSection)}</div>
    <div className="resume-column resume-main-column">{main.map(renderSection)}</div>
  </div>
}

function SingleResume({ resumeData, sections, variant, editorStyle, useGlobalTextColor, footerText, editorRef, preview, onManualEdit, presentation }) {
  return <article
    ref={editorRef}
    style={editorStyle}
    className={`generated-resume template-${variant} ${useGlobalTextColor ? 'ai-global-text-color' : ''} ${preview ? 'template-live-preview' : ''}`}
    contentEditable={!preview}
    role="textbox"
    aria-multiline="true"
    aria-label={preview ? 'Resume template preview' : 'Generated editable resume'}
    suppressContentEditableWarning
    spellCheck
  >
    <ResumeHeader resumeData={resumeData} presentation={presentation} />
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

function paginateMeasurement(measurement, sections) {
  if (!measurement) return initialPages(sections)

  const styles = window.getComputedStyle(measurement)
  const contentHeight = measurement.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom)
  const headerElement = measurement.querySelector('[data-page-header]')
  const footerElement = measurement.querySelector('[data-page-footer]')
  const headerHeight = headerElement?.offsetHeight || 0
  const footerHeight = footerElement?.offsetHeight || 0
  const columnFlow = measurement.querySelector('.resume-columns-flow')
  // For independent sidebar/main flows, summing every section vertically
  // overestimates the page and created the phantom second page seen in the
  // Bronzor capture. Use the actual column height when it fits.
  if (columnFlow && columnFlow.scrollHeight + headerHeight + footerHeight <= contentHeight) return initialPages(sections)
  const pages = []
  let page = { showHeader: true, groups: [], showFooter: false }
  let usedHeight = headerHeight

  const pushPage = () => {
    if (page.groups.length || page.showHeader) pages.push(page)
    page = { showHeader: false, groups: [], showFooter: false }
    usedHeight = 0
  }

  sections.forEach(section => {
    const measuredSection = measurement.querySelector(`[data-measure-section="${section.id}"]`)
    const heading = measuredSection?.querySelector('[data-measure-heading]')
    const sectionStyle = measuredSection ? window.getComputedStyle(measuredSection) : null
    const headingStyle = heading ? window.getComputedStyle(heading) : null
    const sectionMargin = parseFloat(sectionStyle?.marginTop || 0)
    const headingHeight = (heading?.offsetHeight || 0) + parseFloat(headingStyle?.marginBottom || 0)
    let group = null

    section.blocks.forEach((_, blockIndex) => {
      const measuredBlock = measuredSection?.querySelector(`[data-block-index="${blockIndex}"]`)
      const blockHeight = measuredBlock?.offsetHeight || 0
      const needsHeading = !group
      const requiredHeight = blockHeight + (needsHeading ? sectionMargin + headingHeight : 0)

      if (usedHeight + requiredHeight > contentHeight && (page.groups.length || !page.showHeader)) {
        pushPage()
        group = null
      }

      if (!group) {
        group = {
          sectionId: section.id,
          blockIndexes: [],
          continued: blockIndex > 0,
        }
        page.groups.push(group)
        usedHeight += sectionMargin + headingHeight
      }

      group.blockIndexes.push(blockIndex)
      usedHeight += blockHeight
    })
  })

  if (footerHeight) {
    if (usedHeight + footerHeight > contentHeight && page.groups.length) pushPage()
    page.showFooter = true
  }

  if (page.groups.length || page.showFooter || !pages.length) pages.push(page)
  return pages
}

export default function ResumeTemplateLayout({ resumeData = {}, editorRef, variant, editorStyle, useGlobalTextColor = false, footerText = '', preview = false, onManualEdit, presentation, onElementSelect }) {
  const templateResume = useMemo(() => adaptResumeForTemplate(resumeData), [resumeData])
  const templateStyle = {
    ...editorStyle,
    ...(presentation?.accentColor ? { '--template-accent-color': presentation.accentColor } : {}),
    ...(presentation?.fontFamily ? { fontFamily: presentation.fontFamily } : {}),
    ...(Number.isFinite(presentation?.sidebarWidth) ? { '--template-sidebar-width': `${Math.max(24, Math.min(presentation.sidebarWidth, 42))}%` } : {}),
    ...(Number.isFinite(presentation?.contactScale) ? { '--template-contact-text-scale': `${Math.max(.75, Math.min(presentation.contactScale, 1))}em` } : {}),
    ...(Number.isFinite(presentation?.nameScale) ? { '--template-name-text-scale': `${Math.max(.72, Math.min(presentation.nameScale, 1))}em` } : {}),
    ...(Number.isFinite(presentation?.projectDescriptionScale) ? {
      '--template-project-description-size': `${.9 * Math.max(.78, Math.min(presentation.projectDescriptionScale, 1))}em`,
      '--template-project-description-carousel-size': `${.86 * Math.max(.78, Math.min(presentation.projectDescriptionScale, 1))}em`
    } : {})
  }
  const sections = useMemo(() => buildSections(templateResume, variant), [templateResume, variant])
  const shellRef = useRef(null)
  const measurementRef = useRef(null)
  const [pageWidth, setPageWidth] = useState(MAX_A4_WIDTH)
  const [pages, setPages] = useState(() => initialPages(sections))
  const pageHeight = Math.round(pageWidth * A4_RATIO)

  useEffect(() => {
    const font = resumeFonts.find(item => item.family === presentation?.fontFamily)
    if (font) loadResumeFont(font)
  }, [presentation?.fontFamily])

  useEffect(() => {
    if (preview || !shellRef.current) return undefined

    const updatePageWidth = () => {
      const availableWidth = shellRef.current?.clientWidth || MAX_A4_WIDTH
      setPageWidth(Math.max(240, Math.min(MAX_A4_WIDTH, availableWidth - 32)))
    }
    updatePageWidth()

    const observer = new ResizeObserver(updatePageWidth)
    observer.observe(shellRef.current)
    return () => observer.disconnect()
  }, [preview])

  useLayoutEffect(() => {
    if (preview) return
    const nextPages = paginateMeasurement(measurementRef.current, sections)
    setPages(nextPages)
  }, [editorStyle, footerText, pageHeight, preview, sections, useGlobalTextColor, variant])

  if (preview) {
    return <SingleResume
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
    />
  }

  const commitManualEdit = event => {
    const selection = window.getSelection()
    const anchor = selection?.anchorNode
    const anchorElement = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement
    const field = anchorElement?.closest?.('[data-resume-path]') || event.target.closest?.('[data-resume-path]')
    if (!field || !onManualEdit) return
    onManualEdit({ path: field.dataset.resumePath, value: field.innerText })
  }

  const selectResumeElement = event => {
    const element = event.target.closest?.('[data-resume-element-id]')
    if (!element || !onElementSelect) return
    onElementSelect({ id: element.dataset.resumeElementId, path: element.dataset.resumePath })
  }

  return <div className="resume-document-shell" ref={shellRef}>
    <div className="resume-page-scroller">
      <div
        ref={editorRef}
        className="resume-page-document"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Generated editable resume"
        suppressContentEditableWarning
        spellCheck
        onBlur={commitManualEdit}
        onClick={selectResumeElement}
      >
        {pages.map((page, pageIndex) => <div
          className="resume-page-frame"
          style={{ width: pageWidth, height: pageHeight }}
          data-page-number={pageIndex + 1}
          key={`${pageIndex}-${page.groups.map(group => `${group.sectionId}:${group.blockIndexes.join(',')}`).join('|')}`}
        >
          <article
            style={{ ...templateStyle, width: pageWidth, height: pageHeight }}
            className={`generated-resume resume-a4-page template-${variant} ${useGlobalTextColor ? 'ai-global-text-color' : ''}`}
          >
            {page.showHeader && <ResumeHeader resumeData={templateResume} presentation={presentation} />}
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
      className={`generated-resume resume-a4-page resume-pagination-measure template-${variant} ${useGlobalTextColor ? 'ai-global-text-color' : ''}`}
      aria-hidden="true"
    >
      <ResumeHeader resumeData={templateResume} presentation={presentation} />
      <div className="generated-resume-main">
        <ResumeSectionFlow variant={variant} sections={sections} renderSection={section => <section className="resume-section" data-measure-section={section.id} key={section.id}>
          <h2 data-measure-heading>{section.title}</h2>
          {section.blocks.map((block, blockIndex) => <div className="resume-page-block" data-block-index={blockIndex} key={block.id}>
            <RenderBlock block={block} />
          </div>)}
        </section>} />
      </div>
      {footerText && <footer className="generated-resume-footer" data-page-footer>{footerText}</footer>}
    </article>
  </div>
}
