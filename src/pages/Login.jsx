import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import './login.css'

// The approval stamp plays for this long before the page transitions into the workspace.
const APPROVAL_MS = 2400
const EXIT_MS = 650

function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.35 12.23c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.15c1.84-1.7 2.9-4.2 2.9-7.26Z" />
    <path fill="#34A853" d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.15-2.45c-.87.58-1.98.92-3.3.92-2.54 0-4.7-1.72-5.47-4.03H3.28v2.53A9.75 9.75 0 0 0 12 21.5Z" />
    <path fill="#FBBC05" d="M6.53 13.58a5.86 5.86 0 0 1 0-3.16V7.89H3.28a9.75 9.75 0 0 0 0 8.22l3.25-2.53Z" />
    <path fill="#EA4335" d="M12 6.39c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.84 3.51 14.63 2.5 12 2.5a9.75 9.75 0 0 0-8.72 5.39l3.25 2.53C7.3 8.11 9.46 6.39 12 6.39Z" />
  </svg>
}

// Decorative stack of CV sheets, drawn on the full-screen blue backdrop: the front sheet writes itself line by line while evidence chips float in.
function ResumeShowcaseArt() {
  return <div className="login-art" aria-hidden="true">
    <div className="login-sheet login-sheet--back" />
    <div className="login-sheet login-sheet--mid" />
    <div className="login-sheet login-sheet--front">
      <div className="login-sheet-header"><span className="login-sheet-avatar" /><span className="login-sheet-name"><i /><i /></span></div>
      <span className="login-sheet-heading" />
      <i className="login-sheet-line" style={{ '--w': '92%', '--d': '0s' }} />
      <i className="login-sheet-line" style={{ '--w': '78%', '--d': '.25s' }} />
      <i className="login-sheet-line is-highlight" style={{ '--w': '86%', '--d': '.5s' }} />
      <span className="login-sheet-heading" />
      <i className="login-sheet-line" style={{ '--w': '70%', '--d': '.75s' }} />
      <i className="login-sheet-line" style={{ '--w': '88%', '--d': '1s' }} />
      <span className="login-sheet-tags"><i /><i /><i /></span>
    </div>
    <span className="login-chip login-chip--verified"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 7" /></svg>Verified with GitHub</span>
    <span className="login-chip login-chip--match"><b>92%</b>Role match</span>
    <span className="login-chip login-chip--ats">ATS-ready</span>
  </div>
}

// Approval: a resume sheet writes itself, then a seal stamps it with a drawn tick.
export function ApprovalStamp() {
  return <div className="login-approval" role="status" aria-live="polite">
    <div className="login-approval-art" aria-hidden="true">
      <div className="login-approval-sheet">
        <i style={{ '--w': '58%', '--d': '.15s' }} className="is-title" />
        <i style={{ '--w': '84%', '--d': '.35s' }} />
        <i style={{ '--w': '72%', '--d': '.5s' }} />
        <i style={{ '--w': '90%', '--d': '.65s' }} />
        <i style={{ '--w': '64%', '--d': '.8s' }} />
        <i style={{ '--w': '80%', '--d': '.95s' }} />
      </div>
      <svg className="login-approval-seal" viewBox="0 0 120 120">
        <circle className="login-approval-seal-ring" cx="60" cy="60" r="50" />
        <circle className="login-approval-seal-dash" cx="60" cy="60" r="41" />
        <path className="login-approval-seal-tick" d="M40 61.5 54 75 81 46" />
      </svg>
    </div>
    <h2>You're in</h2>
    <p>Opening your workspace…</p>
  </div>
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signInWithGoogle, isConfigured } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [authStage, setAuthStage] = useState('idle')
  const from = location.state?.from?.pathname || '/dashboard'

  const finishApproval = useCallback(() => {
    setAuthStage(stage => stage === 'approving' ? 'exiting' : stage)
  }, [])

  useEffect(() => {
    if (authStage !== 'approving') return undefined
    const approvalTimer = window.setTimeout(finishApproval, APPROVAL_MS)
    return () => window.clearTimeout(approvalTimer)
  }, [authStage, finishApproval])

  useEffect(() => {
    if (authStage !== 'exiting') return undefined
    const navigateTimer = window.setTimeout(() => navigate(from, { replace: true }), EXIT_MS)
    return () => window.clearTimeout(navigateTimer)
  }, [authStage, from, navigate])

  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle()
      setAuthStage('approving')
    } catch (signInError) {
      console.error('Google sign-in failed:', signInError)
      setError(signInError?.code === 'auth/popup-closed-by-user'
        ? 'The sign-in window was closed. Try again when you are ready.'
        : 'Google sign-in could not be completed. Check your Firebase setup and try again.')
    } finally {
      setLoading(false)
    }
  }

  return <main className={`login-page login-page--${authStage}`}>
    <div className="login-hero">
      <ResumeShowcaseArt />
      <h2 className="login-showcase-title">Build a resume you can stand behind.</h2>
    </div>

    <div className="login-shell">
      <section className={`login-panel${authStage !== 'idle' ? ' login-panel--approved' : ''}`} aria-labelledby={authStage === 'idle' ? 'login-title' : undefined} aria-label={authStage === 'idle' ? undefined : 'Signed in'}>
        {authStage !== 'idle' ? <ApprovalStamp /> : <div className="login-form">
          <BrandLogo className="login-logo" animate wordmark={false} />
          <h1 id="login-title">Welcome.</h1>
          <p className="login-subtitle">Sign in to continue to your resume workspace.</p>
          {!isConfigured && <div className="login-setup-note">Authentication is not configured yet. Add the Firebase values from <code>.env.example</code>, then restart Vite.</div>}
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="login-button" type="button" onClick={handleGoogleSignIn} disabled={loading || !isConfigured}>
            {loading ? <span className="login-spinner" aria-hidden="true" /> : <GoogleMark />}
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>
          <p className="login-note">New to Resumetrics? Signing in with Google creates your workspace.</p>
          <ul className="login-assurances">
            <li>Your password stays with Google</li>
            <li>Your resumes stay private to your account</li>
          </ul>
        </div>}
      </section>
    </div>
  </main>
}
