import { useEffect, useState } from 'react'
import '../styles/brand-logo.css'

// The Resumetrics "R": a resume page with a folded corner (src/assets/brand/icon.svg, cropped to its own bounds).
const MARK = 'M10.44 8H61.23L80.77 27.53V50.98C80.77 62.7 73.93 69.53 62.21 73.44L89.56 92H63.19L42.67 74.42H29V92H10.44V8ZM29 24.6V57.81H54.4C60.26 57.81 63.19 54.88 63.19 49.02V33.4L54.4 24.6H29ZM61.23 13.86V25.58H72.95Z'
const WORD = 'Resumetrics'.split('')
// Logos whose entrance already played in this browser tab's session (see `animate="once"`).
const PLAYED_KEY = 'resumetrics:logo-intro-played'

function readPlayed() {
  try { return JSON.parse(sessionStorage.getItem(PLAYED_KEY) || '[]') } catch { return [] }
}

function markPlayed(name) {
  try { sessionStorage.setItem(PLAYED_KEY, JSON.stringify([...new Set([...readPlayed(), name])])) } catch { /* storage blocked: it just plays again */ }
}

/** Lets every "once" logo play its entrance again, for the next sign-in. Called on log out. */
export function resetLogoIntro() {
  try { sessionStorage.removeItem(PLAYED_KEY) } catch { /* nothing to reset */ }
}

export function BrandMark({ className = '' }) {
  return <svg className={`brand-logo-mark ${className}`.trim()} viewBox="10.44 8 79.12 84" aria-hidden="true" focusable="false">
    <path fill="currentColor" fillRule="evenodd" d={MARK} />
  </svg>
}

/**
 * Icon + name. The name is live text so it can take the page's font size and animate letter by letter.
 * Size it with font-size; colour the name with `color` and the mark with `--brand-mark` (defaults to the accent).
 * animate: true plays the entrance on every mount; "once" plays it the first time this session (the sidebar is
 * rebuilt on every page, and replaying there would be noise), until resetLogoIntro() on log out.
 * reveal: only the R shows; the (dot and) name slide out from behind it while the logo is hovered or its link has
 * keyboard focus, and slide back when the pointer leaves. On touch screens, which can't hover, the name stays out.
 */
export default function BrandLogo({ className = '', animate = false, wordmark = true, dot = false, reveal = false, name = 'default' }) {
  const [play] = useState(() => animate === true || (animate === 'once' && !readPlayed().includes(name)))
  useEffect(() => {
    if (animate === 'once' && play) markPlayed(name)
  }, [animate, play, name])
  const classes = ['brand-logo', play && 'brand-logo--animate', dot && wordmark && 'brand-logo--dot', reveal && wordmark && 'brand-logo--reveal', className].filter(Boolean).join(' ')
  const tail = <>
    {dot && <span className="brand-logo-dot" aria-hidden="true" />}
    <span className="brand-logo-word" aria-hidden="true">
      {WORD.map((letter, index) => <span key={index} style={{ '--n': index }}>{letter}</span>)}
    </span>
  </>
  return <span className={classes} role="img" aria-label="Resumetrics">
    <BrandMark />
    {wordmark && (reveal
      ? <span className="brand-logo-tail"><span className="brand-logo-tail-inner">{tail}</span></span>
      : tail)}
  </span>
}
