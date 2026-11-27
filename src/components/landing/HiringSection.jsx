import { hiringPoints } from './landingContent.js'
import { BRAND } from '../../../shared/brand.js'

/** A short word for hiring teams: what the HR portal at /hr does, with a real screen from it. */
export default function HiringSection() {
  return <section className="lp-hiring" id="hiring" data-cine aria-labelledby="lp-hiring-title">
    <div className="lp-hiring-inner">
      <div className="lp-hiring-copy">
        <p className="lp-hiring-kicker">For hiring teams</p>
        <h2 className="lp-title" id="lp-hiring-title">Every resume you receive, organized.</h2>
        <p className="lp-hiring-lede">{BRAND.hiring} is the HR side of {BRAND.name}: a resume organizer for recruiters. Post a job, drop in the resumes you received, and see them read, scored and sorted with the best fit on top.</p>
        <ul className="lp-hiring-points">
          {hiringPoints.map(([title, text]) => <li key={title}><b>{title}</b><span>{text}</span></li>)}
        </ul>
        <div className="lp-hiring-actions">
          <a className="lp-btn lp-btn-ink" href="/hr/login">Try the hiring demo</a>
          <a className="lp-btn lp-btn-outline" href="/hr/register">Create a hiring account</a>
        </div>
      </div>
      <figure className="lp-hiring-shot">
        <div className="lp-screen-window is-static">
          <span className="lp-screen-bar" aria-hidden="true"><i /><i /><i /><span>{BRAND.domain}/hr</span></span>
          <img src="/landing/shots/hr-compare.webp" alt="The hiring portal comparing three candidates on a chart above a ranked list of resumes" loading="lazy" decoding="async" width="2160" height="1350" />
        </div>
      </figure>
    </div>
  </section>
}
