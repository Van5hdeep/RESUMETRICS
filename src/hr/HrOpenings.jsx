import { Link } from 'react-router-dom'
import { useHrSession } from './HrApp.jsx'
import { useNewOpening } from './HrLayout.jsx'
import { useOpenings } from './HrOverview.jsx'
import { formatDate, Icon, PageHeader, ScoreMark, Tags } from './hrUi.jsx'

export default function HrOpenings() {
  const { account } = useHrSession()
  const { openings, error } = useOpenings()
  const { start, atLimit } = useNewOpening()

  return <div className="hr-page">
    <PageHeader eyebrow="Job openings" title="Every role you’re hiring for" lede={account.openingLimit === null ? 'Hiring Pro: create as many openings as you need.' : `Free plan: ${Math.min(account.openingsCreated, account.openingLimit)} of ${account.openingLimit} openings used. Deleting an opening doesn’t give the slot back.`}>
      <button className="hr-btn hr-btn--primary" type="button" onClick={start}><Icon name="plus" />{atLimit ? 'Upgrade for more openings' : 'New opening'}</button>
    </PageHeader>

    {error && <p className="hr-alert hr-alert--error" role="alert">{error}</p>}
    {openings === null ? <div className="hr-loading"><span className="hr-spinner" /></div>
      : openings.length === 0 ? <section className="hr-empty"><h2>No openings yet</h2><p className="hr-muted">Describe a job to start evaluating resumes against it.</p><button className="hr-btn hr-btn--primary" type="button" onClick={start}><Icon name="plus" />Describe a job</button></section>
        : <div className="hr-cards">
          {openings.map(opening => <Link key={opening.id} to={`/hr/openings/${opening.id}`} className="hr-card">
            <div className="hr-card-top">
              <div><h2>{opening.title}</h2><p className="hr-sub">{[opening.employmentType, opening.location, opening.minYears ? `${opening.minYears}+ yrs` : ''].filter(Boolean).join(' · ')}</p></div>
              <ScoreMark score={opening.bestScore} size="sm" />
            </div>
            <div className="hr-card-skills"><span className="hr-label">Must-have</span><Tags items={opening.mustHave.slice(0, 6)} tone="must" /></div>
            <dl className="hr-card-stats">
              <div><dt>Resumes</dt><dd>{opening.candidateCount}</dd></div>
              <div><dt>Strong</dt><dd>{opening.strongCount}</dd></div>
              <div><dt>Created</dt><dd>{formatDate(opening.createdAt)}</dd></div>
            </dl>
          </Link>)}
        </div>}
  </div>
}
