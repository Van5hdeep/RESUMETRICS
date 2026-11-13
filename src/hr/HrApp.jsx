import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { clearSession, getSession, hrApi, SESSION_ENDED } from './hrApi.js'
import { resetLogoIntro } from '../components/BrandLogo.jsx'
import HrLogin from './HrLogin.jsx'
import HrLayout from './HrLayout.jsx'
import HrOverview from './HrOverview.jsx'
import HrOpenings from './HrOpenings.jsx'
import HrOpeningForm from './HrOpeningForm.jsx'
import HrOpening from './HrOpening.jsx'
import HrPlan from './HrPlan.jsx'
import './hr.css'

const HrSessionContext = createContext(null)
export const useHrSession = () => useContext(HrSessionContext)

/** Only an HR session opens the portal; anything else goes to the HR sign-in page. */
function RequireHr() {
  const navigate = useNavigate()
  const [account, setAccount] = useState(null)
  const [error, setError] = useState('')
  const session = getSession()

  const refreshAccount = useCallback(async () => {
    try {
      setAccount(await hrApi.me())
      setError('')
    } catch (problem) {
      setError(problem.message)
    }
  }, [])

  const signOut = useCallback(() => {
    clearSession()
    resetLogoIntro()
    navigate('/hr/login', { replace: true })
  }, [navigate])

  useEffect(() => { if (session) refreshAccount() }, [refreshAccount]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ended = () => navigate('/hr/login', { replace: true, state: { ended: true } })
    window.addEventListener(SESSION_ENDED, ended)
    return () => window.removeEventListener(SESSION_ENDED, ended)
  }, [navigate])

  if (!session) return <Navigate to="/hr/login" replace />
  if (!account) {
    return <div className="hr-boot" role="status">
      {error ? <><p>{error}</p><button className="hr-btn hr-btn--ghost" type="button" onClick={refreshAccount}>Try again</button></> : <span className="hr-spinner" aria-label="Loading" />}
    </div>
  }
  return <HrSessionContext.Provider value={{ account, setAccount, refreshAccount, signOut }}>
    <Outlet />
  </HrSessionContext.Provider>
}

export default function HrApp() {
  return <div className="hr-app">
    <Routes>
      <Route path="login" element={<HrLogin />} />
      <Route element={<RequireHr />}>
        <Route element={<HrLayout />}>
          <Route index element={<HrOverview />} />
          <Route path="openings" element={<HrOpenings />} />
          <Route path="openings/new" element={<HrOpeningForm />} />
          <Route path="openings/:openingId" element={<HrOpening />} />
          <Route path="openings/:openingId/edit" element={<HrOpeningForm />} />
          <Route path="plan" element={<HrPlan />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/hr" replace />} />
    </Routes>
  </div>
}
