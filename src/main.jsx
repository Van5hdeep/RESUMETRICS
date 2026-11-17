import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { PlanProvider } from './context/PlanContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import LandingPage from './pages/LandingPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import LegalPage from './pages/LegalPage.jsx'
import usePageTitle from './hooks/usePageTitle.js'
import './styles.css'
import './template.css'
import './layout-overrides.css'
import './interaction-overrides.css'
import './resume-flow.css'
import './github-evidence.css'
import './linkedin-evidence.css'
import './ai-assistant.css'
import './resume-builder.css'
import './editor-studio.css'
import './section-form.css'
import './print.css'
import './nimbus-chat.css'
import './job-match.css'
import './job-tailoring.css'
import './evidence.css'
import './buttons.css'
import './format-panel.css'
import './cover-letter.css'

// Loaded on demand: the landing and sign-in pages don't pay for the editor, the job tracker or the HR portal.
const pages = () => import('./AppPages.jsx')
const lazyPage = name => React.lazy(() => pages().then(module => ({ default: module[name] })))
const DashboardPage = lazyPage('DashboardPage')
const MainPage = lazyPage('MainPage')
const SettingsPage = lazyPage('SettingsPage')
const HelpPage = lazyPage('HelpPage')
const TemplatesPage = lazyPage('TemplatesPage')
const Shell = lazyPage('Shell')
const PlanPage = lazyPage('PlanPage')
const JobTrackerPage = lazyPage('JobTrackerPage')
const HrApp = React.lazy(() => import('./hr/HrApp.jsx'))

const loading = <div className="auth-loading" role="status">Loading…</div>
const page = element => <React.Suspense fallback={loading}>{element}</React.Suspense>

function App() {
  usePageTitle()
  return <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/login" element={<Login />} />
    <Route path="/privacy" element={<LegalPage kind="privacy" />} />
    <Route path="/terms" element={<LegalPage kind="terms" />} />
    <Route path="/dashboard" element={<ProtectedRoute>{page(<DashboardPage />)}</ProtectedRoute>} />
    <Route path="/workspace/*" element={<ProtectedRoute>{page(<MainPage />)}</ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute>{page(<SettingsPage />)}</ProtectedRoute>} />
    <Route path="/help" element={<ProtectedRoute>{page(<HelpPage />)}</ProtectedRoute>} />
    <Route path="/templates" element={<ProtectedRoute>{page(<TemplatesPage />)}</ProtectedRoute>} />
    <Route path="/plan" element={<ProtectedRoute>{page(<Shell><PlanPage /></Shell>)}</ProtectedRoute>} />
    <Route path="/jobs" element={<ProtectedRoute>{page(<Shell><JobTrackerPage /></Shell>)}</ProtectedRoute>} />
    <Route path="/evaluation" element={<Navigate to="/workspace/evidence" replace />} />
    {/* HR portal: its own sign-in, layout and styles, loaded only when visited. */}
    <Route path="/hr/*" element={<React.Suspense fallback={null}><HrApp /></React.Suspense>} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PlanProvider>
          <App />
        </PlanProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
