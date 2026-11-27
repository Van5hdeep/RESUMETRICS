import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './useLenis.js'
import { stats } from './landingContent.js'
import { BRAND } from '../../../shared/brand.js'

/** Counts from 0 to `value` once it scrolls into view. */
function CountUp({ value, suffix }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(prefersReducedMotion() ? value : 0)
  useEffect(() => {
    const element = ref.current
    if (!element || prefersReducedMotion()) return undefined
    let frame = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      const start = performance.now()
      const tick = now => {
        const t = Math.min(1, (now - start) / 1400)
        setShown(Math.round(value * (1 - Math.pow(1 - t, 3))))
        if (t < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }, { threshold: .6 })
    observer.observe(element)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [value])
  return <span ref={ref} className="lp-stat-number">{shown}{suffix}</span>
}

/** A single quiet strip of numbers, each a real part of the app. */
export default function StatsBand() {
  return <section className="lp-stats" aria-label={`${BRAND.name} in numbers`}>
    <ul className="lp-stat-strip">
      {stats.map((stat, index) => <li key={stat.label} className="lp-reveal-up" style={{ '--delay': `${index * 80}ms` }}>
        <CountUp value={stat.value} suffix={stat.suffix} />
        <span>{stat.label}</span>
      </li>)}
    </ul>
  </section>
}
