import { useEffect, useMemo, useRef, useState } from 'react'
import { HR_CATEGORY_LABELS } from '../../shared/hrScoring.js'
import { displayName } from './hrUi.jsx'

// Every resume in view as one dot on two chosen scores (0–100 each). Position carries the two scores; colour is one
// violet ramp for the overall score (light → dark), so the chart never needs more than one hue. Dragging a box over
// the plot selects the dots inside it for the bulk actions. The ranked table below is the full, accessible view.
const HEIGHT = 340
const PAD = { top: 18, right: 22, bottom: 44, left: 48 }
const TICKS = [0, 25, 50, 75, 100]
const GUIDE = 60   // the "Good" threshold: splits the plot into four quadrants
const STEPS = [
  { min: 75, label: '75+', color: '#2f1f99' },
  { min: 60, label: '60–74', color: '#6c58f2' },
  { min: 0, label: 'Under 60', color: '#a99bff' }
]
const stepOf = score => STEPS.find(step => score >= step.min) ?? STEPS.at(-1)
const AXIS_LABELS = { ...HR_CATEGORY_LABELS, score: 'Overall score' }
const valueOf = (row, axis) => axis === 'score' ? row.score : (row.categories[axis] ?? 0)

export default function CandidateScatter({ candidates, weights, blind, activeId, selectedIds, onOpen, onBrush }) {
  const boxRef = useRef(null)
  const svgRef = useRef(null)
  const [width, setWidth] = useState(720)
  const axes = useMemo(() => [...Object.keys(weights), 'score'], [weights])
  const [xAxis, setXAxis] = useState('skills')
  const [yAxis, setYAxis] = useState('experience')
  const [hover, setHover] = useState(null)
  const [brush, setBrush] = useState(null)   // { x0, y0, x1, y1 } in SVG pixels while dragging

  useEffect(() => {
    const element = boxRef.current
    if (!element) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // An axis that the opening no longer scores (education removed) falls back to a valid one.
  const x = axes.includes(xAxis) ? xAxis : axes[0]
  const y = axes.includes(yAxis) ? yAxis : axes[1] ?? axes[0]
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const sx = value => PAD.left + value / 100 * plotW
  const sy = value => PAD.top + (1 - value / 100) * plotH

  // Resumes with the same two scores would hide each other: fan them out a few pixels around the shared spot.
  const points = useMemo(() => {
    const groups = new Map()
    candidates.forEach(row => {
      const key = `${valueOf(row, x)}:${valueOf(row, y)}`
      groups.set(key, [...(groups.get(key) ?? []), row])
    })
    return [...groups.values()].flatMap(group => group.map((row, index) => {
      const angle = group.length > 1 ? index / group.length * Math.PI * 2 : 0
      const spread = group.length > 1 ? 7 : 0
      return { row, vx: valueOf(row, x), vy: valueOf(row, y), cx: sx(valueOf(row, x)) + Math.cos(angle) * spread, cy: sy(valueOf(row, y)) + Math.sin(angle) * spread, step: stepOf(row.score) }
    }))
  }, [candidates, x, y, width]) // eslint-disable-line react-hooks/exhaustive-deps

  // Name only the top three (by overall score) on the plot; everyone else is one hover or the table away.
  const labelled = useMemo(() => new Set([...candidates].sort((a, b) => b.score - a.score).slice(0, 3).map(row => row.id)), [candidates])
  // Darker (higher) scores are drawn last, so the strongest candidates sit on top.
  const ordered = [...points].sort((a, b) => a.row.score - b.row.score)

  const toSvg = event => {
    const rect = svgRef.current.getBoundingClientRect()
    return { px: Math.max(PAD.left, Math.min(sx(100), event.clientX - rect.left)), py: Math.max(PAD.top, Math.min(sy(0), event.clientY - rect.top)) }
  }
  const startBrush = event => {
    if (event.button !== 0) return
    const { px, py } = toSvg(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    setBrush({ x0: px, y0: py, x1: px, y1: py })
  }
  const moveBrush = event => { if (brush) { const { px, py } = toSvg(event); setBrush(current => ({ ...current, x1: px, y1: py })) } }
  const endBrush = () => {
    if (!brush) return
    const [left, right] = [Math.min(brush.x0, brush.x1), Math.max(brush.x0, brush.x1)]
    const [top, bottom] = [Math.min(brush.y0, brush.y1), Math.max(brush.y0, brush.y1)]
    setBrush(null)
    if (right - left < 6 && bottom - top < 6) return   // a click, not a drag
    onBrush(points.filter(point => point.cx >= left && point.cx <= right && point.cy >= top && point.cy <= bottom).map(point => point.row.id))
  }

  const quadrants = [
    { text: 'Strong on both', tx: sx(100) - 8, ty: sy(100) + 16, anchor: 'end' },
    { text: `Strong ${AXIS_LABELS[y].toLowerCase()}`, tx: sx(0) + 8, ty: sy(100) + 16, anchor: 'start' },
    { text: `Strong ${AXIS_LABELS[x].toLowerCase()}`, tx: sx(100) - 8, ty: sy(0) - 10, anchor: 'end' },
    { text: 'Below on both', tx: sx(0) + 8, ty: sy(0) - 10, anchor: 'start' }
  ]
  const axisSelect = (id, value, set, label) => <label className="hr-axis-select" htmlFor={id}>
    <span>{label}</span>
    <select id={id} value={value} onChange={event => set(event.target.value)}>
      {axes.map(axis => <option key={axis} value={axis}>{AXIS_LABELS[axis]}</option>)}
    </select>
  </label>

  return <section className="hr-panel hr-scatter" aria-label="Resumes compared on two scores">
    <div className="hr-panel-head">
      <h2>Compare resumes</h2>
      <div className="hr-scatter-controls">
        {axisSelect('hr-axis-x', x, setXAxis, 'Across')}
        {axisSelect('hr-axis-y', y, setYAxis, 'Up')}
      </div>
    </div>

    <div className="hr-scatter-box" ref={boxRef}>
      <svg ref={svgRef} width={width} height={HEIGHT} role="img" aria-label={`${candidates.length} resumes plotted by ${AXIS_LABELS[x]} across and ${AXIS_LABELS[y]} up. The ranked table below lists the same scores.`}>
        {/* Quadrant wash: the top-right corner is where both scores clear the "Good" line. */}
        <rect x={sx(GUIDE)} y={sy(100)} width={sx(100) - sx(GUIDE)} height={sy(GUIDE) - sy(100)} className="hr-scatter-sweet" />
        {TICKS.map(tick => <g key={tick}>
          <line x1={sx(tick)} x2={sx(tick)} y1={sy(0)} y2={sy(100)} className="hr-scatter-grid" />
          <line x1={sx(0)} x2={sx(100)} y1={sy(tick)} y2={sy(tick)} className="hr-scatter-grid" />
          <text x={sx(tick)} y={sy(0) + 18} textAnchor="middle" className="hr-scatter-tick">{tick}</text>
          <text x={sx(0) - 10} y={sy(tick) + 4} textAnchor="end" className="hr-scatter-tick">{tick}</text>
        </g>)}
        <line x1={sx(GUIDE)} x2={sx(GUIDE)} y1={sy(0)} y2={sy(100)} className="hr-scatter-guide" />
        <line x1={sx(0)} x2={sx(100)} y1={sy(GUIDE)} y2={sy(GUIDE)} className="hr-scatter-guide" />
        {quadrants.map(item => <text key={item.text} x={item.tx} y={item.ty} textAnchor={item.anchor} className="hr-scatter-quadrant">{item.text}</text>)}
        <text x={sx(50)} y={HEIGHT - 6} textAnchor="middle" className="hr-scatter-axis">{AXIS_LABELS[x]} →</text>
        <text transform={`translate(13 ${sy(50)}) rotate(-90)`} textAnchor="middle" className="hr-scatter-axis">{AXIS_LABELS[y]} →</text>

        {/* Drag anywhere on the plot (not on a dot) to select the dots inside the box. */}
        <rect x={sx(0)} y={sy(100)} width={plotW} height={plotH} className="hr-scatter-brush-area" onPointerDown={startBrush} onPointerMove={moveBrush} onPointerUp={endBrush} onPointerCancel={() => setBrush(null)} />
        {brush && <rect x={Math.min(brush.x0, brush.x1)} y={Math.min(brush.y0, brush.y1)} width={Math.abs(brush.x1 - brush.x0)} height={Math.abs(brush.y1 - brush.y0)} className="hr-scatter-brush" />}

        {ordered.map(({ row, cx, cy, step }) => {
          const name = displayName(row, blind)
          const active = row.id === activeId || row.id === hover?.row.id
          const picked = selectedIds.has(row.id)
          const labelLeft = cx > sx(80)
          return <g key={row.id} className={`hr-dot${active ? ' is-active' : ''}${picked ? ' is-picked' : ''}`} tabIndex={0} role="button"
            aria-label={`${name}: ${AXIS_LABELS[x]} ${valueOf(row, x)}, ${AXIS_LABELS[y]} ${valueOf(row, y)}, overall ${row.score}${picked ? ', selected' : ''}. Open breakdown.`}
            onMouseEnter={() => setHover(points.find(point => point.row.id === row.id))}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(points.find(point => point.row.id === row.id))}
            onBlur={() => setHover(null)}
            onClick={() => onOpen(row.id)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(row.id) } }}>
            <circle cx={cx} cy={cy} r={12} className="hr-dot-hit" />
            {(active || picked) && <circle cx={cx} cy={cy} r={picked ? 10 : 11} className={picked ? 'hr-dot-pick' : 'hr-dot-halo'} />}
            <circle cx={cx} cy={cy} r={active ? 7 : 6} fill={step.color} className="hr-dot-mark" />
            {labelled.has(row.id) && <text x={labelLeft ? cx - 11 : cx + 11} y={cy + 4} textAnchor={labelLeft ? 'end' : 'start'} className="hr-dot-label">{name.split(' ')[0] === 'Candidate' ? name : name.split(' ')[0]}</text>}
          </g>
        })}
      </svg>

      {/* The tooltip sits beside the dot, flipping to the left near the right edge and below near the top, so it never covers the dot. */}
      {hover && !brush && <div className="hr-tooltip" style={{ left: hover.cx > width - 230 ? hover.cx - 204 : hover.cx + 18, top: hover.cy < 90 ? hover.cy + 14 : hover.cy - 84 }} role="status">
        <b>{displayName(hover.row, blind)}</b>
        <span>{AXIS_LABELS[x]} <i>{hover.vx}</i></span>
        <span>{AXIS_LABELS[y]} <i>{hover.vy}</i></span>
        <span>Overall <i>{hover.row.score}</i></span>
      </div>}
    </div>

    <div className="hr-scatter-foot">
      <span className="hr-scatter-legend" aria-label="Dot colour shows the overall score">
        <span className="hr-label">Overall score</span>
        {[...STEPS].reverse().map(step => <span key={step.label}><i style={{ background: step.color }} />{step.label}</span>)}
      </span>
      <span className="hr-muted">The shaded corner is where both scores are 60 or more. Select a dot for its breakdown, or drag a box to select several.</span>
    </div>
  </section>
}
