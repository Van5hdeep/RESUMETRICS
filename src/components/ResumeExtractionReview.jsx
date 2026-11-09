import { useState } from 'react'
import {
  siBehance, siBitbucket, siCodechef, siCodeforces, siCoursera, siCredly, siDevdotto, siDribbble, siFacebook, siFigma,
  siGeeksforgeeks, siGithub, siGitlab, siGoogledocs, siGoogledrive, siGooglescholar, siHackerrank, siHashnode, siInstagram,
  siKaggle, siLeetcode, siMedium, siNotion, siOrcid, siResearchgate, siStackoverflow, siUdemy, siX, siYoutube
} from 'simple-icons'

// Logos for common resume destinations (Simple Icons, CC0). Uncommon sites show text only.
const linkIcons = [
  ['github.', siGithub], ['gitlab.', siGitlab], ['bitbucket.', siBitbucket], ['leetcode.', siLeetcode], ['hackerrank.', siHackerrank],
  ['codechef.', siCodechef], ['codeforces.', siCodeforces], ['geeksforgeeks.', siGeeksforgeeks], ['kaggle.', siKaggle],
  ['stackoverflow.', siStackoverflow], ['medium.', siMedium], ['dev.to', siDevdotto], ['hashnode.', siHashnode], ['behance.', siBehance],
  ['dribbble.', siDribbble], ['figma.', siFigma], ['notion.', siNotion], ['youtube.', siYoutube], ['youtu.be', siYoutube],
  ['twitter.', siX], ['x.com', siX], ['instagram.', siInstagram], ['facebook.', siFacebook], ['scholar.google.', siGooglescholar],
  ['orcid.', siOrcid], ['researchgate.', siResearchgate], ['credly.', siCredly], ['coursera.', siCoursera], ['udemy.', siUdemy],
  ['drive.google.', siGoogledrive], ['docs.google.', siGoogledocs]
]
const hostingSuffixes = ['github.io', 'vercel.app', 'netlify.app', 'pages.dev', 'web.app', 'firebaseapp.com', 'onrender.com', 'herokuapp.com']
const linkHost = url => url.replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLocaleLowerCase()

function iconForUrl(url) {
  const host = linkHost(url)
  if (hostingSuffixes.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) return null
  if (host.includes('linkedin.')) return 'linkedin'
  return linkIcons.find(([pattern]) => host === pattern || host.includes(pattern))?.[1] ?? null
}

// Very dark brand colours (GitHub, X, Medium…) follow the text colour so they stay visible in dark mode.
const isDarkHex = hex => {
  const [r, g, b] = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18
}

function LinkIcon({ url }) {
  const icon = iconForUrl(url)
  if (!icon) return <span className="extraction-link-icon is-blank" aria-hidden="true" />
  if (icon === 'linkedin') {
    // Simple Icons no longer ships LinkedIn's logo, so a plain generic "in" mark is used instead.
    return <span className="extraction-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><text x="12" y="17" textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="Arial, sans-serif" fill="#0A66C2">in</text></svg></span>
  }
  return <span className={`extraction-link-icon${isDarkHex(icon.hex) ? ' is-mono' : ''}`} style={{ '--brand': `#${icon.hex}` }} aria-hidden="true">
    <svg viewBox="0 0 24 24" width="18" height="18"><path d={icon.path} /></svg>
  </span>
}

const collapsedSkillLimit = 18

const hasText = value => typeof value === 'string' && value.trim().length > 0
const joinDates = item => [item?.startDate, item?.endDate].filter(hasText).join(' – ')
const linkHref = url => /^https?:\/\//i.test(url) ? url : `https://${url}`
const shortUrl = url => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')

// Every resume is shown in this same order, so absent categories are as visible as present ones.
function ReviewSection({ label, count = 0, wide = false, empty = false, children }) {
  return <section className={`extraction-section${wide ? ' is-wide' : ''}${empty ? ' is-empty' : ''}`}>
    <h3>{label}{count > 0 && <span>{count}</span>}</h3>
    {empty ? <p className="extraction-absent">Not found in this resume</p> : children}
  </section>
}

function EntryList({ items }) {
  return <ul className="extraction-entries">{items.map((item, index) => <li key={index}>
    <b>{item.title}</b>
    {item.subtitle && <span>{item.subtitle}</span>}
    {item.meta && <small>{item.meta}</small>}
    {item.links?.map(url => <a className="extraction-entry-link" key={url} href={linkHref(url)} target="_blank" rel="noopener noreferrer">{shortUrl(url)}</a>)}
  </li>)}</ul>
}

function LinkList({ links }) {
  return <ul className="extraction-link-list">{links.map(link => <li key={link.url}>
    <a href={linkHref(link.url)} target="_blank" rel="noopener noreferrer">
      <LinkIcon url={link.url} />
      <span className="extraction-link-text"><b>{link.label || 'Link'}</b><small>{shortUrl(link.url)}</small></span>
      <span className="extraction-link-arrow" aria-hidden="true">↗</span>
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  </li>)}</ul>
}

function SimpleList({ items }) {
  return <ul className="extraction-simple-list">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
}

export default function ResumeExtractionReview({ resumeData, uploadedFileName, parseMetadata, onContinue, onStartOver }) {
  const [showAllSkills, setShowAllSkills] = useState(false)
  const contact = [['Email', resumeData.email], ['Phone', resumeData.phone], ['Location', resumeData.location]]
  const hasContact = contact.some(([, value]) => hasText(value))
  const skills = [...new Map(Object.values(resumeData.skills ?? {}).flat().filter(hasText).map(skill => [skill.trim().toLocaleLowerCase(), skill.trim()])).values()]
  const visibleSkills = showAllSkills ? skills : skills.slice(0, collapsedSkillLimit)

  const experience = (resumeData.experience ?? []).map(item => ({ title: item?.role || item?.company || 'Role', subtitle: item?.role && item?.company ? item.company : '', meta: [joinDates(item), item?.location].filter(hasText).join(' · ') }))
  const projects = (resumeData.projects ?? []).map(item => ({ title: item?.name || item?.title || 'Project', subtitle: item?.description || '', meta: (item?.techStack ?? []).filter(hasText).join(' · '), links: (item?.links ?? []).filter(hasText) }))
  const education = (resumeData.education ?? []).map(item => ({ title: item?.degree || item?.institution || 'Education', subtitle: item?.degree && item?.institution ? item.institution : '', meta: [joinDates(item), item?.location].filter(hasText).join(' · ') }))
  const lists = [
    ['Certifications', (resumeData.certifications ?? []).filter(hasText)],
    ['Achievements', (resumeData.achievements ?? []).filter(hasText)],
    ['Languages', (resumeData.languages ?? []).filter(hasText)]
  ]
  const links = [...new Map((resumeData.links ?? [])
    .filter(link => hasText(link?.url) && /[./:]/.test(link.url))
    .map(link => [shortUrl(link.url).toLocaleLowerCase().replace(/[/?#]+$/, ''), link])).values()]
  const customSections = (resumeData.customSections ?? [])
    .filter(section => hasText(section?.title))
    .map(section => [section.title, String(section.content ?? '').split('\n').filter(hasText)])
    .filter(([, items]) => items.length)
  const parseWarnings = [...(parseMetadata?.warnings ?? []), ...(parseMetadata?.errors ?? [])].filter(Boolean)
  const needsParseReview = parseMetadata && (!parseMetadata.isCompleteParse || parseWarnings.length > 0)

  return <section className="extraction-review" aria-label="Extracted resume details">
    <header className="extraction-identity">
      <span className="extraction-source">Extracted from <strong>{uploadedFileName}</strong></span>
      <h2>{resumeData.fullName || 'Name not found'}</h2>
      {hasText(resumeData.headline) && <p className="extraction-headline">{resumeData.headline}</p>}
    </header>

    {needsParseReview && <p className="extraction-warning" role="status">Part of this file could not be read. {parseWarnings.join(' · ')} Check the details below before you continue.</p>}

    <div className="extraction-sections">
      <ReviewSection label="Contact details" empty={!hasContact}>
        <dl className="extraction-contact-list">{contact.map(([label, value]) => <div key={label}>
          <dt>{label}</dt>
          <dd className={hasText(value) ? '' : 'is-absent'}>{hasText(value) ? value : 'Not found'}</dd>
        </div>)}</dl>
      </ReviewSection>
      <ReviewSection label="Summary" empty={!hasText(resumeData.summary)}><p className="extraction-summary-text">{resumeData.summary}</p></ReviewSection>

      <ReviewSection label="Skills" count={skills.length} wide empty={!skills.length}>
        <ul className="extraction-skill-list">{visibleSkills.map(skill => <li key={skill}>{skill}</li>)}</ul>
        {skills.length > collapsedSkillLimit && <button className="extraction-more" type="button" aria-expanded={showAllSkills} onClick={() => setShowAllSkills(value => !value)}>{showAllSkills ? 'Show fewer skills' : `Show all ${skills.length} skills`}</button>}
      </ReviewSection>

      <ReviewSection label="Experience" count={experience.length} empty={!experience.length}><EntryList items={experience} /></ReviewSection>
      <ReviewSection label="Projects" count={projects.length} empty={!projects.length}><EntryList items={projects} /></ReviewSection>
      <ReviewSection label="Education" count={education.length} empty={!education.length}><EntryList items={education} /></ReviewSection>
      {lists.map(([label, items]) => <ReviewSection key={label} label={label} count={items.length} empty={!items.length}><SimpleList items={items} /></ReviewSection>)}
      <ReviewSection label="Links" count={links.length} empty={!links.length}><LinkList links={links} /></ReviewSection>
      {customSections.map(([label, items]) => <ReviewSection key={label} label={label} count={items.length}><SimpleList items={items} /></ReviewSection>)}
    </div>

    <div className="state-actions"><button className="btn btn-secondary" onClick={onStartOver}>Start over</button><button className="btn btn-primary" onClick={onContinue}>Choose template</button></div>
  </section>
}
