import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../BrandLogo.jsx'
import LandingIcon from './LandingIcon.jsx'
import { nav } from './landingContent.js'
import { onScroll } from './useLenis.js'

/** Floating pill nav: glass on the mustard hero, solid once the page scrolls past it. */
export default function LandingNav() {
  const navigate = useNavigate()
  const [solid, setSolid] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const update = () => setSolid(window.scrollY > window.innerHeight * .7)
    update()
    return onScroll(update)
  }, [])
  return <header className={`lp-nav${solid ? ' is-solid' : ''}${open ? ' is-open' : ''}`}>
    <a href="#top" className="lp-nav-brand" aria-label="Resumetrics home"><BrandLogo wordmark={false} /></a>
    <nav className="lp-nav-links" aria-label="Page sections">
      {nav.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}
    </nav>
    <div className="lp-nav-actions">
      <button type="button" className="lp-btn lp-btn-small lp-nav-cta" onClick={() => navigate('/login')}>Start free</button>
      <button type="button" className="lp-nav-menu" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(value => !value)}><LandingIcon name={open ? 'close' : 'menu'} size={20} /></button>
    </div>
  </header>
}
