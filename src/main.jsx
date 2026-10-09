import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import UserMenu from './components/UserMenu.jsx'
import Login from './pages/Login.jsx'
import LandingPage from './pages/LandingPage.jsx'
import './styles.css'
import './template.css'
import './layout-overrides.css'
import './interaction-overrides.css'
import './resume-flow.css'
import './github-evidence.css'
import './linkedin-evidence.css'
import './ai-assistant.css'
import './resume-builder.css'
import logo from './assets/resumetrics-logo.png'
import ResumeStartOptions, { FileTypeIcon } from './components/ResumeStartOptions.jsx'
import ResumeExtractionReview from './components/ResumeExtractionReview.jsx'
import NimbusChat from './components/nimbus/NimbusChat.jsx'
import EditorShell from './components/editor/EditorShell.jsx'
import FormatPanel from './components/editor/FormatPanel.jsx'
import AiRail, { CoverLetterDock, EvidenceDock, TailorDock } from './components/editor/AiRail.jsx'
import SectionForm from './components/form/SectionForm.jsx'
import { SaveButton } from './components/SaveButton.jsx'
import { formSectionsFor, hasStartedForm } from './form/sectionProgress.js'
import { describeResumeElement } from './editor/describeResumeElement.js'
import useEditorHistory from './editor/useEditorHistory.js'
import { useFirestoreAutosave } from './hooks/useFirestoreAutosave.js'
import { listResumes, getResume, deleteResume } from './utils/userApi.js'
import './editor-studio.css'
import './section-form.css'
import './print.css'
import './nimbus-chat.css'
import './job-match.css'
import ProfilePhotoControls from './components/ProfilePhotoControls.jsx'
import { createResumePresentation, getResumeTemplate, resolveResumePresentation, resumeTemplates } from './config/resumeTemplates.js'
import { templatePreviewResumeData } from './data/templatePreviewData.js'
import { createBlankResumeData } from './data/resumeData.js'
import { applyResumeEditPlan } from './utils/applyResumeEditPlan.js'
import { applyResumeEditingOperations, getPathValue } from './editor/resumeEditingEngine.js'
import { clearWorkspaceSnapshot, readWorkspaceSnapshot, restored, writeWorkspaceSnapshot } from './workspace/workspacePersistence.js'
import { toggleMarkInRange } from './editor/inlineMarks.js'
import { getTemplateSectionPlan } from './components/templates/ResumeTemplateLayout.jsx'
import { buildResumeElementRegistry, ensureResumeElementIds } from './editor/resumeElementRegistry.js'
import { findFont, loadFontsForPresentation, resumeFonts } from './editor/fontRegistry.js'
import { extractResumeDocument } from './utils/extractResumeDocument.js'
import useJobMatch from './jd/useJobMatch.js'
import { streamNdjson } from './utils/readNdjson.js'
import { authHeaders } from './utils/authHeaders.js'
import TailorWorkspace from './components/jd/TailorWorkspace.jsx'
import { scoreKeywords } from '../shared/jdKeywords.js'
import EvidenceWorkspace from './components/evidence/EvidenceWorkspace.jsx'
import './job-tailoring.css'
import './evidence.css'
import './buttons.css'
import './format-panel.css'
import { readProfilePhoto } from './utils/readProfilePhoto.js'
import { applyNimbusOperations } from './nimbus/applyNimbusOperations.js'
import { MIN_READABLE_BASE_SIZE } from '../shared/nimbusPlan.js'
import useNimbusTurns, { settleLayout } from './nimbus/useNimbusTurns.js'
import ResumeGateDialog, { gateTools } from './pages/ResumeGate.jsx'
import CoverLetterPage from './coverLetter/CoverLetterPage.jsx'
import LetterStudio, { LetterPrintPage, initialLetterMessages } from './coverLetter/LetterStudio.jsx'
import { createLetter, letterFromJob, letterToText } from '../shared/letterModel.js'
import './cover-letter.css'
import { buildSkillAwareRoleAnalysis } from '../shared/roleAnalysis.js'

// Items without a path are planned features shown as "Soon" until their pages exist.
const navSections = [
  { label: 'Main menu', items: [
    ['Dashboard', '/dashboard', 'dashboard'],
    ['Resume builder', '/workspace', 'create'],
    ['Templates', '/templates', 'layout'],
    ['Plan', null, 'crown']
  ] },
  { label: 'Career tools', items: [
    // These three need a resume: they do not navigate, they open the "Select a resume first" pop-up over the current page (PLAN-033).
    ['Job tailoring', null, 'target', 'tailor'],
    ['Cover letters', null, 'mail', 'letter'],
    ['Evidence check', null, 'evidence', 'evidence'],
    ['Job tracker', null, 'briefcase']
  ] }
]
const navUtilityItems = [
  ['Settings', '/settings', 'settings'],
  ['Help & support', '/help', 'help']
]
const recentProjectColors = ['#7c5cff', '#e0559a', '#1fa37a', '#e59a1a', '#3b82f6']

const safeFileName = value => (value || 'untitled-resume').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled-resume'
const githubResumeSnapshotKey = 'resumetrics:pending-github-evidence-resume'
const githubResumeSnapshotMaxAge = 15 * 60 * 1000
const initialNimbusMessages = [{ id: 'welcome', role: 'assistant', status: 'done', text: 'Hi, I’m NIMBUS. Ask me to write, deepen or rewrite anything on your resume.' }]
function getResumeEvidenceSkills(resumeData) {
  if (!resumeData) return []
  const values = [
    ...Object.values(resumeData.skills ?? {}).flat(),
    ...(resumeData.projects ?? []).flatMap(project => project.techStack ?? []),
    ...(resumeData.certifications ?? [])
  ]
  return [...new Map(values.filter(value => typeof value === 'string' && value.trim()).map(value => [value.trim().toLocaleLowerCase(), value.trim()])).values()].slice(0, 24)
}


const cleanManualValue = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
const splitManualList = value => cleanManualValue(value).split(/[·,\n]/).map(item => item.trim()).filter(Boolean)

function updateManualResumeData(resumeData, path, value) {
  if (!resumeData || !path) return resumeData
  const next = JSON.parse(JSON.stringify(resumeData))
  const text = cleanManualValue(value)
  const parts = path.split('.')

  if (['fullName', 'headline', 'email', 'phone', 'location', 'summary'].includes(path)) {
    next[path] = text
    return next
  }
  if (path === 'skills') {
    const previousCategories = Object.entries(next.skills ?? {})
    const categoryForSkill = new Map(previousCategories.flatMap(([category, skills]) => (skills ?? []).map(skill => [String(skill).toLocaleLowerCase(), category])))
    const values = splitManualList(text)
    next.skills = Object.fromEntries(previousCategories.map(([category]) => [category, []]))
    values.forEach(skill => {
      const category = categoryForSkill.get(skill.toLocaleLowerCase()) || 'other'
      next.skills[category] ||= []
      if (!next.skills[category].some(item => item.toLocaleLowerCase() === skill.toLocaleLowerCase())) next.skills[category].push(skill)
    })
    return next
  }
  if (parts[0] === 'skills' && parts.length === 2) {
    next.skills ||= {}
    next.skills[parts[1]] = splitManualList(text)
    return next
  }
  if (path === 'languages') {
    next.languages = splitManualList(text)
    return next
  }
  if (parts[0] === 'links' && Number.isInteger(Number(parts[1]))) {
    const index = Number(parts[1])
    // The resume shows a link's label ("LinkedIn"); editing that text renames the link without touching its address.
    if (parts[2] === 'label') next.links[index] = { ...(next.links[index] ?? {}), label: text }
    else next.links[index] = { ...(next.links[index] ?? {}), url: text, label: next.links[index]?.label || text }
    return next
  }
  if (['certifications', 'achievements'].includes(parts[0]) && Number.isInteger(Number(parts[1]))) {
    next[parts[0]][Number(parts[1])] = text
    return next
  }

  const [section, indexText, field, itemIndexText] = parts
  const index = Number(indexText)
  if (!['experience', 'projects', 'education'].includes(section) || !Number.isInteger(index) || !next[section]?.[index]) return next
  const item = next[section][index]
  if (field === 'techStack') {
    item.techStack = splitManualList(text)
    return next
  }
  if (field === 'links') {
    const itemIndex = Number(itemIndexText)
    if (!Number.isInteger(itemIndex)) return next
    item.links ||= []
    item.links[itemIndex] = text
    return next
  }
  if (field === 'bullets' || field === 'details') {
    const itemIndex = Number(itemIndexText)
    if (!Number.isInteger(itemIndex)) return next
    item[field] ||= []
    item[field][itemIndex] = text
    return next
  }
  if (field) item[field] = text
  return next
}




const savedProjectsStorageKey = 'resumetrics:saved-projects'
const placeholderSavedProjects = [
  { id: 'saved-work-1', name: 'Saved work', resumeData: null },
  { id: 'saved-work-2', name: 'Saved work', resumeData: null }
]

function describeSavedProject(project) {
  const updatedAt = Number(project.updatedAt)
  return {
    ...project,
    name: project.name || project.resumeData?.fullName || 'Untitled resume',
    templateName: resumeTemplates.find(template => template.id === project.templateId)?.name || '',
    updatedLabel: updatedAt ? `Edited ${new Date(updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Not edited yet'
  }
}

function readSavedProjects() {
  try {
    const stored = JSON.parse(localStorage.getItem(savedProjectsStorageKey) || 'null')
    const projects = Array.isArray(stored) ? stored.filter(project => project?.id) : placeholderSavedProjects
    return projects.map(describeSavedProject)
  } catch {
    return placeholderSavedProjects.map(describeSavedProject)
  }
}

function storeSavedProjects(projects) {
  try {
    localStorage.setItem(savedProjectsStorageKey, JSON.stringify(projects.map(({ id, name, templateId, updatedAt, resumeData, progress }) => ({ id, name, templateId, updatedAt, resumeData, progress }))))
  } catch {
    // The dashboard still updates for this visit if browser storage is unavailable.
  }
}

function getResumeHealth(resumeData) {
  const data = resumeData ?? {}
  const has = value => typeof value === 'string' && value.trim().length > 0
  const count = value => (Array.isArray(value) ? value.filter(Boolean).length : 0)
  const skillCount = Object.values(data.skills ?? {}).flat().filter(has).length
  const experience = Array.isArray(data.experience) ? data.experience : []
  const bulletCount = [...experience, ...(data.projects ?? [])].reduce((total, item) => total + count(item?.bullets), 0)
  const experienceBullets = experience.reduce((total, item) => total + count(item?.bullets), 0)
  const summaryWords = has(data.summary) ? data.summary.trim().split(/\s+/).length : 0
  const contactFields = [data.fullName, data.email, data.phone, data.location].filter(has).length
  const rate = (done, partial) => done ? 'done' : partial ? 'partial' : 'missing'
  const checks = [
    { key: 'contact', label: 'Contact details', weight: 15, status: rate(contactFields === 4, contactFields > 0), detail: `${contactFields} of 4 fields`, tip: 'Complete your name, email, phone and location.' },
    { key: 'headline', label: 'Headline', weight: 8, status: rate(has(data.headline), false), detail: has(data.headline) ? 'Added' : 'Missing', tip: 'Add a headline that names the role you want.' },
    { key: 'summary', label: 'Summary', weight: 15, status: rate(summaryWords >= 30, summaryWords > 0), detail: summaryWords ? `${summaryWords} words` : 'Missing', tip: summaryWords ? 'Expand your summary to at least 30 words.' : 'Write a short professional summary.' },
    { key: 'experience', label: 'Experience', weight: 25, status: rate(experience.length > 0 && experienceBullets >= experience.length * 2, experience.length > 0), detail: experience.length ? `${experience.length} role${experience.length === 1 ? '' : 's'}, ${experienceBullets} bullets` : 'Missing', tip: experience.length ? 'Give each role at least two achievement bullets.' : 'Add your work or internship experience.' },
    { key: 'education', label: 'Education', weight: 12, status: rate(count(data.education) > 0, false), detail: count(data.education) ? `${count(data.education)} entr${count(data.education) === 1 ? 'y' : 'ies'}` : 'Missing', tip: 'Add your education history.' },
    { key: 'skills', label: 'Skills', weight: 13, status: rate(skillCount >= 6, skillCount > 0), detail: skillCount ? `${skillCount} skills` : 'Missing', tip: skillCount ? 'List at least six relevant skills.' : 'Add the skills recruiters search for.' },
    { key: 'projects', label: 'Projects', weight: 7, status: rate(count(data.projects) > 0, false), detail: count(data.projects) ? `${count(data.projects)} project${count(data.projects) === 1 ? '' : 's'}` : 'Missing', tip: 'Showcase a project that proves your skills.' },
    { key: 'links', label: 'Links', weight: 5, status: rate(count(data.links) > 0, false), detail: count(data.links) ? `${count(data.links)} link${count(data.links) === 1 ? '' : 's'}` : 'Missing', tip: 'Link your portfolio, GitHub or LinkedIn.' }
  ]
  const progress = {
    contact: contactFields / 4,
    headline: has(data.headline) ? 1 : 0,
    summary: Math.min(summaryWords / 30, 1),
    experience: experience.length ? .25 + .75 * Math.min(experienceBullets / (experience.length * 2), 1) : 0,
    education: count(data.education) ? 1 : 0,
    skills: Math.min(skillCount / 6, 1),
    projects: count(data.projects) ? 1 : 0,
    links: count(data.links) ? 1 : 0
  }
  checks.forEach(check => { check.progress = resumeData ? progress[check.key] : 0 })
  const completion = resumeData ? Math.round((checks.reduce((total, check) => total + check.progress, 0) / checks.length) * 100) : 0
  const tone = !resumeData ? 'empty' : completion >= 80 ? 'strong' : completion >= 50 ? 'fair' : 'weak'
  return {
    completion,
    tone,
    checks,
    completedSections: checks.filter(check => check.progress >= 1).length,
    missing: checks.filter(check => check.progress < 1).sort((a, b) => b.weight - a.weight)
  }
}

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function AnimatedMatchScore({ score, runId }) {
  const [displayScore, setDisplayScore] = useState(0)

  useEffect(() => {
    const target = Math.max(0, Math.min(100, Number(score) || 0))
    const duration = 760
    const startedAt = performance.now()
    let frameId

    const animate = now => {
      const progress = Math.min(1, (now - startedAt) / duration)
      setDisplayScore(Math.round(target * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frameId = requestAnimationFrame(animate)
    }

    setDisplayScore(0)
    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [score, runId])

  return <strong className="animated-match-score" aria-label={`Role match ${displayScore}%`}>{displayScore}%</strong>
}

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (name === 'dashboard') return <svg {...common}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z" /></svg>
  if (name === 'folder') return <svg {...common}><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12Z" /></svg>
  if (name === 'workspace') return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
  if (name === 'document') return <svg {...common}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4M9 13h6M9 17h6" /></svg>
  if (name === 'settings') return <svg {...common}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.75v2.1M12 19.15v2.1M2.75 12h2.1M19.15 12h2.1M5.46 5.46l1.49 1.49M17.05 17.05l1.49 1.49M18.54 5.46l-1.49 1.49M6.95 17.05l-1.49 1.49" /></svg>
  if (name === 'import') return <svg {...common}><path d="M12 4v10M8 10l4 4 4-4" /><path d="M5 16v3h14v-3" /></svg>
  if (name === 'create') return <svg {...common}><path d="M4 17.5V20h2.5L18.8 7.7l-2.5-2.5L4 17.5Z" /><path d="m14.8 6.2 2.5 2.5M13 20h7" /></svg>
  if (name === 'evidence') return <svg {...common}><path d="M12 3 19 6v5c0 4.5-3 7.8-7 10-4-2.2-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
  if (name === 'download') return <svg {...common}><path d="M12 4v10M8 11l4 4 4-4M5 18v2h14v-2" /></svg>
  if (name === 'trash') return <svg {...common}><path d="M5 7h14M10 4h4l1 3H9l1-3ZM7 7l1 13h8l1-13M10 10v6M14 10v6" /></svg>
  if (name === 'spark') return <svg {...common}><path d="m12 3 1.1 4.1L17 8.5l-3.9 1.4L12 14l-1.1-4.1L7 8.5l3.9-1.4L12 3ZM19 14l.6 2.1L22 17l-2.4.9L19 20l-.6-2.1L16 17l2.4-.9L19 14Z" /></svg>
  if (name === 'appearance') return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
  if (name === 'moon') return <svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" fill="currentColor" stroke="none" /></svg>
  if (name === 'device') return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M8 20h8M12 17v3" /></svg>
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>
  if (name === 'security') return <svg {...common}><path d="M12 3 19 6v5c0 4.5-3 7.8-7 10-4-2.2-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
  if (name === 'notifications') return <svg {...common}><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
  if (name === 'privacy') return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" /></svg>
  if (name === 'help') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 4.1 1.7c-1 .8-1.8 1.2-1.8 2.8M12 17h.01" /></svg>
  if (name === 'rocket') return <svg {...common}><path d="M14.5 4.5c2.6-1 4.8-1 5-1 0 .2 0 2.4-1 5a13 13 0 0 1-6 6.5l-3-3a13 13 0 0 1 5-7.5Z" /><circle cx="15" cy="9" r="1.6" /><path d="m9.5 12-3.3-.7L8.5 8h3.4M12 14.5l.7 3.3L16 15.5v-3.4M6.5 15.5c-1.5.5-2.5 2.5-2.5 4.5 2 0 4-1 4.5-2.5" /></svg>
  if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
  if (name === 'user') return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
  if (name === 'layout') return <svg {...common}><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M3.5 9h17M9 9v11.5" /></svg>
  if (name === 'crown') return <svg {...common}><path d="m3 7 4.5 4L12 5l4.5 6L21 7l-2 11H5L3 7Z" /></svg>
  if (name === 'target') return <svg {...common}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".8" fill="currentColor" /></svg>
  if (name === 'briefcase') return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18" /></svg>
  if (name === 'mail') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>
  if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
  return null
}

function SourceIcon({ name }) {
  if (name === 'GitHub') return <span className="source-icon github-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.48.09.65-.2.65-.46v-1.68c-2.65.58-3.21-1.12-3.21-1.12-.44-1.1-1.07-1.4-1.07-1.4-.87-.59.07-.58.07-.58.96.07 1.46.99 1.46.99.86 1.46 2.25 1.04 2.8.8.09-.62.34-1.04.61-1.28-2.12-.24-4.35-1.06-4.35-4.7 0-1.04.37-1.9.98-2.57-.1-.24-.43-1.22.09-2.54 0 0 .8-.26 2.62.98A9.1 9.1 0 0 1 12 7.1c.8 0 1.6.11 2.35.34 1.82-1.24 2.62-.98 2.62-.98.52 1.32.19 2.3.09 2.54.61.67.98 1.53.98 2.57 0 3.65-2.23 4.46-4.36 4.7.35.3.65.87.65 1.76v2.6c0 .26.17.56.66.46A9.5 9.5 0 0 0 12 2.5Z" /></svg></span>
  if (name === 'LinkedIn') return <span className="source-icon linkedin-mark" aria-hidden="true">in</span>
  return <span className="source-icon leetcode-mark" aria-hidden="true">&lt;/&gt;</span>
}

const profileDetailsStorageKey = 'resumetrics:profile-details'
const settingsTabs = [
  ['account', 'Account', 'user'],
  ['appearance', 'Appearance', 'appearance'],
  ['notifications', 'Notifications', 'notifications'],
  ['privacy', 'Privacy & Data', 'privacy']
]

function readProfileDetails() {
  try {
    const stored = JSON.parse(localStorage.getItem(profileDetailsStorageKey) || 'null')
    return { phone: String(stored?.phone ?? ''), location: String(stored?.location ?? '') }
  } catch {
    return { phone: '', location: '' }
  }
}

const formatAccountDate = value => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
}

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-8Z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.8 0-5.2-1.9-6.1-4.5H2.2v2.8A11 11 0 0 0 12 23Z" /><path fill="#FBBC05" d="M5.9 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.7-2.8Z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.1 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.7 2.8C6.8 7.3 9.2 5.4 12 5.4Z" /></svg>
}

// Accent shades replace the old light/dark/system choice; the interface always stays light.
const accentShadeStorageKey = 'resumetrics-shade'
const accentShades = [
  ['violet', 'Violet', 'The original Resumetrics look', ['#5b45e4', '#6c58f2', '#efecff']],
  ['ocean', 'Ocean', 'Calm, trustworthy blue', ['#2563eb', '#3b82f6', '#e6effe']],
  ['emerald', 'Emerald', 'Fresh and confident green', ['#0e9466', '#16b07c', '#e2f5ec']],
  ['rose', 'Rose', 'Warm and personable', ['#db3f68', '#ec5f84', '#fde8ee']],
  ['sunset', 'Sunset', 'Energetic amber', ['#dd6b12', '#f0862e', '#fdeedf']],
  ['graphite', 'Graphite', 'Neutral and understated', ['#3d4757', '#556076', '#eaecf0']]
]
const readAccentShade = () => {
  try {
    const stored = localStorage.getItem(accentShadeStorageKey)
    return accentShades.some(([id]) => id === stored) ? stored : 'violet'
  } catch {
    return 'violet'
  }
}
function applyAccentShade(shade) {
  const root = document.documentElement
  root.dataset.shade = shade
  root.dataset.resolvedTheme = 'light'
  delete root.dataset.appearance
  try {
    localStorage.setItem(accentShadeStorageKey, shade)
    localStorage.removeItem('resumetrics-appearance')
  } catch {
    // The shade still applies for this visit if browser storage is unavailable.
  }
}
// Apply the saved shade as soon as the app loads, not only after Settings is opened.
if (typeof document !== 'undefined') applyAccentShade(readAccentShade())

function GeneralSettingsPanel() {
  const { currentUser, signOut } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)
  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await signOut()
    } catch (logoutError) {
      console.error('Google sign-out failed:', logoutError)
    } finally {
      navigate('/login', { replace: true })
    }
  }
  const [activeTab, setActiveTab] = useState('account')
  const [shade, setShade] = useState(readAccentShade)
  const [savedDetails, setSavedDetails] = useState(readProfileDetails)
  const [details, setDetails] = useState(savedDetails)
  const [detailsNotice, setDetailsNotice] = useState('')
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [privacyNotice, setPrivacyNotice] = useState('')

  useEffect(() => { applyAccentShade(shade) }, [shade])

  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
  const initials = displayName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
  const profilePhoto = currentUser?.photoURL || currentUser?.providerData?.find(provider => provider.providerId === 'google.com')?.photoURL
  const detailsChanged = details.phone.trim() !== savedDetails.phone || details.location.trim() !== savedDetails.location

  const saveDetails = event => {
    event.preventDefault()
    const next = { phone: details.phone.trim(), location: details.location.trim() }
    try {
      localStorage.setItem(profileDetailsStorageKey, JSON.stringify(next))
      setSavedDetails(next)
      setDetails(next)
      setDetailsNotice('Your details were saved on this device.')
    } catch {
      setDetailsNotice('Your browser blocked saving these details.')
    }
  }

  const clearSavedProjects = () => {
    try { localStorage.removeItem(savedProjectsStorageKey) } catch {
      // Nothing to clear if browser storage is unavailable.
    }
    setClearConfirmOpen(false)
    setPrivacyNotice('Saved projects were removed from this browser.')
  }

  return <div className="settings-layout">
    <nav className="settings-tabs" role="tablist" aria-label="Settings sections">
      {settingsTabs.map(([id, label, icon]) => <button key={id} id={`settings-tab-${id}`} className={activeTab === id ? 'active' : ''} type="button" role="tab" aria-selected={activeTab === id} aria-controls="settings-tab-panel" onClick={() => setActiveTab(id)}>
        <Icon name={icon} size={17} /><span>{label}</span>
      </button>)}
    </nav>

    <section className="panel settings-card" id="settings-tab-panel" role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`}>
      {activeTab === 'account' && <>
        <h2>Account</h2>
        <div className="settings-block">
          <span className="settings-block-title">Profile photo</span>
          <div className="settings-avatar-row">
            {profilePhoto ? <img className="settings-avatar" src={profilePhoto} alt="" referrerPolicy="no-referrer" /> : <span className="settings-avatar settings-avatar-placeholder" aria-hidden="true">{initials}</span>}
            <p>Your photo comes from your Google account. Change it in Google to update it here.</p>
          </div>
        </div>
        <div className="settings-block settings-field-grid">
          <label className="settings-field"><span><b>Name</b><small>From Google</small></span><input value={displayName} readOnly aria-readonly="true" /></label>
          <label className="settings-field"><span><b>Email address</b><small>Used to sign in</small></span><input value={currentUser?.email || ''} readOnly aria-readonly="true" /></label>
        </div>
        <form className="settings-block" onSubmit={saveDetails}>
          <div className="settings-field-grid">
            <label className="settings-field"><span><b>Phone number</b><small>Optional</small></span><input type="tel" autoComplete="tel" value={details.phone} placeholder="Add a phone number" onChange={event => { setDetails(current => ({ ...current, phone: event.target.value })); setDetailsNotice('') }} /></label>
            <label className="settings-field"><span><b>Location</b><small>City, country</small></span><input autoComplete="address-level2" value={details.location} placeholder="Add your location" onChange={event => { setDetails(current => ({ ...current, location: event.target.value })); setDetailsNotice('') }} /></label>
          </div>
          <div className="settings-form-footer">
            {detailsNotice ? <span role="status">{detailsNotice}</span> : <span>These are saved on this device only.</span>}
            <button className="primary-button" type="submit" disabled={!detailsChanged}>Save changes</button>
          </div>
        </form>
        <div className="settings-block">
          <span className="settings-block-title">Linked account</span>
          <div className="settings-linked-row">
            <span className="settings-linked-identity"><GoogleMark /><span><b>Google</b><small>{currentUser?.email}</small></span></span>
            <button className="settings-logout-button" type="button" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? 'Logging out…' : 'Log out'}</button>
          </div>
        </div>
        <dl className="settings-meta">
          <div><dt>Member since</dt><dd>{formatAccountDate(currentUser?.metadata?.creationTime)}</dd></div>
          <div><dt>Last sign-in</dt><dd>{formatAccountDate(currentUser?.metadata?.lastSignInTime)}</dd></div>
        </dl>
      </>}

      {activeTab === 'appearance' && <>
        <h2>Appearance</h2>
        <p className="settings-intro">Pick an accent shade for buttons, highlights and menus. Your resume keeps its own template colours.</p>
        <div className="settings-shade-options" role="radiogroup" aria-label="Accent shade">
          {accentShades.map(([id, label, description, colors]) => <button key={id} type="button" role="radio" aria-checked={shade === id} className={shade === id ? 'active' : ''} onClick={() => setShade(id)}>
            <span className="settings-shade-swatch" style={{ '--swatch-a': colors[0], '--swatch-b': colors[1], '--swatch-soft': colors[2] }} aria-hidden="true"><i /><i /><i /></span>
            <span className="settings-shade-text"><b>{label}</b><small>{description}</small></span>
            {shade === id && <span className="settings-shade-check" aria-hidden="true"><Icon name="check" size={14} /></span>}
          </button>)}
        </div>
      </>}

      {activeTab === 'notifications' && <>
        <h2>Notifications</h2>
        <div className="settings-empty">
          <span aria-hidden="true"><Icon name="notifications" size={22} /></span>
          <b>Nothing to set up yet</b>
          <p>Email updates and resume reminders are coming in a future update.</p>
        </div>
      </>}

      {activeTab === 'privacy' && <>
        <h2>Privacy & Data</h2>
        <p className="settings-intro">Resumetrics keeps your projects and preferences in this browser. Your Google password is never seen or stored.</p>
        <div className="settings-block settings-danger-row">
          <span><b>Clear saved projects</b><small>Removes every saved project from this browser. This can't be undone.</small></span>
          {clearConfirmOpen
            ? <span className="settings-confirm"><button type="button" onClick={() => setClearConfirmOpen(false)}>Cancel</button><button className="is-danger" type="button" onClick={clearSavedProjects}>Clear projects</button></span>
            : <button className="settings-danger-button" type="button" onClick={() => { setClearConfirmOpen(true); setPrivacyNotice('') }}>Clear…</button>}
        </div>
        {privacyNotice && <p className="settings-notice" role="status">{privacyNotice}</p>}
      </>}
    </section>
  </div>
}

function DashboardPage() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const displayName = currentUser?.displayName?.trim() || currentUser?.email?.split('@')[0] || 'there'
  const projectRailRef = useRef(null)
  const [canAdvanceProjects, setCanAdvanceProjects] = useState(false)

  const updateProjectRail = useCallback(() => {
    const rail = projectRailRef.current
    if (!rail) return
    setCanAdvanceProjects(rail.scrollWidth - rail.clientWidth - rail.scrollLeft > 2)
  }, [])

  useEffect(() => {
    const rail = projectRailRef.current
    if (!rail) return undefined
    updateProjectRail()
    const observer = new ResizeObserver(updateProjectRail)
    observer.observe(rail)
    rail.addEventListener('scroll', updateProjectRail, { passive: true })
    return () => {
      observer.disconnect()
      rail.removeEventListener('scroll', updateProjectRail)
    }
  }, [updateProjectRail])

  const [savedProjects, setSavedProjects] = useState(readSavedProjects)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const selectedProject = savedProjects.find(project => project.id === selectedProjectId) ?? null
  const health = getResumeHealth(selectedProject?.resumeData)
  const previewData = selectedProject?.resumeData ?? null
  const previewSkills = Object.values(previewData?.skills ?? {}).flat().filter(Boolean).slice(0, 6)

  useEffect(() => { updateProjectRail() }, [savedProjects, updateProjectRail])

  // Clicking the logo navigates here again with a new location key; reload the dashboard data in place.
  const location = useLocation()
  const pageRef = useRef(null)
  useEffect(() => {
    let cancelled = false
    
    async function loadFromFirestore() {
      try {
        console.log('[Dashboard] Loading projects from Firestore...')
        const response = await listResumes()
        if (cancelled) return
        
        console.log('[Dashboard] Firestore response:', response)
        const projects = (response.resumes || []).map(resume => {
          const updatedDate = new Date(resume.updatedAt)
          return {
            id: resume.id,
            name: resume.title || 'Untitled Resume',
            templateId: resume.templateId,
            updatedAt: updatedDate.getTime(),
            updatedLabel: 'Recently',
            resumeData: resume.draftContent,
            progress: resume.progress || {}
          }
        })
        
        console.log('[Dashboard] Loaded projects:', projects)
        setSavedProjects(projects)
      } catch (error) {
        console.error('[Dashboard] Failed to load from Firestore:', error)
        setSavedProjects(readSavedProjects())
      }
    }
    
    loadFromFirestore()
    setSelectedProjectId(null)
    setConfirmDeleteId(null)
    projectRailRef.current?.scrollTo({ left: 0 })
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) pageRef.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' })
    
    return () => { cancelled = true }
  }, [location.key])

  const selectProject = id => {
    setConfirmDeleteId(null)
    setSelectedProjectId(current => current === id ? null : id)
  }

  const deleteProject = id => {
    const next = savedProjects.filter(project => project.id !== id)
    setSavedProjects(next)
    storeSavedProjects(next)
    setSelectedProjectId(null)
    setConfirmDeleteId(null)
  }

  const progressStages = [
    { key: 'building', label: 'Resume building', icon: 'document', value: health.completion },
    { key: 'tailoring', label: 'Resume tailoring', icon: 'spark', value: Math.round(Number(selectedProject?.progress?.tailoring) || 0) },
    { key: 'cover-letter', label: 'Cover letter', icon: 'mail', value: Math.round(Number(selectedProject?.progress?.coverLetter) || 0) }
  ]

  return <Shell dashboard>
    <div className="dashboard-page" ref={pageRef}>
      <section className={`dashboard-health dashboard-health-${health.tone}`} aria-label="Resume progress" aria-live="polite">
        <div className="dashboard-health-copy">
          <span className="dashboard-health-greeting">Welcome back, {displayName}</span>
          <h1>{selectedProject ? selectedProject.name : 'Your resume progress'}</h1>
          <p>{selectedProject
            ? health.missing.length ? 'A few more details will make this resume ready to send.' : 'This resume is complete. Tailor it for each job you apply to.'
            : 'Select a project below to see its progress.'}</p>
          {selectedProject && health.missing.length > 0 && <span className="dashboard-health-next"><b>Next step</b>{health.missing[0].tip}</span>}
        </div>

        <ul className="dashboard-health-stages" aria-label="Progress">
          {progressStages.map(stage => <li key={stage.key}>
            <span className="dashboard-health-stage-icon" aria-hidden="true"><Icon name={stage.icon} size={18} /></span>
            <span className="dashboard-health-stage-body">
              <span><b>{stage.label}</b><strong>{selectedProject ? `${stage.value}%` : '–'}</strong></span>
              <span className="dashboard-health-stage-bar" role="progressbar" aria-label={stage.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={stage.value}><span style={{ width: `${stage.value}%` }} /></span>
            </span>
          </li>)}
        </ul>

        <figure className="dashboard-health-preview" aria-hidden="true">
          <div className="dashboard-health-paper">
            {previewData
              ? <>
                <header><strong>{previewData.fullName || selectedProject.name}</strong>{previewData.headline && <span>{previewData.headline}</span>}</header>
                <div className="dashboard-health-paper-cols">
                  <div>
                    <em>Details</em>
                    {[previewData.email, previewData.phone, previewData.location].filter(Boolean).map(value => <span key={value}>{value}</span>)}
                    {previewSkills.length > 0 && <><em>Skills</em>{previewSkills.map(skill => <span key={skill}>{skill}</span>)}</>}
                  </div>
                  <div>
                    {previewData.summary && <><em>Profile</em><p>{previewData.summary}</p></>}
                    {previewData.experience?.length > 0 && <><em>Experience</em>{previewData.experience.slice(0, 3).map((item, index) => <span key={index}><b>{item?.role || 'Role'}</b>{item?.company && ` · ${item.company}`}</span>)}</>}
                    {previewData.education?.length > 0 && <><em>Education</em>{previewData.education.slice(0, 2).map((item, index) => <span key={index}>{item?.degree || item?.institution || 'Education'}</span>)}</>}
                  </div>
                </div>
              </>
              : <div className="dashboard-health-paper-skeleton"><i /><i /><i /><i /><i /><i /><i /></div>}
          </div>
          {selectedProject && <span className="dashboard-health-paper-badge">{health.completion}%</span>}
        </figure>
      </section>

      <div className="dashboard-projects-heading">
        <h2>Your projects</h2>
        <span>{savedProjects.length} saved</span>
      </div>
      <section className="dashboard-project-section" aria-label="Projects">
        <button className="dashboard-project-card is-create" type="button" onClick={() => navigate('/workspace')}>
          <span className="dashboard-project-icon"><Icon name="plus" size={28} /></span>
          <strong>Create new project</strong>
          <small>Start blank or import an existing resume</small>
        </button>
        <div className="dashboard-project-rail" ref={projectRailRef}>
          {savedProjects.length === 0 && <div className="dashboard-project-empty">
            <Icon name="folder" size={22} />
            <p>No saved projects yet. Resumes you save will show up here.</p>
          </div>}
          {savedProjects.map(project => {
            const projectHealth = getResumeHealth(project.resumeData)
            const isSelected = project.id === selectedProjectId
            return <article className={`dashboard-project-card is-saved${isSelected ? ' is-selected' : ''}`} key={project.id}>
              <button className="dashboard-project-select" type="button" aria-pressed={isSelected} onClick={() => selectProject(project.id)}>
                <span className="dashboard-project-paper" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                <span className="dashboard-project-meta">
                  <strong>{project.name}</strong>
                  <small>{project.updatedLabel}</small>
                </span>
                <span className={`dashboard-project-pill is-${projectHealth.tone}`}>{project.resumeData ? `${projectHealth.completion}%` : 'Empty'}</span>
              </button>
              {isSelected && <div className="dashboard-project-actions">
                {confirmDeleteId === project.id
                  ? <>
                    <span>Delete this project?</span>
                    <button className="is-danger" type="button" onClick={() => deleteProject(project.id)}>Delete</button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                  </>
                  : <>
                    <button className="is-primary" type="button" onClick={() => navigate('/workspace', { state: { savedProjectId: project.id } })}><Icon name="create" size={15} />Open</button>
                    <button className="is-danger" type="button" onClick={() => setConfirmDeleteId(project.id)}><Icon name="trash" size={15} />Delete</button>
                  </>}
              </div>}
            </article>
          })}
        </div>
        {canAdvanceProjects && <button className="dashboard-project-arrow" type="button" aria-label="View more projects" onClick={() => projectRailRef.current?.scrollBy({ left: projectRailRef.current.clientWidth * .82, behavior: 'smooth' })}>→</button>}
      </section>
    </div>
  </Shell>
}

function SettingsPage() {
  return <Shell>
    <header className="page-header settings-page-header"><div><h1>Settings</h1><p className="dashboard-subtitle">Manage your account and preferences.</p></div></header>
    <GeneralSettingsPanel />
  </Shell>
}

const helpTopics = [
  { id: 'start', icon: 'rocket', title: 'Getting started', description: 'Create your first resume in a few steps.' },
  { id: 'import', icon: 'import', title: 'Importing', description: 'Bring in a resume file or your LinkedIn profile.' },
  { id: 'editing', icon: 'layout', title: 'Templates & editing', description: 'Choose a design and edit any section.' },
  { id: 'nimbus', icon: 'spark', title: 'NIMBUS & job match', description: 'Write and tailor your resume with AI.' },
  { id: 'evidence', icon: 'evidence', title: 'GitHub evidence', description: 'Check your skills against your code.' },
  { id: 'export', icon: 'download', title: 'Exporting & saving', description: 'Download your resume and keep your work.' }
]

const helpArticles = [
  { topic: 'start', question: 'How do I create my first resume?', steps: ['Open Resume builder from the sidebar, or select Create new project on the dashboard.', 'Start from scratch, upload a resume, or import your LinkedIn profile.', 'Pick a template. You will see a live preview of each design.', 'Fill in or review your sections in the editor, then export it.'] },
  { topic: 'start', question: 'Why do I need to sign in with Google?', answer: 'Signing in keeps your workspace private to you and lets Resumetrics connect services such as GitHub to your account. Your Google password is never seen or stored by Resumetrics.' },
  { topic: 'import', question: 'Which files can I import?', answer: 'You can import PDF, DOCX and TXT files. PDFs exported from a word processor work best. Scanned images or photos of a resume may not contain readable text.' },
  { topic: 'import', question: 'What happens after I upload my resume?', answer: 'Resumetrics reads the text in your file and sorts it into sections such as experience, education and skills. You then get a review screen to check everything before choosing a template. Nothing is added that was not in your file.' },
  { topic: 'editing', question: 'How do I edit text on my resume?', answer: 'In the editor, click any text on the resume to edit it. The Format panel on the right changes fonts, size and colours — highlight words to make just those bold, italic or underlined.' },
  { topic: 'editing', question: 'Can I add a profile photo?', answer: 'Yes, on templates that support a photo. Upload a JPEG image from the editor, then adjust its position and size.' },
  { topic: 'nimbus', question: 'What can NIMBUS do?', answer: 'NIMBUS writes for you: ask it to deepen your summary, strengthen bullets, add something to a section or change a detail. It only uses facts from your resume or what you tell it. Fonts and colours are changed in the Format panel.' },
  { topic: 'nimbus', question: 'How do I tailor my resume to a job?', steps: ['Open Job tailoring from the sidebar, or press Open beside "Tailor to a job" in the editor.', 'Paste the job description or attach the posting.', 'Check your match score, then press Execute on the changes you want and watch them appear on your resume beside it.'] },
  { topic: 'import', question: 'How do I start from my LinkedIn profile?', steps: ['On a desktop browser, open LinkedIn and go to Me → View Profile.', 'Choose Resources (or More), then Save to PDF.', 'In Resumetrics, choose Import from LinkedIn, upload that PDF, then pick a template.'] },
  { topic: 'nimbus', question: 'How do I add a cover letter to my resume?', steps: ['Open Cover letters from the sidebar and pick your resume, or press Open beside "Write a cover letter" in the editor.', 'Paste the job post under Details, then ask NIMBUS to write your letter, or type it on the page.', 'Upload a photo of your signature under Format, then press Add to resume. The letter becomes page 1 and is included when you export.'] },
  { topic: 'start', question: 'Why does a pop-up ask me to select a resume?', answer: 'Job tailoring, Cover letters and Evidence check each work on one resume. When you click one in the sidebar, a pop-up asks you to start or import a resume first. Saved resumes are coming; until then the pop-up also offers the resume you are working on in this session.' },
  { topic: 'evidence', question: 'Why connect GitHub?', answer: 'In the editor, press Compare next to GitHub evidence. Your 25 most recently updated repositories are scanned and each resume skill is shown with its share of your code; under 5% counts as too little evidence.' },
  { topic: 'export', question: 'Which formats can I download?', answer: 'Use the Export menu in the editor to download your resume as a PDF, a Word document (DOCX) or plain text (TXT).' },
  { topic: 'export', question: 'Is my resume saved automatically?', answer: 'Your current draft is kept in this browser tab, even if you refresh. Closing the tab clears it, so export your resume before you leave.' },
  { topic: 'export', question: 'Where is my data stored, and how do I remove it?', answer: 'Your saved projects and preferences are kept in this browser. You can remove saved projects at any time from Settings → Privacy & Data.' }
]

function HelpPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeTopic, setActiveTopic] = useState(null)
  const articlesRef = useRef(null)
  const searchTerm = query.trim().toLocaleLowerCase()
  const visibleArticles = helpArticles.filter(article => {
    if (searchTerm) return [article.question, article.answer, ...(article.steps ?? [])].join(' ').toLocaleLowerCase().includes(searchTerm)
    return !activeTopic || article.topic === activeTopic
  })
  const activeTopicTitle = helpTopics.find(topic => topic.id === activeTopic)?.title

  const chooseTopic = id => {
    setQuery('')
    setActiveTopic(current => current === id ? null : id)
    window.requestAnimationFrame(() => articlesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return <Shell>
    <div className="help-page">
      <section className="help-hero">
        <span className="help-hero-eyebrow">Help & support</span>
        <h1>Hi! How can we help you?</h1>
        <form className="help-search" role="search" onSubmit={event => { event.preventDefault(); articlesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
          <label className="visually-hidden" htmlFor="help-search-input">Search help articles</label>
          <input id="help-search-input" type="search" value={query} placeholder="Ask a question, e.g. how do I export?" onChange={event => { setQuery(event.target.value); setActiveTopic(null) }} />
          <button type="submit" aria-label="Search"><Icon name="search" size={19} /></button>
        </form>
      </section>

      <section className="help-topics" aria-label="Help topics">
        {helpTopics.map(topic => <button key={topic.id} type="button" className={activeTopic === topic.id ? 'active' : ''} aria-pressed={activeTopic === topic.id} onClick={() => chooseTopic(topic.id)}>
          <span className="help-topic-icon" aria-hidden="true"><Icon name={topic.icon} size={24} /></span>
          <b>{topic.title}</b>
          <small>{topic.description}</small>
        </button>)}
      </section>

      <section className="help-articles" ref={articlesRef} aria-labelledby="help-articles-title">
        <div className="help-articles-heading">
          <h2 id="help-articles-title">{searchTerm ? `Results for “${query.trim()}”` : activeTopicTitle || 'Popular questions'}</h2>
          {(searchTerm || activeTopic) && <button type="button" onClick={() => { setQuery(''); setActiveTopic(null) }}>Show all</button>}
        </div>
        {visibleArticles.length
          ? <div className="help-accordion">{visibleArticles.map(article => <details key={article.question}>
            <summary><span>{article.question}</span><span className="help-accordion-icon" aria-hidden="true">›</span></summary>
            <div className="help-answer">
              {article.answer && <p>{article.answer}</p>}
              {article.steps && <ol>{article.steps.map(step => <li key={step}>{step}</li>)}</ol>}
            </div>
          </details>)}</div>
          : <p className="help-no-results">No articles match that search. Try a different word, such as “import” or “export”.</p>}
      </section>

      <section className="help-contact">
        <span className="help-topic-icon" aria-hidden="true"><Icon name="help" size={22} /></span>
        <div><b>Still need help?</b><p>Start with a fresh resume to try things out safely, or review your account and data options in Settings.</p></div>
        <div className="help-contact-actions">
          <button type="button" onClick={() => navigate('/workspace')}>Open resume builder</button>
          <button type="button" className="is-primary" onClick={() => navigate('/settings')}>Go to Settings</button>
        </div>
      </section>
    </div>
  </Shell>
}

const templateGroups = [
  ['single-column', 'Single-column', 'One clean column, read top to bottom. The safest choice for applicant tracking systems and long careers.'],
  ['two-column', 'Two-column', 'A main column with a sidebar for skills and extras. Fits more on a page and gives the design more character.']
]
const TEMPLATE_PAGE_WIDTH = 794

// Large preview of one template over a blurred page, with a brief description and a button to start.
function TemplatePreviewDialog({ template, previewData = templatePreviewResumeData, onClose, onUse }) {
  const paperRef = useRef(null)
  const [scale, setScale] = useState(.6)
  const Preview = template.component

  useEffect(() => {
    const paper = paperRef.current
    if (!paper) return undefined
    const update = () => setScale(paper.clientWidth / TEMPLATE_PAGE_WIDTH || .6)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(paper)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow }
  }, [onClose])

  return <div className="template-preview-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="template-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="template-preview-title">
      <div className="template-preview-paper" ref={paperRef} style={{ '--preview-scale': scale }} aria-hidden="true">
        <span className="template-gallery-sheet template-preview-sheet">
          <Preview resumeData={previewData} presentation={{ ...resolveResumePresentation(template, {}), photo: template.supportsPhoto ? template.defaultTheme.photo : undefined }} preview />
        </span>
      </div>
      <div className="template-preview-info">
        <button className="template-preview-close" type="button" onClick={onClose} aria-label="Close preview">×</button>
        <span className="template-preview-layout">{template.layout === 'two-column' ? 'Two-column' : 'Single-column'}</span>
        <h2 id="template-preview-title">{template.name}</h2>
        <p>{template.summary}</p>
        <span className="template-gallery-tags">{(template.tags ?? []).filter(tag => !/^(single|two)-column$/i.test(tag)).map(tag => <i key={tag}>{tag}</i>)}</span>
        <button className="template-preview-use" type="button" onClick={onUse} autoFocus>Use this template</button>
        <small className="template-gallery-source">{template.collection === 'reactive-resume' ? 'Adapted from Reactive Resume' : template.collection === 'latex' ? 'LaTeX classic' : 'Resumetrics classic'}</small>
      </div>
    </div>
  </div>
}

// The one template picker. The sidebar Templates page and both workspace flows (scratch and import) use it.
function TemplateGallery({ title = 'Templates', subtitle, previewData = templatePreviewResumeData, onUse, onBack, backLabel = 'Back' }) {
  const galleryRef = useRef(null)
  const [previewScale, setPreviewScale] = useState(.3)

  // Every preview is a real A4 page (794px wide) zoomed down to the card width.
  useEffect(() => {
    const paper = galleryRef.current?.querySelector('.template-gallery-paper')
    if (!paper) return undefined
    const update = () => setPreviewScale(paper.clientWidth / TEMPLATE_PAGE_WIDTH || .3)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(paper)
    return () => observer.disconnect()
  }, [])

  const [previewId, setPreviewId] = useState(null)
  const previewTemplate = resumeTemplates.find(template => template.id === previewId) ?? null

  return <>
    <header className="page-header templates-page-header"><div>{onBack && <button className="editor-back-button" type="button" onClick={onBack}><span aria-hidden="true">←</span> {backLabel}</button>}<h1>{title}</h1><p className="dashboard-subtitle">{subtitle ?? 'Pick a design to start building. You can change colours and fonts in the editor, and switch templates at any time.'}</p></div></header>
    <div className="templates-gallery" ref={galleryRef} style={{ '--gallery-scale': previewScale }}>
      {templateGroups.map(([layout, title, description]) => {
        const templates = resumeTemplates.filter(template => template.layout === layout)
        return <section className="templates-group" key={layout} aria-labelledby={`templates-${layout}`}>
          <div className="templates-group-heading">
            <h2 id={`templates-${layout}`}>{title} <span>{templates.length}</span></h2>
            <p>{description}</p>
          </div>
          <ul className="templates-grid">{templates.map(template => {
            const Preview = template.component
            return <li key={template.id}>
              <button className="template-gallery-card" type="button" onClick={() => setPreviewId(template.id)} aria-label={`Preview the ${template.name} template`}>
                <span className="template-gallery-paper" aria-hidden="true">
                  <span className="template-gallery-sheet">
                    <Preview resumeData={previewData} presentation={{ ...resolveResumePresentation(template, {}), photo: template.supportsPhoto ? template.defaultTheme.photo : undefined }} preview />
                  </span>
                </span>
                <span className="template-gallery-info">
                  <b>{template.name}</b>
                  <small>{template.description}</small>
                  <span className="template-gallery-tags">{(template.tags ?? []).filter(tag => !/^(single|two)-column$/i.test(tag)).slice(0, 3).map(tag => <i key={tag}>{tag}</i>)}</span>
                  <span className="template-gallery-source">{template.collection === 'reactive-resume' ? 'Reactive Resume' : template.collection === 'latex' ? 'LaTeX classic' : 'Resumetrics classic'}</span>
                </span>
              </button>
            </li>
          })}</ul>
        </section>
      })}
    </div>
    {previewTemplate && <TemplatePreviewDialog template={previewTemplate} previewData={previewData} onClose={() => setPreviewId(null)} onUse={() => onUse(previewTemplate.id)} />}
  </>
}

function TemplatesPage() {
  const navigate = useNavigate()
  return <Shell>
    <TemplateGallery onUse={templateId => navigate('/workspace', { state: { dashboardTemplateId: templateId } })} />
  </Shell>
}

function SidebarLink({ label, path, icon, gate, onGate }) {
  const location = useLocation()
  if (gate) {
    const active = location.pathname === gateTools[gate].route
    return <button type="button" className={`sidebar-link${active ? ' active' : ''}`} aria-haspopup="dialog" onClick={() => onGate(gate)}><Icon name={icon} size={18} /><span>{label}</span></button>
  }
  if (path) return <NavLink className="sidebar-link" to={path}><Icon name={icon} size={18} /><span>{label}</span></NavLink>
  return <span className="sidebar-link is-soon" aria-disabled="true" title={`${label} is coming soon`}><Icon name={icon} size={18} /><span>{label}</span><small>Soon</small></span>
}

function Shell({ children, immersive = false, dashboard = false, studio = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const recentProjects = useMemo(() => readSavedProjects().filter(project => project.resumeData).slice(0, 3), [location.key])
  // "Select a resume first" pop-up for the three career tools. It opens over any page; a page that sends someone
  // here without a resume (a direct visit to a tool) passes location.state.gate.
  const [gateTool, setGateTool] = useState(null)
  useEffect(() => {
    const requested = location.state?.gate
    if (!requested) return
    if (gateTools[requested]) setGateTool(requested)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state]) // eslint-disable-line react-hooks/exhaustive-deps
  const closeGate = useCallback(() => setGateTool(null), [])
  const sessionResumes = () => {
    const snapshot = readWorkspaceSnapshot()
    const template = getResumeTemplate(snapshot?.selectedTemplateId)
    return snapshot?.resumeData && template ? [{ id: 'session', name: snapshot.resumeName || 'Untitled resume', templateName: template.name, note: 'Open in this session' }] : []
  }
  const openFromGate = path => { setGateTool(null); navigate(path) }

  return <div className={`app-shell${immersive ? ' editor-shell' : ''}${dashboard ? ' dashboard-shell' : ''}${studio ? ' studio-shell' : ''}`}>
    {!immersive && <aside className="sidebar">
      <NavLink to="/dashboard" state={{ refresh: true }} className="brand" aria-label="Resumetrics dashboard">
        <img src={logo} alt="Resumetrics" />
      </NavLink>
      <div className="sidebar-scroll">
        {navSections.map(section => <div className="sidebar-section" key={section.label}>
          <span className="sidebar-label">{section.label}</span>
          <nav aria-label={section.label}>{section.items.map(([label, path, icon, gate]) => <SidebarLink key={label} label={label} path={path} icon={icon} gate={gate} onGate={setGateTool} />)}</nav>
        </div>)}
        {recentProjects.length > 0 && <div className="sidebar-section sidebar-recent">
          <span className="sidebar-label">Recent resumes</span>
          <ul>{recentProjects.map((project, index) => <li key={project.id}>
            <button type="button" onClick={() => navigate('/dashboard')}>
              <span className="sidebar-recent-mark" style={{ '--recent-color': recentProjectColors[index % recentProjectColors.length] }} aria-hidden="true">{project.name.trim().charAt(0).toUpperCase() || 'R'}</span>
              <span>{project.name}</span>
            </button>
          </li>)}</ul>
        </div>}
      </div>
      <nav className="sidebar-utility" aria-label="Account">{navUtilityItems.map(([label, path, icon]) => <SidebarLink key={label} label={label} path={path} icon={icon} />)}</nav>
      <div className="sidebar-footer">
        <UserMenu />
      </div>
    </aside>}
    <main>{children}</main>
    {gateTool && <ResumeGateDialog tool={gateTool} resumes={sessionResumes()} onClose={closeGate}
      onPick={() => openFromGate(gateTools[gateTool].route)} onStart={() => openFromGate('/workspace/templates')} onImport={() => openFromGate('/workspace')} />}
  </div>
}

function MainPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const uploadInputRef = useRef(null)
  const linkedinUploadInputRef = useRef(null)
  const profilePhotoInputRef = useRef(null)
  const editorRef = useRef(null)
  const resumeDataRef = useRef(null)
  const exportMenuRef = useRef(null)
  const assistantInputRef = useRef(null)
  const editorPresentationRef = useRef(null)
  const [resumeId, setResumeId] = useState(null)
  const [isHydrating, setIsHydrating] = useState(false)
  const [description, setDescription] = useState(() => restored('description', ''))
  const [analysis, setAnalysis] = useState(() => restored('analysis', null))
  const [githubConnection, setGithubConnection] = useState({ loading: true, connected: false })
  const [githubConnecting, setGithubConnecting] = useState(false)
  const [githubConnectionError, setGithubConnectionError] = useState('')
  const [githubConnectionNotice, setGithubConnectionNotice] = useState('')
  const [githubCompareError, setGithubCompareError] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState(() => restored('workspaceMode', 'initial'))
  const [resumeData, setResumeData] = useState(() => restored('resumeData', null))
  const [pendingUploadFile, setPendingUploadFile] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => restored('selectedTemplateId', null))
  const [resumePresentation, setResumePresentation] = useState(() => restored('resumePresentation', createResumePresentation))
  const [profilePhotoError, setProfilePhotoError] = useState('')
  const [selectedResumeElement, setSelectedResumeElement] = useState(null)
  const [uploadedFileName, setUploadedFileName] = useState(() => restored('uploadedFileName', ''))
  const [parseMetadata, setParseMetadata] = useState(() => restored('parseMetadata', null))
  const [workspaceError, setWorkspaceError] = useState('')
  const [resumeName, setResumeName] = useState(() => restored('resumeName', 'Untitled resume'))
  const [editingName, setEditingName] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [fontSize, setFontSize] = useState(14)
  const [fontColor, setFontColor] = useState(() => restored('fontColor', '#172033'))
  const [fontFamily, setFontFamily] = useState(() => restored('fontFamily', null))
  const [globalFontSize, setGlobalFontSize] = useState(() => restored('globalFontSize', null))
  const [useGlobalTextColor, setUseGlobalTextColor] = useState(() => restored('useGlobalTextColor', false))
  const [footerText, setFooterText] = useState(() => restored('footerText', ''))
  const [assistantInput, setAssistantInput] = useState('')
  const [assistantMessages, setAssistantMessages] = useState(() => restored('assistantMessages', initialNimbusMessages).map((turn, index) => turn.id ? turn : { ...turn, id: `m${index}`, status: 'done' }))
  const [nimbusPreviewing, setNimbusPreviewing] = useState(false)
  const [aiTab, setAiTab] = useState(() => restored('aiTab', 'nimbus'))
  const [canvasZoom, setCanvasZoom] = useState(1)
  const [formActiveSection, setFormActiveSection] = useState(null)
  const [confirmedSections, setConfirmedSections] = useState(() => restored('confirmedSections', {}))
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [importSource, setImportSource] = useState('resume')
  const [githubScan, setGithubScan] = useState(() => restored('githubScan', null))
  const [coverLetter, setCoverLetter] = useState(() => restored('coverLetter', null))
  const [coverLetterIncluded, setCoverLetterIncluded] = useState(() => restored('coverLetterIncluded', false))
  const [letterMessages, setLetterMessages] = useState(() => restored('letterMessages', initialLetterMessages))
  const selectedTemplate = getResumeTemplate(selectedTemplateId)
  const resumeElementRegistry = useMemo(() => buildResumeElementRegistry(resumeData ?? {}, resumePresentation), [resumeData, resumePresentation])
  const selectedElementDefinition = selectedResumeElement ? resumeElementRegistry.get(selectedResumeElement.id) : null
  const TemplateComponent = selectedTemplate?.component
  // Routing: /workspace (start or import) -> /workspace/templates -> /workspace/build (scratch form only) -> /workspace/editor (all edit tools).
  const workspaceRoute = location.pathname.replace(/\/+$/, '').split('/')[2] || 'start'
  const isTemplatesRoute = workspaceRoute === 'templates'
  const isBuilderRoute = workspaceRoute === 'build'
  const isEditorRoute = workspaceRoute === 'editor'
  const isEvidenceRoute = workspaceRoute === 'evidence'
  const isTailorRoute = workspaceRoute === 'tailor'
  const isLetterRoute = workspaceRoute === 'letter'
  const isSelectRoute = workspaceRoute === 'select'
  const isStartRoute = !isTemplatesRoute && !isBuilderRoute && !isEditorRoute && !isEvidenceRoute && !isTailorRoute && !isLetterRoute
  const hasDraft = Boolean(TemplateComponent) && Boolean(resumeData)
  const isScratchResume = !uploadedFileName
  const isEditorReady = workspaceMode === 'editor-ready' && hasDraft
  const isEditorPage = isEditorRoute && isEditorReady
  // Job tailoring (PLAN-029): job match on one half, the live resume (read-only) on the other.
  const isTailorPage = isTailorRoute && isEditorReady
  // Cover letter studio (PLAN-033): the letter on the resume's template, edited like the resume.
  const isLetterPage = isLetterRoute && isEditorReady
  // GitHub evidence (PLAN-032) shows the live resume read-only in its preview pane.
  const isEvidencePage = isEvidenceRoute && hasDraft
  const isBuilderPage = isBuilderRoute && hasDraft && isScratchResume
  const resumeStyle = {
    fontFamily: fontFamily || selectedTemplate?.defaultTheme?.fontFamily || resumeFonts[0].family,
    ...(globalFontSize ? { fontSize: `${globalFontSize}px` } : {}),
    ...(useGlobalTextColor ? { '--resume-text-color': fontColor } : {})
  }
  const resumeEvidenceSkills = getResumeEvidenceSkills(resumeData)
  const hasImportedResumeSkills = Boolean(uploadedFileName) && resumeEvidenceSkills.length > 0
  const hasWorkspaceResumeSkills = workspaceMode === 'editor-ready' && resumeEvidenceSkills.length > 0

  // Firestore autosave: workspace state memo
  // Firestore autosave: workspace state memo (includes resumeId for saves)
  const workspaceState = useMemo(() => {
    if (!resumeData) return null
    return {
      resumeData,
      resumeId,
      selectedTemplateId,
      resumeName,
      workspaceMode
    }
  }, [resumeData, resumeId, selectedTemplateId, resumeName, workspaceMode])

  // Firestore autosave: callback for when resume ID is generated
  const onResumeIdGenerated = useCallback((id) => {
    // Handle null (404 case - document was deleted)
    if (id === null) {
      console.log('[MainPage] Resume was deleted (404), clearing resumeId')
      setResumeId(null)
      return
    }
    
    setResumeId(prev => {
      // Only set if still null (prevent overwriting after Open or workspace switch)
      if (prev === null) {
        console.log('[MainPage] Resume ID generated:', id)
        return id
      }
      console.log('[MainPage] Ignoring generated ID (already set to', prev, ')')
      return prev
    })
  }, [])

  // Firestore autosave: wire the hook
  const { saveNow, isSaving, cancelPendingSave } = useFirestoreAutosave({
    workspaceState,
    resumeId,
    isAuthenticated: Boolean(currentUser),
    isEditorReady,
    isHydrating,
    onResumeIdGenerated
  })

  // A template picked on the sidebar Templates page starts a new scratch resume at the details form.
  useEffect(() => {
    const templateId = location.state?.dashboardTemplateId
    if (!templateId) return
    if (!resumeTemplates.some(template => template.id === templateId)) {
      navigate('/workspace/templates', { replace: true })
      return
    }
    setResumeData(ensureResumeElementIds(createBlankResumeData()))
    setUploadedFileName('')
    setParseMetadata(null)
    setSelectedTemplateId(templateId)
    setResumePresentation(createResumePresentation(templateId))
    setFontFamily(null)
    setWorkspaceError('')
    setGithubCompareError('')
    setResumeName('Untitled resume')
    setWorkspaceMode('builder')
    navigate('/workspace/build', { replace: true })
  }, [location.state, navigate])

  // Load a saved project from the dashboard Open button
  useEffect(() => {
    const projectId = location.state?.savedProjectId
    if (!projectId) return

    let cancelled = false

    async function loadSavedProject() {
      try {
        console.log('[MainPage] Loading saved project:', projectId)
        const response = await getResume(projectId)
        
        if (cancelled) return
        
        if (!response.resume) {
          throw new Error('Resume not found')
        }

        const saved = response.resume
        console.log('[MainPage] Loaded resume:', saved)

        // Set isHydrating guard to prevent autosave during hydration
        setIsHydrating(true)

        // Clear stale sessionStorage to prevent mixing resumes
        clearWorkspaceSnapshot()

        // Hydrate editor state from saved draftContent AND set resumeId atomically
        setResumeId(projectId)
        setResumeData(ensureResumeElementIds(saved.draftContent || {}))
        setResumeName(saved.title || 'Untitled Resume')
        setSelectedTemplateId(saved.templateId || null)
        setResumePresentation(createResumePresentation(saved.templateId))
        
        console.log('[MainPage] Hydrating with resumeId =', projectId)

        // draftContent only contains resumeData; other workspace state is not persisted

        // Enter editor mode and navigate
        setWorkspaceMode('editor-ready')
        navigate('/workspace/editor', { replace: true })
        
        // Clear isHydrating guard after state commits (next tick)
        setTimeout(() => setIsHydrating(false), 0)

      } catch (error) {
        console.error('[MainPage] Failed to load saved project:', error)
        setWorkspaceError(error.message || 'Could not load this resume. Please try again.')
        navigate('/dashboard', { replace: true })
      }
    }

    loadSavedProject()

    return () => { cancelled = true }
  }, [location.state?.savedProjectId, navigate])

  // Keep the URL and the draft in step: each step needs the work from the step before it.
  useEffect(() => {
    if (location.state?.dashboardTemplateId) return
    if (isBuilderRoute && !isBuilderPage) {
      if (hasDraft && !isScratchResume) navigate('/workspace/editor', { replace: true })
      else navigate(resumeData && isScratchResume ? '/workspace/templates' : '/workspace', { replace: true })
      return
    }
    if (isBuilderPage && workspaceMode !== 'builder') setWorkspaceMode('builder')
    // Career tools without a resume open the "Select a resume first" pop-up over the start page.
    if (isEvidenceRoute && !hasDraft) { navigate('/workspace', { replace: true, state: { gate: 'evidence' } }); return }
    if (isTailorRoute && !hasDraft) { navigate('/workspace', { replace: true, state: { gate: 'tailor' } }); return }
    if (isLetterRoute && !hasDraft) { navigate('/workspace', { replace: true, state: { gate: 'letter' } }); return }
    // Old links to the previous select page open the pop-up instead.
    if (isSelectRoute) { navigate('/workspace', { replace: true, state: { gate: location.pathname.split('/').filter(Boolean)[2] } }); return }
    if (isEditorRoute && !hasDraft) navigate('/workspace', { replace: true })
    else if ((isEditorRoute || isTailorRoute || isLetterRoute) && workspaceMode !== 'editor-ready') setWorkspaceMode('editor-ready')
  }, [hasDraft, isBuilderPage, isBuilderRoute, isEditorRoute, isEvidenceRoute, isTailorRoute, isLetterRoute, isSelectRoute, isScratchResume, location.state, navigate, resumeData, workspaceMode])

  useEffect(() => {
    resumeDataRef.current = resumeData
  }, [resumeData])

  // Autosave the draft so leaving the workspace or refreshing never loses it.
  const photoDropNoticeRef = useRef(false)
  useEffect(() => {
    if (!resumeData && workspaceMode === 'initial') return undefined
    const timer = window.setTimeout(() => {
      const { photoDropped } = writeWorkspaceSnapshot({ workspaceMode, resumeData, selectedTemplateId, resumePresentation, uploadedFileName, parseMetadata, resumeName, fontColor, fontFamily, globalFontSize, useGlobalTextColor, footerText, assistantMessages: assistantMessages.slice(-40), aiTab, confirmedSections, description, analysis, coverLetter, coverLetterIncluded, letterMessages: letterMessages.slice(-40), githubScan: githubScan?.status === 'scanning' ? { ...githubScan, status: 'cancelled' } : githubScan })
      if (photoDropped && !photoDropNoticeRef.current) {
        photoDropNoticeRef.current = true
        setProfilePhotoError('Your photo is too large to keep after a refresh; it stays for this visit.')
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [aiTab, analysis, assistantMessages, confirmedSections, coverLetter, coverLetterIncluded, letterMessages, description, githubScan, fontColor, fontFamily, footerText, globalFontSize, parseMetadata, resumeData, resumeName, resumePresentation, selectedTemplateId, uploadedFileName, useGlobalTextColor, workspaceMode])

  // Undo/redo covers content and formatting from every source (format panel, inline edits, NIMBUS).
  const restoreHistorySnapshot = useCallback(snapshot => {
    resumeDataRef.current = snapshot.resumeData
    setResumeData(snapshot.resumeData)
    setResumePresentation(snapshot.resumePresentation)
    setFontFamily(snapshot.fontFamily)
    setGlobalFontSize(snapshot.globalFontSize)
    setFontColor(snapshot.fontColor)
    setUseGlobalTextColor(snapshot.useGlobalTextColor)
    setFooterText(snapshot.footerText)
  }, [])
  const history = useEditorHistory({ resumeData, resumePresentation, fontFamily, globalFontSize, fontColor, useGlobalTextColor, footerText }, restoreHistorySnapshot, isEditorPage && !nimbusPreviewing)

  useEffect(() => {
    if (!isEditorPage) return undefined
    const onKey = event => {
      const target = event.target
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable
      const onPage = Boolean(target?.closest?.('.resume-page-document'))
      const formatKey = { b: 'b', i: 'i', u: 'u' }[event.key.toLowerCase()]
      if ((event.ctrlKey || event.metaKey) && formatKey && !event.shiftKey && !event.altKey && (onPage || !typing) && selectedResumeElementRef.current) {
        event.preventDefault()
        toggleFormattingMarkRef.current(formatKey)
        return
      }
      if (event.key === 'Escape' && !typing) { setSelectedResumeElement(null); return }
      if (typing || !(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); history.undo() }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); history.redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history, isEditorPage])

  useEffect(() => {
    if (!isEditorRoute) setSelectedResumeElement(null)
  }, [isEditorRoute])

  // Selection updates arrive on every caret move; keep the same object when nothing changed.
  const selectedResumeElementRef = useRef(null)
  selectedResumeElementRef.current = selectedResumeElement
  const selectResumeElement = useCallback(next => setSelectedResumeElement(current => {
    if (!next) return null
    if (current && current.id === next.id && current.path === next.path && current.range?.start === next.range?.start && current.range?.end === next.range?.end) return current
    return next
  }), [])

  // Bold/italic/underline/strike: highlighted words get inline marks; otherwise the whole element is styled.
  const toggleFormattingMark = mark => {
    const selection = selectedResumeElementRef.current
    if (!selection) return
    const value = selection.path ? getPathValue({ content: resumeDataRef.current ?? resumeData, presentation: resumePresentation }, selection.path) : null
    if (selection.range && typeof value === 'string' && value) {
      handleManualResumeEdit({ path: selection.path, value: toggleMarkInRange(value, selection.range.start, selection.range.end, mark) })
      setSelectedResumeElement({ ...selection, range: null })
      return
    }
    const node = document.querySelector(`.resume-page-document [data-resume-element-id="${CSS.escape(selection.id)}"]`)
    const style = node ? window.getComputedStyle(node) : null
    const override = resumePresentation.elementOverrides?.[selection.id] ?? {}
    const decorations = String(override.textDecoration ?? style?.textDecorationLine ?? '').split(' ').filter(word => word === 'underline' || word === 'line-through')
    const toggleDecoration = word => {
      const next = decorations.includes(word) ? decorations.filter(item => item !== word) : [...decorations, word]
      return { textDecoration: next.length ? next.join(' ') : 'none' }
    }
    const weight = Number(override.fontWeight ?? style?.fontWeight) || 400
    const fontStyle = override.fontStyle ?? style?.fontStyle
    const changes = mark === 'b' ? { fontWeight: weight >= 600 ? 400 : 700 }
      : mark === 'i' ? { fontStyle: fontStyle === 'italic' ? 'normal' : 'italic' }
        : mark === 'u' ? toggleDecoration('underline') : toggleDecoration('line-through')
    applyEditorOperations([{ type: 'set_style', target: selection.id, changes }])
  }
  const toggleFormattingMarkRef = useRef(toggleFormattingMark)
  toggleFormattingMarkRef.current = toggleFormattingMark

  // Every manual and AI style change goes through the constrained editing engine.
  const applyEditorOperations = operations => setResumePresentation(current => {
    try {
      return applyResumeEditingOperations({ content: {}, presentation: current }, operations).presentation
    } catch {
      return current
    }
  })

  const resetAllFormatting = () => {
    applyEditorOperations([{ type: 'clear_style', target: '*' }])
    setFontFamily(null)
    setGlobalFontSize(null)
    setUseGlobalTextColor(false)
    setResumePresentation(current => ({ ...current, fontFamily: null, accentColor: null }))
  }

  useEffect(() => {
    if (!exportMenuOpen && !deleteConfirmOpen) return undefined
    const closeOnOutsideClick = event => {
      if (exportMenuOpen && !exportMenuRef.current?.contains(event.target)) setExportMenuOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return
      setExportMenuOpen(false)
      setDeleteConfirmOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [deleteConfirmOpen, exportMenuOpen])


  useEffect(() => {
    let isCurrent = true
    const loadGitHubStatus = async () => {
      if (!currentUser) {
        if (isCurrent) setGithubConnection({ loading: false, connected: false })
        return
      }
      try {
        const idToken = await currentUser.getIdToken()
        const response = await fetch('/api/github/status', { headers: { Authorization: `Bearer ${idToken}` } })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Could not check GitHub connection status.')
        if (isCurrent) {
          setGithubConnection({ loading: false, ...(payload.connection ?? { connected: false }) })
          setGithubConnectionError('')
        }
      } catch (error) {
        if (isCurrent) {
          setGithubConnection({ loading: false, connected: false })
          setGithubConnectionError(error instanceof TypeError ? 'GitHub service is not running. Start the app with npm run dev:all.' : error.message || 'Could not check GitHub connection status.')
        }
      }
    }
    loadGitHubStatus()
    const refreshWhenFocused = () => loadGitHubStatus()
    const refreshInterval = window.setInterval(loadGitHubStatus, 60_000)
    window.addEventListener('focus', refreshWhenFocused)
    return () => {
      isCurrent = false
      window.clearInterval(refreshInterval)
      window.removeEventListener('focus', refreshWhenFocused)
    }
  }, [currentUser])

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search)
    const result = parameters.get('github')
    const installationId = parameters.get('installation_id')
    const authorizationCode = parameters.get('code')
    const authorizationState = parameters.get('state')
    if (!result && !installationId && !authorizationCode) return

    const restorePendingResume = () => {
      try {
        const snapshot = JSON.parse(sessionStorage.getItem(githubResumeSnapshotKey) || 'null')
        if (snapshot?.resumeData && Date.now() - snapshot.savedAt <= githubResumeSnapshotMaxAge) {
          setResumeData(ensureResumeElementIds(snapshot.resumeData))
          setResumeName(snapshot.resumeData.fullName || 'Untitled resume')
          setSelectedTemplateId(snapshot.selectedTemplateId || null)
          setResumePresentation(snapshot.resumePresentation || createResumePresentation(snapshot.selectedTemplateId || null))
          setFontFamily(snapshot.resumePresentation?.fontFamily || null)
          setUploadedFileName(snapshot.uploadedFileName || '')
          setParseMetadata(snapshot.parseMetadata || null)
          setWorkspaceMode(snapshot.workspaceMode || 'extraction-review')
          if (snapshot.workspaceMode === 'editor-ready' && snapshot.selectedTemplateId) navigate('/workspace/editor', { replace: true })
        }
      } catch {
        // The connection itself should still succeed if browser storage is unavailable.
      } finally {
        sessionStorage.removeItem(githubResumeSnapshotKey)
      }
    }

    const finishSetupInstallation = async () => {
      if (!currentUser || !installationId) return
      setGithubConnecting(true)
      setGithubConnectionError('')
      setGithubConnectionNotice('Finishing GitHub connection…')
      try {
        const idToken = await currentUser.getIdToken()
        const response = await fetch('/api/github/complete-installation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ installationId })
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'GitHub could not be connected.')
        setGithubConnection({ loading: false, ...(payload.connection ?? { connected: true }) })
        setGithubConnectionNotice('GitHub connected successfully.')
        restorePendingResume()
      } catch (error) {
        setGithubConnectionError(error instanceof TypeError ? 'GitHub service is not running. Start the app with npm run dev:all.' : error.message || 'GitHub could not be connected.')
      } finally {
        setGithubConnecting(false)
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
      }
    }

    const finishGitHubAuthorization = async () => {
      if (!currentUser || !authorizationCode || !authorizationState) return
      setGithubConnecting(true)
      setGithubConnectionError('')
      setGithubConnectionNotice('Finishing GitHub connection…')
      try {
        const idToken = await currentUser.getIdToken()
        const response = await fetch('/api/github/complete-authorization', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ code: authorizationCode, state: authorizationState, ...(installationId ? { installationId } : {}) })
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'GitHub could not be connected.')
        setGithubConnection({ loading: false, ...(payload.connection ?? { connected: true }) })
        setGithubConnectionNotice('GitHub connected successfully.')
        restorePendingResume()
      } catch (error) {
        setGithubConnectionError(error instanceof TypeError ? 'GitHub service is not running. Start the app with npm run dev:all.' : error.message || 'GitHub could not be connected.')
      } finally {
        setGithubConnecting(false)
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
      }
    }

    if (authorizationCode) {
      if (authorizationState) finishGitHubAuthorization()
      else {
        setGithubConnectionError('GitHub returned an authorization response without a valid connection state. Start the connection again from Resumetrics.')
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
      }
      return
    }

    if (installationId && (!result || result === 'installation-pending')) {
      finishSetupInstallation()
      return
    }

    const messages = {
      connected: ['notice', 'GitHub connected successfully.'],
      cancelled: ['error', 'GitHub connection was cancelled before installation finished.'],
      'invalid-state': ['error', 'This GitHub connection link expired. Please try connecting again.'],
      'configuration-error': ['error', 'GitHub connection needs server configuration before it can finish.'],
      'storage-unavailable': ['error', 'GitHub could not be saved because Cloud Firestore is not enabled yet. Create a Cloud Firestore database, then reconnect GitHub.'],
      'connection-failed': ['error', 'GitHub could not be connected. Check the app installation and try again.']
    }
    const [type, message] = messages[result] ?? ['error', 'GitHub connection could not be completed. Please try again.']
    if (type === 'notice') {
      setGithubConnectionNotice(message)
      restorePendingResume()
    } else setGithubConnectionError(message)
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
  }, [currentUser])

  const resetWorkspace = () => {
    setWorkspaceMode('initial')
    setResumeData(null)
    setPendingUploadFile(null)
    setSelectedTemplateId(null)
    setResumePresentation(createResumePresentation())
    setProfilePhotoError('')
    setUploadedFileName('')
    setParseMetadata(null)
    setWorkspaceError('')
    setDescription('')
    setResumeName('Untitled resume')
    setEditingName(false)
    setAnalysis(null)
    setGithubCompareError('')
    setGlobalFontSize(null)
    setUseGlobalTextColor(false)
    setFooterText('')
    setAssistantInput('')
    setAssistantMessages(initialNimbusMessages)
    setCoverLetter(null)
    setCoverLetterIncluded(false)
    setLetterMessages(initialLetterMessages)
    setSelectedResumeElement(null)
    setFormActiveSection(null)
    setConfirmedSections({})
    setDiscardConfirmOpen(false)
    setCanvasZoom(1)
    setFontFamily(null)
    history.reset()
    clearWorkspaceSnapshot()
    nimbusResetRef.current?.()
    editorRef.current = null
    if (location.pathname !== '/workspace') navigate('/workspace', { replace: true })
  }

  const exportDraft = async (format = 'TXT') => {
    if (!isEditorReady || exportLoading) return
    const resumeContent = `${resumeName}\n${resumeData?.headline || ''}\n${selectedTemplate?.name || 'Resumetrics draft'}\n\n${editorRef.current?.innerText || resumeData?.summary || 'Start editing your resume in Resumetrics.'}`
    // A cover letter added to the resume is the first page of every export.
    const letterText = letterOnResume ? letterToText(coverLetter, resumeData) : ''
    const content = letterText ? `${letterText}\n\n----------\n\n${resumeContent}` : resumeContent
    const baseName = `resumetrics-${safeFileName(resumeName)}`
    setExportLoading(true)
    try {
      if (format === 'TXT') {
        downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), `${baseName}.txt`)
      } else if (format === 'PDF') {
        await printResume()
      } else if (format === 'DOCX') {
        const { Document, Packer, Paragraph, TextRun } = await import('docx')
        const toParagraphs = (text, breakBefore = false) => text.split(/\r?\n/).map((line, index) => new Paragraph({ pageBreakBefore: breakBefore && index === 0, children: [new TextRun(line || ' ')] }))
        const documentDocx = new Document({ sections: [{ children: [...(letterText ? toParagraphs(letterText) : []), ...toParagraphs(resumeContent, Boolean(letterText))] }] })
        downloadBlob(await Packer.toBlob(documentDocx), `${baseName}.docx`)
      }
    } catch (error) {
      showAssistantError(`Export failed. Please try again${error?.message ? `: ${error.message}` : '.'}`)
    } finally {
      setExportLoading(false)
    }
  }

  // Renders an A4-sized copy of the resume for the print dialog, so the PDF matches the design exactly.
  const printResume = () => new Promise(resolve => {
    const previousTitle = document.title
    const finish = () => {
      window.removeEventListener('afterprint', finish)
      document.title = previousTitle
      setPrinting(false)
      resolve()
    }
    setPrinting(true)
    // Wait for the print copy to paginate and its fonts to load before opening the dialog.
    const open = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      document.title = resumeName || 'Resume'
      window.addEventListener('afterprint', finish)
      window.print()
    }))
    loadFontsForPresentation(editorPresentationRef.current).then(() => document.fonts?.ready).then(() => window.setTimeout(open, 120))
  })

  const deleteDraft = () => {
    if (workspaceMode === 'initial') return
    setExportMenuOpen(false)
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteDraft = () => {
    setDeleteConfirmOpen(false)
    resetWorkspace()
  }

  const chooseExportFormat = async format => {
    setExportMenuOpen(false)
    await exportDraft(format)
  }

  const handleUpload = event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    selectUploadFile(file)
  }

  const selectUploadFile = file => {
    if (!file) return

    setWorkspaceError('')
    setGithubCompareError('')
    setPendingUploadFile(file)
    setUploadedFileName('')
    setResumeData(null)
    setParseMetadata(null)
    setWorkspaceMode('file-selected')
  }

  // Uploaded resumes go to the review step; LinkedIn exports go straight to the template gallery.
  const readDocument = async (fileOverride = null, source = 'resume') => {
    const file = fileOverride instanceof File ? fileOverride : pendingUploadFile
    if (!file) return
    setImportSource(source)
    if (source === 'linkedin') {
      setPendingUploadFile(file)
      setResumeData(null)
      setSelectedTemplateId(null)
    }

    setWorkspaceError('')
    setWorkspaceMode('extracting')
    try {
      const extractedDocument = await extractResumeDocument(file)
      if (!extractedDocument.rawText) throw new Error('Could not read this file. Try a text-based PDF, DOCX, or TXT file.')
      const response = await fetch('/api/resume/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ document: { pages: extractedDocument.pages, links: extractedDocument.links ?? [], metadata: { ...extractedDocument.metadata, ...(source === 'linkedin' ? { sourceType: 'linkedin' } : {}) } } })
      })
      const isJson = response.headers.get('content-type')?.includes('application/json')
      if (!isJson) {
        throw new Error('The AI server is not running. Start the app with npm run dev:all, then try again.')
      }
      const payload = await response.json()
      if (!response.ok || !payload.ok || !payload.resumeData) throw new Error(payload.error || 'Could not extract this resume. Try again.')
      setResumeData(ensureResumeElementIds(payload.resumeData))
      setUploadedFileName(file.name)
      setParseMetadata(payload.metadata ?? extractedDocument.metadata)
      setResumeName(payload.resumeData.fullName || 'Untitled resume')
      setWorkspaceMode('extraction-review')
      if (source === 'linkedin') navigate('/workspace/templates')
    } catch (error) {
      const message = error instanceof TypeError && /fetch/i.test(error.message)
        ? 'The AI server is not running. Start the app with npm run dev:all, then try again.'
        : /central directory|zip file/i.test(error.message || '')
          ? 'This DOCX file looks damaged or is not a real Word document. Save it again from Word, or upload it as a PDF.'
          : error.message || 'Could not read this file. Try a text-based PDF, DOCX, or TXT file.'
      setWorkspaceError(message)
      setWorkspaceMode('error')
    }
  }


  // Imported resumes already have their details, so they go straight to the editor; scratch resumes fill the form first.
  const chooseTemplate = templateId => {
    setSelectedTemplateId(templateId)
    const template = getResumeTemplate(templateId)
    setResumePresentation(current => ({ ...current, template: templateId, photo: current.photo?.uploaded ? current.photo : template?.supportsPhoto ? { width: 72, height: 72, shape: 'circle', uploadPlaceholder: true } : { visible: false } }))
    setResumeData(current => current || ensureResumeElementIds(createBlankResumeData()))
    if (uploadedFileName) {
      setWorkspaceMode('editor-ready')
      navigate('/workspace/editor')
      requestAnimationFrame(() => editorRef.current?.focus())
    } else {
      setWorkspaceMode('builder')
      navigate('/workspace/build')
    }
  }

  const startFromScratch = () => {
    resetWorkspace()
    navigate('/workspace/templates')
  }

  const discardFormAndChooseTemplate = () => {
    setDiscardConfirmOpen(false)
    startFromScratch()
  }

  const continueToEditor = () => {
    setWorkspaceMode('editor-ready')
    navigate('/workspace/editor')
  }

  const handleProfilePhotoUpload = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setProfilePhotoError('')
    try {
      const source = await readProfilePhoto(file)
      // The cropper opens straight away; the template's own photo shape (circle or rounded) is kept.
      if (source && isEditorRoute) setSelectedResumeElement({ id: 'resume.header.photo', path: null })
      if (source) setResumePresentation(current => ({ ...current, photo: { source, originalSource: source, cropPending: true, uploaded: true, width: 72, height: 72, shape: selectedTemplate?.defaultTheme?.photo?.shape || 'circle', objectFit: 'cover', objectPosition: '50% 50%' } }))
    } catch (error) {
      setProfilePhotoError(error.message || 'The profile photo could not be loaded.')
    }
  }

  const updateProfilePhoto = photo => setResumePresentation(current => ({ ...current, photo }))




  const startGitHubConnection = async () => {
    if (!currentUser || githubConnecting || githubConnection.connected) return
    setGithubConnecting(true)
    setGithubConnectionError('')
    setGithubConnectionNotice('')
    try {
      if (resumeData) {
        sessionStorage.setItem(githubResumeSnapshotKey, JSON.stringify({
          savedAt: Date.now(),
          resumeData,
          workspaceMode,
          selectedTemplateId,
          resumePresentation,
          uploadedFileName,
          parseMetadata,
        }))
      }
      const idToken = await currentUser.getIdToken()
      const response = await fetch('/api/github/connect', { headers: { Authorization: `Bearer ${idToken}` } })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok || !payload.authorizationUrl) throw new Error(payload?.error || 'Could not start the GitHub connection.')
      window.location.assign(payload.authorizationUrl)
    } catch (error) {
      setGithubConnectionError(error instanceof TypeError ? 'GitHub service is not running. Start the app with npm run dev:all.' : error.message || 'Could not start the GitHub connection.')
      setGithubConnecting(false)
    }
  }

  const openEvidence = () => navigate('/workspace/evidence')

  // ---- Cover letter (PLAN-033) ----
  useEffect(() => {
    if (isLetterPage && !coverLetter) setCoverLetter(letterFromJob(createLetter(), analysis?.jd ?? {}))
  }, [isLetterPage, coverLetter, analysis])
  const openLetter = () => navigate('/workspace/letter')
  const addLetterToResume = () => { setCoverLetterIncluded(true); navigate('/workspace/editor') }
  const removeLetterFromResume = () => setCoverLetterIncluded(false)
  const letterOnResume = coverLetterIncluded && Boolean(coverLetter)
  const handleLetterResumeChange = next => {
    resumeDataRef.current = next
    setResumeData(next)
    if (next.fullName !== resumeName) setResumeName(next.fullName || 'Untitled resume')
  }

  // GitHub evidence scan, streamed: progress and charts update as each repository finishes.
  const githubScanAbortRef = useRef(null)
  const runGitHubScan = async () => {
    if (!currentUser || githubScan?.status === 'scanning') return
    const controller = new AbortController()
    githubScanAbortRef.current = controller
    setGithubScan({ status: 'scanning', done: 0, total: 0, percent: 0, repos: [], resumeSkills: [], errors: [], startedAt: Date.now() })
    try {
      const idToken = await currentUser.getIdToken()
      await streamNdjson('/api/github/evidence-scan', {
        headers: { Authorization: `Bearer ${idToken}` },
        body: { resumeData: resumeDataRef.current ?? resumeData },
        signal: controller.signal,
        onEvent: event => {
          if (event.type === 'start') setGithubScan(current => ({ ...current, total: event.total, accessible: event.accessible, cap: event.cap, resumeSkills: event.resumeSkills }))
          else if (event.type === 'repo') setGithubScan(current => ({ ...current, done: event.done, percent: event.percent, current: event.repo.name, repos: [...current.repos, event.repo] }))
          else if (event.type === 'repo-error') setGithubScan(current => ({ ...current, errors: [...current.errors, event] }))
          else if (event.type === 'result') setGithubScan(current => ({ ...current, status: 'done', percent: 100, done: event.scanned, repos: event.repositories, summary: event.summary, current: null }))
          else if (event.type === 'error') setGithubScan(current => ({ ...current, status: 'error', error: event.message }))
        }
      })
      setGithubScan(current => current?.status === 'scanning' ? { ...current, status: 'done', current: null } : current)
    } catch (error) {
      setGithubScan(current => controller.signal.aborted
        ? { ...current, status: 'cancelled', current: null }
        : { ...current, status: 'error', error: error instanceof TypeError ? 'GitHub service is not running. Start the app with npm run dev:all.' : error.message || 'Could not scan GitHub.' })
    } finally {
      githubScanAbortRef.current = null
    }
  }

  const answerJdFixWithNimbus = fix => {
    setAiTab('nimbus')
    setAssistantInput(`${fix.question}\n\nMy answer: `)
    if (!isEditorRoute) navigate('/workspace/editor')
    setTimeout(() => {
      const input = assistantInputRef.current
      input?.focus()
      input?.setSelectionRange?.(input.value.length, input.value.length)
    }, 120)
  }

  const editorReady = editor => { editorRef.current = editor }
  const handleManualResumeEdit = ({ path, value }) => {
    if (path === 'footerText') {
      setFooterText(cleanManualValue(value))
      return
    }
    const current = resumeDataRef.current ?? resumeData
    const next = updateManualResumeData(current, path, value)
    if (next === current) return
    resumeDataRef.current = next
    setResumeData(next)
    if (path === 'fullName') setResumeName(next.fullName || 'Untitled resume')
  }

  const handleBuilderResumeUpdate = next => {
    resumeDataRef.current = next
    setResumeData(next)
    if (next.fullName !== resumeName) setResumeName(next.fullName || 'Untitled resume')
  }

  // ---- NIMBUS v2: streamed turns with live steps, option cards, questions and per-turn undo ----
  const latestEditorStateRef = useRef(null)
  latestEditorStateRef.current = { resumeData, resumePresentation, fontFamily, globalFontSize, fontColor, useGlobalTextColor, footerText }
  const snapshotEditorState = () => structuredClone({ ...latestEditorStateRef.current, resumeData: resumeDataRef.current ?? latestEditorStateRef.current.resumeData })
  const showAssistantError = message => setAssistantMessages(turns => [...turns, { id: `n${Date.now()}`, role: 'assistant', status: 'done', tone: 'warning', text: message }].slice(-60))
  const pageElementNodes = () => [...document.querySelectorAll('.studio-canvas .resume-page-document [data-resume-element-id]')]
  const pageElementIds = () => [...new Set(pageElementNodes().map(node => node.dataset.resumeElementId))]

  const buildNimbusContext = () => {
    const latest = latestEditorStateRef.current
    const elements = new Map()
    pageElementNodes().forEach(node => {
      const id = node.dataset.resumeElementId
      if (!elements.has(id)) elements.set(id, { id, label: describeResumeElement(id).label, text: node.textContent.trim().replace(/\s+/g, ' ').slice(0, 90), path: node.dataset.resumePath })
    })
    const selection = selectedResumeElementRef.current
    const highlighted = selection?.range ? String(selection.text ?? '').slice(selection.range.start, selection.range.end) : ''
    return {
      resumeData: resumeDataRef.current ?? latest.resumeData,
      elements: [...elements.values()].slice(0, 320),
      style: {
        fontFamily: latest.resumePresentation.fontFamily || null,
        templateFontFamily: selectedTemplate?.defaultTheme?.fontFamily,
        baseSize: latest.globalFontSize ?? null,
        textColor: latest.useGlobalTextColor ? latest.fontColor : null,
        accent: latest.resumePresentation.accentColor || selectedTemplate?.defaultTheme?.accentColor || null,
        lineHeight: latest.resumePresentation.elementOverrides?.resume?.lineHeight ?? null,
        template: selectedTemplate?.name,
        pages: document.querySelectorAll('.studio-canvas .resume-page-document .resume-page-frame').length || null
      },
      elementOverrides: latest.resumePresentation.elementOverrides ?? {},
      selection: selection ? { id: selection.id, label: describeResumeElement(selection.id).label, text: selection.text ?? '', highlighted } : null,
      conversation: assistantMessages.filter(turn => turn.text).slice(-10).map(turn => ({ role: turn.role, text: turn.text })),
      job: analysis?.jd ? (() => { const match = scoreKeywords(resumeDataRef.current ?? resumeData ?? {}, analysis.keywords ?? []); return { title: analysis.jd.title, score: analysis.step === 'results' ? match.score : null, mustHave: analysis.jd.mustHave, missingKeywords: match.rows.filter(row => !row.found).map(row => row.term).slice(0, 15) } })() : null
    }
  }

  const applyNimbusOps = operations => {
    const latest = latestEditorStateRef.current
    const current = resumeDataRef.current ?? latest.resumeData
    const result = applyNimbusOperations({ resumeData: current }, operations, { elementIds: pageElementIds(), fontFamilyForId: id => findFont(id)?.family ?? id })
    if (result.resumeData !== current) {
      const next = ensureResumeElementIds(result.resumeData)
      resumeDataRef.current = next
      setResumeData(next)
      latestEditorStateRef.current = { ...latest, resumeData: next }
      if (next.fullName !== current.fullName) setResumeName(next.fullName || 'Untitled resume')
    }
    if (result.global.resetAll) resetAllFormatting()
    if (result.presentationOps.length) applyEditorOperations(result.presentationOps)
    if (result.global.fontFamily) { setFontFamily(result.global.fontFamily); setResumePresentation(value => ({ ...value, fontFamily: result.global.fontFamily })) }
    if (result.global.baseSize) { setGlobalFontSize(result.global.baseSize); setFontSize(result.global.baseSize) }
    if (result.global.textColor) { setUseGlobalTextColor(true); setFontColor(result.global.textColor) }
    if (result.global.accent) setResumePresentation(value => ({ ...value, accentColor: result.global.accent }))
    return result
  }

  const pageCount = () => document.querySelectorAll('.studio-canvas .resume-page-document .resume-page-frame').length

  // Tighten spacing, then step the whole-resume size down — never below the readable minimum.
  const fitResumeToOnePage = async () => {
    await settleLayout(120)
    if (pageCount() <= 1) return { ok: true, changed: false, note: 'It already fits on one page.' }
    const startLatest = latestEditorStateRef.current
    const originalSize = startLatest.globalFontSize
    const originalLineHeight = startLatest.resumePresentation.elementOverrides?.resume?.lineHeight ?? null
    const bodyNode = document.querySelector('.studio-canvas .resume-page-document .resume-section li, .studio-canvas .resume-page-document .resume-section p')
    const bodyStyle = bodyNode ? window.getComputedStyle(bodyNode) : null
    const lineRatio = bodyStyle ? parseFloat(bodyStyle.lineHeight) / parseFloat(bodyStyle.fontSize) : 1.4
    if (!(lineRatio <= 1.25)) {
      applyEditorOperations([{ type: 'set_style', target: 'resume', changes: { lineHeight: 1.25 } }])
      await settleLayout(120)
      if (pageCount() <= 1) return { ok: true, changed: true, note: 'Tightened line spacing.' }
    }
    let size = originalSize ?? 13.5
    while (size > MIN_READABLE_BASE_SIZE) {
      size = Math.max(MIN_READABLE_BASE_SIZE, Math.round((size - 0.5) * 2) / 2)
      setGlobalFontSize(size)
      setFontSize(size)
      await settleLayout(120)
      if (pageCount() <= 1) return { ok: true, changed: true, note: `Text size ${size}px (${Math.round(size * 0.75 * 10) / 10}pt) and tighter spacing.` }
    }
    setGlobalFontSize(originalSize)
    applyEditorOperations([{ type: 'set_style', target: 'resume', changes: { lineHeight: originalLineHeight } }])
    return { ok: false, changed: false, note: `It won't fit without going below ${MIN_READABLE_BASE_SIZE}px (9pt), which is too small to read comfortably. I left the size as it was — shortening a few bullets or older entries would get it onto one page. Want me to suggest what to trim?` }
  }

  const nimbusResetRef = useRef(null)
  const nimbus = useNimbusTurns({
    turns: assistantMessages,
    setTurns: setAssistantMessages,
    available: isEditorReady && Boolean(resumeData),
    adapter: { snapshot: snapshotEditorState, restore: restoreHistorySnapshot, applyOperations: applyNimbusOps, buildContext: buildNimbusContext, fitToOnePage: fitResumeToOnePage }
  })
  nimbusResetRef.current = nimbus.reset
  const jobMatch = useJobMatch({
    analysis, setAnalysis, draft: description, setDraft: setDescription,
    adapter: {
      getResume: () => resumeDataRef.current ?? resumeData,
      elementIds: pageElementIds, snapshot: snapshotEditorState,
      restore: snapshot => { restoreHistorySnapshot(snapshot); resumeDataRef.current = snapshot.resumeData },
      applyOperations: applyNimbusOps
    }
  })
  useEffect(() => { setNimbusPreviewing(nimbus.previewing) }, [nimbus.previewing])

  const activeFontFamily = resumePresentation.fontFamily || selectedTemplate?.defaultTheme?.fontFamily || resumeFonts[0].family
  const editorPresentation = resolveResumePresentation(selectedTemplate, resumePresentation)
  editorPresentationRef.current = editorPresentation
  if ((isEditorPage || isBuilderPage) && selectedTemplate?.supportsPhoto && !editorPresentation.photo?.uploaded) {
    editorPresentation.photo = { width: 72, height: 72, shape: 'circle', uploadPlaceholder: true }
  }
  if (isTemplatesRoute) return <Shell>
    <TemplateGallery
      title={uploadedFileName ? 'Choose a template' : 'Templates'}
      subtitle={uploadedFileName
        ? `Your details from ${uploadedFileName} are ready. Pick a design and it opens in the editor with everything filled in.`
        : 'Pick a design, then fill in your details. You can change colours and fonts in the editor, and switch templates at any time.'}
      previewData={uploadedFileName && resumeData ? resumeData : undefined}
      onUse={chooseTemplate}
      onBack={() => navigate(hasDraft && isScratchResume ? '/workspace/build' : '/workspace')}
      backLabel={uploadedFileName ? 'Back to extracted details' : hasDraft ? 'Back to details' : 'Back to workspace'}
    />
  </Shell>

  const isStepPage = isEditorPage || isBuilderPage || isTailorPage || isEvidencePage
  const supportsPhoto = Boolean(selectedTemplate?.supportsPhoto)
  const hasUploadedPhoto = Boolean(resumePresentation.photo?.uploaded)
  const photoControls = <ProfilePhotoControls photo={resumePresentation.photo} onChange={updateProfilePhoto} error="" />
  const goBackFromStep = () => {
    if (isEditorRoute) {
      navigate(isScratchResume ? '/workspace/build' : '/workspace')
      return
    }
    // Leaving the form discards it, so ask first once anything has been typed.
    if (hasStartedForm(formSectionsFor(getTemplateSectionPlan(selectedTemplate?.id)), resumeData ?? {}, { supportsPhoto, hasPhoto: hasUploadedPhoto })) setDiscardConfirmOpen(true)
    else discardFormAndChooseTemplate()
  }
  const hiddenInputs = <>
    <input ref={uploadInputRef} className="upload-input" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={handleUpload} />
    <input ref={linkedinUploadInputRef} className="upload-input" type="file" accept=".pdf,application/pdf" aria-label="Choose LinkedIn profile PDF" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { resetWorkspace(); readDocument(file, 'linkedin') } }} />
    {isStepPage && supportsPhoto && <input ref={profilePhotoInputRef} className="upload-input" type="file" accept="image/jpeg,.jpg,.jpeg" aria-label="Choose JPEG profile photo" onChange={handleProfilePhotoUpload} />}
  </>
  const resumeCanvas = isStepPage && <div className="studio-canvas" style={{ '--canvas-zoom': isEditorPage || isTailorPage ? canvasZoom : 1 }}>
    {isEditorPage && letterOnResume && <section className="letter-in-editor" aria-label="Cover letter, page 1 of your document">
      <div className="letter-bar">
        <b>Cover letter</b><span>The first page of your document</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={openLetter}>Edit letter</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={removeLetterFromResume}>Remove</button>
      </div>
      <CoverLetterPage template={selectedTemplate} resumeData={resumeData} letter={coverLetter} presentation={editorPresentation} readOnly />
    </section>}
    <TemplateComponent
      resumeData={resumeData}
      editorRef={editorReady}
      editorStyle={resumeStyle}
      useGlobalTextColor={useGlobalTextColor}
      footerText={footerText}
      readOnly={isBuilderPage || isTailorPage || isEvidencePage}
      onManualEdit={isEditorPage ? handleManualResumeEdit : undefined}
      onElementSelect={isEditorPage ? selectResumeElement : undefined}
      selectedElementId={isEditorPage ? selectedResumeElement?.id ?? null : null}
      focusSectionId={isBuilderPage ? formActiveSection : null}
      presentation={editorPresentation}
      onProfilePhotoClick={() => profilePhotoInputRef.current?.click()}
      blankPreview={isScratchResume}
    />
  </div>

  const dialogs = <>
    {deleteConfirmOpen && <div className="linkedin-import-backdrop delete-draft-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDeleteConfirmOpen(false) }}>
      <section className="linkedin-import-dialog delete-draft-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-draft-title" aria-describedby="delete-draft-description">
        <span className="delete-draft-warning"><Icon name="trash" size={15} /> Draft deletion</span>
        <h2 id="delete-draft-title">Delete this draft?</h2>
        <p id="delete-draft-description">Your resume and its edits will be removed. This action cannot be undone.</p>
        <div className="linkedin-import-actions"><button className="secondary-button" type="button" onClick={() => setDeleteConfirmOpen(false)}>Keep draft</button><button className="delete-confirm-button" type="button" onClick={confirmDeleteDraft}>Delete draft</button></div>
      </section>
    </div>}
    {discardConfirmOpen && <div className="linkedin-import-backdrop delete-draft-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDiscardConfirmOpen(false) }}>
      <section className="linkedin-import-dialog delete-draft-dialog" role="alertdialog" aria-modal="true" aria-labelledby="discard-form-title" aria-describedby="discard-form-description">
        <span className="delete-draft-warning">Unsaved form</span>
        <h2 id="discard-form-title">Discard this form and start fresh?</h2>
        <p id="discard-form-description">Going back to templates throws away everything you have filled in for this resume. This cannot be undone.</p>
        <div className="linkedin-import-actions"><button className="secondary-button" type="button" onClick={() => setDiscardConfirmOpen(false)} autoFocus>Keep filling</button><button className="delete-confirm-button" type="button" onClick={discardFormAndChooseTemplate}>Discard and choose template</button></div>
      </section>
    </div>}
    {printing && TemplateComponent && createPortal(<div className="print-root" aria-hidden="true">
      {letterOnResume && <div className="print-letter-section"><LetterPrintPage template={selectedTemplate} resumeData={resumeData} letter={coverLetter} presentation={editorPresentation} /></div>}
      <TemplateComponent resumeData={resumeData} editorStyle={resumeStyle} useGlobalTextColor={useGlobalTextColor} footerText={footerText} readOnly presentation={{ ...editorPresentation, photo: editorPresentation.photo?.uploadPlaceholder ? { visible: false } : editorPresentation.photo }} blankPreview={isScratchResume} pageWidthOverride={794} />
    </div>, document.body)}
  </>

  // Text of every resume element on the tailoring canvas, to show what a fix changed.
  const readCanvasText = () => new Map([...document.querySelectorAll('.tw-resume .resume-page-document [data-resume-element-id]')].map(node => [node.dataset.resumeElementId, node.textContent]))
  const flashChanges = async action => {
    const before = readCanvasText()
    const result = await action()
    setTimeout(() => {
      const changed = [...document.querySelectorAll('.tw-resume .resume-page-document [data-resume-element-id]')].filter(node => before.get(node.dataset.resumeElementId) !== node.textContent)
      changed[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      changed.forEach(node => node.classList.add('is-tailor-changed'))
      setTimeout(() => changed.forEach(node => node.classList.remove('is-tailor-changed')), 1600)
    }, 150)
    return result
  }
  if (isLetterPage) return <Shell immersive studio>
    <LetterStudio
      resumeData={resumeData} onResumeChange={handleLetterResumeChange} resumeName={resumeName} template={selectedTemplate} presentation={editorPresentation}
      letter={coverLetter ?? createLetter()} onLetterChange={setCoverLetter} messages={letterMessages} setMessages={setLetterMessages}
      jobText={description} onJobTextChange={setDescription}
      included={coverLetterIncluded} onAddToResume={addLetterToResume} onRemoveFromResume={removeLetterFromResume}
      onBackToResume={() => navigate('/workspace/editor')} onBack={() => navigate('/workspace/editor')} onOpenTailor={() => navigate('/workspace/tailor')} />
  </Shell>

  if (isTailorPage) return <Shell immersive studio>
    <div className="studio tailor-page">
      {hiddenInputs}
      <TailorWorkspace analysis={analysis} resumeData={resumeData} jobMatch={jobMatch} draft={description} onDraftChange={setDescription}
        onExecuteFix={fix => flashChanges(() => jobMatch.executeFix(fix))} onUndoFix={fix => flashChanges(() => jobMatch.undoFix(fix))} onAnswerFix={answerJdFixWithNimbus}
        resumeCanvas={resumeCanvas} resumeName={resumeName} templateName={selectedTemplate?.name} onBack={() => navigate('/workspace/editor')} onOpenEditor={() => navigate('/workspace/editor')} onWriteLetter={openLetter} />
    </div>
    {dialogs}
  </Shell>

  if (isEvidencePage) return <Shell immersive studio>
    <div className="studio tailor-page">
      {hiddenInputs}
      <EvidenceWorkspace
        github={{ connected: githubConnection.connected, connecting: githubConnecting || githubConnection.loading, login: githubConnection.githubLogin, onConnect: startGitHubConnection, scan: githubScan, onScan: runGitHubScan, onCancel: () => githubScanAbortRef.current?.abort() }}
        resumeCanvas={resumeCanvas} resumeName={resumeName} templateName={selectedTemplate?.name}
        onBack={() => navigate('/workspace/editor')} onOpenEditor={() => navigate('/workspace/editor')} />
    </div>
    {dialogs}
  </Shell>

  if (!isStepPage) return <Shell>
    <header className="page-header"><div><span className="eyebrow">WORKSPACE</span><h1>Start a resume.</h1></div></header>
    <div className="workspace-grid setup-mode">
      <section className="resume-canvas panel">
        {hiddenInputs}
        {isStartRoute && ['initial', 'file-selected', 'builder', 'editor-ready'].includes(workspaceMode) && <ResumeStartOptions onImport={() => uploadInputRef.current?.click()} onFile={selectUploadFile} onCreate={startFromScratch} onImportLinkedIn={() => linkedinUploadInputRef.current?.click()} selectedFile={workspaceMode === 'file-selected' ? pendingUploadFile : null} onRead={readDocument} />}
        {isStartRoute && workspaceMode === 'extracting' && <div className="flow-loading" aria-live="polite"><div className="flow-loading-card"><DotLottieReact className="flow-loading-animation" src="/loading.lottie" loop autoplay mode="bounce" speed={2} aria-label="Extracting resume data" /><h2>{importSource === 'linkedin' ? 'Reading your LinkedIn profile…' : 'Extracting resume details…'}</h2>{pendingUploadFile && <p className="flow-loading-name">{pendingUploadFile.name}</p>}</div></div>}
        {isStartRoute && workspaceMode === 'extraction-review' && resumeData && <ResumeExtractionReview resumeData={resumeData} uploadedFileName={uploadedFileName} parseMetadata={parseMetadata} onContinue={() => navigate('/workspace/templates')} onStartOver={resetWorkspace} />}
        {isStartRoute && workspaceMode === 'error' && <div className="flow-error" role="alert"><span className="flow-error-icon" aria-hidden="true">!</span><h3>We could not import that resume.</h3><p>{workspaceError}</p><div className="state-actions"><button className="secondary-button" onClick={resetWorkspace}>Start over</button><button className="primary-button" onClick={() => uploadInputRef.current?.click()}>Try another file</button></div></div>}
      </section>
    </div>
    {dialogs}
  </Shell>

  const backLabel = isEditorRoute ? (isScratchResume ? 'Back to details' : 'Back to workspace') : 'Back to templates'
  const docMark = <svg className="studio-doc-mark" viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 2.5h6l3 3v12h-9v-15Z" /><path d="M11.5 2.5v3h3M7.8 9.5h4.4M7.8 12h4.4M7.8 14.5h2.6" /></svg>
  const topBar = <header className="studio-topbar">
    <div className="studio-topbar-start">
      <button className="btn btn-ghost btn-icon" type="button" onClick={goBackFromStep} aria-label={backLabel} title={backLabel}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4.5 6.5 10l5.5 5.5" /></svg></button>
      {docMark}
      <div className="studio-title-wrap">
        {editingName
          ? <input className="studio-title-input" autoFocus value={resumeName} onChange={event => setResumeName(event.target.value)} onBlur={() => { setResumeName(resumeName.trim() || 'Untitled resume'); setEditingName(false) }} onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} aria-label="Resume name" />
          : <button className="studio-title" type="button" onClick={() => setEditingName(true)} title="Rename">{resumeName}</button>}
        <span className="studio-subtitle">{selectedTemplate?.name}</span>
      </div>
    </div>
    {isEditorPage && <div className="studio-topbar-centre" role="toolbar" aria-label="History and zoom">
      <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 5 3.5 9l4 4M4 9h8a4.5 4.5 0 0 1 0 9h-2" /></svg></button>
      <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl+Y)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 5 4 4-4 4M16 9H8a4.5 4.5 0 0 0 0 9h2" /></svg></button>
      <span className="studio-divider" aria-hidden="true" />
      <select className="studio-zoom" value={canvasZoom} onChange={event => setCanvasZoom(Number(event.target.value))} aria-label="Zoom">
        {[.5, .75, 1, 1.25, 1.5].map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
      </select>
    </div>}
    <div className="studio-topbar-end">
      <button className="btn btn-ghost btn-icon" type="button" onClick={deleteDraft} aria-label="Delete this draft" title="Delete draft"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4.5h4V6M6 6l.8 10h6.4L14 6" /></svg></button>
      {isEditorPage && <SaveButton onSave={saveNow} isSaving={isSaving} />}
      {isEditorPage && <span className="canvas-export-wrap" ref={exportMenuRef}>
        <button className="btn btn-primary" type="button" disabled={exportLoading} aria-haspopup="menu" aria-expanded={exportMenuOpen} onClick={() => setExportMenuOpen(open => !open)}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v9M6 8.5l4 4 4-4M4 16.5h12" /></svg>{exportLoading ? 'Exporting…' : 'Export'}
        </button>
        {exportMenuOpen && <div className="export-format-menu studio-menu" role="menu" aria-label="Export format">
          <button type="button" role="menuitem" disabled={exportLoading} onClick={() => chooseExportFormat('PDF')}><b>PDF</b><small>As designed</small></button>
          <button type="button" role="menuitem" disabled={exportLoading} onClick={() => chooseExportFormat('DOCX')}><b>Word</b><small>Text only</small></button>
          <button type="button" role="menuitem" disabled={exportLoading} onClick={() => chooseExportFormat('TXT')}><b>Plain text</b><small>For online forms</small></button>
        </div>}
      </span>}
    </div>
  </header>

  if (isBuilderPage) return <Shell immersive studio>
    <div className="studio">
      {topBar}
      {hiddenInputs}
      <div className="build-grid">
        <section className="editor-pane build-form-pane" aria-label="Resume details form">
          <SectionForm
            template={selectedTemplate}
            resumeData={resumeData}
            onChange={handleBuilderResumeUpdate}
            supportsPhoto={supportsPhoto}
            hasPhoto={hasUploadedPhoto}
            onPhotoUpload={() => profilePhotoInputRef.current?.click()}
            onPhotoRemove={() => updateProfilePhoto(null)}
            photoControls={photoControls}
            photoError={profilePhotoError}
            confirmed={confirmedSections}
            onConfirm={id => setConfirmedSections(current => ({ ...current, [id]: true }))}
            activeSection={formActiveSection}
            onActiveSectionChange={setFormActiveSection}
            onContinue={continueToEditor}
          />
        </section>
        <section className="editor-pane editor-pane-centre" aria-label="Live resume preview">{resumeCanvas}</section>
      </div>
    </div>
    {dialogs}
  </Shell>

  const selectionLabel = selectedResumeElement ? describeResumeElement(selectedResumeElement.id).label : ''
  const assistantEditor = <NimbusChat
    inputRef={assistantInputRef}
    turns={assistantMessages}
    busy={nimbus.busy}
    phase={nimbus.phase}
    task={nimbus.task}
    available={isEditorPage}
    value={assistantInput}
    onChange={event => setAssistantInput(event.target.value)}
    onSend={text => { setAssistantInput(''); nimbus.run(text) }}
    onStop={nimbus.stop}
  />
  const aiRail = <AiRail
    nimbus={assistantEditor}
    docks={<>
      <TailorDock score={analysis?.step === 'results' && resumeData ? scoreKeywords(resumeData, analysis.keywords).score : null} onOpen={() => navigate('/workspace/tailor')} />
      <CoverLetterDock included={letterOnResume} started={Boolean(coverLetter)} onOpen={openLetter} />
      <EvidenceDock onCompare={openEvidence} canCompare={hasDraft} connected={githubConnection.connected} />
    </>}
  />
  const formatPanel = <FormatPanel
    selection={selectedResumeElement}
    onClearSelection={() => setSelectedResumeElement(null)}
    resumeData={resumeData}
    onEditText={(path, value) => handleManualResumeEdit({ path, value })}
    onToggleMark={toggleFormattingMark}
    overrides={resumePresentation.elementOverrides ?? {}}
    onStyle={(target, changes) => applyEditorOperations([{ type: 'set_style', target, changes }])}
    onClear={target => applyEditorOperations([{ type: 'clear_style', target }])}
    revision={`${selectedResumeElement?.id}|${JSON.stringify(resumePresentation)}|${resumeStyle.fontFamily}|${globalFontSize}|${fontColor}|${useGlobalTextColor}`}
    fonts={resumeFonts}
    fontFamily={resumePresentation.fontFamily || null}
    templateFontFamily={selectedTemplate?.defaultTheme?.fontFamily}
    onFontFamily={family => { setFontFamily(family); setResumePresentation(current => ({ ...current, fontFamily: family })) }}
    baseFontSize={globalFontSize ?? 13.5}
    onBaseFontSize={size => { setGlobalFontSize(size); setFontSize(size) }}
    textColor={useGlobalTextColor ? fontColor : null}
    onTextColor={color => { setUseGlobalTextColor(Boolean(color)); if (color) setFontColor(color) }}
    accentColor={resumePresentation.accentColor}
    templateAccent={selectedTemplate?.defaultTheme?.accentColor}
    onAccentColor={color => setResumePresentation(current => ({ ...current, accentColor: color }))}
    photo={resumePresentation.photo}
    onPhotoChange={updateProfilePhoto}
    onPhotoUpload={() => profilePhotoInputRef.current?.click()}
    photoControls={<>{profilePhotoError && <p className="form-error" role="alert">{profilePhotoError}</p>}{photoControls}</>}
    onResetAll={resetAllFormatting}
  />

  return <Shell immersive studio>
    <div className="studio">
      {topBar}
      {hiddenInputs}
      <EditorShell left={aiRail} centre={resumeCanvas} right={formatPanel} leftLabel="AI tools" rightLabel="Format" />
    </div>
    {dialogs}
  </Shell>
}


function App() {
  return <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/login" element={<Login />} />
    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
    <Route path="/workspace/*" element={<ProtectedRoute><MainPage /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    <Route path="/help" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
    <Route path="/templates" element={<ProtectedRoute><TemplatesPage /></ProtectedRoute>} />
    <Route path="/evaluation" element={<Navigate to="/workspace/evidence" replace />} />
  </Routes>
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)