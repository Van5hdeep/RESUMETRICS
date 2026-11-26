import { useEffect, useMemo, useRef, useState } from 'react'
import ScoreRing from '../charts/ScoreRing.jsx'
import ScoreSpotlight from './ScoreSpotlight.jsx'
import JdHighlight from './JdHighlight.jsx'
import { scoreKeywords, TARGET_SCORE, verdictFor } from '../../../shared/jdKeywords.js'
import { assessJobFit, fitVerdict } from '../../../shared/jobFit.js'
import { textHasTerm } from '../../../shared/jdScoring.js'
import { addedWords, describeFixChanges } from '../../jd/fixPreview.js'
import { loadResumeFont } from '../../editor/fontRegistry.js'
import { Icon, NavItem, Toggle, scoreColour as tailorScoreColour } from '../product/ProductUI.jsx'

const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'
const GROUP_NAMES = { hard: 'Hard skill', keyword: 'Requirement', soft: 'Soft skill' }

/**
 * Job tailoring (PLAN-031): bar, sidebar (score + fixes), workspace (job post → keywords → report)
 * and a preview pane (side by side, job post, resume, changes). `resumeCanvas` is the live template.
 */
export default function TailorWorkspace({ analysis, resumeData, jobMatch, draft, onDraftChange, onExecuteFix, onUndoFix, onAnswerFix, resumeCanvas, resumeName, templateName, onBack, onOpenEditor, onWriteLetter, onFindJobs }) {
  useEffect(() => { loadResumeFont('Figtree') }, [])
  const stage = !analysis?.jd || !Array.isArray(analysis.keywords) ? 'post' : analysis.step === 'results' ? 'report' : 'keywords'
  const [view, setView] = useState('keywords')
  const [fixId, setFixId] = useState(null)
  const [preview, setPreview] = useState('side')
  const [previewOpen, setPreviewOpen] = useState(false)
  useEffect(() => { if (stage !== 'report') setView('keywords') }, [stage])

  const live = useMemo(() => stage === 'report' ? scoreKeywords(resumeData ?? {}, analysis.keywords) : null, [stage, resumeData, analysis?.keywords])
  const fixState = analysis?.fixState ?? {}
  const skipped = analysis?.skipped ?? {}
  const allFixes = analysis?.fixes ?? []
  const executable = allFixes.filter(fix => fix.kind === 'executable')
  const impacts = useMemo(() => Object.fromEntries(executable.map(fix => [fix.id, fixState[fix.id]?.status === 'done' ? null : jobMatch.impactOf(fix, resumeData ?? {}, analysis?.keywords ?? [])])), [executable, fixState, resumeData, analysis?.keywords]) // eslint-disable-line react-hooks/exhaustive-deps
  // Largest gain first, decided once when the fixes arrive, so the order doesn't jump as fixes are applied.
  const orderRef = useRef({ key: '', ids: [] })
  const fixKey = executable.map(fix => fix.id).join('|')
  if (orderRef.current.key !== fixKey) {
    const known = orderRef.current.ids.filter(id => executable.some(fix => fix.id === id))
    const fresh = executable.filter(fix => !known.includes(fix.id)).sort((a, b) => (impacts[b.id] ?? -1) - (impacts[a.id] ?? -1)).map(fix => fix.id)
    orderRef.current = { key: fixKey, ids: [...known, ...fresh] }
  }
  const ordered = orderRef.current.ids.map(id => executable.find(fix => fix.id === id)).filter(Boolean)
  const currentFix = ordered.find(fix => fix.id === fixId) ?? ordered.find(fix => fixState[fix.id]?.status !== 'done') ?? ordered[0]
  const applied = executable.filter(fix => fixState[fix.id]?.status === 'done')
  // What each fix changed, kept from before it was applied so "What changed" still shows the old text.
  const changeCache = useRef(new Map())
  useEffect(() => { changeCache.current = new Map() }, [analysis?.runId])
  const openFix = fix => { setView('fixes'); setFixId(fix.id) }

  // "+N" beside the score after each change, and the spotlight after the last one.
  const [delta, setDelta] = useState(null)
  const previous = useRef(live?.score ?? null)
  useEffect(() => {
    if (live == null) return undefined
    const change = previous.current == null ? 0 : live.score - previous.current
    previous.current = live.score
    if (!change) return undefined
    setDelta(change)
    const timer = window.setTimeout(() => setDelta(null), 2200)
    return () => window.clearTimeout(timer)
  }, [live?.score]) // eslint-disable-line react-hooks/exhaustive-deps
  const ringRef = useRef(null)
  const [spotlight, setSpotlight] = useState(null)
  const allApplied = executable.length > 0 && applied.length === executable.length
  const wasAllApplied = useRef(allApplied)
  useEffect(() => {
    const was = wasAllApplied.current
    wasAllApplied.current = allApplied
    if (!allApplied || was) return undefined
    const timer = window.setTimeout(() => setSpotlight({ from: analysis.baseline ?? previous.current, to: previous.current, rect: ringRef.current?.getBoundingClientRect() ?? null, count: executable.length }), 1300)
    return () => window.clearTimeout(timer)
  }, [allApplied]) // eslint-disable-line react-hooks/exhaustive-deps

  // Is this job a realistic target at all? A poor fit is said plainly instead of "aim for 85" (shared/jobFit.js).
  const reachable = useMemo(() => stage === 'report' ? jobMatch.reachableScore?.(resumeData ?? {}, analysis.keywords) ?? null : null, [stage, resumeData, analysis?.keywords, analysis?.fixes, analysis?.fixState, analysis?.fixesStatus]) // eslint-disable-line react-hooks/exhaustive-deps
  const fit = useMemo(() => live ? assessJobFit({ resume: resumeData ?? {}, jd: analysis.jd, match: live, reachable }) : null, [live, reachable, resumeData, analysis?.jd])
  const missing = live ? live.rows.filter(row => !row.found).length : 0
  const titleFound = stage === 'report' && hasJobTitle(resumeData, analysis.jd?.title)

  return <div className={`tw${previewOpen ? ' is-preview-open' : ''}`}>
    <header className="tw-bar">
      <button type="button" className="tw-bar-icon" onClick={onBack} aria-label="Back to the editor" title="Back to the editor"><Icon name="back" size={18} /></button>
      <div className="tw-bar-title"><b>Job tailoring</b><span>{resumeName}</span></div>
      {analysis?.jd && <div className="tw-bar-job" title={[analysis.jd.title, analysis.jd.company].filter(Boolean).join(' at ')}><Icon name="post" /><span><b>{analysis.jd.title}</b>{analysis.jd.company && <> at {analysis.jd.company}</>}</span></div>}
      <div className="tw-bar-actions">
        <button type="button" className="tw-btn tw-btn-on-dark tw-preview-toggle" onClick={() => setPreviewOpen(open => !open)} aria-expanded={previewOpen}><Icon name="resume" />{previewOpen ? 'Hide preview' : 'Preview'}</button>
        {analysis && <button type="button" className="tw-btn tw-btn-on-dark" onClick={jobMatch.reset}><Icon name="plus" />New job post</button>}
        {onWriteLetter && analysis?.jd && <button type="button" className="tw-btn tw-btn-on-dark" onClick={onWriteLetter}><Icon name="post" />Write a cover letter</button>}
        <button type="button" className="tw-btn tw-btn-primary" onClick={onOpenEditor}><Icon name="open" />Open in editor</button>
      </div>
    </header>

    <div className="tw-body">
      <aside className="tw-side" aria-label="Match summary">
        <div className="tw-side-score" ref={ringRef}>
          {live
            ? <><ScoreRing score={live.score} runId={analysis.runId} label="" size={104} stroke={9} colourFor={tailorScoreColour} /><span className="tw-side-score-label">Match score</span></>
            : <div className="tw-side-empty"><span>–</span><small>Match score</small></div>}
        </div>
        {stage !== 'report'
          ? <ol className="tw-steps">
            {[['post', 'Paste the job post'], ['keywords', 'Review keywords'], ['report', 'See your match']].map(([id, label], index) => {
              const order = ['post', 'keywords', 'report']
              const state = order.indexOf(id) < order.indexOf(stage) ? 'done' : id === stage ? 'current' : 'todo'
              return <li key={id} className={`is-${state}`} aria-current={state === 'current' ? 'step' : undefined}><span className="tw-step-dot">{state === 'done' ? <Icon name="check" size={12} /> : index + 1}</span>{label}</li>
            })}
          </ol>
          : <nav className="tw-nav" aria-label="Report">
            <p className="tw-nav-head">Report</p>
            <NavItem icon="key" label="Keywords" active={view === 'keywords'} onClick={() => setView('keywords')} value={missing ? `${missing} missing` : 'All found'} tone={missing ? 'bad' : 'good'} />
            <NavItem icon="title" label="Job title" active={view === 'title'} onClick={() => setView('title')} value={titleFound ? 'Found' : 'Missing'} tone={titleFound ? 'good' : 'warn'} />
            <p className="tw-nav-head">Fixes{executable.length > 0 && <span>{applied.length} of {executable.length}</span>}</p>
            {analysis.fixesStatus === 'loading' && <p className="tw-nav-note"><span className="tw-spinner" aria-hidden="true" />Preparing fixes…</p>}
            {ordered.filter(fix => fixState[fix.id]?.status !== 'done').map(fix => <NavItem key={fix.id} icon="fix" label={fix.title} active={view === 'fixes' && currentFix?.id === fix.id} onClick={() => openFix(fix)}
              value={skipped[fix.id] ? 'Skipped' : impacts[fix.id] > 0 ? `+${impacts[fix.id]}` : ''} tone={skipped[fix.id] ? 'muted' : 'warn'} />)}
            {applied.length > 0 && <><p className="tw-nav-head">Applied</p>
              {applied.map(fix => <NavItem key={fix.id} icon="check" label={fix.title} done active={view === 'fixes' && currentFix?.id === fix.id} onClick={() => openFix(fix)} />)}</>}
          </nav>}
        {stage === 'report' && <div className="tw-side-foot"><button type="button" className="tw-btn tw-btn-secondary tw-btn-block" onClick={jobMatch.editKeywords}><Icon name="key" />Edit keywords</button></div>}
      </aside>

      <main className="tw-main" aria-label="Job tailoring">
        {stage === 'post' && <JobPost draft={draft} onDraftChange={onDraftChange} jobMatch={jobMatch} />}
        {stage === 'keywords' && <KeywordReview analysis={analysis} jobMatch={jobMatch} />}
        {stage === 'report' && <>
          <ScoreHero score={live.score} found={live.found} total={live.total} baseline={analysis.baseline} delta={delta} runId={analysis.runId} fit={fit} />
          {fit?.level !== 'fit' && <FitNotice fit={fit} onFindJobs={onFindJobs} onWriteLetter={onWriteLetter} />}
          <div className="tw-tabs" role="tablist" aria-label="Report">
            {[['keywords', 'key', 'Keywords'], ['fixes', 'fix', 'Fixes'], ['title', 'title', 'Job title']].map(([id, icon, label]) => <button key={id} type="button" role="tab" id={`tw-tab-${id}`} aria-controls={`tw-panel-${id}`} aria-selected={view === id} onClick={() => setView(id)}><Icon name={icon} size={15} />{label}</button>)}
          </div>
          <div id={`tw-panel-${view}`} role="tabpanel" aria-labelledby={`tw-tab-${view}`} className="tw-panel">
            {view === 'keywords' && <KeywordReport rows={live.rows} fixes={ordered} fixState={fixState} onOpenFix={openFix} />}
            {view === 'fixes' && <FixCard cache={changeCache.current} analysis={analysis} ordered={ordered} index={Math.max(0, ordered.indexOf(currentFix))} onIndex={position => setFixId(ordered[position]?.id ?? null)} impacts={impacts} resumeData={resumeData} jobMatch={jobMatch} onExecuteFix={onExecuteFix} onUndoFix={onUndoFix} onAnswerFix={onAnswerFix} />}
            {view === 'title' && <JobTitleCheck cache={changeCache.current} jd={analysis.jd} found={titleFound} resumeData={resumeData} jobMatch={jobMatch} onExecuteFix={onExecuteFix} onUndoFix={onUndoFix} fixState={fixState} impactOf={fix => jobMatch.impactOf(fix, resumeData ?? {}, analysis.keywords)} />}
          </div>
        </>}
      </main>

      <section className="tw-preview" aria-label="Preview">
        <div className="tw-pills" role="tablist" aria-label="Preview">
          {[['side', 'split', 'Side by side'], ['post', 'post', 'Job post'], ['resume', 'resume', 'Your resume'], ['changes', 'history', 'Changes']].map(([id, icon, label]) =>
            <button key={id} type="button" role="tab" aria-selected={preview === id} onClick={() => setPreview(id)} disabled={id !== 'resume' && !analysis?.jobText}><Icon name={icon} size={14} />{label}</button>)}
        </div>
        <div className="tw-preview-body">
          {preview === 'changes' && analysis?.jobText
            ? <ChangeLog applied={applied} resumeData={resumeData} onUndoFix={onUndoFix} />
            : <>
              {(preview === 'side' || preview === 'post') && analysis?.jobText && <div className={`tw-post${preview === 'side' ? ' is-compact' : ''}`}><p className="tw-pane-label">Job post</p><JdHighlight analysis={analysis} resumeData={resumeData} /></div>}
              {(preview === 'resume' || preview === 'side' || !analysis?.jobText) && <div className="tw-resume"><p className="tw-pane-label">Your resume<span>{templateName} · updates as you apply fixes</span></p>{resumeCanvas}</div>}
            </>}
        </div>
      </section>
    </div>
    {spotlight && <ScoreSpotlight {...spotlight} colourFor={tailorScoreColour} onClose={() => setSpotlight(null)} />}
  </div>
}

function hasJobTitle(resume, title) {
  if (!title) return true
  const text = [resume?.headline, ...(resume?.experience ?? []).map(item => item?.role)].filter(Boolean).join('\n')
  return textHasTerm(text, title)
}

function JobPost({ draft, onDraftChange, jobMatch }) {
  const fileRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const ready = draft.trim().length >= 40 || jobMatch.file
  return <section className={`tw-card tw-post-card${dragging ? ' is-dragging' : ''}`} aria-labelledby="tw-post-title"
    onDragOver={event => { if (event.dataTransfer?.types?.includes('Files')) { event.preventDefault(); setDragging(true) } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
    onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files?.[0]; if (file) jobMatch.setFile(file) }}>
    <h1 id="tw-post-title" className="tw-h1">Paste the job post</h1>
    <p className="tw-lead">Include the requirements and what you would do. We pick out the skills and phrases employers screen for, then check your resume for each one.</p>
    <label className="tw-label" htmlFor="tw-post-text">Job post</label>
    <textarea id="tw-post-text" className="tw-textarea" value={draft} onChange={event => onDraftChange(event.target.value)} maxLength={20000} rows={14} disabled={jobMatch.busy}
      placeholder={'Security Officer at Sentinel Protection Services\n\nWhat you will do\n• Patrol the site and monitor CCTV\n• Write clear incident reports\n\nRequirements\n• 2+ years in security\n• Valid guard licence'} />
    {jobMatch.file && <p className="tw-file"><Icon name="doc" /><span>{jobMatch.file.name}</span><button type="button" className="tw-btn tw-btn-quiet" onClick={() => jobMatch.setFile(null)}>Remove</button></p>}
    {jobMatch.error && <p className="tw-error" role="alert">{jobMatch.error}</p>}
    <div className="tw-actions">
      <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) jobMatch.setFile(file) }} />
      <button type="button" className="tw-btn tw-btn-secondary" onClick={() => fileRef.current?.click()} disabled={jobMatch.busy}><Icon name="clip" />Attach a file</button>
      <span className="tw-hint">{draft.length ? `${draft.length.toLocaleString()} characters` : 'PDF, Word or plain text'}</span>
      <button type="button" className="tw-btn tw-btn-primary tw-btn-lg" onClick={jobMatch.parse} disabled={!ready || jobMatch.busy}>{jobMatch.busy ? <><span className="tw-spinner is-light" aria-hidden="true" />Reading the file</> : 'Find keywords'}</button>
    </div>
  </section>
}

function KeywordReview({ analysis, jobMatch }) {
  const [filter, setFilter] = useState('all')
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState('')
  const keywords = analysis.keywords
  const shown = keywords.filter(keyword => filter === 'all' || keyword.group === filter)
  const selected = keywords.filter(keyword => keyword.selected).length
  const allShownOn = shown.every(keyword => keyword.selected)
  const add = () => {
    if (!custom.trim()) return
    if (jobMatch.addKeyword(custom)) { setCustom(''); setNote('') } else setNote('That keyword is already in the list.')
  }
  const counts = { all: keywords.length, hard: keywords.filter(k => k.group === 'hard').length, keyword: keywords.filter(k => k.group === 'keyword').length, soft: keywords.filter(k => k.group === 'soft').length }
  return <section className="tw-card" aria-labelledby="tw-kw-title">
    <h1 id="tw-kw-title" className="tw-h1">Review the keywords</h1>
    <p className="tw-lead">We found {keywords.length} in “{analysis.jd.title}”. Untick anything that doesn't matter for this job; your match score is based on what stays ticked.</p>
    <div className="tw-filter" role="group" aria-label="Show">
      {[['all', 'All'], ['hard', 'Hard skills'], ['keyword', 'Requirements'], ['soft', 'Soft skills']].filter(([id]) => counts[id]).map(([id, label]) =>
        <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<span>{counts[id]}</span></button>)}
    </div>
    <table className="tw-table tw-table-select">
      <thead><tr>
        <th scope="col" className="tw-col-check"><input type="checkbox" aria-label={allShownOn ? 'Untick all shown' : 'Tick all shown'} checked={allShownOn} onChange={() => jobMatch.selectAll(!allShownOn, filter === 'all' ? null : filter)} /></th>
        <th scope="col">Keyword or skill</th><th scope="col">Type</th><th scope="col" className="tw-num">In post</th><th scope="col" className="tw-center">Key skill</th>
      </tr></thead>
      <tbody>{shown.map(keyword => <tr key={keyword.term} className={keyword.selected ? '' : 'is-off'} onClick={event => { if (event.target.tagName !== 'INPUT') jobMatch.toggleKeyword(keyword.term) }}>
        <td className="tw-col-check"><input type="checkbox" checked={keyword.selected} onChange={() => jobMatch.toggleKeyword(keyword.term)} aria-label={`Include ${keyword.term}`} /></td>
        <th scope="row">{keyword.term}{keyword.custom && <span className="tw-tag">Added by you</span>}</th>
        <td className="tw-muted">{GROUP_NAMES[keyword.group]}</td>
        <td className="tw-num">{keyword.jdCount}</td>
        <td className="tw-center">{keyword.key && <span className="tw-star" role="img" aria-label="Key skill"><Icon name="key" size={15} /></span>}</td>
      </tr>)}</tbody>
    </table>
    <div className="tw-add">
      <label className="visually-hidden" htmlFor="tw-add-kw">Add a keyword</label>
      <input id="tw-add-kw" value={custom} maxLength={60} placeholder="Add a keyword we missed" onChange={event => setCustom(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add() } }} />
      <button type="button" className="tw-btn tw-btn-secondary" onClick={add} disabled={!custom.trim()}><Icon name="plus" />Add</button>
    </div>
    {note && <p className="tw-error" role="alert">{note}</p>}
    <div className="tw-sticky">
      <span><b>{selected}</b> of {keywords.length} keywords will be scored</span>
      <button type="button" className="tw-btn tw-btn-primary tw-btn-lg" onClick={jobMatch.scoreNow} disabled={!selected}>Score my resume</button>
    </div>
  </section>
}

// The honest context under the score: why this job is a stretch or not a fit, and what to do instead.
function FitNotice({ fit, onFindJobs, onWriteLetter }) {
  if (!fit || fit.level === 'fit') return null
  const mismatch = fit.level === 'mismatch'
  return <section className={`tw-fit is-${fit.level}`} role={mismatch ? 'alert' : 'status'} aria-labelledby="tw-fit-title">
    <h2 id="tw-fit-title" className="tw-h2">{fit.title}</h2>
    {fit.reasons.length > 0 && <ul>{fit.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
    <p>{fit.text}</p>
    <div className="tw-fit-actions">
      {mismatch && onFindJobs && <button type="button" className="tw-btn tw-btn-primary" onClick={onFindJobs}><Icon name="post" />Find jobs that fit my resume</button>}
      {!mismatch && onWriteLetter && <button type="button" className="tw-btn tw-btn-secondary" onClick={onWriteLetter}><Icon name="post" />Write a cover letter</button>}
    </div>
  </section>
}

function ScoreHero({ score, found, total, baseline, delta, runId, fit }) {
  const verdict = fitVerdict(fit, verdictFor(score))
  return <section className={`tw-hero is-${verdict.id}`} aria-labelledby="tw-hero-title">
    <div className="tw-hero-tabs" aria-hidden="true"><span className="is-active">Match score</span>{Number.isFinite(baseline) && baseline !== score && <span>Started at {baseline}</span>}</div>
    <div className="tw-hero-body">
      <div className="tw-hero-ring">
        <ScoreRing score={score} runId={runId} label="" size={128} stroke={11} colourFor={tailorScoreColour} />
        {delta != null && <span key={`${score}-${delta}`} className={`tw-delta${delta < 0 ? ' is-down' : ''}`} aria-hidden="true">{delta > 0 ? '+' : ''}{delta}</span>}
      </div>
      <div className="tw-hero-text">
        <h2 id="tw-hero-title"><b>{verdict.label}.</b> {verdict.text}</h2>
        <p>{found} of {total} keywords are on your resume.{fit?.level === 'mismatch' ? '' : ` The marker shows the ${TARGET_SCORE} target.`}{Number.isFinite(fit?.reachable) && fit.reachable > score ? ` Every fix together would reach about ${fit.reachable}.` : ''}</p>
        <div className="tw-meter" role="img" aria-label={`${score} of 100, target ${TARGET_SCORE}`}><span style={{ width: `${score}%`, background: tailorScoreColour(score) }} /><i style={{ left: `${TARGET_SCORE}%` }} /></div>
      </div>
    </div>
  </section>
}

function KeywordReport({ rows, fixes, fixState, onOpenFix }) {
  const [showFound, setShowFound] = useState(true)
  const [keyOnly, setKeyOnly] = useState(false)
  const [copied, setCopied] = useState(false)
  const missing = rows.filter(row => !row.found)
  const shown = rows.filter(row => (showFound || !row.found) && (!keyOnly || row.key))
    .sort((a, b) => Number(a.found) - Number(b.found) || Number(a.prominent) - Number(b.prominent) || Number(b.key) - Number(a.key) || b.jdCount - a.jdCount)
  const fixFor = term => fixes.find(fix => fixState[fix.id]?.status !== 'done' && `${fix.title} ${fix.why}`.toLowerCase().includes(term.toLowerCase()))
  const copy = async () => {
    try { await navigator.clipboard.writeText(missing.map(row => row.term).join(', ')); setCopied(true); window.setTimeout(() => setCopied(false), 1800) } catch { setCopied(false) }
  }
  return <div className="tw-report">
    <p className="tw-lead">{missing.length ? `These ${missing.length === 1 ? 'keyword is' : `${missing.length} keywords are`} in the job post but not on your resume. Buried ones are on it, but not in your headline, summary, skills or top bullets, where screeners look first.` : 'Every keyword you picked is on your resume. Fixes can still move buried ones to where screeners look first.'}</p>
    <div className="tw-toolbar">
      <Toggle label="Show found keywords" checked={showFound} onChange={setShowFound} />
      <Toggle label="Key skills only" checked={keyOnly} onChange={setKeyOnly} />
      <button type="button" className="tw-btn tw-btn-outline" onClick={copy} disabled={!missing.length}><Icon name="copy" size={14} />{copied ? 'Copied' : 'Copy missing'}</button>
      <span className="visually-hidden" role="status">{copied ? 'Missing keywords copied' : ''}</span>
    </div>
    <table className="tw-table">
      <thead><tr><th scope="col">Keyword or skill</th><th scope="col" className="tw-num">In post</th><th scope="col" className="tw-num">In resume</th><th scope="col" className="tw-center">Key skill</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Fix</span></th></tr></thead>
      <tbody>{shown.map(row => {
        const status = !row.found ? ['missing', 'Missing'] : !row.prominent ? ['buried', 'Buried'] : ['found', 'Found']
        const fix = row.found && row.prominent ? null : fixFor(row.term)
        return <tr key={row.term}>
          <th scope="row">{row.term}</th>
          <td className="tw-num">{row.jdCount}</td>
          <td className="tw-num">{row.resumeCount}</td>
          <td className="tw-center">{row.key && <span className="tw-star" role="img" aria-label="Key skill"><Icon name="key" size={15} /></span>}</td>
          <td><span className={`tw-status is-${status[0]}`}>{status[1]}</span></td>
          <td className="tw-right">{fix && <button type="button" className="tw-btn tw-btn-quiet" onClick={() => onOpenFix(fix)}>See fix</button>}</td>
        </tr>
      })}</tbody>
    </table>
    {!shown.length && <p className="tw-empty">Nothing to show with these filters.</p>}
  </div>
}

function FixCard({ cache, analysis, ordered, index, onIndex, impacts, resumeData, jobMatch, onExecuteFix, onUndoFix, onAnswerFix }) {
  const ideas = (analysis.fixes ?? []).filter(fix => fix.kind !== 'executable')
  const fix = ordered[index]
  const state = fix ? analysis.fixState?.[fix.id] : null
  const done = state?.status === 'done'
  const skipped = fix ? analysis.skipped?.[fix.id] : false
  const fresh = useMemo(() => fix && !done ? describeFixChanges(resumeData ?? {}, fix.operations) : null, [fix, resumeData, done])
  useEffect(() => { if (fix && fresh) cache.set(fix.id, fresh) }, [fix, fresh, cache])
  const changes = fresh ?? (fix ? cache.get(fix.id) ?? describeFixChanges(resumeData ?? {}, fix.operations) : [])
  const [busy, setBusy] = useState(false)
  // The next fix still to do, looking forward first and then wrapping round.
  const nextPending = () => {
    const after = [...ordered.slice(index + 1), ...ordered.slice(0, index)]
    const next = after.find(item => item.id !== fix?.id && analysis.fixState?.[item.id]?.status !== 'done' && !analysis.skipped?.[item.id])
    return next ? ordered.indexOf(next) : -1
  }
  const apply = async () => {
    setBusy(true)
    await onExecuteFix(fix)
    setBusy(false)
    // Move on to the next fix once the change has landed on the resume.
    const next = nextPending()
    if (next >= 0) window.setTimeout(() => onIndex(next), 900)
  }

  if (analysis.fixesStatus === 'loading' && !ordered.length) return <section className="tw-card tw-fix"><p className="tw-loading"><span className="tw-spinner" aria-hidden="true" />Preparing fixes for “{analysis.jd.title}”. Your keyword report is ready now.</p>{[0, 1].map(item => <div key={item} className="tw-skeleton" />)}</section>
  if (analysis.fixesStatus === 'error' && !ordered.length) return <section className="tw-card tw-fix"><p className="tw-error" role="alert">{analysis.fixesError || 'Fixes could not be prepared.'} Check that the app server is running, then try again.</p><button type="button" className="tw-btn tw-btn-secondary" onClick={() => jobMatch.fetchFixes()}>Try again</button></section>
  return <>
    {fix && <section className={`tw-card tw-fix${done ? ' is-done' : ''}`} aria-labelledby="tw-fix-title">
      <header className="tw-fix-head">
        <div className="tw-pager">
          <button type="button" className="tw-icon-btn" onClick={() => onIndex(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous fix"><Icon name="left" /></button>
          <button type="button" className="tw-icon-btn" onClick={() => onIndex(Math.min(ordered.length - 1, index + 1))} disabled={index >= ordered.length - 1} aria-label="Next fix"><Icon name="right" /></button>
          <span>Fix {index + 1} of {ordered.length}</span>
        </div>
        <div className={`tw-impact${done ? ' is-done' : ''}`} aria-label={done ? 'Applied' : impacts[fix.id] > 0 ? `Adds ${impacts[fix.id]} points` : 'Polish'}>{done ? <Icon name="check" size={18} /> : impacts[fix.id] > 0 ? `+${impacts[fix.id]}` : '0'}</div>
      </header>
      <h1 id="tw-fix-title" className="tw-h1">{fix.title}</h1>
      {fix.why && <p className="tw-lead">{fix.why}</p>}
      {state?.error && <p className="tw-error" role="alert">{state.error}</p>}
      <h2 className="tw-h2">{done ? 'What changed' : 'What will change'}</h2>
      {changes.map((change, position) => <ChangeBlock key={position} change={change} done={done} />)}
      {!changes.length && <p className="tw-muted">This fix reorders or restyles content without changing its words.</p>}
      <footer className="tw-fix-actions">
        {done
          ? <><span className="tw-applied"><Icon name="check" />Applied to your resume</span><button type="button" className="tw-btn tw-btn-secondary" onClick={() => onUndoFix(fix)}>Undo</button></>
          : <><button type="button" className="tw-btn tw-btn-primary tw-btn-lg" onClick={apply} disabled={busy}>{busy ? 'Applying…' : 'Apply change'}</button>
            <button type="button" className="tw-btn tw-btn-quiet" onClick={() => { jobMatch.skipFix(fix); const next = nextPending(); if (next >= 0) onIndex(next) }}>{skipped ? 'Unskip' : 'Skip'}</button></>}
      </footer>
    </section>}
    {!ordered.length && analysis.fixesStatus === 'ready' && <section className="tw-card"><p className="tw-empty">No changes are needed for the keywords you picked. Try the job title check, or add the ideas below yourself.</p></section>}
    {analysis.fixesDegraded && <p className="tw-note">{analysis.fixesLimited ? 'The AI has reached its usage limit for now, so only ideas are shown.' : 'Tailored fixes could not be prepared this time.'} <button type="button" className="tw-btn tw-btn-quiet" onClick={() => jobMatch.fetchFixes()}>Try again</button></p>}
    {ideas.length > 0 && <section className="tw-card tw-ideas" aria-labelledby="tw-ideas-title">
      <h2 id="tw-ideas-title" className="tw-h2">Ideas only you can add</h2>
      <p className="tw-muted">These need facts we don't have, so they are never applied for you.</p>
      <ul>{ideas.map(idea => <li key={idea.id}><b>{idea.title}</b>{idea.why && <span>{idea.why}</span>}{idea.question && onAnswerFix && <button type="button" className="tw-btn tw-btn-quiet" onClick={() => onAnswerFix(idea)}>Answer with NIMBUS</button>}</li>)}</ul>
    </section>}
  </>
}

function Highlighted({ text, words }) {
  if (!words?.size) return text
  return String(text).split(/(\s+)/).map((part, index) => words.has(part.toLowerCase().replace(/[^a-z0-9+#.]/g, '')) ? <mark key={index}>{part}</mark> : part)
}

function ChangeBlock({ change, done }) {
  if (change.kind === 'added') return <div className="tw-change">
    <p className="tw-change-label">{change.label}</p>
    <div className="tw-chips">{change.after.map(item => <span key={item} className="tw-chip is-added"><Icon name="plus" size={12} />{item}</span>)}</div>
  </div>
  if (change.kind === 'list') {
    const moved = change.before.length === change.after.length && change.before.every(item => change.after.includes(item))
    return <div className="tw-change">
      <p className="tw-change-label">{change.label}{moved && <span> · new order</span>}</p>
      <div className="tw-compare">
        <div className="tw-before"><p>Before</p><ol>{change.before.map((item, index) => <li key={index}>{item}</li>)}</ol></div>
        <div className="tw-after"><p><Icon name="check" size={13} />{done ? 'Now' : 'After'}</p><ol>{change.after.map((item, index) => <li key={index} className={change.before[index] !== item ? 'is-changed' : ''}>{item}</li>)}</ol></div>
      </div>
    </div>
  }
  const words = addedWords(change.before, change.after)
  return <div className="tw-change">
    <p className="tw-change-label">{change.label}</p>
    <div className="tw-compare">
      <div className="tw-before"><p>Before</p><blockquote>{change.before || <em>Empty</em>}</blockquote></div>
      <div className="tw-after"><p><Icon name="check" size={13} />{done ? 'Now' : 'After'}</p><blockquote><Highlighted text={change.after} words={words} /></blockquote></div>
    </div>
  </div>
}

function JobTitleCheck({ cache, jd, found, resumeData, jobMatch, onExecuteFix, onUndoFix, fixState, impactOf }) {
  const fix = useMemo(() => ({ id: 'local-job-title', local: true, kind: 'executable', title: `Use “${jd.title}” as your headline`, why: 'Recruiters and ATS filters often search by the exact job title.', operations: [{ type: 'set_field', target: 'headline', value: jd.title }] }), [jd.title])
  const done = fixState[fix.id]?.status === 'done'
  const impact = impactOf(fix)
  if (!done) cache.set(fix.id, [{ label: 'Headline', kind: 'text', before: resumeData?.headline ?? '', after: jd.title }])
  const change = cache.get(fix.id)?.[0] ?? { label: 'Headline', kind: 'text', before: resumeData?.headline ?? '', after: jd.title }
  return <section className="tw-card" aria-labelledby="tw-title-check">
    <div className={`tw-check${found ? ' is-good' : ' is-warn'}`}><Icon name={found ? 'check' : 'title'} size={18} /><span>{found ? `“${jd.title}” appears in your headline or job titles.` : `“${jd.title}” doesn't appear in your headline or job titles.`}</span></div>
    <h1 id="tw-title-check" className="tw-h1">Job title match</h1>
    <p className="tw-lead">Screeners often filter by the title in the post. Using the same words in your headline, where they're true for you, helps your resume come up in those searches.</p>
    {(!found || done) && <>
      <h2 className="tw-h2">{done ? 'What changed' : 'Suggested change'}{!done && impact > 0 && <span className="tw-impact-inline">+{impact}</span>}</h2>
      <ChangeBlock change={change} done={done} />
      <footer className="tw-fix-actions">
        {done ? <><span className="tw-applied"><Icon name="check" />Applied to your resume</span><button type="button" className="tw-btn tw-btn-secondary" onClick={() => onUndoFix(fix)}>Undo</button></>
          : <button type="button" className="tw-btn tw-btn-primary tw-btn-lg" onClick={() => { jobMatch.addLocalFix(fix); onExecuteFix(fix) }}>Use this headline</button>}
      </footer>
    </>}
  </section>
}

function ChangeLog({ applied, resumeData, onUndoFix }) {
  if (!applied.length) return <p className="tw-empty tw-empty-pane">Fixes you apply are listed here, so you can undo any of them.</p>
  return <ol className="tw-log">{applied.map(fix => <li key={fix.id}>
    <span className="tw-log-mark"><Icon name="check" size={13} /></span>
    <div><b>{fix.title}</b><span>{describeFixChanges(resumeData ?? {}, fix.operations).map(change => change.label).join(', ') || 'Resume content'}</span></div>
    <button type="button" className="tw-btn tw-btn-quiet" onClick={() => onUndoFix(fix)}>Undo</button>
  </li>)}</ol>
}
