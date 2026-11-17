import { useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { formatRupees } from '../../shared/plans.js'
import { HR_FREE_OPENING_LIMIT, HR_PRICES, HR_RESUMES_PER_OPENING, HR_YEARLY_SAVING_PERCENT } from '../../shared/hrPlans.js'
import { useHrSession } from './HrApp.jsx'
import { Icon, PageHeader } from './hrUi.jsx'

const TERMS = ['monthly', 'yearly']
const MONTHLY_FOR_A_YEAR = HR_PRICES.monthly * 12
const YEARLY_SAVING = MONTHLY_FOR_A_YEAR - HR_PRICES.yearly

// Only the number of openings differs between the plans; everything else is in both. The table says so plainly.
const COMPARISON = [
  { label: 'Job openings', free: `${HR_FREE_OPENING_LIMIT} in total`, pro: 'Unlimited', differs: true },
  { label: 'Resumes per opening', free: `Up to ${HR_RESUMES_PER_OPENING}`, pro: `Up to ${HR_RESUMES_PER_OPENING}` },
  { label: 'Scoring, ranking and “why this score”', free: true, pro: true },
  { label: 'Compare chart and side-by-side compare', free: true, pro: true },
  { label: 'Shortlist, reject and bulk actions', free: true, pro: true },
  { label: 'Blind screening and custom weights', free: true, pro: true },
  { label: 'Shortlist export (CSV)', free: true, pro: true }
]

/** Monthly / Yearly with a thumb that slides to the chosen side. */
function TermToggle({ term, setTerm }) {
  const refs = useRef({})
  const [thumb, setThumb] = useState(null)
  useLayoutEffect(() => {
    const active = refs.current[term]
    if (active) setThumb({ left: active.offsetLeft, width: active.offsetWidth })
  }, [term])
  return <div className="hr-toggle hr-toggle--slide" role="radiogroup" aria-label="Billing term">
    {thumb && <span className="hr-toggle-thumb" style={{ transform: `translateX(${thumb.left - 2}px)`, width: thumb.width }} aria-hidden="true" />}
    {TERMS.map(item => <button key={item} ref={element => { refs.current[item] = element }} type="button" role="radio" aria-checked={term === item} className={term === item ? 'is-on' : ''} onClick={() => setTerm(item)}>
      {item === 'monthly' ? 'Monthly' : <>Yearly <span>−{HR_YEARLY_SAVING_PERCENT}%</span></>}
    </button>)}
  </div>
}

/** Both prices sit in a one-line window; switching term slides the other one into view. */
function SlidingPrice({ term }) {
  const index = TERMS.indexOf(term)
  return <div className="hr-price-window" aria-live="polite">
    <div className="hr-price-clip">
      <div className="hr-price-track" style={{ transform: `translateY(${-index * 56}px)` }}>
        <p className="hr-price" aria-hidden={term !== 'monthly'}><b>₹{formatRupees(HR_PRICES.monthly)}</b><span>/month · GST included</span></p>
        <p className="hr-price" aria-hidden={term !== 'yearly'}><b>₹{formatRupees(HR_PRICES.yearly)}</b><span>/year · GST included</span></p>
      </div>
    </div>
    <p className="hr-price-note">{term === 'yearly' ? `About ₹${formatRupees(Math.round(HR_PRICES.yearly / 12))} a month, billed once a year.` : `₹${formatRupees(MONTHLY_FOR_A_YEAR)} over a year if you stay monthly.`}</p>
  </div>
}

/** Twelve opening slots: Free fills two, the rest stay locked; Pro fills them all and keeps going. */
function OpeningsVisual() {
  const slots = Array.from({ length: 12 }, (_, index) => index)
  const row = (filled, label, more) => <div className="hr-slots-row">
    <span className="hr-slots-label">{label}</span>
    <span className="hr-slots" role="img" aria-label={more ? 'Unlimited openings' : `${HR_FREE_OPENING_LIMIT} openings, the rest locked`}>
      {slots.map(index => <i key={index} className={index < filled ? 'is-on' : 'is-locked'} />)}
      {more && <em>and more</em>}
    </span>
  </div>
  return <div className="hr-visual">
    <h3>Job openings you can create</h3>
    {row(HR_FREE_OPENING_LIMIT, 'Free')}
    {row(12, 'Hiring Pro', true)}
    <p className="hr-note-sm">On Free, closing or deleting an opening doesn’t give its slot back.</p>
  </div>
}

/** What a year of Hiring Pro costs on each term. */
function CostVisual() {
  const width = value => `${value / MONTHLY_FOR_A_YEAR * 100}%`
  return <div className="hr-visual">
    <h3>A year of Hiring Pro</h3>
    <div className="hr-cost-row"><span>Monthly × 12</span><span className="hr-cost-bar"><i className="is-monthly" style={{ width: width(MONTHLY_FOR_A_YEAR) }} /></span><b>₹{formatRupees(MONTHLY_FOR_A_YEAR)}</b></div>
    <div className="hr-cost-row"><span>Yearly</span><span className="hr-cost-bar"><i className="is-yearly" style={{ width: width(HR_PRICES.yearly) }} /></span><b>₹{formatRupees(HR_PRICES.yearly)}</b></div>
    <p className="hr-cost-saving"><Icon name="check" />Yearly saves ₹{formatRupees(YEARLY_SAVING)} ({HR_YEARLY_SAVING_PERCENT}%).</p>
  </div>
}

export default function HrPlan() {
  const { account } = useHrSession()
  const location = useLocation()
  const [term, setTerm] = useState('yearly')
  const [notice, setNotice] = useState('')
  const pro = account.plan === 'pro'
  const used = account.openingsCreated
  const mark = value => value === true ? <span className="hr-yes"><Icon name="check" /><span className="hr-visually-hidden">Included</span></span> : value

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
        <p className="hr-price"><b>₹0</b><span>forever</span></p>
        <ul>
          <li><Icon name="check" />{HR_FREE_OPENING_LIMIT} job openings</li>
          <li><Icon name="check" />Up to {HR_RESUMES_PER_OPENING} resumes per opening</li>
          <li><Icon name="check" />Every screening feature</li>
        </ul>
        {!pro && <p className="hr-current">Current plan</p>}
      </section>

      <section className={`hr-panel hr-plan hr-plan--pro${pro ? ' is-current' : ''}`}>
        <div className="hr-plan-top">
          <p className="hr-eyebrow">Hiring Pro</p>
          <TermToggle term={term} setTerm={setTerm} />
        </div>
        <SlidingPrice term={term} />
        <ul>
          <li><Icon name="check" />Unlimited job openings</li>
          <li><Icon name="check" />Up to {HR_RESUMES_PER_OPENING} resumes per opening</li>
          <li><Icon name="check" />Every screening feature</li>
        </ul>
        {pro ? <p className="hr-current">Current plan</p>
          : <button className="hr-btn hr-btn--primary hr-btn--block" type="button" onClick={() => setNotice('Checkout opens soon. Payments aren’t switched on yet.')}>Upgrade to Hiring Pro</button>}
        {notice && <p className="hr-alert hr-alert--info" role="status">{notice}</p>}
      </section>
    </div>

    <section className="hr-panel hr-compare-plans" aria-labelledby="hr-plans-diff">
      <div className="hr-panel-head"><h2 id="hr-plans-diff">What’s different</h2><span className="hr-muted">Both plans have every screening feature. Only the number of openings and the price change.</span></div>
      <div className="hr-visuals">
        <OpeningsVisual />
        <CostVisual />
      </div>
      <div className="hr-table-wrap"><table className="hr-table hr-plan-table">
        <thead><tr><th>Feature</th><th>Free</th><th>Hiring Pro</th></tr></thead>
        <tbody>
          <tr className="is-differs"><td>Price</td><td>₹0</td><td>₹{formatRupees(HR_PRICES.monthly)}/month or ₹{formatRupees(HR_PRICES.yearly)}/year</td></tr>
          {COMPARISON.map(row => <tr key={row.label} className={row.differs ? 'is-differs' : ''}><td>{row.label}</td><td>{mark(row.free)}</td><td>{mark(row.pro)}</td></tr>)}
        </tbody>
      </table></div>
    </section>
  </div>
}
