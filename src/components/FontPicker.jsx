import { useMemo, useState } from 'react'
import { loadResumeFont, resumeFonts } from '../editor/fontRegistry.js'

export default function FontPicker({ value, onChange, disabled = false }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const current = resumeFonts.find(font => font.family === value) || resumeFonts[0]
  const options = useMemo(() => {
    const term = query.trim().toLowerCase()
    return resumeFonts.filter(font => !term || `${font.name} ${font.category}`.toLowerCase().includes(term))
  }, [query])
  const choose = font => {
    loadResumeFont(font)
    onChange(font.family)
    setOpen(false)
  }
  return <div className="font-picker">
    <button type="button" className="font-picker-trigger" disabled={disabled} onClick={() => setOpen(state => !state)} style={{ fontFamily: current.family }}>{current.name} <span>⌄</span></button>
    {open && <div className="font-picker-popover">
      <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search fonts…" aria-label="Search fonts" />
      <div className="font-picker-options">{options.map(font => <button type="button" key={font.name} onClick={() => choose(font)} style={{ fontFamily: font.family }}><span>{font.name}</span><small>{font.category}{font.recommended ? ' · Recommended' : ''}</small></button>)}</div>
    </div>}
  </div>
}
