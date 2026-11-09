import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlan } from '../context/PlanContext.jsx'
import { deleteSavedJob, getLatestJobSearch, listResumes, listSavedJobs, loadJobBoard, saveJob, searchJobs, updateSavedJob } from '../utils/userApi.js'
import { JOB_STATUSES, PLATFORMS, PLATFORM_NAMES, buildSearchProfile, jobIdentity } from '../../shared/jobMatch.js'
import './jobs.css'

// Job tracker (Pro): openings matched to a saved resume, one row per job board, and a board of saved applications.
// Searches run on the server (server/jobs/jobSearch.js); this page only shows them and keeps the saved jobs in step.

const STATUS_LABELS = { saved: 'Saved', applied: 'Applied', interview: 'Interview', offer: 'Offer', rejected: 'Closed' }
const DATE_OPTIONS = [['month', 'Past month'], ['week', 'Past week'], ['3days', 'Past 3 days'], ['today', 'Today'], ['all', 'Any time']]
// Board logos are bundled in public/boards so the page never waits on another site for them.
const BOARD_LOGOS = {
  linkedin: '/boards/linkedin.png', naukri: '/boards/naukri.png', indeed: '/boards/indeed.png', glassdoor: '/boards/glassdoor.png', foundit: '/boards/foundit.png',
  internshala: '/boards/internshala.png', wellfound: '/boards/wellfound.png', instahyre: '/boards/instahyre.jpg', cutshort: '/boards/cutshort.png', apna: '/boards/apna.png', shine: '/boards/shine.png'
}
const TOP_PICKS = 3
const openingOf = job => jobIdentity(job) || job.key
// Boards load after the main search, this many at a time (context.dev's free plan reads two pages at once).
const BOARDS_AT_ONCE = 2

/** The search with one board's row swapped in (rows stay in PLATFORMS order) and that board no longer pending. */
function withBoard(search, platform, row, failure) {
  const order = PLATFORMS.map(item => item.id)
  const rows = (search.rows ?? []).filter(item => item.platform !== platform)
  if (row?.jobs?.length) rows.push(row)
  rows.sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform))
  const failures = (search.failures ?? []).filter(item => item !== failure)
  return { ...search, rows, failures: failure ? [...failures, failure] : failures, pendingBoards: (search.pendingBoards ?? []).filter(item => item !== platform) }
}

function postedAgo(iso) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (!Number.isFinite(days)) return ''
  if (days <= 0) return 'Posted today'
  if (days === 1) return 'Posted yesterday'
  return days < 30 ? `Posted ${days} days ago` : `Posted ${Math.floor(days / 30)} mo ago`
}

const Svg = ({ children, size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
const SearchIcon = () => <Svg><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Svg>
const PinIcon = ({ size = 18 }) => <Svg size={size}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></Svg>
const WalletIcon = ({ size = 18 }) => <Svg size={size}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="16" height="11" rx="2.5" /><path d="M16 13.5h.01" /></Svg>
const ClockIcon = ({ size = 18 }) => <Svg size={size}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>
const DocIcon = () => <Svg><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4M9 13h6M9 17h6" /></Svg>
const ArrowOut = () => <Svg size={15}><path d="M8 16 16 8M9.5 8H16v6.5" /></Svg>
const Heart = ({ filled }) => <Svg size={18}><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" fill={filled ? 'currentColor' : 'none'} /></Svg>
const Star = () => <Svg size={14}><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" fill="currentColor" /></Svg>

/** "LinkedIn", or for other boards and employer sites the site's own address ("jobrapido.com"). */
function boardName(platform, url) {
  if (platform !== 'other' && platform !== 'company') return PLATFORM_NAMES[platform] ?? 'the job board'
  try { return new URL(url).hostname.replace(/^(?:www|in|careers|jobs)\./, '') } catch { return platform === 'company' ? 'the company site' : 'the job board' }
}

/** The job board's own logo; the employer's site and other boards get an icon. */
function PlatformMark({ platform, size = 'md' }) {
  const [broken, setBroken] = useState(false)
  const src = BOARD_LOGOS[platform]
  return <span className={`jobs-mark is-${size}`} data-platform={platform} aria-hidden="true">
    {src && !broken
      ? <img src={src} alt="" onError={() => setBroken(true)} />
      : platform === 'company'
        ? <Svg size={size === 'sm' ? 13 : 20}><path d="M4 20V5.5L12 3v17M12 8h8v12M7.5 8.5h1M7.5 12h1M7.5 15.5h1M15.5 12h1M15.5 15.5h1M3 20h18" /></Svg>
        : <Svg size={size === 'sm' ? 13 : 20}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18" /></Svg>}
  </span>
}

function CompanyLogo({ job, size = 'md' }) {
  const [broken, setBroken] = useState(false)
  if (job.logo && !broken) return <img className={`job-logo is-${size}`} src={job.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  const letter = (job.company || job.title || 'J').trim().charAt(0).toUpperCase()
  return <span className={`job-logo is-letter is-${size}`} aria-hidden="true">{letter}</span>
}

/** Posted pay as is; estimates are marked and explained on hover. Older saved searches kept pay as plain text. */
function Pay({ salary }) {
  const pay = typeof salary === 'string' ? (salary ? { text: salary, kind: 'posted' } : null) : salary
  if (!pay?.text) return <span className="job-pay is-none">Not listed</span>
  return <span className={`job-pay is-${pay.kind}`} title={pay.note}>{pay.text}{pay.kind !== 'posted' && <small>est.</small>}</span>
}

function JobFacts({ job }) {
  return <dl className="job-facts">
    <div><dt><PinIcon size={15} /><span className="sr-only">Location</span></dt><dd>{job.remote && !/remote/i.test(job.location) ? `${job.location ? `${job.location} · ` : ''}Remote` : job.location || 'Location not listed'}</dd></div>
    <div><dt><WalletIcon size={15} /><span className="sr-only">Expected salary</span></dt><dd><Pay salary={job.salary} /></dd></div>
    {job.postedAt && <div><dt><ClockIcon size={15} /><span className="sr-only">Posted</span></dt><dd>{postedAgo(job.postedAt)}</dd></div>}
  </dl>
}

const HighestBadge = () => <span className="job-highest"><Star />Highest match</span>

function ScoreRing({ score }) {
  return <span className={`job-ring${score >= 70 ? ' is-high' : score >= 45 ? ' is-mid' : ''}`} style={{ '--score': score }} role="img" aria-label={`${score}% match with your resume`}>
    <b>{score}%</b><small>match</small>
  </span>
}

function JobCard({ job, rowName, saved, highest, onToggleSave }) {
  const tags = [job.type, job.experience].filter(Boolean)
  return <article className={`job-card${highest ? ' is-highest' : ''}`}>
    {highest && <HighestBadge />}
    <header>
      <CompanyLogo job={job} />
      <div className="job-card-title">
        <h4 title={job.title}>{job.title}</h4>
        <p>{job.company || `On ${rowName}`}</p>
      </div>
      <button type="button" className={`job-save${saved ? ' is-saved' : ''}`} aria-pressed={saved} aria-label={saved ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`} title={saved ? 'Saved' : 'Save to My applications'} onClick={() => onToggleSave(job)}><Heart filled={saved} /></button>
    </header>
    <JobFacts job={job} />
    {tags.length > 0 && <ul className="job-tags">{tags.map(tag => <li key={tag}>{tag}</li>)}</ul>}
    <div className="job-fit">
      {job.score !== null
        ? <span className={`job-score${job.score >= 70 ? ' is-high' : job.score >= 45 ? ' is-mid' : ''}`} style={{ '--score': job.score }}><b>{job.score}%</b> match</span>
        : <span className="job-score is-unknown">Open the posting to check fit</span>}
      {job.matched.length > 0 && <ul className="job-skills" aria-label="Your matching skills">{job.matched.slice(0, 3).map(skill => <li key={skill}>{skill}</li>)}</ul>}
      {job.missing.length > 0 && <p className="job-missing">Missing: {job.missing.slice(0, 3).join(', ')}</p>}
    </div>
    <footer>
      <span className="job-via" title={boardName(job.platform, job.url)}><PlatformMark platform={job.platform} size="sm" />via {boardName(job.platform, job.url)}</span>
      <a className="btn btn-primary btn-sm" href={job.url} target="_blank" rel="noopener noreferrer">Apply <ArrowOut /></a>
    </footer>
  </article>
}

/** The best-scoring jobs across every board, each with an apply link for every board that lists it. */
function TopMatches({ picks, savedKeys, onToggleSave }) {
  return <section className="jobs-top" aria-labelledby="jobs-top-title">
    <header>
      <h2 id="jobs-top-title">Best matches for you</h2>
      <p>The roles your resume fits best, from every board we searched.</p>
    </header>
    <div className="jobs-top-grid">
      {picks.map(({ job, links }, index) => <article key={job.key} className={`top-card${index === 0 ? ' is-highest' : ''}`}>
        {index === 0 && <HighestBadge />}
        <div className="top-card-head">
          <CompanyLogo job={job} size="lg" />
          <div className="top-card-title">
            <h3 title={job.title}>{job.title}</h3>
            <p>{job.company}</p>
          </div>
          <ScoreRing score={job.score} />
        </div>
        <JobFacts job={job} />
        {job.matched.length > 0 && <ul className="job-skills" aria-label="Your matching skills">{job.matched.slice(0, 5).map(skill => <li key={skill}>{skill}</li>)}</ul>}
        <div className="top-card-actions">
          {links.slice(0, 3).map(link => <a key={link.platform} className="top-apply" href={link.url} target="_blank" rel="noopener noreferrer"><PlatformMark platform={link.platform} size="sm" />Apply on {boardName(link.platform, link.url)}<ArrowOut /></a>)}
          <button type="button" className={`job-save${savedKeys.has(job.key) ? ' is-saved' : ''}`} aria-pressed={savedKeys.has(job.key)} aria-label={savedKeys.has(job.key) ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`} onClick={() => onToggleSave({ ...job, platform: links[0].platform, url: links[0].url })}><Heart filled={savedKeys.has(job.key)} /></button>
        </div>
      </article>)}
    </div>
  </section>
}

function PlatformRow({ row, savedKeys, highestKey, onToggleSave }) {
  const railRef = useRef(null)
  const [edges, setEdges] = useState({ start: true, end: true })
  const update = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    setEdges({ start: rail.scrollLeft < 4, end: rail.scrollWidth - rail.clientWidth - rail.scrollLeft < 4 })
  }, [])
  useEffect(() => {
    update()
    const observer = new ResizeObserver(update)
    observer.observe(railRef.current)
    return () => observer.disconnect()
  }, [update, row])
  const scroll = direction => railRef.current?.scrollBy({ left: direction * railRef.current.clientWidth * .85, behavior: 'smooth' })
  return <section className="jobs-row" aria-labelledby={`row-${row.platform}`}>
    <header className="jobs-row-head">
      <PlatformMark platform={row.platform} />
      <div>
        <h3 id={`row-${row.platform}`}>{row.name}</h3>
        <span>{row.jobs.length} matching job{row.jobs.length === 1 ? '' : 's'}</span>
      </div>
      {row.jobs.length > 1 && <div className="jobs-row-arrows">
        <button type="button" className="btn btn-secondary btn-icon btn-sm" disabled={edges.start} onClick={() => scroll(-1)} aria-label={`Previous ${row.name} jobs`}><Svg size={16}><path d="M14.5 6 8.5 12l6 6" /></Svg></button>
        <button type="button" className="btn btn-secondary btn-icon btn-sm" disabled={edges.end} onClick={() => scroll(1)} aria-label={`More ${row.name} jobs`}><Svg size={16}><path d="m9.5 6 6 6-6 6" /></Svg></button>
      </div>}
    </header>
    <div className="jobs-rail" ref={railRef} onScroll={update}>
      {row.jobs.map(job => <JobCard key={`${row.platform}-${job.key}`} job={job} rowName={row.name} saved={savedKeys.has(job.key)} highest={job.key === highestKey} onToggleSave={onToggleSave} />)}
    </div>
  </section>
}

function ApplicationsBoard({ jobs, onStatus, onNotes, onRemove }) {
  const [openNotes, setOpenNotes] = useState(null)
  if (!jobs.length) return <div className="jobs-empty">
    <Heart />
    <h3>No saved jobs yet</h3>
    <p>Press the heart on any opening to keep it here, then move it along as you apply, interview and hear back.</p>
  </div>
  return <div className="jobs-board">
    {JOB_STATUSES.map(status => {
      const column = jobs.filter(job => job.status === status)
      return <section key={status} className="jobs-column" data-status={status} aria-labelledby={`col-${status}`}>
        <header><h3 id={`col-${status}`}>{STATUS_LABELS[status]}</h3><span>{column.length}</span></header>
        {column.map(job => <article key={job.key} className="board-card">
          <div className="board-card-top">
            <PlatformMark platform={job.platform} size="sm" />
            <span>{PLATFORM_NAMES[job.platform] ?? 'Job board'}</span>
            {Number.isInteger(job.score) && <b>{job.score}%</b>}
          </div>
          <h4>{job.title}</h4>
          <p>{[job.company, job.location].filter(Boolean).join(' · ') || 'Details on the posting'}</p>
          {job.salary && <p className="board-pay"><WalletIcon size={14} />{job.salary}</p>}
          <label className="board-status"><span className="sr-only">Status</span>
            <select value={job.status} onChange={event => onStatus(job, event.target.value)}>{JOB_STATUSES.map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select>
          </label>
          {openNotes === job.key
            ? <textarea className="board-notes" autoFocus defaultValue={job.notes} maxLength={2000} placeholder="Recruiter, interview date, follow-ups…" aria-label={`Notes for ${job.title}`} onBlur={event => { setOpenNotes(null); if (event.target.value !== job.notes) onNotes(job, event.target.value) }} />
            : job.notes && <p className="board-note-text">{job.notes}</p>}
          <div className="board-actions">
            <a className="btn btn-secondary btn-sm" href={job.url} target="_blank" rel="noopener noreferrer">Open <ArrowOut /></a>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpenNotes(openNotes === job.key ? null : job.key)}>{job.notes ? 'Edit notes' : 'Add notes'}</button>
            <button type="button" className="btn btn-ghost btn-sm board-remove" onClick={() => onRemove(job)} aria-label={`Remove ${job.title}`}>Remove</button>
          </div>
        </article>)}
      </section>
    })}
  </div>
}

function LockedTracker() {
  const navigate = useNavigate()
  return <div className="jobs-page">
    <section className="jobs-hero is-locked">
      <div className="jobs-hero-copy">
        <span className="jobs-eyebrow">Career tools · Pro</span>
        <h1>The job tracker is part of Pro</h1>
        <p>It reads your latest resume, searches LinkedIn, Naukri, Indeed and more, ranks every opening by how well you fit, and keeps your applications on one board.</p>
        <button type="button" className="btn btn-primary jobs-locked-cta" onClick={() => navigate('/plan')}>See plans</button>
      </div>
      <ul className="jobs-locked-boards" aria-label="Job boards searched">{PLATFORMS.filter(platform => !['company', 'other', 'apna', 'shine', 'cutshort', 'instahyre'].includes(platform.id)).map(platform => <li key={platform.id}><PlatformMark platform={platform.id} size="sm" />{platform.name}</li>)}</ul>
    </section>
    <div className="jobs-skeleton is-preview" aria-hidden="true">
      {['linkedin', 'naukri'].map(platform => <div key={platform} className="jobs-skeleton-row"><div className="jobs-preview-head"><PlatformMark platform={platform} /><i className="is-head" /></div><div>{[0, 1, 2].map(card => <i key={card} />)}</div></div>)}
    </div>
  </div>
}

export default function JobTrackerPage() {
  const navigate = useNavigate()
  const { pro, loading: planLoading } = usePlan()
  const [resumes, setResumes] = useState(null)
  const [resumeId, setResumeId] = useState('')
  const [form, setForm] = useState({ role: '', location: '', remote: false, datePosted: 'month' })
  const [search, setSearch] = useState(null)
  const [quota, setQuota] = useState(null)   // { left, perDay }
  const [status, setStatus] = useState('loading')   // loading | idle | searching | error
  const [error, setError] = useState('')
  const [saved, setSaved] = useState([])
  const [tab, setTab] = useState('matches')
  const [toast, setToast] = useState('')
  const started = useRef(false)

  const prefill = useCallback((resume, keep = {}) => {
    const profile = buildSearchProfile(resume?.data ?? {})
    setForm(current => ({ ...current, role: profile.role, location: profile.location, ...keep }))
  }, [])

  const run = useCallback(async (id, values) => {
    if (!id) return
    setStatus('searching')
    setError('')
    try {
      const result = await searchJobs({ resumeId: id, ...values })
      setSearch(result.search)
      setQuota({ left: result.searchesLeft, perDay: result.searchesPerDay })
      setStatus('idle')
      setTab('matches')
    } catch (failure) {
      setError(failure.message || 'Jobs could not be loaded.')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!pro || started.current) return
    started.current = true
    ;(async () => {
      try {
        const [list, latest, savedJobs] = await Promise.all([listResumes(), getLatestJobSearch(), listSavedJobs()])
        setResumes(list)
        setSaved(savedJobs)
        setQuota({ left: latest.searchesLeft, perDay: latest.searchesPerDay })
        const last = latest.search
        const lastResume = last && list.find(resume => resume.id === last.resumeId)
        if (last && lastResume) {
          setSearch(last)
          setResumeId(lastResume.id)
          setForm({ role: last.profile.role, location: last.profile.location, remote: last.profile.remote, datePosted: last.profile.datePosted })
          setStatus('idle')
          return
        }
        // First visit: search straight away with the most recently edited resume.
        const latestResume = list[0]
        if (!latestResume) { setStatus('idle'); return }
        setResumeId(latestResume.id)
        const profile = buildSearchProfile(latestResume.data)
        const values = { role: profile.role, location: profile.location, remote: false, datePosted: 'month' }
        setForm(values)
        await run(latestResume.id, values)
      } catch (failure) {
        setError(failure.message || 'The job tracker could not be loaded.')
        setStatus('error')
      }
    })()
  }, [pro, run])

  // After a search (or on reopening one that was still loading), read its pending boards and merge each row in as it
  // arrives. A newer search replaces this one, so late answers for an old search are dropped.
  const boardsFor = useRef('')
  useEffect(() => {
    const id = search?.searchedAt
    const pending = search?.pendingBoards ?? []
    if (!id || !pending.length || boardsFor.current === id) return
    boardsFor.current = id
    const { role, location, remote, datePosted } = search.profile
    const terms = { resumeId: search.resumeId, role, location, remote, datePosted }
    const queue = [...pending]
    const worker = async () => {
      for (let platform = queue.shift(); platform; platform = queue.shift()) {
        let row = null
        let failure = null
        try {
          ({ row, failure } = await loadJobBoard(platform, terms))
        } catch {
          failure = PLATFORM_NAMES[platform] ?? platform
        }
        setSearch(current => (current?.searchedAt === id ? withBoard(current, platform, row, failure) : current))
      }
    }
    for (let index = 0; index < BOARDS_AT_ONCE; index++) worker()
  }, [search])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  const savedKeys = useMemo(() => new Set(saved.map(job => job.key)), [saved])
  // Searches saved before search pages were dropped can hold rows with no jobs.
  const rows = useMemo(() => (search?.rows ?? []).filter(row => row.jobs?.length), [search])
  // One opening can sit in several rows (found on several boards); counts and top picks take it once, by its title
  // and employer (or its key when either is missing).
  const total = useMemo(() => new Set(rows.flatMap(row => row.jobs.map(openingOf))).size, [rows])
  const pendingBoards = search?.pendingBoards ?? []
  // Top picks across boards: each job once, with every board's apply link; the first is the highest match.
  const picks = useMemo(() => {
    const byOpening = new Map()
    for (const row of rows) for (const job of row.jobs) {
      if (job.score === null) continue
      const id = openingOf(job)
      const entry = byOpening.get(id) ?? byOpening.set(id, { job, links: [] }).get(id)
      if (job.score > entry.job.score) entry.job = job
      if (!entry.links.some(link => link.platform === job.platform)) entry.links.push({ platform: job.platform, url: job.url })
    }
    return [...byOpening.values()].sort((a, b) => b.job.score - a.job.score).slice(0, TOP_PICKS)
  }, [rows])
  const highestKey = picks[0]?.job.key ?? null

  const toggleSave = async job => {
    if (savedKeys.has(job.key)) {
      const previous = saved
      setSaved(previous.filter(item => item.key !== job.key))
      try { await deleteSavedJob(job.key) } catch (failure) { setSaved(previous); setToast(failure.message || 'Could not remove this job.') }
      return
    }
    const draft = { key: job.key, title: job.title, company: job.company, location: job.location, logo: job.logo, url: job.url, platform: job.platform, type: job.type, salary: typeof job.salary === 'string' ? job.salary : job.salary ? `${job.salary.text}${job.salary.kind === 'posted' ? '' : ' (est.)'}` : '', postedAt: job.postedAt, score: job.score, resumeId: search?.resumeId ?? null, status: 'saved', notes: '' }
    setSaved(current => [draft, ...current])
    try {
      const stored = await saveJob(job.key, draft)
      setSaved(current => current.map(item => (item.key === job.key ? stored : item)))
      setToast('Saved to My applications')
    } catch (failure) {
      setSaved(current => current.filter(item => item.key !== job.key))
      setToast(failure.message || 'Could not save this job.')
    }
  }

  const changeSaved = async (job, changes) => {
    const previous = saved
    setSaved(current => current.map(item => (item.key === job.key ? { ...item, ...changes } : item)))
    try {
      const stored = await updateSavedJob(job.key, changes)
      setSaved(current => current.map(item => (item.key === job.key ? stored : item)))
    } catch (failure) {
      setSaved(previous)
      setToast(failure.message || 'Could not update this job.')
    }
  }

  const removeSaved = async job => {
    const previous = saved
    setSaved(previous.filter(item => item.key !== job.key))
    try { await deleteSavedJob(job.key) } catch (failure) { setSaved(previous); setToast(failure.message || 'Could not remove this job.') }
  }

  if (planLoading) return <div className="jobs-page"><div className="jobs-hero is-loading" aria-busy="true" /></div>
  if (!pro) return <LockedTracker />

  const searching = status === 'searching'
  const noResumes = Array.isArray(resumes) && resumes.length === 0
  const submit = event => { event.preventDefault(); run(resumeId, form) }

  return <div className="jobs-page">
    <section className="jobs-hero">
      <div className="jobs-hero-copy">
        <span className="jobs-eyebrow">Career tools · Job tracker</span>
        <h1>Openings that fit <em>your resume</em></h1>
        <p>We search LinkedIn, Naukri, Indeed, Glassdoor and more with your role and skills, then rank every opening by how well you match.</p>
      </div>
      <form className="jobs-search" onSubmit={submit} aria-label="Search for jobs">
        <label className="jobs-field is-resume">
          <DocIcon />
          <span className="sr-only">Resume</span>
          <select value={resumeId} disabled={!resumes?.length || searching} onChange={event => { const id = event.target.value; setResumeId(id); prefill(resumes.find(resume => resume.id === id)) }}>
            {!resumes && <option value="">Loading resumes…</option>}
            {resumes?.length === 0 && <option value="">No saved resumes</option>}
            {resumes?.map((resume, index) => <option key={resume.id} value={resume.id}>{resume.name}{index === 0 ? ' (latest)' : ''}</option>)}
          </select>
        </label>
        <label className="jobs-field">
          <SearchIcon />
          <span className="sr-only">Role</span>
          <input value={form.role} maxLength={80} placeholder="Role or job title" disabled={searching} onChange={event => setForm(current => ({ ...current, role: event.target.value }))} />
        </label>
        <label className="jobs-field">
          <PinIcon />
          <span className="sr-only">Location</span>
          <input value={form.location} maxLength={80} placeholder="City or country" disabled={searching || form.remote} onChange={event => setForm(current => ({ ...current, location: event.target.value }))} />
        </label>
        <button type="submit" className="jobs-go" disabled={!resumeId || searching}>{searching ? <span className="jobs-spinner" aria-hidden="true" /> : <SearchIcon />}<span>{searching ? 'Searching…' : 'Find jobs'}</span></button>
      </form>
      <div className="jobs-options">
        <label className="jobs-switch">
          <input type="checkbox" checked={form.remote} disabled={searching} onChange={event => setForm(current => ({ ...current, remote: event.target.checked }))} />
          <span aria-hidden="true" />Remote only
        </label>
        <label className="jobs-chip-select">
          <span className="sr-only">Date posted</span>
          <select value={form.datePosted} disabled={searching} onChange={event => setForm(current => ({ ...current, datePosted: event.target.value }))}>
            {DATE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {quota && <span className="jobs-quota">{quota.left} of {quota.perDay} fresh searches left today</span>}
      </div>
    </section>

    <div className="jobs-tabs" role="tablist" aria-label="Job tracker">
      <button type="button" role="tab" aria-selected={tab === 'matches'} className={tab === 'matches' ? 'is-active' : ''} onClick={() => setTab('matches')}>Matches{total ? <span>{total}</span> : null}</button>
      <button type="button" role="tab" aria-selected={tab === 'applications'} className={tab === 'applications' ? 'is-active' : ''} onClick={() => setTab('applications')}>My applications{saved.length ? <span>{saved.length}</span> : null}</button>
    </div>

    {tab === 'applications'
      ? <div role="tabpanel"><ApplicationsBoard jobs={saved} onStatus={(job, value) => changeSaved(job, { status: value })} onNotes={(job, notes) => changeSaved(job, { notes })} onRemove={removeSaved} /></div>
      : <div role="tabpanel" aria-busy={searching}>
        {error && <p className="jobs-alert" role="alert">{error}{resumeId && <button type="button" className="btn btn-secondary btn-sm" onClick={() => run(resumeId, form)}>Try again</button>}</p>}
        {noResumes && <div className="jobs-empty">
          <DocIcon />
          <h3>Save a resume first</h3>
          <p>The job tracker searches with the role, skills and location on your resume.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/workspace')}>Create a resume</button>
        </div>}
        {(status === 'loading' || searching) && <div className="jobs-skeleton" aria-label="Searching job boards">
          {[0, 1].map(row => <div key={row} className="jobs-skeleton-row"><i className="is-head" /><div>{[0, 1, 2].map(card => <i key={card} />)}</div></div>)}
        </div>}
        {!searching && search && <>
          <div className="jobs-summary">
            <div>
              <h2>{total} matching job{total === 1 ? '' : 's'} on {rows.length} board{rows.length === 1 ? '' : 's'}</h2>
              <p>Matched on <b>{search.resumeName}</b> · {search.profile.level}{search.profile.years ? `, ${search.profile.years} yrs` : ''}{search.cached ? ' · from a recent search' : ''}</p>
            </div>
            {search.profile.skills.length > 0 && <ul className="jobs-profile-skills" aria-label="Skills used for matching">{search.profile.skills.slice(0, 8).map(skill => <li key={skill}>{skill}</li>)}</ul>}
          </div>
          {search.failures.length > 0 && <p className="jobs-partial">Some boards didn’t answer this time ({search.failures.join(', ')}). The rest are below.</p>}
          {picks.length > 0 && <TopMatches picks={picks} savedKeys={savedKeys} onToggleSave={toggleSave} />}
          {rows.map(row => <PlatformRow key={row.platform} row={row} savedKeys={savedKeys} highestKey={highestKey} onToggleSave={toggleSave} />)}
          {pendingBoards.length > 0 && <div className="jobs-skeleton jobs-skeleton-boards" role="status" aria-label={`Reading ${pendingBoards.map(id => PLATFORM_NAMES[id] ?? id).join(', ')}`}>
            {pendingBoards.map(id => <div key={id} className="jobs-skeleton-row">
              <p className="jobs-skeleton-label"><PlatformMark platform={id} />Reading {PLATFORM_NAMES[id] ?? id}…</p>
              <div>{[0, 1, 2].map(card => <i key={card} />)}</div>
            </div>)}
          </div>}
          {!rows.length && !pendingBoards.length && <div className="jobs-empty"><SearchIcon /><h3>No openings for this search</h3><p>Try a broader role, another city, or a longer date range.</p></div>}
        </>}
      </div>}
    {toast && <p className="jobs-toast" role="status">{toast}</p>}
  </div>
}
