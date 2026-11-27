import { useCallback, useEffect, useRef, useState } from 'react'
import LandingIcon from './LandingIcon.jsx'
import { screens } from './landingContent.js'
import { getLenis } from './useLenis.js'
import { BRAND } from '../../../shared/brand.js'

// Footer links like #tailor open their screen.
const HASH_TO_SCREEN = { tailor: 'tailor', letter: 'letter', evidence: 'evidence', jobs: 'jobs', inside: null }

function Lightbox({ screen, onClose }) {
  const closeRef = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    closeRef.current?.focus()
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const lenis = getLenis()
    lenis?.stop()   // the page stays put behind the enlarged screen
    return () => { document.removeEventListener('keydown', onKey); lenis?.start(); previous?.focus?.() }
  }, [onClose])
  return <div className="lp-lightbox" role="dialog" aria-modal="true" aria-label={screen.name} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <button type="button" className="lp-lightbox-close" ref={closeRef} onClick={onClose} aria-label="Close"><LandingIcon name="close" size={20} /></button>
    <img src={screen.src} alt={screen.alt} />
  </div>
}

const Chevron = ({ flip }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}><path d="m14.5 5.5-6.5 6.5 6.5 6.5" /></svg>

/** Real screens of the app, one at a time: the current one in front, its neighbours tucked behind it. */
export default function ScreenSlider() {
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const drag = useRef(null)
  const count = screens.length
  const go = useCallback(step => setActive(index => (index + step + count) % count), [count])
  const offsetOf = index => {
    let offset = index - active
    if (offset > count / 2) offset -= count
    if (offset < -count / 2) offset += count
    return offset
  }

  useEffect(() => {
    const fromHash = () => {
      const id = HASH_TO_SCREEN[window.location.hash.slice(1)]
      const index = screens.findIndex(screen => screen.id === id)
      if (index >= 0) setActive(index)
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [])

  // Load every screen once the section is near, so moving between them never waits on the network.
  const sectionRef = useRef(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); observer.disconnect() } }, { rootMargin: '600px 0px' })
    observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  const current = screens[active]
  return <section className="lp-inside" id="inside" ref={sectionRef} data-cine aria-roledescription="carousel" aria-labelledby="lp-inside-title">
    {Object.keys(HASH_TO_SCREEN).filter(id => id !== 'inside').map(id => <span key={id} id={id} className="lp-anchor" aria-hidden="true" />)}
    <h2 className="lp-title is-center" id="lp-inside-title">Inside {BRAND.name}</h2>

    <div className="lp-slider" onKeyDown={event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1) }
    }}>
      <button type="button" className="lp-slider-arrow" onClick={() => go(-1)} aria-label="Previous screen"><Chevron /></button>
      <div className="lp-slider-stage"
        onPointerDown={event => { drag.current = { x: event.clientX, moved: false } }}
        onPointerMove={event => { if (drag.current && Math.abs(event.clientX - drag.current.x) > 8) drag.current.moved = true }}
        onPointerUp={event => {
          const start = drag.current
          drag.current = null
          if (start && Math.abs(event.clientX - start.x) > 50) go(event.clientX < start.x ? 1 : -1)
        }}
        onPointerCancel={() => { drag.current = null }}>
        {screens.map((screen, index) => {
          const offset = offsetOf(index)
          const depth = Math.abs(offset)
          if (depth > 1 && !near) return null
          return <figure key={screen.id} className={`lp-slide${offset === 0 ? ' is-current' : ''}${depth > 1 ? ' is-away' : ''}`} style={{ '--o': offset, '--d': depth }} aria-hidden={offset !== 0} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${count}: ${screen.name}`}>
            <button type="button" className="lp-screen-window" tabIndex={offset === 0 ? 0 : -1}
              onClick={event => { if (drag.current?.moved) { event.preventDefault(); return } if (offset === 0) setOpen(true); else setActive(index) }}
              aria-label={offset === 0 ? `Enlarge ${screen.name}` : `Show ${screen.name}`}>
              <span className="lp-screen-bar" aria-hidden="true"><i /><i /><i /><span>{BRAND.domain}/{screen.path}</span></span>
              <img src={screen.src} alt={offset === 0 ? screen.alt : ''} loading={depth > 1 ? 'lazy' : 'eager'} decoding="async" width="2160" height="1350" draggable="false" />
            </button>
          </figure>
        })}
      </div>
      <button type="button" className="lp-slider-arrow" onClick={() => go(1)} aria-label="Next screen"><Chevron flip /></button>
    </div>

    <p className="lp-slide-name" aria-live="polite" key={current.id}>{current.name}</p>
    <div className="lp-slider-dots" role="tablist" aria-label="Screens">
      {screens.map((screen, index) => <button key={screen.id} type="button" role="tab" aria-selected={index === active} aria-label={screen.name} className={index === active ? 'is-current' : ''} onClick={() => setActive(index)} />)}
    </div>
    {open && <Lightbox screen={current} onClose={() => setOpen(false)} />}
  </section>
}
