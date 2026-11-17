import { useRef } from 'react'
import LandingNav from '../components/landing/LandingNav.jsx'
import GoldHero from '../components/landing/GoldHero.jsx'
import ResumeWriter from '../components/landing/ResumeWriter.jsx'
import StatsBand from '../components/landing/StatsBand.jsx'
import NimbusSection from '../components/landing/NimbusSection.jsx'
import ScreenSlider from '../components/landing/ScreenSlider.jsx'
import HiringSection from '../components/landing/HiringSection.jsx'
import { BigCta, LandingFooter } from '../components/landing/ClosingSections.jsx'
import useLenis from '../components/landing/useLenis.js'
import useRevealOnScroll from '../components/landing/useRevealOnScroll.js'
import useCinematicScroll from '../components/landing/useCinematicScroll.js'
import '../styles/landing-page.css'

export default function LandingPage() {
  const rootRef = useRef(null)
  useLenis()
  useRevealOnScroll(rootRef)
  useCinematicScroll(rootRef)

  // The tab title comes from usePageTitle (src/hooks/usePageTitle.js).

  return <div className="lp" ref={rootRef}>
    <LandingNav />
    <main className="lp-main">
      <GoldHero />
      <ResumeWriter />
      <StatsBand />
      <NimbusSection />
      <ScreenSlider />
      <HiringSection />
      <BigCta />
    </main>
    <LandingFooter />
  </div>
}
