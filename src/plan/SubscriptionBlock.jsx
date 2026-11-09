import { useNavigate } from 'react-router-dom'
import { usePlan } from '../context/PlanContext.jsx'
import './plan.css'

const TERM_LABELS = { monthly: 'Monthly', yearly: 'Yearly', lifetime: 'Lifetime' }

/** Settings → Account: which plan this account is on, with the way to change it. */
export default function SubscriptionBlock() {
  const navigate = useNavigate()
  const { loading, pro, plan, resumes } = usePlan()
  if (loading) return null
  const renews = plan?.currentPeriodEnd ? new Date(plan.currentPeriodEnd).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const detail = pro
    ? [plan?.term === 'lifetime' ? 'Lifetime access, no renewals' : renews ? `Renews on ${renews}` : 'Active', plan?.source === 'developer' && 'Developer access'].filter(Boolean).join(' · ')
    : `${resumes?.limit ? `${Math.min(resumes.used, resumes.limit)} of ${resumes.limit} free resumes used · ` : ''}Job tailoring and the job tracker need Pro`
  return <div className="settings-block">
    <span className="settings-block-title">Subscription</span>
    <div className="settings-plan-row">
      <span className={`settings-plan-badge${pro ? ' is-pro' : ''}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="m3 7 4.5 4L12 5l4.5 6L21 7l-2 11H5L3 7Z" /></svg>
        {pro ? 'Pro' : 'Free'}
      </span>
      <span className="settings-plan-text"><b>{pro ? `Resumetrics Pro${plan?.term ? ` · ${TERM_LABELS[plan.term]}` : ''}` : 'Free plan'}</b><small>{detail}</small></span>
      <button className={pro ? 'btn btn-secondary' : 'btn btn-primary'} type="button" onClick={() => navigate('/plan')}>{pro ? 'View plan' : 'Upgrade to Pro'}</button>
    </div>
  </div>
}
