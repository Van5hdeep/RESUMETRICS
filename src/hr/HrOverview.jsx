import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hrApi } from './hrApi.js'
import { useHrSession } from './HrApp.jsx'
import { useNewOpening } from './HrLayout.jsx'
import { formatDate, Icon, PageHeader, ScoreMark } from './hrUi.jsx'

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

  const resumes = openings?.reduce((sum, opening) => sum + opening.candidateCount, 0) ?? 0
  const strong = openings?.reduce((sum, opening) => sum + opening.strongCount, 0) ?? 0
  const left = account.openingLimit === null ? 'Unlimited' : Math.max(0, account.openingLimit - account.openingsCreated)

  return <div className="hr-page">
    <PageHeader eyebrow={today} title={greeting()}>
      <button className="hr-btn hr-btn--primary" type="button" onClick={start}><Icon name="plus" />{atLimit ? 'Upgrade for more openings' : 'New opening'}</button>
    </PageHeader>

    <section className="hr-figures" aria-label="Summary">
      <div><span>Open roles</span><b>{openings ? openings.length : '–'}</b></div>
      <div><span>Resumes evaluated</span><b>{openings ? resumes : '–'}</b></div>
      <div><span>Strong matches</span><b>{openings ? strong : '–'}</b><small>score 75 or more</small></div>
      <div><span>Openings left</span><b>{left}</b><small>{account.plan === 'pro' ? 'Hiring Pro' : 'on the free plan'}</small></div>
    </section>

    {error && <p className="hr-alert hr-alert--error" role="alert">{error}</p>}

    {openings === null ? <div className="hr-loading"><span className="hr-spinner" /></div>
      : openings.length === 0 ? <section className="hr-empty">
        <h2>Start with one job opening</h2>
        <ol className="hr-steps">
          <li><b>Describe the job</b><span>Title, must-have skills, experience and education.</span></li>
          <li><b>Upload resumes</b><span>Drop in PDF, DOCX or TXT files, up to 50 per opening.</span></li>
          <li><b>Read the ranking</b><span>Every resume is scored against the job, with the reasons shown.</span></li>
        </ol>
        <button className="hr-btn hr-btn--primary" type="button" onClick={start}><Icon name="plus" />Describe a job</button>
      </section>
        : <section className="hr-panel">
          <div className="hr-panel-head"><h2>Job openings</h2><Link to="/hr/openings">View all</Link></div>
          <div className="hr-table-wrap"><table className="hr-table">
            <thead><tr><th>Role</th><th>Resumes</th><th>Best match</th><th>Strong</th><th>Created</th></tr></thead>
            <tbody>
              {openings.map(opening => <tr key={opening.id} className="hr-row-link" tabIndex={0} onClick={() => navigate(`/hr/openings/${opening.id}`)} onKeyDown={event => { if (event.key === 'Enter') navigate(`/hr/openings/${opening.id}`) }}>
                <td><b>{opening.title}</b><span className="hr-sub">{[opening.employmentType, opening.location].filter(Boolean).join(' · ')}</span></td>
                <td className="hr-num">{opening.candidateCount}</td>
                <td>{opening.bestScore === null ? <span className="hr-muted">No resumes yet</span> : <span className="hr-best"><ScoreMark score={opening.bestScore} size="sm" /><span className="hr-sub">{opening.bestCandidate}</span></span>}</td>
                <td className="hr-num">{opening.strongCount}</td>
                <td className="hr-muted">{formatDate(opening.createdAt)}</td>
              </tr>)}
            </tbody>
          </table></div>
        </section>}
  </div>
}
