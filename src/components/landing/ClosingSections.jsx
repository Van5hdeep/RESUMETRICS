import { useNavigate } from 'react-router-dom'
import BrandLogo from '../BrandLogo.jsx'
import LandingIcon from './LandingIcon.jsx'
import { BRAND } from '../../../shared/brand.js'

export function BigCta() {
  const navigate = useNavigate()
  return <section className="lp-bigcta" data-cine aria-labelledby="lp-bigcta-title">
    <div className="lp-bigcta-box">
      <div className="lp-bigcta-orbs" aria-hidden="true"><i /><i /><i /></div>
      <h2 id="lp-bigcta-title">The right resume, <span>on both sides of the hire.</span></h2>
      <p>Looking for a job? Start with your old resume, your LinkedIn profile or a blank page; your first two resumes are free. Hiring? Open the HR portal and try the demo workspace.</p>
      <div className="lp-bigcta-actions">
        <button type="button" className="lp-btn lp-btn-ink lp-btn-lg" onClick={() => navigate('/login')}>Start free</button>
        <a className="lp-btn lp-btn-outline lp-btn-lg" href="/hr/login">I’m hiring</a>
      </div>
    </div>
  </section>
}

// Social accounts are coming; the links stay inert until their addresses are added here.
const socials = []   // e.g. ['instagram', 'Instagram', 'https://www.instagram.com/…']

export function LandingFooter() {
  const navigate = useNavigate()
  const year = new Date().getFullYear()
  return <footer className="lp-footer">
    <div className="lp-footer-top">
      <div className="lp-footer-brand">
        <BrandLogo />
        <p>{BRAND.tagline}</p>
        {/* Social accounts are listed only once they exist: add [icon, name, url] rows to `socials`. */}
        {socials.length > 0 && <ul className="lp-socials" aria-label={`${BRAND.name} on social media`}>
          {socials.map(([icon, name, url]) => <li key={icon}><a href={url} target="_blank" rel="noopener noreferrer" aria-label={name} title={name}><LandingIcon name={icon} size={18} /></a></li>)}
        </ul>}
      </div>
      <nav className="lp-footer-links" aria-label="Footer">
        <div><b>Product</b><a href="#sides">Two sides</a><a href="#nimbus">NIMBUS</a><a href="#inside">Inside the app</a><a href="#hiring">For hiring teams</a></div>
        <div><b>Tools</b><a href="#tailor">Job tailoring</a><a href="#letter">Cover letters</a><a href="#evidence">Evidence check</a><a href="#jobs">Job tracker</a></div>
        <div><b>Account</b><button type="button" onClick={() => navigate('/login')}>Start free</button><a href="/hr/login">For hiring teams</a></div>
        <div><b>Legal</b><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></div>
      </nav>
    </div>
    <div className="lp-footer-bottom">
      <span>© {year} {BRAND.name}. All rights reserved.</span>
      <span>Made in India, for job seekers and hiring teams everywhere.</span>
    </div>
  </footer>
}
