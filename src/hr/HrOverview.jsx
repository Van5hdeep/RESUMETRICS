import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hrApi } from './hrApi.js'
import { useNewOpening } from './HrLayout.jsx'
import { useHrSession } from './HrApp.jsx'
import { formatDate, Icon, PageHeader, Pipeline, ScoreMark } from './hrUi.jsx'

const greeting = () => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

export function useOpenings() {
  const [state, setState] = useState({ openings: null, error: '' })
  useEffect(() => {
    let live = true
    hrApi.listOpenings()
      .then(data => live && setState({ openings: data.openings, error: '' }))
      .catch(problem => live && setState({ openings: [], error: problem.message }))
    return () => { live = false }
  }, [])
  return state
}

export default function HrOverview() {
  const { account } = useHrSession()
  const { openings, error } = useOpenings()
  const { start, atLimit } = useNewOpening()
  const navigate = useNavigate()
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  const open = openings?.filter(opening => opening.status !== 'closed') ?? []
  const sum = (list, pick) => list.reduce((total, opening) => total + pick(opening), 0)
  const resumes = sum(openings ?? [], opening => opening.candidateCount)
  const awaiting = sum(open, opening => opening.pipeline?.new ?? 0)
  const shortlisted = sum(openings ?? [], opening => opening.pipeline?.shortlisted ?? 0)
  // Open roles with resumes nobody has decided on yet, most waiting first.
  const attention = open.filter(opening => opening.pipeline?.new > 0).sort((a, b) => b.pipeline.new - a.pipeline.new)
  const go = id => navigate(`/hr/openings/${id}`)

  return <div className="hr-page">
    <PageHeader eyebrow={today} title={greeting()}>
      <button className="hr-btn hr-btn--primary" type="button" onClick={start}><Icon name="plus" />{atLimit ? 'Upgrade for more openings' : 'New opening'}</button>
    </PageHeader>

    <section className="hr-figures" aria-label="Summary">
      <div><span>Open roles</span><b>{openings ? open.length : '–'}</b>{openings && openings.length > open.length && <small>{openings.length - open.length} closed</small>}</div>
      <div><span>Resumes evaluated</span><b>{openings ? resumes : '–'}</b></div>
      <div><span>Awaiting review</span><b>{openings ? awaiting : '–'}</b><small>in open roles</small></div>
      <div><span>Shortlisted</span><b>{openings ? shortlisted : '–'}</b></div>
    </section>

    {error && <p className="hr-alert hr-alert--error" role="alert">{error}</p>}

    {openings === null ? <div className="hr-loading"><span className="hr-spinner" /></div>
      : openings.length === 0 ? <section className="hr-empty">
        <h2>Start with one job opening</h2>
        <ol className="hr-steps">
          <li><b>Describe the job</b><span>Title, must-have skills, experience and education.</span></li>
          <li><b>Upload resumes</b><span>Drop in PDF, DOCX or TXT files, up to {account.resumeLimit ?? 5} per opening on your plan.</span></li>
          <li><b>Read the ranking</b><span>Every resume is scored against the job, with the reasons shown.</span></li>
        </ol>
        <button className="hr-btn hr-btn--primary" type="button" onClick={start}><Icon name="plus" />Describe a job</button>
      </section>
        : <>
          {attention.length > 0 && <section className="hr-panel hr-attention" aria-label="Needs attention">
            <div className="hr-panel-head"><h2>Needs attention</h2><span className="hr-muted">Resumes nobody has shortlisted or rejected yet</span></div>
            <ul>
              {attention.map(opening => <li key={opening.id}>
                <span className="hr-attention-count">{opening.pipeline.new}</span>
                <span className="hr-attention-text"><b>{opening.title}</b><span className="hr-sub">{opening.pipeline.new === 1 ? 'resume' : 'resumes'} awaiting review{opening.bestScore !== null ? ` · best match ${opening.bestScore}` : ''}</span></span>
                <button className="hr-btn hr-btn--ghost" type="button" onClick={() => go(opening.id)}>Review</button>
              </li>)}
            </ul>
          </section>}

          <section className="hr-panel">
            <div className="hr-panel-head"><h2>Job openings</h2><Link to="/hr/openings">View all</Link></div>
            <div className="hr-table-wrap"><table className="hr-table">
              <thead><tr><th>Role</th><th>Resumes</th><th>Best match</th><th>Review progress</th><th>Created</th></tr></thead>
              <tbody>
                {openings.map(opening => <tr key={opening.id} className={`hr-row-link${opening.status === 'closed' ? ' is-closed' : ''}`} tabIndex={0} onClick={() => go(opening.id)} onKeyDown={event => { if (event.key === 'Enter') go(opening.id) }}>
                  <td><b>{opening.title}</b>{opening.status === 'closed' && <span className="hr-status hr-status--closed">Closed</span>}<span className="hr-sub">{[opening.employmentType, opening.location].filter(Boolean).join(' · ')}</span></td>
                  <td className="hr-num">{opening.candidateCount}</td>
                  <td>{opening.bestScore === null ? <span className="hr-muted">No resumes yet</span> : <span className="hr-best"><ScoreMark score={opening.bestScore} size="sm" /><span className="hr-sub">{opening.bestCandidate}</span></span>}</td>
                  <td><Pipeline pipeline={opening.pipeline} /></td>
                  <td className="hr-muted">{formatDate(opening.createdAt)}</td>
                </tr>)}
              </tbody>
            </table></div>
          </section>
        </>}
  </div>
}
