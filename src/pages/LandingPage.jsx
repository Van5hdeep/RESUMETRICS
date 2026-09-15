import { useEffect } from 'react'
import HeroSection from '../components/landing/HeroSection.jsx'
import ProblemSection from '../components/landing/ProblemSection.jsx'
import SolutionSection from '../components/landing/SolutionSection.jsx'
import HowItWorksSection from '../components/landing/HowItWorksSection.jsx'
import FeatureGrid from '../components/landing/FeatureGrid.jsx'
import ProductPreview from '../components/landing/ProductPreview.jsx'
import FinalCTA from '../components/landing/FinalCTA.jsx'
import '../styles/landing.css'
import '../styles/landing-wordmark.css'

export default function LandingPage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Resumetrics — Build smarter resumes with AI'
    return () => { document.title = previousTitle }
  }, [])

  return <div className="landing-page">
    <HeroSection />
    <ProblemSection />
    <SolutionSection />
    <HowItWorksSection />
    <FeatureGrid />
    <ProductPreview />
    <FinalCTA />
    <footer className="landing-footer"><span>Resumetrics</span><span>Evidence-led resumes, made editable.</span></footer>
  </div>
}
