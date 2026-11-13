import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HR_CATEGORY_LABELS } from '../../shared/hrScoring.js'
import { HR_RESUMES_PER_OPENING } from '../../shared/hrPlans.js'
import { extractResumeDocument } from '../utils/extractResumeDocument.js'
import { hrApi } from './hrApi.js'
import CandidatePanel from './CandidatePanel.jsx'
import { Icon, Meter, PageHeader, ScoreMark, Tags } from './hrUi.jsx'

const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'
const MAX_WAITS = 8
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const STATUS_LABEL = { queued: 'Queued', reading: 'Reading file', scoring: 'Reading and scoring', waiting: 'Waiting for AI capacity', done: 'Scored', failed: 'Failed' }

/** Files are read and scored one at a time, so each shows its own progress and the AI budget is shared fairly. */
function useUploadQueue(openingId, onScored) {
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
            update(key, { status: 'done', message: `${candidate.name} · ${candidate.score}` })
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
        update(key, { status: 'failed', message: problem.message })
      }
    }
    running.current = false
  }, [openingId, onScored])

  const add = (files, room) => {
    const accepted = files.slice(0, Math.max(0, room))
    const refused = files.slice(accepted.length)
    const fresh = accepted.map(file => ({ key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, name: file.name, status: 'queued', message: '' }))
    const full = refused.map(file => ({ key: `${file.name}-full-${Math.random().toString(36).slice(2)}`, name: file.name, status: 'failed', message: `This opening is full (${HR_RESUMES_PER_OPENING} resumes).` }))
    setItems(current => [...current, ...fresh.map(({ file: _file, ...item }) => item), ...full])
    queue.current.push(...fresh.map(({ key, file }) => ({ key, file })))
    run()
    return fresh.length
  }

  const clearFinished = () => setItems(current => current.filter(item => !['done', 'failed'].includes(item.status)))
  return { items, add, clearFinished, busy: items.some(item => !['done', 'failed'].includes(item.status)) }
}

const SORTS = {
  score: (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
  years: (a, b) => b.years - a.years || b.score - a.score
}

export default function HrOpening() {
  const { openingId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [sort, setSort] = useState('score')
  const [selected, setSelected] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const load = useCallback(() => hrApi.getOpening(openingId).then(next => { setData(next); setError('') }).catch(problem => setError(problem.message)), [openingId])
  useEffect(() => { load() }, [load])
  const queue = useUploadQueue(openingId, load)

  const rows = useMemo(() => [...(data?.candidates ?? [])].sort(SORTS[sort]), [data, sort])
  const ranks = useMemo(() => new Map([...(data?.candidates ?? [])].sort(SORTS.score).map((row, index) => [row.id, index + 1])), [data])

  if (!data) {
    return <div className="hr-page">
      {error ? <><Link className="hr-back" to="/hr/openings"><Icon name="back" />Job openings</Link><p className="hr-alert hr-alert--error" role="alert">{error}</p></> : <div className="hr-loading"><span className="hr-spinner" /></div>}
    </div>
  }

  const { opening, weights } = data
  const pending = queue.items.filter(item => !['done', 'failed'].includes(item.status)).length
  const room = HR_RESUMES_PER_OPENING - opening.candidateCount - pending
  const pick = files => { if (files?.length) queue.add([...files], room) }

  const remove = async () => {
    try {
      await hrApi.deleteOpening(openingId)
      navigate('/hr/openings', { replace: true })
    } catch (problem) {
      setError(problem.message)
      setConfirmDelete(false)
    }
  }

  const sortHeader = (key, label) => <th aria-sort={sort === key ? (key === 'name' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className={`hr-sort${sort === key ? ' is-active' : ''}`} onClick={() => setSort(key)}>{label}</button>
  </th>

  return <div className="hr-page">
    <Link className="hr-back" to="/hr/openings"><Icon name="back" />Job openings</Link>
    <PageHeader eyebrow={[opening.employmentType, opening.location].filter(Boolean).join(' · ') || 'Job opening'} title={opening.title}>
      {confirmDelete
        ? <span className="hr-confirm" role="alertdialog" aria-label="Delete this opening">
          <span>Delete this opening and its {opening.candidateCount} resume{opening.candidateCount === 1 ? '' : 's'}?</span>
          <button className="hr-btn hr-btn--danger" type="button" onClick={remove}>Delete</button>
          <button className="hr-btn hr-btn--ghost" type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
        </span>
        : <>
          <Link className="hr-btn hr-btn--ghost" to={`/hr/openings/${openingId}/edit`}>Edit job</Link>
          <button className="hr-btn hr-btn--ghost hr-btn--quiet-danger" type="button" onClick={() => setConfirmDelete(true)}>Delete</button>
        </>}
    </PageHeader>
    {error && <p className="hr-alert hr-alert--error" role="alert">{error}</p>}

    <section className="hr-panel hr-requirements" aria-label="What resumes are scored against">
      <div className="hr-req-col hr-req-col--wide"><span className="hr-label">Must-have</span><Tags items={opening.mustHave} tone="must" /></div>
      <div className="hr-req-col hr-req-col--wide"><span className="hr-label">Nice-to-have</span><Tags items={opening.niceToHave} tone="nice" /></div>
      <div className="hr-req-col"><span className="hr-label">Experience</span><span>{opening.minYears ? `${opening.minYears}+ years` : 'Any'}</span></div>
      <div className="hr-req-col"><span className="hr-label">Education</span><span>{opening.education || 'Not scored'}</span></div>
      <div className="hr-req-col hr-req-weights"><span className="hr-label">Weights</span><span>{Object.entries(weights).map(([key, value]) => `${HR_CATEGORY_LABELS[key]} ${value}%`).join(' · ')}</span></div>
    </section>

    <section className={`hr-drop${dragging ? ' is-dragging' : ''}${room <= 0 ? ' is-full' : ''}`}
      onDragOver={event => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files) }}>
      <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={event => { pick(event.target.files); event.target.value = '' }} />
      <div className="hr-drop-copy">
        <Icon name="upload" />
        <div>
          <b>{room > 0 ? 'Drop resumes here' : 'This opening is full'}</b>
          <span>PDF, DOCX or TXT · {opening.candidateCount} of {HR_RESUMES_PER_OPENING} resumes</span>
        </div>
      </div>
      <button className="hr-btn hr-btn--primary" type="button" disabled={room <= 0} onClick={() => inputRef.current?.click()}>Choose files</button>
    </section>

    {queue.items.length > 0 && <section className="hr-panel hr-queue" aria-label="Upload progress">
      <div className="hr-panel-head">
        <h2>{queue.busy ? `Scoring ${pending} resume${pending === 1 ? '' : 's'}…` : 'Upload finished'}</h2>
        {!queue.busy && <button className="hr-link" type="button" onClick={queue.clearFinished}>Clear</button>}
      </div>
      <ul>
        {queue.items.map(item => <li key={item.key} className={`hr-queue-item is-${item.status}`}>
          <span className="hr-queue-dot" aria-hidden="true" />
          <span className="hr-queue-name">{item.name}</span>
          <span className="hr-queue-status">{STATUS_LABEL[item.status]}{item.message ? ` · ${item.message}` : ''}</span>
        </li>)}
      </ul>
    </section>}

    <section className="hr-panel">
      <div className="hr-panel-head">
        <h2>Ranked resumes <span className="hr-count">{rows.length}</span></h2>
        <span className="hr-muted">Highest score first. Select a row for the full breakdown.</span>
      </div>
      {rows.length === 0 ? <p className="hr-table-empty">No resumes yet. Upload files above to score them against this job.</p>
        : <div className="hr-table-wrap"><table className="hr-table hr-table--ranked">
          <thead><tr>
            <th className="hr-num">#</th>
            {sortHeader('name', 'Candidate')}
            {sortHeader('score', 'Score')}
            {Object.keys(weights).map(key => <th key={key} className="hr-col-meter">{HR_CATEGORY_LABELS[key]}</th>)}
            <th>Must-haves</th>
            {sortHeader('years', 'Years')}
            <th>Missing must-haves</th>
          </tr></thead>
          <tbody>
            {rows.map(row => <tr key={row.id} className={`hr-row-link${selected === row.id ? ' is-selected' : ''}`} tabIndex={0} onClick={() => setSelected(row.id)} onKeyDown={event => { if (event.key === 'Enter') setSelected(row.id) }}>
              <td className="hr-num hr-rank">{ranks.get(row.id)}</td>
              <td><b>{row.name}</b><span className="hr-sub">{row.headline || row.fileName}</span></td>
              <td><ScoreMark score={row.score} size="sm" /></td>
              {Object.keys(weights).map(key => <td key={key} className="hr-col-meter"><Meter value={row.categories[key]} label={HR_CATEGORY_LABELS[key]} /><span className="hr-meter-num">{row.categories[key]}</span></td>)}
              <td className="hr-num">{row.mustHaveMet}/{row.mustHaveTotal}</td>
              <td className="hr-num">{row.years}</td>
              <td>{row.missingMustHave.length ? <Tags items={row.missingMustHave.slice(0, 3)} tone="missing" /> : <span className="hr-ok">All met</span>}{row.missingMustHave.length > 3 && <span className="hr-sub">+{row.missingMustHave.length - 3} more</span>}</td>
            </tr>)}
          </tbody>
        </table></div>}
    </section>

    {selected && <CandidatePanel openingId={openingId} candidateId={selected} rank={ranks.get(selected)} onClose={() => setSelected(null)} onRemoved={() => { setSelected(null); load() }} />}
  </div>
}
