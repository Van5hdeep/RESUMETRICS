import { useMemo, useState } from 'react'

const unique = values => [...new Map(values.filter(Boolean).map(value => [String(value).trim().toLowerCase(), String(value).trim()])).values()]

function profileSkills(profile) {
  return unique([
    ...Object.values(profile?.skills ?? {}).flat(),
    ...(profile?.projects ?? []).flatMap(project => project.techStack ?? []),
    ...(profile?.certifications ?? [])
  ])
}

function DetailList({ title, items, emptyCopy }) {
  return <div className="linkedin-detail-list"><h3>{title}</h3>{items.length ? items.map(item => <div key={item.key} className="linkedin-detail-row"><strong>{item.title}</strong>{item.meta && <span>{item.meta}</span>}{item.detail && <small>{item.detail}</small>}</div>) : <p>{emptyCopy}</p>}</div>
}

export default function LinkedInEvidenceReview({ profile, resumeData, hasJobDescription, analysis, isLoading, error, onRetry }) {
  const [activeView, setActiveView] = useState('skills')
  const skills = useMemo(() => profileSkills(profile), [profile])
  const resumeSkills = useMemo(() => profileSkills(resumeData), [resumeData])
  const resumeKeys = useMemo(() => new Set(resumeSkills.map(skill => skill.toLowerCase())), [resumeSkills])
  const profileOverlap = analysis?.profileOverlap ?? skills.filter(skill => resumeKeys.has(skill.toLowerCase()))
  const resumeOnlySkills = analysis?.resumeOnlySkills ?? resumeSkills.filter(skill => !new Set(skills.map(item => item.toLowerCase())).has(skill.toLowerCase()))
  const jdMatchedSkills = hasJobDescription ? (analysis?.strengths ?? []) : []
  const jdMissingSkills = hasJobDescription ? (analysis?.missingSkills ?? []) : []
  const profileScore = Math.max(0, Math.min(100, Number(analysis?.score) || 0))
  const comparisonScore = hasJobDescription ? profileScore : Math.max(0, Math.min(100, Number(analysis?.profileOverlapScore) || 0))
  const experience = (profile?.experience ?? []).map((item, index) => ({
    key: `${item.role}-${item.company}-${index}`,
    title: [item.role, item.company].filter(Boolean).join(' · ') || `Role ${index + 1}`,
    meta: [item.startDate, item.endDate].filter(Boolean).join(' – '),
    detail: item.bullets.slice(0, 1).join('')
  }))
  const education = (profile?.education ?? []).map((item, index) => ({
    key: `${item.degree}-${item.institution}-${index}`,
    title: [item.degree, item.institution].filter(Boolean).join(' · ') || `Education ${index + 1}`,
    meta: [item.startDate, item.endDate].filter(Boolean).join(' – '),
    detail: item.details.slice(0, 1).join('')
  }))

  if (!isLoading && !analysis && !error) return null

  return <section className={`panel section-panel linkedin-evidence-review ${isLoading ? 'is-loading' : ''}`} aria-live="polite">
    <div className="linkedin-evidence-heading"><span className="linkedin-evidence-icon" aria-hidden="true">in</span><div><span className="eyebrow">LINKEDIN PROFILE EVIDENCE</span><h2>{isLoading ? 'Comparing your LinkedIn profile…' : 'LinkedIn profile alignment'}</h2></div>{!isLoading && analysis && <span className="linkedin-evidence-count">{comparisonScore}% {hasJobDescription ? 'JD fit' : 'resume overlap'}</span>}</div>

    {isLoading && <><p className="muted">Comparing the extracted LinkedIn profile with your resume, plus the job description when provided.</p><div className="linkedin-scan-steps"><span>Profile details ready</span><span>Matching resume skills</span><span>Reviewing experience & education</span></div></>}

    {!isLoading && error && <div className="github-evidence-error"><p>{error}</p><button className="secondary-button" type="button" onClick={onRetry}>Try again</button></div>}

    {!isLoading && analysis && <>
      <p className="linkedin-evidence-summary">{analysis.summary}</p>
      <div className="linkedin-overview">
        <div className="linkedin-match-ring" style={{ background: `conic-gradient(#0a7bbd ${comparisonScore}%, #e6edf4 ${comparisonScore}% 100%)` }}><div><strong>{comparisonScore}%</strong><span>{hasJobDescription ? 'JD fit' : 'resume overlap'}</span></div></div>
        <div className="linkedin-evidence-metrics"><div><strong>{profileOverlap.length}</strong><span>skills shared with resume</span></div><div><strong>{hasJobDescription ? jdMatchedSkills.length : resumeOnlySkills.length}</strong><span>{hasJobDescription ? 'JD skills matched by resume' : 'resume skills to review'}</span></div><div><strong>{experience.length}</strong><span>LinkedIn roles extracted</span></div><div><strong>{education.length}</strong><span>education entries</span></div></div>
      </div>
      <div className="linkedin-view-tabs" role="tablist" aria-label="LinkedIn comparison details">{[['skills', 'Skills'], ['experience', 'Experience'], ['education', 'Education']].map(([view, label]) => <button type="button" key={view} role="tab" aria-selected={activeView === view} className={activeView === view ? 'active' : ''} onClick={() => setActiveView(view)}>{label}</button>)}</div>
      {activeView === 'skills' && <div className="linkedin-skill-breakdown"><div><h3>Shared with resume</h3><div className="skill-tags linkedin-matched-skills">{profileOverlap.length ? profileOverlap.map(skill => <span key={skill}>{skill}</span>) : <small>No skills are shared by the resume and LinkedIn profile.</small>}</div></div><div><h3>Resume skills not on LinkedIn</h3><div className="skill-tags linkedin-missing-skills">{resumeOnlySkills.length ? resumeOnlySkills.map(skill => <span key={skill}>{skill}</span>) : <small>Every extracted resume skill appears on LinkedIn.</small>}</div></div>{hasJobDescription && <div><h3>JD skills matched by resume</h3><div className="skill-tags linkedin-matched-skills">{jdMatchedSkills.length ? jdMatchedSkills.map(skill => <span key={skill}>{skill}</span>) : <small>No identified JD skills matched the resume.</small>}</div><div className="skill-tags linkedin-missing-skills">{jdMissingSkills.slice(0, 8).map(skill => <span key={skill}>{skill}</span>)}</div></div>}<p className="linkedin-skill-inventory"><strong>{skills.length} LinkedIn skills extracted:</strong> {skills.slice(0, 18).join(' · ') || 'No dedicated skills were detected in this export.'}{analysis.certificationAlignment && <><br /><strong>Certification context:</strong> {analysis.certificationAlignment}</>}</p></div>}
      {activeView === 'experience' && <div><p className="linkedin-section-alignment">{analysis.experienceAlignment || `${experience.length} LinkedIn role${experience.length === 1 ? '' : 's'} extracted; the resume contains ${(resumeData?.experience ?? []).length} role${(resumeData?.experience ?? []).length === 1 ? '' : 's'} for side-by-side review${hasJobDescription ? ' alongside the JD fit' : ''}.`}</p><DetailList title="Experience captured from LinkedIn" items={experience} emptyCopy="No experience entries were detected in this profile export." /></div>}
      {activeView === 'education' && <div><p className="linkedin-section-alignment">{analysis.educationAlignment || `${education.length} LinkedIn education entr${education.length === 1 ? 'y is' : 'ies are'} available; the resume contains ${(resumeData?.education ?? []).length} education entr${(resumeData?.education ?? []).length === 1 ? 'y' : 'ies'} for side-by-side review${hasJobDescription ? ' alongside the JD fit' : ''}.`}</p><DetailList title="Education captured from LinkedIn" items={education} emptyCopy="No education entries were detected in this profile export." /></div>}
      {analysis.recommendations?.length > 0 && <div className="linkedin-recommendations"><strong>Keep it accurate</strong><ul>{analysis.recommendations.map(item => <li key={item}>{item}</li>)}</ul></div>}
      {analysis.analysisMethod !== 'ai' && <small className="analysis-note">A skills-based comparison is shown while the AI narrative service is unavailable.</small>}
    </>}
  </section>
}
