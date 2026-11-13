import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { formatRupees } from '../../shared/plans.js'
import { HR_FREE_OPENING_LIMIT, HR_PRICES, HR_RESUMES_PER_OPENING, HR_YEARLY_SAVING_PERCENT } from '../../shared/hrPlans.js'
import { useHrSession } from './HrApp.jsx'
import { Icon, PageHeader } from './hrUi.jsx'

export default function HrPlan() {
  const { account } = useHrSession()
  const location = useLocation()
  const [term, setTerm] = useState('yearly')
  const [notice, setNotice] = useState('')
  const pro = account.plan === 'pro'
  const used = account.openingsCreated
  const price = term === 'yearly' ? HR_PRICES.yearly : HR_PRICES.monthly

  return <div className="hr-page">
    <PageHeader eyebrow="Plan & billing" title={pro ? 'You’re on Hiring Pro' : 'Free plan'} lede={pro ? 'Create as many job openings as you need.' : `Free includes ${HR_FREE_OPENING_LIMIT} job openings. Hiring Pro removes the limit.`} />

    {location.state?.limitReached && !pro && <p className="hr-alert hr-alert--info" role="status">You’ve used both free job openings. Upgrade to Hiring Pro to create more.</p>}

    {!pro && <section className="hr-panel hr-usage-panel" aria-label="Usage">
      <div><span className="hr-label">Job openings used</span><b>{Math.min(used, HR_FREE_OPENING_LIMIT)} <small>of {HR_FREE_OPENING_LIMIT}</small></b></div>
      <span className="hr-usage-bar hr-usage-bar--lg"><i style={{ width: `${Math.min(100, used / HR_FREE_OPENING_LIMIT * 100)}%` }} /></span>
      <p className="hr-muted">Deleting an opening doesn’t give the slot back.</p>
    </section>}

    <div className="hr-plans">
      <section className={`hr-panel hr-plan${!pro ? ' is-current' : ''}`}>
        <p className="hr-eyebrow">Free</p>
        <p className="hr-price"><b>₹0</b></p>
        <ul>
          <li><Icon name="check" />{HR_FREE_OPENING_LIMIT} job openings</li>
          <li><Icon name="check" />Up to {HR_RESUMES_PER_OPENING} resumes per opening</li>
          <li><Icon name="check" />Scoring and ranking with full breakdowns</li>
        </ul>
        {!pro && <p className="hr-current">Current plan</p>}
      </section>

      <section className={`hr-panel hr-plan hr-plan--pro${pro ? ' is-current' : ''}`}>
        <div className="hr-plan-top">
          <p className="hr-eyebrow">Hiring Pro</p>
          <div className="hr-toggle" role="group" aria-label="Billing term">
            <button type="button" aria-pressed={term === 'monthly'} onClick={() => setTerm('monthly')}>Monthly</button>
            <button type="button" aria-pressed={term === 'yearly'} onClick={() => setTerm('yearly')}>Yearly <span>−{HR_YEARLY_SAVING_PERCENT}%</span></button>
          </div>
        </div>
        <p className="hr-price"><b>₹{formatRupees(price)}</b><span>/{term === 'yearly' ? 'year' : 'month'} · GST included</span></p>
        <ul>
          <li><Icon name="check" />Unlimited job openings</li>
          <li><Icon name="check" />Up to {HR_RESUMES_PER_OPENING} resumes per opening</li>
          <li><Icon name="check" />Scoring and ranking with full breakdowns</li>
        </ul>
        {pro ? <p className="hr-current">Current plan</p>
          : <button className="hr-btn hr-btn--primary hr-btn--block" type="button" onClick={() => setNotice('Checkout opens soon. Payments aren’t switched on yet.')}>Upgrade to Hiring Pro</button>}
        {notice && <p className="hr-alert hr-alert--info" role="status">{notice}</p>}
      </section>
    </div>
  </div>
}
