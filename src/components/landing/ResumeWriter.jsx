import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getResumeTemplate, resolveResumePresentation } from '../../config/resumeTemplates.js'
import { loadFontsForPresentation } from '../../editor/fontRegistry.js'
import { landingResumeData } from '../../data/sampleResume.js'
import useScrollProgress from './useScrollProgress.js'
import { onScroll, prefersReducedMotion } from './useLenis.js'

const A4 = { width: 794, height: 1123 }
const TEMPLATE_ID = 'gengar'
const FONT = 'Sora, sans-serif'   // a geometric Google font from the app's own catalogue
// The page is written between these points of the scene's scroll (keep in step with .lp-ink in landing-page.css).
const WRITE_START = 0.03
const WRITE_SPAN = 0.84
const RING = 2 * Math.PI * 52

// What the ring says while the page fills in.
const stages = [[0, 'Adding your details'], [0.16, 'Writing your summary'], [0.34, 'Filling in your experience'], [0.62, 'Listing projects and skills'], [0.86, 'Finishing touches']]

/**
 * A real Resumetrics template (Gengar) with the sample resume, written element by element as you scroll. Each element
 * gets its place in reading order (--i) and CSS reveals it once the scroll (--p) reaches it. The ring beside it counts
 * the same progress and turns into a green tick when the last line lands.
 */
export default function ResumeWriter() {
  const sceneRef = useRef(null)
  const pageRef = useRef(null)
  const frameRef = useRef(null)
  const [scale, setScale] = useState(.6)
  const [pageHeight, setPageHeight] = useState(A4.height)
  const [progress, setProgress] = useState(() => (prefersReducedMotion() ? 100 : 0))
  useScrollProgress(sceneRef, 'pin')

  const template = getResumeTemplate(TEMPLATE_ID)
  const Template = template.component
  const presentation = { ...resolveResumePresentation(template, { fontFamily: FONT }), photo: template.defaultTheme.photo }

  // Tag the innermost elements in reading order, and crop the paper to where the content ends (once fonts settle).
  useLayoutEffect(() => {
    const page = pageRef.current
    if (!page) return undefined
    const nodes = [...page.querySelectorAll('[data-resume-element-id]')].filter(node => !node.querySelector('[data-resume-element-id]'))
    nodes.forEach((node, index) => { node.classList.add('lp-ink'); node.style.setProperty('--i', index) })
    page.style.setProperty('--n', nodes.length)
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      const top = page.getBoundingClientRect().top
      const scaleNow = page.getBoundingClientRect().width / A4.width || 1
      const bottom = Math.max(...nodes.map(node => node.getBoundingClientRect().bottom - top)) / scaleNow
      if (Number.isFinite(bottom)) setPageHeight(Math.min(A4.height, Math.max(760, Math.ceil(bottom + 44))))
    }
    loadFontsForPresentation(presentation).then(() => document.fonts.ready).then(() => requestAnimationFrame(measure))
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return undefined
    const update = () => setScale(frame.clientWidth / A4.width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  // The same progress as the CSS reveal, as a whole percentage for the ring.
  useEffect(() => {
    if (prefersReducedMotion()) return undefined
    const scene = sceneRef.current
    const update = () => {
      const rect = scene.getBoundingClientRect()
      const p = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height - window.innerHeight)))
      setProgress(Math.round(Math.min(1, Math.max(0, (p - WRITE_START) / WRITE_SPAN)) * 100))
    }
    update()
    const off = onScroll(update)
    window.addEventListener('resize', update)
    return () => { off(); window.removeEventListener('resize', update) }
  }, [])

  const done = progress >= 100
  const stage = [...stages].reverse().find(([from]) => progress / 100 >= from)?.[1] ?? stages[0][1]
  return <section className="lp-writer" id="write" ref={sceneRef} aria-label="A resume being written in a Resumetrics template">
    <div className="lp-writer-stage">
      <div className="lp-writer-copy">
        <h2 className="lp-title">A resume that is built to stay.</h2>
        <p className="lp-writer-intro">Honest wording, a clean design and proof from your own work, so your resume keeps holding up long after you send it.</p>
        <div className={`lp-progress${done ? ' is-done' : ''}`}>
          <div className="lp-progress-ring" role="progressbar" aria-label="Resume progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle className="lp-ring-track" cx="60" cy="60" r="52" />
              <circle className="lp-ring-bar" cx="60" cy="60" r="52" style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - progress / 100) }} />
              <circle className="lp-ring-fill" cx="60" cy="60" r="43" />
              <path className="lp-ring-tick" d="M42 61.5 54.5 74 79 48" />
            </svg>
            <span className="lp-progress-number">{progress}<small>%</small></span>
          </div>
          <p className="lp-progress-label" aria-live="polite">{done ? 'Resume complete' : stage}</p>
        </div>
      </div>
      {/* A picture of a sample resume: hidden from screen readers and keyboard focus (its heading and links are not
          part of this page), and described by the section's label instead. */}
      <div className="lp-writer-paper" ref={frameRef} style={{ '--scale': scale, '--page-h': pageHeight }} aria-hidden="true" inert>
        <div className="lp-writer-sheet" ref={pageRef}>
          <Template resumeData={landingResumeData} presentation={presentation} preview />
        </div>
      </div>
    </div>
  </section>
}
