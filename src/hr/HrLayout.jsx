import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useHrSession } from './HrApp.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import { Icon } from './hrUi.jsx'

/** Free accounts at their opening limit go to the plan page instead of the form. */
export function useNewOpening() {
  const { account } = useHrSession()
  const navigate = useNavigate()
  const atLimit = account.openingLimit !== null && account.openingsCreated >= account.openingLimit
  return { atLimit, start: () => navigate(atLimit ? '/hr/plan' : '/hr/openings/new', atLimit ? { state: { limitReached: true } } : undefined) }
}

export default function HrLayout() {
  const { account, signOut, refreshAccount } = useHrSession()
  const { start } = useNewOpening()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Counts in the sidebar follow what happens on the pages.
  useEffect(() => { setMenuOpen(false); refreshAccount() }, [location.pathname, refreshAccount])

  const pro = account.plan === 'pro'
  const used = account.openingsCreated
  const limit = account.openingLimit

  return <div className={`hr-shell${menuOpen ? ' hr-shell--menu' : ''}`}>
    <aside className="hr-sidebar">
      <div className="hr-sidebar-top">
        <NavLink className="hr-brand" to="/hr" aria-label="Resumetrics Hiring, overview"><BrandLogo animate="once" name="hr-sidebar" dot reveal word="Hiring" /></NavLink>
        <button className="hr-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="hr-nav" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? 'Close' : 'Menu'}</button>
      </div>
      <div className="hr-sidebar-body" id="hr-nav">
        <button className="hr-btn hr-btn--primary hr-btn--block" type="button" onClick={start}><Icon name="plus" />New opening</button>
        <nav className="hr-nav" aria-label="HR portal">
          <NavLink to="/hr" end><Icon name="overview" />Overview</NavLink>
          <NavLink to="/hr/openings"><Icon name="openings" />Job openings</NavLink>
          <NavLink to="/hr/plan"><Icon name="plan" />Plan &amp; billing</NavLink>
        </nav>
        <div className="hr-sidebar-foot">
          <div className="hr-usage">
            <p><b>{pro ? 'Hiring Pro' : 'Free plan'}</b>{pro ? 'Unlimited openings' : `${Math.min(used, limit)} of ${limit} openings used`}</p>
            {!pro && <span className="hr-usage-bar"><i style={{ width: `${Math.min(100, used / limit * 100)}%` }} /></span>}
          </div>
          <p className="hr-account" title={account.email}>{account.email}</p>
          <button className="hr-signout" type="button" onClick={signOut}><Icon name="out" />Sign out</button>
        </div>
      </div>
    </aside>
    <main className="hr-main">
      <Outlet />
    </main>
  </div>
}
