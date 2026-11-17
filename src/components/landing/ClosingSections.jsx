import { useNavigate } from 'react-router-dom'
import BrandLogo from '../BrandLogo.jsx'
import LandingIcon from './LandingIcon.jsx'

export function BigCta() {
  const navigate = useNavigate()
  return <section className="lp-bigcta" data-cine aria-labelledby="lp-bigcta-title">
    <div className="lp-bigcta-box">
      <div className="lp-bigcta-orbs" aria-hidden="true"><i /><i /><i /></div>
      <h2 id="lp-bigcta-title">Your best resume, <span>moments away.</span></h2>
      <p>Start with your old resume, your LinkedIn profile or a blank page. Your first two resumes are free.</p>
      <div className="lp-bigcta-actions">
        <button type="button" className="lp-btn lp-btn-ink lp-btn-lg" onClick={() => navigate('/login')}>Start free</button>
        <a className="lp-btn lp-btn-outline lp-btn-lg" href="#inside">See inside the app</a>
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
        <p>Resumes built from your real work, tuned to every job.</p>
        {/* Social accounts are listed only once they exist: add [icon, name, url] rows to `socials`. */}
        {socials.length > 0 && <ul className="lp-socials" aria-label="Resumetrics on social media">
          {socials.map(([icon, name, url]) => <li key={icon}><a href={url} target="_blank" rel="noopener noreferrer" aria-label={name} title={name}><LandingIcon name={icon} size={18} /></a></li>)}
        </ul>}
      </div>
      <nav className="lp-footer-links" aria-label="Footer">
        <div><b>Product</b><a href="#nimbus">NIMBUS</a><a href="#inside">Inside the app</a></div>
        <div><b>Tools</b><a href="#tailor">Job tailoring</a><a href="#letter">Cover letters</a><a href="#evidence">Evidence check</a><a href="#jobs">Job tracker</a></div>
        <div><b>Account</b><button type="button" onClick={() => navigate('/login')}>Start free</button><a href="/hr/login">For hiring teams</a></div>
        <div><b>Legal</b><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></div>
      </nav>
    </div>
    <div className="lp-footer-bottom">
      <span>© {year} Resumetrics. All rights reserved.</span>
      <span>Made in India, for job seekers everywhere.</span>
    </div>
  </footer>
}
