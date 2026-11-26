import { useEffect, useState } from 'react'
import { usePlan } from '../context/PlanContext.jsx'
import { COUNTED_DELETE_PERCENT, FREE_RESUME_LIMIT, PRICES, YEARLY_SAVING_PERCENT, formatRupees } from '../../shared/plans.js'
import './plan.css'

const Check = () => <svg className="plan-check" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3.2L15 6.8" /></svg>
const Dash = () => <svg className="plan-dash" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 10h8" /></svg>

const FREE_FEATURES = [`${FREE_RESUME_LIMIT} resumes`, 'Every template', 'NIMBUS: change lists, reviews, layout control', 'Cover letters', 'GitHub evidence check', 'PDF, Word and text export']
const PRO_FEATURES = ['Unlimited resumes', 'NIMBUS Pro: apply all, add numbers, tone, smart one page, template advice', 'Job tailoring: match score and one-click fixes', 'Job tracker: openings from LinkedIn, Naukri, Indeed and more', 'Every opening ranked against your resume', 'Application board from saved to offer']
const LIFETIME_FEATURES = ['Everything in Pro, for good', 'One payment, no renewals', 'Every Pro feature we add later']

const COMPARE = [
  ['Resumes', `${FREE_RESUME_LIMIT}`, 'Unlimited'],
  ['Templates, formatting and export', true, true],
  ['NIMBUS AI writing, change lists and layout control', true, true],
  ['NIMBUS requests per day', '20', '150'],
  ['Strength score and quick fixes', 'Top 3 fixes', 'Every fix'],
  ['NIMBUS Pro tools (apply all, add numbers, tone, tailor, one page, templates)', false, true],
  ['Cover letters', true, true],
  ['GitHub evidence check', true, true],
  ['Job tailoring (JD match and fixes)', false, true],
  ['Job tracker with live openings', false, true],
  ['Application board', false, true]
]

const FAQ = [
  ['What counts as one of my free resumes?', `Every resume you create or duplicate takes one of the ${FREE_RESUME_LIMIT} free slots. If you delete a resume that was less than ${COUNTED_DELETE_PERCENT}% complete you get the slot back; a resume that was ${COUNTED_DELETE_PERCENT}% or more complete keeps counting, so the free plan can’t be used to make endless finished resumes.`],
  ['Can I switch between monthly and yearly?', `Yes. Yearly costs ₹${formatRupees(PRICES.yearly)}, about ₹${formatRupees(Math.round(PRICES.yearly / 12))} a month, which saves ${YEARLY_SAVING_PERCENT}% against paying monthly.`],
  ['Is Lifetime really a single payment?', `Yes. ₹${formatRupees(PRICES.lifetime)} once and Pro stays on your account with no renewals, including features added later.`],
  ['Do prices include GST?', 'Yes. The price you see is the price you pay.']
]

const termLabel = { monthly: 'Monthly', yearly: 'Yearly', lifetime: 'Lifetime' }

export default function PlanPage() {
  const { pro, plan, resumes, loading, refresh } = usePlan()
  const [term, setTerm] = useState('monthly')
  const [notice, setNotice] = useState('')
  useEffect(() => { refresh() }, [refresh])

  const currentTerm = pro ? plan?.term : null
  const yearly = term === 'yearly'
  // Payments (Razorpay) are not connected yet, so choosing a paid plan only explains that.
  const choose = name => setNotice(`${name} checkout opens soon. We’re connecting secure payments (UPI, cards and netbanking); this button will start checkout right here.`)

  return <div className="plan-page">
    <header className="plan-head">
      <span className="plan-pill"><i aria-hidden="true" />Plans and pricing</span>
      <h1>Build for free. Go Pro for the job hunt.</h1>
      <p>Start with {FREE_RESUME_LIMIT} free resumes. Pro adds job tailoring and a job tracker that finds openings matched to your resume. Prices in rupees, GST included.</p>
      {!loading && <div className="plan-status" role="status">
        {pro
          ? <><b>You’re on Pro{currentTerm ? ` · ${termLabel[currentTerm]}` : ''}</b>{plan?.source === 'developer' && <span>Developer access</span>}</>
          : <><b>You’re on Free</b>{resumes && <span>{resumes.used} of {resumes.limit} resumes used</span>}</>}
      </div>}
    </header>

    <div className="plan-grid">
      <article className="plan-card is-free" aria-labelledby="plan-free">
        <div className="plan-card-top">
          <h2 id="plan-free">Free</h2>
          <p className="plan-tagline">For your first resumes</p>
          <p className="plan-price"><span className="plan-currency">₹</span><strong>0</strong><span className="plan-per">forever</span></p>
          <p className="plan-note">No card needed</p>
        </div>
        <button type="button" className="plan-cta is-quiet" disabled>{pro ? 'Included in Pro' : 'Your plan'}</button>
        <ul className="plan-features">{FREE_FEATURES.map(item => <li key={item}><Check />{item}</li>)}</ul>
      </article>

      <article className="plan-card is-pro" aria-labelledby="plan-pro">
        <span className="plan-ribbon">Most popular</span>
        <div className="plan-card-top">
          <div className="plan-card-title">
            <h2 id="plan-pro">Pro</h2>
            <div className="plan-toggle" role="radiogroup" aria-label="Billing period">
              {['monthly', 'yearly'].map(value => <button key={value} type="button" role="radio" aria-checked={term === value} className={term === value ? 'is-on' : ''} onClick={() => setTerm(value)}>{termLabel[value]}</button>)}
              <span className={`plan-toggle-thumb${yearly ? ' is-right' : ''}`} aria-hidden="true" />
            </div>
          </div>
          <p className="plan-tagline">For an active job hunt</p>
          <p className="plan-price" aria-live="polite"><span className="plan-currency">₹</span><strong key={term}>{formatRupees(yearly ? PRICES.yearly : PRICES.monthly)}</strong><span className="plan-per">/ {yearly ? 'year' : 'month'}</span></p>
          <p className="plan-note">{yearly ? <>About ₹{formatRupees(Math.round(PRICES.yearly / 12))} a month <em>Save {YEARLY_SAVING_PERCENT}%</em></> : <>Or ₹{formatRupees(PRICES.yearly)} a year, save {YEARLY_SAVING_PERCENT}%</>}</p>
        </div>
        {currentTerm === term
          ? <button type="button" className="plan-cta" disabled>Your plan</button>
          : <button type="button" className="plan-cta" disabled={currentTerm === 'lifetime'} onClick={() => choose(`Pro ${termLabel[term].toLowerCase()}`)}>{currentTerm === 'lifetime' ? 'Included in Lifetime' : `Get Pro ${termLabel[term].toLowerCase()}`}</button>}
        <p className="plan-includes">Everything in Free, plus:</p>
        <ul className="plan-features">{PRO_FEATURES.map(item => <li key={item}><Check />{item}</li>)}</ul>
      </article>

      <article className="plan-card is-lifetime" aria-labelledby="plan-lifetime">
        <div className="plan-card-top">
          <h2 id="plan-lifetime">Lifetime</h2>
          <p className="plan-tagline">Pay once, keep Pro</p>
          <p className="plan-price"><span className="plan-currency">₹</span><strong>{formatRupees(PRICES.lifetime)}</strong><span className="plan-per">once</span></p>
          <p className="plan-note">About two years of yearly Pro</p>
        </div>
        <button type="button" className="plan-cta is-light" disabled={currentTerm === 'lifetime'} onClick={() => choose('Lifetime')}>{currentTerm === 'lifetime' ? 'Your plan' : 'Get Lifetime'}</button>
        <ul className="plan-features">{LIFETIME_FEATURES.map(item => <li key={item}><Check />{item}</li>)}</ul>
      </article>
    </div>

    {notice && <p className="plan-notice" role="status"><span aria-hidden="true">i</span>{notice}<button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice('')}>Got it</button></p>}

    <section className="plan-compare" aria-labelledby="plan-compare-title">
      <h2 id="plan-compare-title">Free and Pro side by side</h2>
      <table>
        <thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Pro</th></tr></thead>
        <tbody>{COMPARE.map(([feature, free, paid]) => <tr key={feature}>
          <th scope="row">{feature}</th>
          {[free, paid].map((value, index) => <td key={index}>{typeof value === 'string' ? value : value ? <><Check /><span className="sr-only">Included</span></> : <><Dash /><span className="sr-only">Not included</span></>}</td>)}
        </tr>)}</tbody>
      </table>
    </section>

    <section className="plan-faq" aria-labelledby="plan-faq-title">
      <div className="plan-faq-glow" aria-hidden="true" />
      <h2 id="plan-faq-title">Questions, answered</h2>
      {FAQ.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
    </section>
  </div>
}
