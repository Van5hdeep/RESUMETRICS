import { Link, useLocation } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo.jsx'
import './simple-page.css'
import { BRAND } from '../../shared/brand.js'

/** Any address the app doesn't know. Says so plainly and offers the ways back. */
export default function NotFoundPage() {
  const { pathname } = useLocation()
  return <main className="simple-page simple-page--centred">
    <Link to="/" className="simple-page-brand" aria-label={`${BRAND.name} home`}><BrandLogo /></Link>
    <p className="simple-page-eyebrow">Error 404</p>
    <h1>This page doesn’t exist</h1>
    <p className="simple-page-lede">There is nothing at <code>{pathname}</code>. The link may be old, or the address may have a typo.</p>
    <div className="simple-page-actions">
      <Link className="btn btn-primary" to="/">Go to the home page</Link>
      <Link className="btn btn-secondary" to="/dashboard">Open your dashboard</Link>
    </div>
  </main>
}
