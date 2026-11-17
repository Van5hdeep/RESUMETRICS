import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getSession, signIn, startDemo } from './hrApi.js'
import BrandLogo from '../components/BrandLogo.jsx'

// Decorative ranked shortlist: the portal's one idea, drawn.
function RankingArt() {
  const rows = [['Asha R.', 91, 'strong'], ['Dev M.', 78, 'strong'], ['Lena K.', 64, 'good'], ['Omar S.', 47, 'fair']]
  return <div className="hr-login-art" aria-hidden="true">
    <div className="hr-login-card">
      <p className="hr-login-card-title">Frontend Developer <span>· 24 resumes</span></p>
      {rows.map(([name, score, band], index) => <div key={name} className="hr-login-row" style={{ '--d': `${0.2 + index * 0.18}s` }}>
        <span className="hr-login-rank">{index + 1}</span>
        <span className="hr-login-name">{name}</span>
        <span className={`hr-meter hr-band--${band}`}><i style={{ width: `${score}%` }} /></span>
        <b className={`hr-band--${band}`}>{score}</b>
      </div>)}
    </div>
  </div>
}

/** The violet left half shared by sign-in and sign-up. */
export function HrAuthSide({ title, lede }) {
  return <section className="hr-login-side">
    <div className="hr-login-brand"><BrandLogo animate /><em>Hiring</em></div>
    <h2>{title ?? <>Hire from evidence,<br /><em>not guesswork.</em></>}</h2>
    <p>{lede ?? 'Describe the job once. Every resume you upload is scored against it and ranked, with the reasons shown.'}</p>
    <RankingArt />
  </section>
}

export default function HrLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(location.state?.ended ? 'Your session ended. Sign in again.' : '')
  const [busy, setBusy] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)

  if (getSession()) return <Navigate to="/hr" replace />

  const openDemo = async () => {
    setError('')
    setDemoBusy(true)
    try {
      await startDemo()
      navigate('/hr', { replace: true })
    } catch (problem) {
      setError(problem.message)
      setDemoBusy(false)
    }
  }

  const submit = async event => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(email, password)
      navigate('/hr', { replace: true })
    } catch (problem) {
      setError(problem.message)
      setBusy(false)
    }
  }

  return <main className="hr-login">
    <HrAuthSide />

    <section className="hr-login-main">
      <form className="hr-login-form" onSubmit={submit} noValidate>
        <p className="hr-eyebrow">HR portal</p>
        <h1>Sign in</h1>
        <p className="hr-muted">Use your work email and password.</p>
        {error && <p className="hr-alert hr-alert--error" role="alert">{error}</p>}
        <label className="hr-field">
          <span>Work email</span>
          <input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.com" required autoFocus />
        </label>
        <label className="hr-field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
        </label>
        <button className="hr-btn hr-btn--primary hr-btn--block" type="submit" disabled={busy || demoBusy || !email.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="hr-login-switch">New to Resumetrics Hiring? <Link to="/hr/register">Create an HR account</Link></p>
        <div className="hr-login-demo">
          <button className="hr-btn hr-btn--ghost hr-btn--block" type="button" onClick={openDemo} disabled={busy || demoBusy}>{demoBusy ? 'Opening the demo…' : 'Explore the demo'}</button>
          <span>A private sample workspace with made-up candidates, just for you. It is deleted after 24 hours or when you sign out.</span>
        </div>
        <p className="hr-login-switch">Looking for your own resume? <Link to="/login">Candidate sign-in</Link></p>
        <p className="hr-login-legal"><Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link></p>
      </form>
    </section>
  </main>
}
