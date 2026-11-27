import { useNavigate } from 'react-router-dom'
import BrandLogo from '../BrandLogo.jsx'
import GhostFibers from '../reactbits/GhostFibers.jsx'
import { BRAND } from '../../../shared/brand.js'

/**
 * Violet hero: fibers in the app's violet drifting behind the wordmark. This entrance is the page's one orchestrated
 * motion (each line rises in turn, --i); everything below answers scrolling or a click.
 */
export default function GoldHero() {
  const navigate = useNavigate()
  return <section className="lp-hero" id="top" data-cine="hero">
    <div className="lp-hero-fibers" aria-hidden="true">
      <GhostFibers glowColor="#a99bff" lineColor="#7d6bff" glow={1.5} brightness={1.3} waves={0.024} twist={0.15} threads={2} speed={0.18} vignette={0.35} grain={0.02} />
    </div>
    <div className="lp-hero-inner">
      <span className="lp-hero-pill lp-enter" style={{ '--i': 0 }}>For job seekers and hiring teams</span>
      <h1 className="lp-hero-title">
        <BrandLogo className="lp-hero-logo" animate />
        <span className="lp-hero-lede lp-enter" style={{ '--i': 2 }}>Refine your resume for every job.</span>
      </h1>
      <p className="lp-hero-sub lp-enter" style={{ '--i': 3 }}>{BRAND.name} is a resume workspace. Job seekers rework one resume into the right version for every role, with an AI that never invents a fact. Hiring teams drop in the resumes they receive and get them read, scored and sorted against the job.</p>
      <div className="lp-hero-ctas lp-enter" style={{ '--i': 4 }}>
        <button type="button" className="lp-btn lp-btn-ink" onClick={() => navigate('/login')}>Start free</button>
        <button type="button" className="lp-btn lp-btn-outline" onClick={() => navigate('/hr/login')}>I’m hiring</button>
      </div>
      <p className="lp-hero-note lp-enter" style={{ '--i': 5 }}>Free to start, no card needed. Job seekers sign in with Google; hiring teams use a work email.</p>
    </div>
  </section>
}
