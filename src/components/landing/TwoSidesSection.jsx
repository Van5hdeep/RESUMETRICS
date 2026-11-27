import { useNavigate } from 'react-router-dom'
import { BRAND } from '../../../shared/brand.js'
import LandingIcon from './LandingIcon.jsx'
import { sides } from './landingContent.js'

/** Right under the hero: what the product is, as its two sides side by side, each with its own way in. */
export default function TwoSidesSection() {
  const navigate = useNavigate()
  return <section className="lp-sides" id="sides" aria-labelledby="lp-sides-title">
    <div className="lp-section-head is-center">
      <h2 className="lp-title is-center" id="lp-sides-title">One resume workspace, two sides of the hire.</h2>
      <p>{BRAND.name} is where job seekers refine their resume for every job, and where hiring teams organize the resumes they receive. Both sides read a resume the same way, against the same job.</p>
    </div>
    <ul className="lp-sides-grid">
      {sides.map((side, index) => <li key={side.id} className={`lp-side lp-side--${side.id} lp-reveal-up`} style={{ '--delay': `${index * 120}ms` }}>
        <span className="lp-side-icon"><LandingIcon name={side.icon} size={22} /></span>
        <p className="lp-side-kicker">{side.kicker}</p>
        <h3>{side.title}</h3>
        <p className="lp-side-lede">{side.lede}</p>
        <ul className="lp-side-points">
          {side.points.map(point => <li key={point}>{point}</li>)}
        </ul>
        <div className="lp-side-actions">
          <button type="button" className="lp-btn lp-btn-ink" onClick={() => navigate(side.cta[1])}>{side.cta[0]}</button>
          <a className="lp-btn lp-btn-outline" href={side.more[1]}>{side.more[0]}</a>
        </div>
      </li>)}
    </ul>
  </section>
}
