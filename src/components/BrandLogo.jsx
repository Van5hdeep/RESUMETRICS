import '../styles/brand-logo.css'

// The Resumetrics "R": a resume page with a folded corner (src/assets/brand/icon.svg, cropped to its own bounds).
const MARK = 'M10.44 8H61.23L80.77 27.53V50.98C80.77 62.7 73.93 69.53 62.21 73.44L89.56 92H63.19L42.67 74.42H29V92H10.44V8ZM29 24.6V57.81H54.4C60.26 57.81 63.19 54.88 63.19 49.02V33.4L54.4 24.6H29ZM61.23 13.86V25.58H72.95Z'
const WORD = 'Resumetrics'.split('')

export function BrandMark({ className = '' }) {
  return <svg className={`brand-logo-mark ${className}`.trim()} viewBox="10.44 8 79.12 84" aria-hidden="true" focusable="false">
    <path fill="currentColor" fillRule="evenodd" d={MARK} />
  </svg>
}

/**
 * Icon + name. The name is live text so it can take the page's font size and animate letter by letter.
 * Size it with font-size; colour the name with `color` and the mark with `--brand-mark` (defaults to the accent).
 */
export default function BrandLogo({ className = '', animate = false, wordmark = true, dot = false }) {
  return <span className={`brand-logo${animate ? ' brand-logo--animate' : ''}${dot && wordmark ? ' brand-logo--dot' : ''} ${className}`.trim()} role="img" aria-label="Resumetrics">
    <BrandMark />
    {dot && wordmark && <span className="brand-logo-dot" aria-hidden="true" />}
    {wordmark && <span className="brand-logo-word" aria-hidden="true">
      {WORD.map((letter, index) => <span key={index} style={{ '--n': index }}>{letter}</span>)}
    </span>}
  </span>
}
