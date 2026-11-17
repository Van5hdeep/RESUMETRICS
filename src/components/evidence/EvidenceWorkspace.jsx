import { Fragment, useEffect, useMemo, useState } from 'react'
import ScoreRing from '../charts/ScoreRing.jsx'
import LanguageDonut, { formatBytes, OTHER_KEY, useStableLanguageColours } from '../charts/LanguageDonut.jsx'
import { evidenceScore, languageTotals, skillEvidence, STRONG_EVIDENCE_PERCENT, WEAK_EVIDENCE_PERCENT } from '../../../shared/githubEvidenceMath.js'
import { skillKey } from '../../../shared/skillTaxonomy.js'
import { loadResumeFont } from '../../editor/fontRegistry.js'
import { Icon, NavItem, Toggle, scoreColour } from '../product/ProductUI.jsx'
import { safeLinkUrl } from '../../utils/safeUrl.js'

const STATUS = {
  strong: { label: 'Strong', tone: 'found', side: 'good' },
  moderate: { label: 'Some', tone: 'found', side: 'good' },
  weak: { label: 'Too little', tone: 'buried', side: 'warn' },
  mentioned: { label: 'README only', tone: 'buried', side: 'warn' },
  none: { label: 'Not found', tone: 'missing', side: 'bad' }
}
// Bar colours follow the status pills: teal for backed, lighter teal for some, orange for too little.
const SHARE_COLOUR = { strong: '#22A699', moderate: '#6CCBBF', weak: '#F08A3E', mentioned: '#F08A3E', none: '#E2483D' }
const SOURCE = { language: 'Language', manifest: 'Dependency', readme: 'README only' }
const relativeDate = value => {
  if (!value) return ''
  const days = Math.round((Date.now() - new Date(value).getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  if (days < 365) return `${Math.round(days / 30)} mo ago`
  return `${Math.round(days / 365)} yr ago`
}
const verdictFor = (score, backed, total) => {
  if (!total) return { label: 'No skills to check.', text: 'Add skills to your resume, then scan again to see which ones your code backs up.' }
  if (score >= 75) return { label: 'Well backed.', text: `${backed} of ${total} skills on your resume show up clearly in your code.` }
  if (score >= 50) return { label: 'Partly backed.', text: `${backed} of ${total} skills on your resume show up in your code; the rest have little or no code behind them.` }
  return { label: 'Little code behind your skills.', text: `Only ${backed} of ${total} skills on your resume show up in your code.` }
}

/**
 * GitHub evidence (PLAN-032) in the same shell as Job tailoring: bar, sidebar (score + skills),
 * workspace (start states, hero, Skills / Languages / Repositories) and a preview (resume | scan activity).
 * github: { connected, connecting, login, onConnect, scan, onScan, onCancel, staleSkills, onForget }
 */
export default function EvidenceWorkspace({ github, resumeCanvas, resumeName, templateName, onBack, onOpenEditor }) {
  useEffect(() => { loadResumeFont('Figtree') }, [])
  const scan = github.scan
  const repos = scan?.repos ?? []
  const scanning = scan?.status === 'scanning'
  const { totalBytes, languages } = useMemo(() => languageTotals(repos), [repos])
  const skills = useMemo(() => skillEvidence(scan?.resumeSkills ?? [], repos), [repos, scan?.resumeSkills])
  const summary = useMemo(() => evidenceScore(skills), [skills])
  const colours = useStableLanguageColours(languages)
  const [view, setView] = useState('skills')
  const [language, setLanguage] = useState(null)
  const [focusSkill, setFocusSkill] = useState(null)
  const [preview, setPreview] = useState('resume')
  const [previewOpen, setPreviewOpen] = useState(false)
  const stage = !github.connected ? 'connect' : !scan || (scan.status !== 'scanning' && !repos.length) ? 'scan' : 'report'
  const pickLanguage = name => { setLanguage(current => current === name ? null : name); setView('repos') }
  const openSkill = name => { setFocusSkill(name); setView('skills') }
  const groups = [
    ['Backed by code', skills.filter(skill => STATUS[skill.status].side === 'good')],
    ['Needs more proof', skills.filter(skill => STATUS[skill.status].side === 'warn')],
    ['Not found in code', skills.filter(skill => STATUS[skill.status].side === 'bad')]
  ]

  return <div className={`tw tw-evidence${previewOpen ? ' is-preview-open' : ''}`}>
    <header className="tw-bar">
      <button type="button" className="tw-bar-icon" onClick={onBack} aria-label="Back to the editor" title="Back to the editor"><Icon name="back" size={18} /></button>
      <div className="tw-bar-title"><b>Evidence with GitHub</b><span>{resumeName}</span></div>
      {github.connected && <div className="tw-bar-job"><Icon name="github" /><span><b>{github.login || 'GitHub'}</b> connected</span></div>}
      <div className="tw-bar-actions">
        <button type="button" className="tw-btn tw-btn-on-dark tw-preview-toggle" onClick={() => setPreviewOpen(open => !open)} aria-expanded={previewOpen}><Icon name="resume" />{previewOpen ? 'Hide preview' : 'Preview'}</button>
        {stage === 'report' && (scanning
          ? <button type="button" className="tw-btn tw-btn-on-dark" onClick={github.onCancel}><Icon name="stop" />Stop scan</button>
          : <button type="button" className="tw-btn tw-btn-on-dark" onClick={github.onScan}><Icon name="refresh" />Scan again</button>)}
        <button type="button" className="tw-btn tw-btn-primary" onClick={onOpenEditor}><Icon name="open" />Open in editor</button>
      </div>
    </header>

    <div className="tw-body">
      <aside className="tw-side" aria-label="Evidence summary">
        <div className="tw-side-score">
          {stage === 'report'
            ? <><ScoreRing score={summary.score} runId={scan.startedAt} label="" size={104} stroke={9} colourFor={scoreColour} /><span className="tw-side-score-label">Code evidence</span></>
            : <div className="tw-side-empty"><span>–</span><small>Code evidence</small></div>}
        </div>
        {stage !== 'report'
          ? <ol className="tw-steps">
            {[['connect', 'Connect GitHub'], ['scan', 'Scan repositories'], ['report', 'See your evidence']].map(([id, label], index) => {
              const order = ['connect', 'scan', 'report']
              const state = order.indexOf(id) < order.indexOf(stage) ? 'done' : id === stage ? 'current' : 'todo'
              return <li key={id} className={`is-${state}`} aria-current={state === 'current' ? 'step' : undefined}><span className="tw-step-dot">{state === 'done' ? <Icon name="check" size={12} /> : index + 1}</span>{label}</li>
            })}
          </ol>
          : <nav className="tw-nav" aria-label="Skills">
            {groups.map(([title, list]) => list.length > 0 && <Fragment key={title}>
              <p className="tw-nav-head">{title}<span>{list.length}</span></p>
              {list.map(skill => <NavItem key={skill.name} icon="code" label={skill.name} active={view === 'skills' && focusSkill === skill.name} onClick={() => openSkill(skill.name)}
                value={skill.share ? `${skill.share}%` : STATUS[skill.status].label} tone={STATUS[skill.status].side} />)}
            </Fragment>)}
            {!skills.length && <p className="tw-nav-note">Your resume has no skills to check yet.</p>}
          </nav>}
      </aside>

      <main className="tw-main" aria-label="GitHub evidence">
        {stage === 'connect' && <StartCard title="Connect GitHub" action={github.connecting ? 'Connecting…' : 'Connect GitHub'} onAction={github.onConnect} disabled={github.connecting}
          lead="See which skills on your resume your code actually backs up. Recruiters often check GitHub; this shows you what they'll find first."
          points={['Read-only access: we never change your repositories', 'Your 25 most recently updated repositories are checked', 'You choose what to do with the results']} />}
        {stage === 'scan' && <StartCard title="Scan your repositories" action="Scan repositories" onAction={github.onScan}
          lead="We'll read the languages, dependency files (package.json, requirements.txt and similar) and READMEs of your 25 most recently updated repositories, then compare them with the skills on your resume."
          points={['Takes about a minute', `Skills with under ${WEAK_EVIDENCE_PERCENT}% of your code count as too little evidence`, 'Nothing on your resume changes']} error={scan?.error} />}
        {stage === 'report' && <>
          <EvidenceHero scan={scan} summary={summary} scanning={scanning} staleSkills={github.staleSkills ?? []} onScan={github.onScan} onForget={github.onForget} />
          {scan.error && <p className="tw-note" role="alert">{scan.error}</p>}
          <div className="tw-tabs" role="tablist" aria-label="Evidence">
            {[['skills', 'shield', 'Skills'], ['languages', 'chart', 'Languages'], ['repos', 'repo', 'Repositories']].map(([id, icon, label]) =>
              <button key={id} type="button" role="tab" id={`ev-tab-${id}`} aria-controls={`ev-panel-${id}`} aria-selected={view === id} onClick={() => setView(id)}><Icon name={icon} size={15} />{label}</button>)}
          </div>
          <div id={`ev-panel-${view}`} role="tabpanel" aria-labelledby={`ev-tab-${view}`} className="tw-panel">
            {view === 'skills' && <SkillTable skills={skills} repos={repos} focus={focusSkill} onFocus={setFocusSkill} scanning={scanning} />}
            {view === 'languages' && <Languages languages={languages} totalBytes={totalBytes} repoCount={repos.length} colours={colours} active={language} onPick={pickLanguage} onSelect={setLanguage} />}
            {view === 'repos' && <RepoList repos={repos} skills={skills} colours={colours} language={language} onClearLanguage={() => setLanguage(null)} scanning={scanning} scan={scan} />}
          </div>
        </>}
      </main>

      <section className="tw-preview" aria-label="Preview">
        <div className="tw-pills" role="tablist" aria-label="Preview">
          {[['resume', 'resume', 'Your resume'], ['activity', 'history', 'Scan activity']].map(([id, icon, label]) =>
            <button key={id} type="button" role="tab" aria-selected={preview === id} onClick={() => setPreview(id)} disabled={id === 'activity' && !scan}><Icon name={icon} size={14} />{label}</button>)}
        </div>
        <div className="tw-preview-body">
          {preview === 'activity' && scan
            ? <ScanActivity scan={scan} colours={colours} />
            : <div className="tw-resume"><p className="tw-pane-label">Your resume<span>{templateName}</span></p>{resumeCanvas}</div>}
        </div>
      </section>
    </div>
  </div>
}

function StartCard({ title, lead, points, action, onAction, disabled, error }) {
  return <section className="tw-card ev-start" aria-labelledby="ev-start-title">
    <span className="ev-start-mark" aria-hidden="true"><Icon name="github" size={26} /></span>
    <h1 id="ev-start-title" className="tw-h1">{title}</h1>
    <p className="tw-lead">{lead}</p>
    <ul className="ev-points">{points.map(point => <li key={point}><Icon name="check" size={15} />{point}</li>)}</ul>
    {error && <p className="tw-error" role="alert">{error}</p>}
    <div className="tw-actions"><button type="button" className="tw-btn tw-btn-primary tw-btn-lg" onClick={onAction} disabled={disabled}><Icon name="github" />{action}</button></div>
  </section>
}

function EvidenceHero({ scan, summary, scanning, staleSkills = [], onScan, onForget }) {
  const verdict = verdictFor(summary.score, summary.backed, summary.total)
  const weak = summary.counts.weak + summary.counts.mentioned
  return <section className="tw-hero" aria-labelledby="ev-hero-title">
    <div className="tw-hero-tabs" aria-hidden="true"><span className="is-active">Code evidence</span>{scan.accessible > (scan.cap ?? 25) && <span>{scan.cap ?? 25} of {scan.accessible} repositories</span>}</div>
    <div className="tw-hero-body">
      <div className="tw-hero-ring"><ScoreRing score={summary.score} runId={scan.startedAt} label="" size={128} stroke={11} colourFor={scoreColour} /></div>
      <div className="tw-hero-text">
        <h2 id="ev-hero-title"><b>{verdict.label}</b> {verdict.text}</h2>
        <p>{weak > 0 ? `${weak} more ${weak === 1 ? 'has' : 'have'} too little code to count (under ${WEAK_EVIDENCE_PERCENT}% of your code, or only a README mention). ` : ''}Strong means at least {STRONG_EVIDENCE_PERCENT}% of your code.</p>
        {scanning
          ? <div className="ev-progress" aria-live="polite">
            <span className="ev-progress-text"><span className="tw-spinner" aria-hidden="true" />Reading {scan.current || 'your repositories'} · {scan.done} of {scan.total || 25}</span>
            <span className="ev-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={scan.percent} aria-label="Scan progress"><span style={{ width: `${scan.percent}%` }} /></span>
          </div>
          : <>
            <p className="ev-done">{scan.status === 'cancelled' ? `Stopped after ${scan.done} of ${scan.total} repositories, so this is a partial result.` : `${scan.done} repositories read${scan.scannedAt ? `, ${relativeDate(scan.scannedAt) === 'today' ? 'today' : relativeDate(scan.scannedAt)}` : ''}.`}{onForget && scan.scannedAt && <> <button type="button" className="ev-link" onClick={onForget}>Forget this report</button></>}</p>
            {staleSkills.length > 0 && <p className="tw-note ev-stale" role="status">{staleSkills.length === 1 ? `${staleSkills[0]} was added` : `${staleSkills.slice(0, 3).join(', ')}${staleSkills.length > 3 ? ` and ${staleSkills.length - 3} more were` : ' were'} added`} to your resume after this scan, so {staleSkills.length === 1 ? 'it isn’t' : 'they aren’t'} checked here. {onScan && <button type="button" className="ev-link" onClick={onScan}>Scan again</button>}</p>}
          </>}
      </div>
    </div>
  </section>
}

function SkillTable({ skills, repos, focus, onFocus, scanning }) {
  const [showBacked, setShowBacked] = useState(true)
  const [proofOnly, setProofOnly] = useState(false)
  const shown = skills.filter(skill => (showBacked || STATUS[skill.status].side !== 'good') && (!proofOnly || STATUS[skill.status].side !== 'good'))
  useEffect(() => { if (focus) document.getElementById(`ev-skill-${skillKey(focus)}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [focus])
  if (!skills.length) return <p className="tw-empty">Your resume has no skills to compare. Add some in the editor, then scan again.</p>
  return <div className="tw-report">
    <p className="tw-lead">How much of your code uses each skill on your resume. Open a skill to see the repositories behind it.</p>
    <div className="tw-toolbar">
      <Toggle label="Show backed skills" checked={showBacked} onChange={setShowBacked} />
      <Toggle label="Needs proof only" checked={proofOnly} onChange={setProofOnly} />
    </div>
    <table className="tw-table ev-skill-table">
      <thead><tr><th scope="col">Skill</th><th scope="col">Share of code</th><th scope="col" className="tw-num">Repos</th><th scope="col">Found in</th><th scope="col">Status</th></tr></thead>
      <tbody>{shown.map(skill => {
        const open = focus === skill.name
        const status = STATUS[skill.status]
        return <Fragment key={skill.name}>
          <tr id={`ev-skill-${skillKey(skill.name)}`} className={`ev-skill-row${open ? ' is-open' : ''}`} onClick={() => onFocus(open ? null : skill.name)}>
            <th scope="row"><button type="button" className="ev-expand" aria-expanded={open} onClick={event => { event.stopPropagation(); onFocus(open ? null : skill.name) }}><Icon name="chevron" size={14} />{skill.name}</button></th>
            <td><span className="ev-share"><span className="ev-share-track"><span style={{ width: `${Math.min(100, skill.share * 2)}%`, background: SHARE_COLOUR[skill.status] }} /></span><b>{skill.share ? `${skill.share}%` : '–'}</b></span></td>
            <td className="tw-num">{skill.repos.length}</td>
            <td className="tw-muted">{SOURCE[skill.source] ?? '–'}</td>
            <td><span className={`tw-status is-${status.tone}`}>{status.label}</span></td>
          </tr>
          {open && <tr className="ev-skill-detail"><td colSpan={5}>
            {skill.repos.length
              ? <><p>{skill.source === 'readme' ? 'Mentioned only in the README of:' : `Backed by ${skill.repos.length} ${skill.repos.length === 1 ? 'repository' : 'repositories'}:`}</p>
                <div className="tw-chips">{skill.repos.map(name => { const repo = repos.find(item => item.name === name); return <a key={name} className="tw-chip ev-repo-chip" href={safeLinkUrl(repo?.url)} target="_blank" rel="noreferrer"><Icon name="repo" size={13} />{name}</a> })}</div></>
              : <p>{scanning ? 'Not seen yet. The scan is still running.' : 'No code, dependency file or README in your recent repositories uses this skill.'}</p>}
            {(skill.status === 'weak' || skill.status === 'mentioned' || skill.status === 'none') && !scanning && <p className="ev-advice">{skill.status === 'none' ? 'If you use it, push a project that shows it; otherwise consider removing it from your resume.' : 'Push a project that uses it more, or keep it lower on your skills list.'}</p>}
          </td></tr>}
        </Fragment>
      })}</tbody>
    </table>
    {!shown.length && <p className="tw-empty">Every skill on your resume is backed by your code.</p>}
  </div>
}

function Languages({ languages, totalBytes, repoCount, colours, active, onPick, onSelect }) {
  if (!languages.length) return <p className="tw-empty">No code found yet.</p>
  return <div className="ev-languages">
    <p className="tw-lead">Your code by language, measured in bytes across the repositories scanned. Choose a language to see its repositories.</p>
    <div className="ev-lang-grid">
      <LanguageDonut languages={languages} totalBytes={totalBytes} repoCount={repoCount} colours={colours} active={active} onSelect={onSelect} size={200} />
      <table className="tw-table">
        <thead><tr><th scope="col">Language</th><th scope="col" className="tw-num">Share</th><th scope="col" className="tw-num">Size</th><th scope="col" className="tw-num">Repos</th></tr></thead>
        <tbody>{languages.slice(0, 10).map(entry => <tr key={entry.name} className={active === entry.name ? 'is-active' : ''}>
          <th scope="row"><button type="button" className="ev-lang-btn" onClick={() => onPick(entry.name)}><i style={{ background: colours.colourOf(entry.name) }} />{entry.name}</button></th>
          <td className="tw-num">{entry.share}%</td>
          <td className="tw-num">{formatBytes(entry.bytes)}</td>
          <td className="tw-num">{entry.repos}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>
}

function RepoList({ repos, skills, colours, language, onClearLanguage, scanning, scan }) {
  const backedBy = name => skills.filter(skill => skill.source !== 'readme' && skill.repos.includes(name)).map(skill => skill.name)
  const shown = language ? repos.filter(repo => Object.keys(repo.languages ?? {}).some(name => language === OTHER_KEY ? !colours.top.includes(name) : name === language)) : repos
  return <div className="ev-repos">
    <div className="tw-toolbar ev-repo-toolbar">
      <p className="tw-lead">Only your {scan.cap ?? 25} most recently updated repositories are scanned.</p>
      {language && <button type="button" className="tw-chip ev-filter" onClick={onClearLanguage} aria-label={`Clear the ${language === OTHER_KEY ? 'Other' : language} filter`}><i style={{ background: colours.colourOf(language) }} />{language === OTHER_KEY ? 'Other' : language}<span aria-hidden="true">×</span></button>}
    </div>
    <ul className="ev-repo-list">{shown.map(repo => {
      const total = Object.values(repo.languages ?? {}).reduce((sum, bytes) => sum + bytes, 0)
      const backed = backedBy(repo.name)
      return <li key={repo.fullName ?? repo.name}>
        <div className="ev-repo-head">
          <a href={safeLinkUrl(repo.url)} target="_blank" rel="noreferrer">{repo.name}</a>
          {repo.private && <span className="ev-badge">Private</span>}
          {repo.fork && <span className="ev-badge">Fork</span>}
          {repo.archived && <span className="ev-badge">Archived</span>}
          <span className="ev-repo-meta">{repo.stars > 0 && <span><Icon name="star" size={13} />{repo.stars}</span>}<span>{relativeDate(repo.pushedAt)}</span></span>
        </div>
        {repo.description && <p className="ev-repo-desc">{repo.description}</p>}
        <span className="ev-repo-bar" aria-label={Object.entries(repo.languages ?? {}).map(([name, bytes]) => `${name} ${Math.round(bytes / (total || 1) * 100)}%`).join(', ') || 'No code'} role="img">
          {Object.entries(repo.languages ?? {}).sort((a, b) => b[1] - a[1]).map(([name, bytes]) => <span key={name} style={{ width: `${bytes / (total || 1) * 100}%`, background: colours.colourOf(name) }} title={`${name} ${Math.round(bytes / (total || 1) * 100)}%`} />)}
        </span>
        {backed.length > 0 && <div className="tw-chips ev-backs"><span className="tw-muted">Backs</span>{backed.map(name => <span key={name} className="tw-chip is-added">{name}</span>)}</div>}
      </li>
    })}</ul>
    {!shown.length && <p className="tw-empty">{scanning ? 'Repositories appear here as they are read.' : 'No repositories match this filter.'}</p>}
  </div>
}

function ScanActivity({ scan, colours }) {
  const items = [...(scan.repos ?? [])].reverse()
  return <div className="ev-activity">
    <p className="tw-pane-label">Scan activity<span>{scan.status === 'scanning' ? `${scan.done} of ${scan.total || 25}` : `${scan.done} read`}</span></p>
    {scan.status === 'scanning' && <p className="ev-activity-now"><span className="tw-spinner" aria-hidden="true" />Reading {scan.current || 'the next repository'}</p>}
    <ol className="tw-log">
      {(scan.errors ?? []).map((error, index) => <li key={`error-${index}`} className="is-error"><span className="tw-log-mark ev-log-error">!</span><div><b>{error.repo ?? 'Repository'}</b><span>{error.message ?? 'Could not be read'}</span></div></li>)}
      {items.map(repo => <li key={repo.fullName ?? repo.name}>
        <span className="tw-log-mark"><Icon name="check" size={13} /></span>
        <div><b>{repo.name}</b><span>{Object.keys(repo.languages ?? {}).slice(0, 3).join(', ') || 'No code'}{repo.filesChecked?.length ? ` · read ${repo.filesChecked.join(', ')}` : ''}</span></div>
        <span className="ev-activity-dot" style={{ background: colours.colourOf(Object.entries(repo.languages ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '') }} aria-hidden="true" />
      </li>)}
    </ol>
  </div>
}
