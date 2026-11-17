import { bandOf } from '../../shared/hrScoring.js'

export const formatDate = value => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Score figure with its band label: "82 Strong". */
export function ScoreMark({ score, size = 'md' }) {
  if (score === null || score === undefined) return <span className="hr-score hr-score--none">—</span>
  const band = bandOf(score)
  return <span className={`hr-score hr-score--${size} hr-band--${band.id}`}>
    <b>{score}</b><small>{band.label}</small>
  </span>
}

/** A thin horizontal bar, 0–100. */
export function Meter({ value, label }) {
  const band = bandOf(value ?? 0)
  return <span className={`hr-meter hr-band--${band.id}`} title={label ? `${label}: ${value}` : String(value)}>
    <i style={{ width: `${Math.max(2, Math.min(100, value ?? 0))}%` }} />
  </span>
}

/**
 * The name to show for a resume. In blind mode a resume HR hasn't decided on yet is "Candidate 4" (its upload
 * number), so the first read is on skills and experience alone; the name appears once it is shortlisted or rejected.
 */
export const isHidden = (row, blind) => Boolean(blind && row?.status === 'new')
export const displayName = (row, blind) => isHidden(row, blind) ? `Candidate ${row.serial ?? ''}`.trim() : row?.name

export function StatusBadge({ status }) {
  if (!status || status === 'new') return <span className="hr-status hr-status--new">New</span>
  return <span className={`hr-status hr-status--${status}`}>{status === 'shortlisted' ? 'Shortlisted' : 'Rejected'}</span>
}

/** Uploaded → reviewed: one bar split into shortlisted, rejected and still new, with the counts in words beside it. */
export function Pipeline({ pipeline, compact = false }) {
  const { new: fresh = 0, shortlisted = 0, rejected = 0 } = pipeline ?? {}
  const total = fresh + shortlisted + rejected
  if (!total) return <span className="hr-muted">No resumes yet</span>
  const label = `${shortlisted} shortlisted, ${rejected} rejected, ${fresh} awaiting review`
  return <span className={`hr-pipeline${compact ? ' hr-pipeline--compact' : ''}`} title={label}>
    <span className="hr-pipeline-bar" role="img" aria-label={label}>
      {shortlisted > 0 && <i className="is-shortlisted" style={{ flexGrow: shortlisted }} />}
      {rejected > 0 && <i className="is-rejected" style={{ flexGrow: rejected }} />}
      {fresh > 0 && <i className="is-new" style={{ flexGrow: fresh }} />}
    </span>
    <span className="hr-pipeline-text" aria-hidden="true"><b>{shortlisted}</b> shortlisted · <b>{fresh}</b> to review</span>
  </span>
}

export function Tags({ items, tone = 'plain', empty = 'None' }) {
  if (!items?.length) return <span className="hr-muted">{empty}</span>
  return <span className="hr-tags">{items.map(item => <span key={item} className={`hr-tag hr-tag--${tone}`}>{item}</span>)}</span>
}

export function PageHeader({ eyebrow, title, children, lede }) {
  return <header className="hr-page-head">
    <div>
      {eyebrow && <p className="hr-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {lede && <p className="hr-lede">{lede}</p>}
    </div>
    {children && <div className="hr-page-actions">{children}</div>}
  </header>
}

const ICONS = {
  overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="4.5" rx="1" /><rect x="13.5" y="11" width="7" height="9.5" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /></>,
  openings: <><rect x="3.5" y="7" width="17" height="12.5" rx="1.5" /><path d="M8.5 7V5.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5V7M3.5 12.5h17" /></>,
  plan: <><path d="M4 7.5h16v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" /><path d="M4 7.5 6 4h12l2 3.5M9 12h6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  upload: <><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4.5 14.5v4a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-4" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  cross: <path d="M7 7l10 10M17 7 7 17" />,
  out: <><path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4" /><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15" /></>,
  back: <path d="M14.5 6 8.5 12l6 6" />,
  company: <><path d="M4 20.5V6.5A1.5 1.5 0 0 1 5.5 5h7A1.5 1.5 0 0 1 14 6.5v14" /><path d="M14 10h4.5a1.5 1.5 0 0 1 1.5 1.5v9M3 20.5h18M7.5 9h3M7.5 12.5h3M7.5 16h3" /></>
}

export function Icon({ name }) {
  return <svg className="hr-icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>
}
