import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HR_CATEGORY_LABELS, STATUS_LABELS } from '../../shared/hrScoring.js'
import { extractResumeDocument } from '../utils/extractResumeDocument.js'
import { hrApi } from './hrApi.js'
import { useHrSession } from './HrApp.jsx'
import CandidatePanel from './CandidatePanel.jsx'
import CandidateScatter from './CandidateScatter.jsx'
import CompareDialog from './CompareDialog.jsx'
import WeightsPanel from './WeightsPanel.jsx'
import { displayName, Icon, isHidden, Meter, PageHeader, ScoreMark, StatusBadge, Tags } from './hrUi.jsx'

const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'
const MAX_WAITS = 8
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const QUEUE_LABEL = { queued: 'Queued', reading: 'Reading file', scoring: 'Reading and scoring', waiting: 'Waiting for AI capacity', done: 'Scored', skipped: 'Skipped', failed: 'Failed' }
const FINISHED = ['done', 'skipped', 'failed']
const NO_FILTERS = { status: 'all', mustAll: false, minScore: 0, query: '' }

/** Files are read and scored one at a time, so each shows its own progress and the AI budget is shared fairly. */
function useUploadQueue(openingId, onScored, blindRef) {
  const [items, setItems] = useState([])
  const queue = useRef([])
  const running = useRef(false)
  const update = (key, changes) => setItems(current => current.map(item => item.key === key ? { ...item, ...changes } : item))

  const run = useCallback(async () => {
    if (running.current) return
    running.current = true
    while (queue.current.length) {
      const { key, file } = queue.current.shift()
      try {
        update(key, { status: 'reading' })
        const document = await extractResumeDocument(file)
        for (let attempt = 0; ; attempt += 1) {
          update(key, { status: 'scoring', message: '' })
          try {
            const candidate = await hrApi.uploadCandidate(openingId, file.name, document)
            update(key, { status: 'done', message: blindRef.current ? `score ${candidate.score}` : `${candidate.name} · ${candidate.score}` })
            onScored()
            break
          } catch (problem) {
            if (problem.code !== 'ai_busy' || attempt >= MAX_WAITS) throw problem
            const seconds = Math.max(3, Math.ceil(problem.retryAfterSeconds || 10))
            for (let left = seconds; left > 0; left -= 1) {
              update(key, { status: 'waiting', message: `retrying in ${left}s` })
              await wait(1000)
            }
          }
        }
      } catch (problem) {
        update(key, problem.code === 'duplicate' ? { status: 'skipped', message: problem.message } : { status: 'failed', message: problem.message })
      }
    }
    running.current = false
  }, [openingId, onScored, blindRef])

  const add = (files, room, limit) => {
    const accepted = files.slice(0, Math.max(0, room))
    const refused = files.slice(accepted.length)
    const fresh = accepted.map(file => ({ key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, name: file.name, status: 'queued', message: '' }))
    const full = refused.map(file => ({ key: `${file.name}-full-${Math.random().toString(36).slice(2)}`, name: file.name, status: 'failed', message: `This opening is full (${limit} resumes on your plan).` }))
    setItems(current => [...current, ...fresh.map(({ file: _file, ...item }) => item), ...full])
    queue.current.push(...fresh.map(({ key, file }) => ({ key, file })))
    run()
  }

  const clearFinished = () => setItems(current => current.filter(item => !FINISHED.includes(item.status)))
  return { items, add, clearFinished, busy: items.some(item => !FINISHED.includes(item.status)) }
}

const SORTS = {
  score: (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
  years: (a, b) => b.years - a.years || b.score - a.score
}

/** Filters shared by the chart and the table. In blind mode, search never matches a hidden name. */
function applyFilters(rows, filters, blind) {
  const query = filters.query.trim().toLowerCase()
  return rows.filter(row => {
    if (filters.status !== 'all' && row.status !== filters.status) return false
    if (filters.mustAll && row.mustHaveMet < row.mustHaveTotal) return false
    if (row.score < filters.minScore) return false
    if (!query) return true
    const haystack = [isHidden(row, blind) ? '' : row.name, row.headline, ...row.skills].join(' ').toLowerCase()
    return haystack.includes(query)
  })
}

export default function HrOpening() {
  const { openingId } = useParams()
  const navigate = useNavigate()
  const { account } = useHrSession()
  const freePlan = account.openingLimit !== null
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sort, setSort] = useState('score')
  const [activeId, setActiveId] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [filters, setFilters] = useState(NO_FILTERS)
  const [dialog, setDialog] = useState(null)          // 'weights' | 'compare'
  const [confirm, setConfirm] = useState(null)        // 'delete' | 'remove' | 'reject'
  const [rejectReason, setRejectReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)
  const blindRef = useRef(false)

  const load = useCallback(() => hrApi.getOpening(openingId).then(next => { setData(next); setError('') }).catch(problem => setError(problem.message)), [openingId])
  useEffect(() => { load() }, [load])
  const queue = useUploadQueue(openingId, load, blindRef)

  const opening = data?.opening
  const blind = Boolean(opening?.blind)
  blindRef.current = blind
  const closed = opening?.status === 'closed'
  const all = useMemo(() => data?.candidates ?? [], [data])
  const ranks = useMemo(() => new Map([...all].sort(SORTS.score).map((row, index) => [row.id, index + 1])), [all])
  const rows = useMemo(() => applyFilters(all, filters, blind).sort(SORTS[sort]), [all, filters, blind, sort])
  const counts = useMemo(() => ({ all: all.length, new: all.filter(row => row.status === 'new').length, shortlisted: all.filter(row => row.status === 'shortlisted').length, rejected: all.filter(row => row.status === 'rejected').length }), [all])

  // A selection never holds resumes that are gone or filtered out of view.
  useEffect(() => {
    const visible = new Set(rows.map(row => row.id))
    setSelected(current => { const next = new Set([...current].filter(id => visible.has(id))); return next.size === current.size ? current : next })
  }, [rows])
  useEffect(() => { if (!notice) return undefined; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer) }, [notice])

  if (!data) {
    return <div className="hr-page">
      {error ? <><Link className="hr-back" to="/hr/openings"><Icon name="back" />Job openings</Link><p className="hr-alert hr-alert--error" role="alert">{error}</p></> : <div className="hr-loading"><span className="hr-spinner" /></div>}
    </div>
  }

  const { weights } = data
  const pending = queue.items.filter(item => !FINISHED.includes(item.status)).length
  const resumeLimit = account.resumeLimit ?? 5
  const room = resumeLimit - opening.candidateCount - pending
  const pick = files => { if (files?.length) queue.add([...files], room, resumeLimit) }
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)
  const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }))
  const toggle = id => setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })
  const allPicked = rows.length > 0 && rows.every(row => selected.has(row.id))

  const run = async (work, message) => {
    setBusy(true)
    setError('')
    try {
      await work()
      if (message) setNotice(message)
      await load()
      return true
    } catch (problem) {
      setError(problem.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const changeSettings = settings => hrApi.updateSettings(openingId, settings).then(next => setData(current => ({ ...current, opening: next.opening, weights: next.weights }))).then(load)
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
  const ids = [...selected]
  const bulk = async (action, reason = '') => {
    const verb = { shortlist: 'shortlisted', reject: 'rejected', reset: 'moved back to New', remove: 'removed' }[action]
    if (await run(() => hrApi.bulk(openingId, ids, action, reason), `${plural(ids.length, 'resume')} ${verb}.`)) {
      setSelected(new Set())
      setConfirm(null)
      setRejectReason('')
    }
  }

  // Deciding in the panel moves on to the next resume in view that is still New.
  const decideFromPanel = async (candidateId, status, reason) => {
    const order = rows.map(row => row.id)
    const start = order.indexOf(candidateId)
    const nextNew = [...order.slice(start + 1), ...order.slice(0, Math.max(0, start))].find(id => all.find(row => row.id === id)?.status === 'new')
    const ok = await run(() => hrApi.decide(openingId, candidateId, status, reason), status === 'new' ? 'Moved back to New.' : `${STATUS_LABELS[status]}.`)
    if (ok && status !== 'new') setActiveId(nextNew ?? candidateId)
    return ok
  }

  const sortHeader = (key, label) => <th aria-sort={sort === key ? (key === 'name' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className={`hr-sort${sort === key ? ' is-active' : ''}`} onClick={() => setSort(key)}>{label}</button>
  </th>

  const lede = [plural(counts.all, 'resume'), `${counts.new} new`, `${counts.shortlisted} shortlisted`, `${counts.rejected} rejected`].join(' · ')

  return <div className="hr-page">
    <Link className="hr-back" to="/hr/openings"><Icon name="back" />Job openings</Link>
    <PageHeader eyebrow={[closed ? 'Closed' : null, opening.employmentType, opening.location].filter(Boolean).join(' · ') || 'Job opening'} title={opening.title} lede={lede}>
      {confirm === 'delete'
        ? <span className="hr-confirm" role="alertdialog" aria-label="Delete this opening">
          <span>Delete this opening and its {plural(opening.candidateCount, 'resume')}?{freePlan && <small className="hr-confirm-note">It will still count as 1 of your {account.openingLimit} free openings.</small>}</span>
          <button className="hr-btn hr-btn--danger" type="button" onClick={() => hrApi.deleteOpening(openingId).then(() => navigate('/hr/openings', { replace: true })).catch(problem => { setError(problem.message); setConfirm(null) })}>Delete</button>
          <button className="hr-btn hr-btn--ghost" type="button" onClick={() => setConfirm(null)}>Cancel</button>
        </span>
        : <>
          <button className="hr-btn hr-btn--ghost" type="button" onClick={() => hrApi.exportShortlist(openingId).catch(problem => setError(problem.message))} disabled={!counts.shortlisted} title={counts.shortlisted ? 'Download the shortlist as a CSV file' : 'Shortlist someone first'}>Export shortlist</button>
          <button className="hr-btn hr-btn--ghost" type="button" onClick={() => setDialog('weights')}>Scoring weights</button>
          {!closed && <Link className="hr-btn hr-btn--ghost" to={`/hr/openings/${openingId}/edit`}>Edit job</Link>}
          <button className="hr-btn hr-btn--ghost" type="button" disabled={busy} onClick={() => run(() => changeSettings({ status: closed ? 'open' : 'closed' }), closed ? 'Opening reopened.' : 'Opening closed.')}>{closed ? 'Reopen' : 'Close opening'}</button>
          <button className="hr-btn hr-btn--ghost hr-btn--quiet-danger" type="button" onClick={() => setConfirm('delete')}>Delete</button>
        </>}
    </PageHeader>
    {error && <p className="hr-alert hr-alert--error" role="alert">{error}</p>}
    {closed && <p className="hr-alert hr-alert--info" role="status">This opening is closed, so it’s read-only: no new resumes, decisions or edits. Reopen it to continue.</p>}

    <section className="hr-panel hr-requirements" aria-label="What resumes are scored against">
      <div className="hr-req-col hr-req-col--wide"><span className="hr-label">Must-have</span><Tags items={opening.mustHave} tone="must" /></div>
      <div className="hr-req-col hr-req-col--wide"><span className="hr-label">Nice-to-have</span><Tags items={opening.niceToHave} tone="nice" /></div>
      <div className="hr-req-col"><span className="hr-label">Experience</span><span>{opening.minYears ? `${opening.minYears}+ years` : 'Any'}</span></div>
      <div className="hr-req-col"><span className="hr-label">Education</span><span>{opening.education || 'Not scored'}</span></div>
      <div className="hr-req-col hr-req-weights"><span className="hr-label">Weights{opening.weights ? ' (custom)' : ''}</span><span>{Object.entries(weights).map(([key, value]) => `${HR_CATEGORY_LABELS[key]} ${value}%`).join(' · ')}</span></div>
    </section>

    {!closed && <section className={`hr-drop${dragging ? ' is-dragging' : ''}${room <= 0 ? ' is-full' : ''}`}
      onDragOver={event => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files) }}>
      <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={event => { pick(event.target.files); event.target.value = '' }} />
      <div className="hr-drop-copy">
        <Icon name="upload" />
        <div>
          <b>{room > 0 ? 'Drop resumes here' : 'This opening is full'}</b>
          <span>PDF, DOCX or TXT · {opening.candidateCount} of {resumeLimit} resumes{freePlan ? ' on the free plan' : ''} · duplicates are skipped</span>
          {freePlan && room <= 0 && <span><Link to="/hr/plan">Upgrade to Hiring Pro</Link> for up to 50 resumes per opening.</span>}
        </div>
      </div>
      <button className="hr-btn hr-btn--primary" type="button" disabled={room <= 0} onClick={() => inputRef.current?.click()}>Choose files</button>
    </section>}

    {queue.items.length > 0 && <section className="hr-panel hr-queue" aria-label="Upload progress">
      <div className="hr-panel-head">
        <h2>{queue.busy ? `Scoring ${plural(pending, 'resume')}…` : 'Upload finished'}</h2>
        {!queue.busy && <button className="hr-link" type="button" onClick={queue.clearFinished}>Clear</button>}
      </div>
      <ul>
        {queue.items.map(item => <li key={item.key} className={`hr-queue-item is-${item.status}`}>
          <span className="hr-queue-dot" aria-hidden="true" />
          <span className="hr-queue-name">{blind ? 'Resume file' : item.name}</span>
          <span className="hr-queue-status">{QUEUE_LABEL[item.status]}{item.message ? ` · ${item.message}` : ''}</span>
        </li>)}
      </ul>
    </section>}

    {all.length > 0 && <section className="hr-filters" aria-label="Filter resumes">
      <div className="hr-segmented" role="group" aria-label="Decision">
        {['all', 'new', 'shortlisted', 'rejected'].map(status => <button key={status} type="button" aria-pressed={filters.status === status} onClick={() => setFilter('status', status)}>
          {status === 'all' ? 'All' : STATUS_LABELS[status]} <span>{counts[status]}</span>
        </button>)}
      </div>
      <label className="hr-check"><input type="checkbox" checked={filters.mustAll} onChange={event => setFilter('mustAll', event.target.checked)} />Meets all must-haves</label>
      <label className="hr-range">
        <span>Min score <b>{filters.minScore}</b></span>
        <input type="range" min="0" max="100" step="5" value={filters.minScore} onChange={event => setFilter('minScore', Number(event.target.value))} aria-valuetext={`Minimum score ${filters.minScore}`} />
      </label>
      <input className="hr-search" type="search" placeholder="Search name or skill" value={filters.query} onChange={event => setFilter('query', event.target.value)} aria-label="Search by name or skill" />
      <label className="hr-switch" title="Hide names and contact details until you decide">
        <input type="checkbox" role="switch" checked={blind} disabled={busy} onChange={event => run(() => changeSettings({ blind: event.target.checked }), event.target.checked ? 'Blind screening on: names stay hidden until you decide.' : 'Blind screening off.')} />
        <span aria-hidden="true" />Blind screening
      </label>
      <span className="hr-filters-count">{filtered ? <>Showing {rows.length} of {all.length} · <button className="hr-link" type="button" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button></> : `${all.length} in view`}</span>
    </section>}

    {rows.length > 0 && <CandidateScatter candidates={rows} weights={weights} blind={blind} activeId={activeId} selectedIds={selected} onOpen={setActiveId}
      onBrush={found => { setSelected(new Set(found)); if (found.length) setNotice(`${plural(found.length, 'resume')} selected from the chart.`) }} />}

    <section className="hr-panel">
      <div className="hr-panel-head">
        <h2>Ranked resumes <span className="hr-count">{rows.length}</span></h2>
        <span className="hr-muted">Select a row for the full breakdown. Tick rows to act on several at once.</span>
      </div>
      {all.length === 0 ? <p className="hr-table-empty">No resumes yet. {closed ? 'Reopen the opening to add some.' : 'Upload files above to score them against this job.'}</p>
        : rows.length === 0 ? <p className="hr-table-empty">No resumes match these filters. <button className="hr-link" type="button" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button></p>
          : <div className="hr-table-wrap"><table className="hr-table hr-table--ranked">
            <thead><tr>
              <th className="hr-col-check"><input type="checkbox" aria-label="Select all resumes in view" checked={allPicked} onChange={() => setSelected(allPicked ? new Set() : new Set(rows.map(row => row.id)))} /></th>
              <th className="hr-num">#</th>
              {sortHeader('name', 'Candidate')}
              {sortHeader('score', 'Score')}
              <th>Decision</th>
              {Object.keys(weights).map(key => <th key={key} className="hr-col-meter">{HR_CATEGORY_LABELS[key]}</th>)}
              <th>Must-haves</th>
              {sortHeader('years', 'Years')}
              <th>Missing must-haves</th>
            </tr></thead>
            <tbody>
              {rows.map(row => <tr key={row.id} className={`hr-row-link${activeId === row.id ? ' is-selected' : ''}${selected.has(row.id) ? ' is-picked' : ''}`} tabIndex={0} onClick={() => setActiveId(row.id)} onKeyDown={event => { if (event.key === 'Enter') setActiveId(row.id) }}>
                <td className="hr-col-check" onClick={event => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${displayName(row, blind)}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} /></td>
                <td className="hr-num hr-rank">{ranks.get(row.id)}</td>
                <td><b>{displayName(row, blind)}</b><span className="hr-sub">{row.headline || (isHidden(row, blind) ? '' : row.fileName)}</span></td>
                <td><ScoreMark score={row.score} size="sm" /></td>
                <td><StatusBadge status={row.status} />{row.reason && <span className="hr-sub" title={row.reason}>{row.reason.length > 28 ? `${row.reason.slice(0, 27)}…` : row.reason}</span>}</td>
                {Object.keys(weights).map(key => <td key={key} className="hr-col-meter"><Meter value={row.categories[key]} label={HR_CATEGORY_LABELS[key]} /><span className="hr-meter-num">{row.categories[key]}</span></td>)}
                <td className="hr-num">{row.mustHaveMet}/{row.mustHaveTotal}</td>
                <td className="hr-num">{row.years}</td>
                <td>{row.missingMustHave.length ? <Tags items={row.missingMustHave.slice(0, 3)} tone="missing" /> : <span className="hr-ok">All met</span>}{row.missingMustHave.length > 3 && <span className="hr-sub">+{row.missingMustHave.length - 3} more</span>}</td>
              </tr>)}
            </tbody>
          </table></div>}
    </section>

    {selected.size > 0 && <div className="hr-bulkbar" role="region" aria-label="Actions for selected resumes">
      {confirm === 'reject' ? <>
        <span><b>Reject {plural(ids.length, 'resume')}</b></span>
        <input className="hr-search" value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="Reason (optional)" maxLength={200} aria-label="Reason for rejecting" autoFocus />
        <button className="hr-btn hr-btn--danger" type="button" disabled={busy} onClick={() => bulk('reject', rejectReason)}>Reject</button>
        <button className="hr-btn hr-btn--ghost" type="button" onClick={() => setConfirm(null)}>Cancel</button>
      </> : confirm === 'remove' ? <>
        <span><b>Remove {plural(ids.length, 'resume')}</b> from this opening? This can’t be undone.</span>
        <button className="hr-btn hr-btn--danger" type="button" disabled={busy} onClick={() => bulk('remove')}>Remove</button>
        <button className="hr-btn hr-btn--ghost" type="button" onClick={() => setConfirm(null)}>Cancel</button>
      </> : <>
        <span><b>{ids.length}</b> selected</span>
        <button className="hr-btn hr-btn--primary" type="button" disabled={busy || closed} onClick={() => bulk('shortlist')}>Shortlist</button>
        <button className="hr-btn hr-btn--ghost" type="button" disabled={busy || closed} onClick={() => setConfirm('reject')}>Reject</button>
        <button className="hr-btn hr-btn--ghost" type="button" disabled={busy || closed} onClick={() => bulk('reset')}>Back to New</button>
        <button className="hr-btn hr-btn--ghost" type="button" disabled={ids.length < 2 || ids.length > 3} title={ids.length < 2 || ids.length > 3 ? 'Select 2 or 3 resumes to compare' : undefined} onClick={() => setDialog('compare')}>Compare</button>
        <button className="hr-btn hr-btn--ghost hr-btn--quiet-danger" type="button" disabled={busy || closed} onClick={() => setConfirm('remove')}>Remove</button>
        <button className="hr-link" type="button" onClick={() => setSelected(new Set())}>Clear</button>
      </>}
    </div>}

    {notice && <p className="hr-toast" role="status">{notice}</p>}

    {activeId && <CandidatePanel openingId={openingId} candidateId={activeId} rank={ranks.get(activeId)} order={rows.map(row => row.id)} blind={blind} closed={closed}
      onNavigate={setActiveId} onClose={() => setActiveId(null)} onDecide={decideFromPanel}
      onRemoved={() => { setActiveId(null); load(); setNotice('Resume removed.') }} />}
    {dialog === 'weights' && <WeightsPanel opening={opening} onClose={() => setDialog(null)} onSave={weightsValue => changeSettings({ weights: weightsValue }).then(() => setNotice(weightsValue ? 'Weights saved; resumes re-ranked.' : 'Default weights restored.'))} />}
    {dialog === 'compare' && <CompareDialog openingId={openingId} ids={ids} blind={blind} onClose={() => setDialog(null)} onOpen={id => { setDialog(null); setActiveId(id) }} />}
  </div>
}
