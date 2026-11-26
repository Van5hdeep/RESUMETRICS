import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import EditorShell from '../components/editor/EditorShell.jsx'
import FormatPanel from '../components/editor/FormatPanel.jsx'
import AiRail from '../components/editor/AiRail.jsx'
import NimbusChat from '../components/nimbus/NimbusChat.jsx'
import CoverLetterPage, { letterPresentationOf } from './CoverLetterPage.jsx'
import LetterDetails from './LetterDetails.jsx'
import LetterGuide from './LetterGuide.jsx'
import SignatureControls from './SignatureControls.jsx'
import { importSignature, renderSignature } from './signature.js'
import useNimbusTurns from '../nimbus/useNimbusTurns.js'
import { greetingFor } from '../nimbus/greeting.js'
import useEditorHistory from '../editor/useEditorHistory.js'
import { applyResumeEditingOperations } from '../editor/resumeEditingEngine.js'
import { describeResumeElement } from '../editor/describeResumeElement.js'
import { findFont, loadFontsForPresentation, resumeFonts } from '../editor/fontRegistry.js'
import { toggleMarkInRange } from '../editor/inlineMarks.js'
import { latexTemplateFeatures, isLatexVariant } from '../components/templates/ResumeTemplateLayout.jsx'
import { extractJd } from '../../shared/jdExtract.js'
import { lintLetter } from '../../shared/letterLint.js'
import { PAPER_OPTIONS, applyLetterEdit, applyLetterOperations, createLetter, letterReadModel, letterToText, roleOf } from '../../shared/letterModel.js'
import '../cover-letter.css'

export const LETTER_PLACEHOLDERS = [
  'Write my cover letter…',
  'Make the opening more specific…',
  'Shorten this to about 300 words…',
  'Add a paragraph about why I want this company…',
  'Make the tone more confident…',
  'Strengthen the closing…'
]
const SUGGESTIONS = ['Write my cover letter', 'Make it shorter', 'Make it more confident']
export const initialLetterMessages = [{ id: 'welcome', role: 'assistant', status: 'done', text: 'Hi, I’m NIMBUS. I can write your cover letter from your resume and the job post, or improve any paragraph.' }]
const HEADER_KEYS = ['fullName', 'headline', 'email', 'phone', 'location', 'links']
const pick = (source, keys) => Object.fromEntries(keys.map(key => [key, source?.[key]]))
const readPath = (source, path) => String(path).split('.').reduce((current, key) => current?.[/^\d+$/.test(key) ? Number(key) : key], source)
const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = fileName
  document.body.appendChild(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const rgbToHex = value => { const parts = String(value).match(/\d+(\.\d+)?/g); return parts ? `#${parts.slice(0, 3).map(part => Math.round(Number(part)).toString(16).padStart(2, '0')).join('')}` : '#172033' }
export const safeLetterFileName = name => `${String(name || 'cover-letter').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cover-letter'}-cover-letter`

/** Print copy of the letter, rendered at exactly A4 (794px) for the browser print path. */
export function LetterPrintPage({ template, resumeData, letter, presentation }) {
  return <CoverLetterPage template={template} resumeData={resumeData} letter={letter} presentation={presentation} readOnly pageWidthOverride={794} />
}

/**
 * The cover letter studio (PLAN-033): the resume editor's shell with the letter in the centre,
 * NIMBUS and the Letter guide on the left, Details and Format on the right.
 */
export default function LetterStudio({
  resumeData, onResumeChange, resumeName, template, presentation, letter, onLetterChange, messages, setMessages,
  jobText, onJobTextChange, included, onAddToResume, onRemoveFromResume, onBackToResume, onBack, onOpenTailor, userName = ''
}) {
  const latest = useRef({ letter, resumeData })
  latest.current = { letter, resumeData }
  const [selection, setSelection] = useState(null)
  const selectionRef = useRef(null)
  selectionRef.current = selection
  const [tab, setTab] = useState('details')
  const [zoom, setZoom] = useState(1)
  const [pages, setPages] = useState(1)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [input, setInput] = useState('')
  const [sigBusy, setSigBusy] = useState(false)
  const [sigError, setSigError] = useState('')
  const [notice, setNotice] = useState('')
  const inputRef = useRef(null)
  const sigInputRef = useRef(null)
  const exportRef = useRef(null)
  const sigTimer = useRef(0)

  const setLetter = useCallback(updater => {
    const next = typeof updater === 'function' ? updater(latest.current.letter) : updater
    latest.current = { ...latest.current, letter: next }
    onLetterChange(next)
  }, [onLetterChange])
  const setResume = useCallback(next => {
    latest.current = { ...latest.current, resumeData: next }
    onResumeChange(next)
  }, [onResumeChange])

  const pres = useMemo(() => letterPresentationOf(presentation, letter), [presentation, letter])
  const readModel = useMemo(() => letterReadModel(letter, resumeData), [letter, resumeData])
  const defaultBase = isLatexVariant(template?.id) ? latexTemplateFeatures[template.id].base : 13.3333
  const job = useMemo(() => jobText && jobText.trim().length > 20 ? extractJd(jobText) : null, [jobText])
  const lint = useMemo(() => lintLetter({ paragraphs: letter.paragraphs, recipient: letter.recipient, role: roleOf(letter, resumeData) || job?.title || '', company: letter.recipient.company || job?.company || '', resumeData }), [letter, resumeData, job])

  // ---- Editing ----
  const handleEdit = useCallback(({ path, value }) => {
    if (!path) return
    const current = latest.current
    if (path.startsWith('letter.')) { setLetter(applyLetterEdit(current.letter, path, value)); return }
    // The line under your name is the letter's own job title; the rest of the header is shared with the resume.
    if (path === 'headline') { setLetter(applyLetterEdit(current.letter, 'letter.role', value)); return }
    const next = structuredClone(current.resumeData)
    const parts = path.split('.')
    const target = parts.slice(0, -1).reduce((node, key) => node?.[/^\d+$/.test(key) ? Number(key) : key], next)
    if (!target) return
    target[parts.at(-1)] = String(value).replace(/\s*\n\s*/g, ' ').trim()
    setResume(next)
  }, [setLetter, setResume])

  const selectElement = useCallback(next => setSelection(current => {
    if (!next) return null
    if (current && current.id === next.id && current.path === next.path && current.range?.start === next.range?.start && current.range?.end === next.range?.end) return current
    return next
  }), [])
  useEffect(() => { if (selection) setTab('format') }, [selection?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMark = mark => {
    const active = selectionRef.current
    if (!active?.path || !active.range) return
    const value = readPath(readModel, active.path)
    if (typeof value !== 'string' || !value) return
    handleEdit({ path: active.path, value: toggleMarkInRange(value, active.range.start, active.range.end, mark) })
    setSelection({ ...active, range: null })
  }

  const ownOverrides = letter.presentation.elementOverrides ?? {}
  const applyStyle = operation => {
    const next = applyResumeEditingOperations({ content: {}, presentation: { elementOverrides: ownOverrides } }, [operation])
    setLetter(current => ({ ...current, presentation: { ...current.presentation, elementOverrides: next.presentation.elementOverrides } }))
  }
  const setPresentation = patch => setLetter(current => ({ ...current, presentation: { ...current.presentation, ...patch } }))

  // ---- History (letter and the shared header facts) ----
  // Signature pictures are large, so history keeps only their settings; undo never swaps the picture itself.
  const restoreHistory = useCallback(snapshot => {
    const kept = latest.current.letter.signature
    setLetter({ ...snapshot.letter, signature: snapshot.letter.signature && kept ? { ...kept, ...snapshot.letter.signature, image: kept.image, source: kept.source } : kept && !snapshot.letter.signature ? null : kept })
    setResume({ ...latest.current.resumeData, ...snapshot.header })
  }, [setLetter, setResume])
  const historyLetter = useMemo(() => ({ ...letter, signature: letter.signature ? { ...letter.signature, image: undefined, source: undefined } : null }), [letter])
  const history = useEditorHistory({ letter: historyLetter, header: pick(resumeData, HEADER_KEYS) }, restoreHistory, true)
  useEffect(() => {
    const onKey = event => {
      const target = event.target
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable
      const onPage = Boolean(target?.closest?.('.letter-page-document'))
      const formatKey = { b: 'b', i: 'i', u: 'u' }[event.key.toLowerCase()]
      if ((event.ctrlKey || event.metaKey) && formatKey && !event.shiftKey && !event.altKey && (onPage || !typing) && selectionRef.current) { event.preventDefault(); toggleMark(formatKey); return }
      if (event.key === 'Escape' && !typing) { setSelection(null); return }
      if (typing || !(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); history.undo() }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); history.redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- NIMBUS ----
  const buildContext = () => {
    const { letter: current, resumeData: resume } = latest.current
    const elements = new Map()
    document.querySelectorAll('.letter-page-document [data-resume-element-id]').forEach(node => {
      const id = node.dataset.resumeElementId
      if (!elements.has(id)) elements.set(id, { id, label: describeResumeElement(id).label, text: node.textContent.trim().replace(/\s+/g, ' ').slice(0, 90), path: node.dataset.resumePath })
    })
    const active = selectionRef.current
    const highlighted = active?.range ? String(active.text ?? '').slice(active.range.start, active.range.end) : ''
    return {
      document: 'letter',
      resumeData: resume,
      letter: { role: roleOf(current, resume), date: current.dateAuto ? '' : current.date, recipient: current.recipient, subject: current.subject, showSubject: current.showSubject, salutation: current.salutation, signoff: current.signoff, paragraphs: current.paragraphs.map(({ kind, text }) => ({ kind, text })) },
      elements: [...elements.values()].slice(0, 120),
      selection: active ? { id: active.id, label: describeResumeElement(active.id).label, text: active.text ?? '', highlighted } : null,
      conversation: messages.filter(turn => turn.text).slice(-10).map(turn => ({ role: turn.role, text: turn.text })),
      job: jobText?.trim() ? { text: jobText.slice(0, 2500), title: job?.title ?? '', company: job?.company ?? '' } : null
    }
  }
  const applyOperations = operations => {
    const current = latest.current
    const result = applyLetterOperations({ letter: current.letter, resumeData: current.resumeData }, operations)
    if (result.letter !== current.letter) setLetter(result.letter)
    if (result.resumeData !== current.resumeData) setResume(result.resumeData)
    return { changed: result.changed, fitOnePage: false }
  }
  const nimbus = useNimbusTurns({
    turns: messages, setTurns: setMessages, available: true,
    adapter: {
      snapshot: () => structuredClone(latest.current),
      restore: snapshot => { setLetter(snapshot.letter); setResume(snapshot.resumeData) },
      applyOperations, buildContext,
      fitToOnePage: async () => ({ ok: true, changed: false, note: '' })
    }
  })

  // ---- Signature ----
  const defaultInk = () => {
    const node = document.querySelector('.letter-page-document .letter-paragraph')
    return node ? rgbToHex(window.getComputedStyle(node).color) : '#172033'
  }
  const onSignatureFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setSigBusy(true); setSigError('')
    try {
      const ink = letter.signature?.ink || defaultInk()
      const result = await importSignature(file, { ink, cleanup: letter.signature?.cleanup ?? 0.5 })
      if (!result.image) { setSigError(result.advice || 'No signature found in this image.'); return }
      setLetter(current => ({ ...current, signature: { image: result.image, source: result.source, ink, cleanup: current.signature?.cleanup ?? 0.5, width: current.signature?.width ?? 9, align: current.signature?.align ?? 'left', advice: result.advice } }))
      setSelection({ id: 'letter.signature', path: null, range: null, text: '' })
    } catch (error) {
      setSigError(error.message || 'This image could not be used.')
    } finally { setSigBusy(false) }
  }
  const changeSignature = patch => {
    setLetter(current => current.signature ? { ...current, signature: { ...current.signature, ...patch } } : current)
    if (!('cleanup' in patch || 'ink' in patch)) return
    window.clearTimeout(sigTimer.current)
    sigTimer.current = window.setTimeout(async () => {
      const signature = latest.current.letter.signature
      if (!signature?.source) return
      try {
        const result = await renderSignature(signature.source, { ink: signature.ink || defaultInk(), cleanup: signature.cleanup ?? 0.5 })
        if (result.image) setLetter(current => current.signature ? { ...current, signature: { ...current.signature, image: result.image, advice: result.advice } } : current)
        else setSigError(result.advice || '')
      } catch { /* keep the last good image */ }
    }, 180)
  }
  const removeSignature = () => { setLetter(current => ({ ...current, signature: null })); setSigError(''); setSelection(null) }
  const pickSignature = () => sigInputRef.current?.click()

  // ---- Export ----
  useEffect(() => {
    if (!exportOpen) return undefined
    const close = event => { if (!exportRef.current?.contains(event.target)) setExportOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [exportOpen])
  const printLetter = () => new Promise(resolve => {
    const previousTitle = document.title
    const finish = () => { window.removeEventListener('afterprint', finish); document.title = previousTitle; setPrinting(false); resolve() }
    setPrinting(true)
    loadFontsForPresentation(pres).then(() => document.fonts?.ready).then(() => window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      document.title = `${resumeName || 'Resume'} cover letter`
      window.addEventListener('afterprint', finish)
      window.print()
    })), 120))
  })
  const exportLetter = async format => {
    setExportOpen(false)
    if (exporting) return
    setExporting(true)
    const text = letterToText(letter, resumeData)
    try {
      if (format === 'PDF') await printLetter()
      else if (format === 'TXT') downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${safeLetterFileName(resumeName)}.txt`)
      else {
        const { Document, Packer, Paragraph, TextRun } = await import('docx')
        const children = text.split('\n').map(line => new Paragraph({ children: [new TextRun(line || ' ')] }))
        downloadBlob(await Packer.toBlob(new Document({ sections: [{ children }] })), `${safeLetterFileName(resumeName)}.docx`)
      }
    } catch (error) {
      setNotice(`Export failed${error?.message ? `: ${error.message}` : '.'}`)
    } finally { setExporting(false) }
  }

  // ---- Panels ----
  const accentDefault = template?.defaultTheme?.accentColor
  const paperColor = PAPER_OPTIONS.find(option => option.id === letter.presentation.paper)?.color ?? '#ffffff'
  const signaturePanel = <SignatureControls signature={letter.signature} onPick={pickSignature} onChange={changeSignature} onRemove={removeSignature} busy={sigBusy} error={sigError}
    textColor={letter.presentation.textColor} accentColor={letter.presentation.accentColor || pres.accentColor || accentDefault} paper={paperColor} />
  const paperControls = <section className="fp-group">
    <h3>Page</h3>
    <div className="fp-field is-wide"><span className="fp-label">Paper colour</span>
      <div className="fp-segmented" role="group" aria-label="Paper colour">
        {PAPER_OPTIONS.map(option => <button key={option.id} type="button" className={letter.presentation.paper === option.id ? 'is-active' : ''} aria-pressed={letter.presentation.paper === option.id} onClick={() => setPresentation({ paper: option.id })}>{option.label}</button>)}
      </div>
    </div>
  </section>
  const photoPanel = <section className="fp-group"><h3>Photo</h3>
    <p className="fp-hint letter-panel-note">Your photo comes from your resume. Change it there.</p>
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLetter(current => ({ ...current, showPhoto: false }))}>Hide from this letter</button>
  </section>
  const format = <FormatPanel
    selection={selection} onClearSelection={() => setSelection(null)} resumeData={readModel}
    onEditText={(path, value) => handleEdit({ path, value })} onToggleMark={toggleMark}
    overrides={pres.elementOverrides} onStyle={(target, changes) => applyStyle({ type: 'set_style', target, changes })} onClear={target => applyStyle({ type: 'clear_style', target })}
    revision={`${selection?.id}|${JSON.stringify(letter.presentation)}|${letter.paragraphs.length}`}
    fonts={resumeFonts} fontFamily={letter.presentation.fontFamily || null} templateFontFamily={template?.defaultTheme?.fontFamily}
    onFontFamily={family => setPresentation({ fontFamily: family })}
    baseFontSize={letter.presentation.baseSize ?? defaultBase} onBaseFontSize={size => setPresentation({ baseSize: size })}
    textColor={letter.presentation.textColor} onTextColor={color => setPresentation({ textColor: color })}
    accentColor={letter.presentation.accentColor || pres.accentColor} templateAccent={accentDefault} onAccentColor={color => setPresentation({ accentColor: color })}
    photo={null} onPhotoChange={() => {}} onPhotoUpload={() => {}}
    onResetAll={() => setLetter(current => ({ ...current, presentation: createLetter().presentation }))}
    documentSelector=".letter-page-document" scopeLabel="Whole letter" documentNoun="letter"
    wholeExtras={<>{paperControls}{signaturePanel}</>}
    elementPanels={{ 'letter.signature': signaturePanel, 'resume.header.photo': photoPanel }}
  />
  const details = <LetterDetails letter={letter} onChange={setLetter} jobText={jobText} onJobTextChange={onJobTextChange} supportsPhoto={Boolean(template?.supportsPhoto && presentation?.photo?.source)} />
  const right = <div className="letter-panel">
    <div className="letter-panel-tabs" role="tablist" aria-label="Letter panel">
      {[['details', 'Details'], ['format', 'Format']].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <div role="tabpanel" hidden={tab !== 'details'}>{details}</div>
    <div role="tabpanel" hidden={tab !== 'format'}>{format}</div>
  </div>

  const chat = <NimbusChat inputRef={inputRef} turns={messages} busy={nimbus.busy} phase={nimbus.phase} task={nimbus.task} available
    value={input} onChange={event => setInput(event.target.value)} onSend={text => { setInput(''); nimbus.run(text) }} onStop={nimbus.stop}
    hints={LETTER_PLACEHOLDERS} suggestions={SUGGESTIONS} actions={nimbus}
    greeting={greetingFor({ displayName: userName, resumeName: resumeData?.fullName })} />
  const left = <AiRail nimbus={chat} docks={<>
    <LetterGuide result={lint} busy={nimbus.busy} onFix={fix => nimbus.run(fix)} />
    <div className="rail-evidence rail-tailor">
      <svg className="rail-evidence-logo" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="10" cy="10" r="3.2" fill="currentColor" /></svg>
      <span><b>Tailor to a job</b><small>Match your resume to this job first</small></span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenTailor}>Open</button>
    </div>
  </>} />

  const topBar = <header className="studio-topbar">
    <div className="studio-topbar-start">
      <button className="btn btn-ghost btn-icon" type="button" onClick={onBack} aria-label="Back to resume" title="Back to resume"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4.5 6.5 10l5.5 5.5" /></svg></button>
      <svg className="studio-doc-mark" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13v9h-13z" /><path d="m3.8 6 6.2 4.6L16.2 6" /></svg>
      <div className="studio-title-wrap">
        <span className="studio-title letter-studio-title">Cover letter</span>
        <span className="studio-subtitle">{resumeName} · {pages > 1 ? `${pages} pages` : 'one page'}</span>
      </div>
    </div>
    <div className="studio-topbar-centre" role="toolbar" aria-label="History and zoom">
      <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 5 3.5 9l4 4M4 9h8a4.5 4.5 0 0 1 0 9h-2" /></svg></button>
      <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl+Y)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 5 4 4-4 4M16 9H8a4.5 4.5 0 0 0 0 9h2" /></svg></button>
      <span className="studio-divider" aria-hidden="true" />
      <select className="studio-zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))} aria-label="Zoom">
        {[.5, .75, 1, 1.25, 1.5].map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
      </select>
    </div>
    <div className="studio-topbar-end">
      <span className="canvas-export-wrap" ref={exportRef}>
        <button className="btn btn-secondary" type="button" disabled={exporting} aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen(open => !open)}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v9M6 8.5l4 4 4-4M4 16.5h12" /></svg>{exporting ? 'Exporting…' : 'Export letter'}
        </button>
        {exportOpen && <div className="export-format-menu studio-menu" role="menu" aria-label="Export format">
          <button type="button" role="menuitem" onClick={() => exportLetter('PDF')}><b>PDF</b><small>As designed</small></button>
          <button type="button" role="menuitem" onClick={() => exportLetter('DOCX')}><b>Word</b><small>Text only</small></button>
          <button type="button" role="menuitem" onClick={() => exportLetter('TXT')}><b>Plain text</b><small>For online forms</small></button>
        </div>}
      </span>
      {included
        ? <><button className="btn btn-ghost" type="button" onClick={onRemoveFromResume}>Remove from resume</button><button className="btn btn-primary" type="button" onClick={onBackToResume}>Back to resume</button></>
        : <button className="btn btn-primary" type="button" onClick={onAddToResume}>Add to resume</button>}
    </div>
  </header>

  const canvas = <div className="studio-canvas letter-canvas" style={{ '--canvas-zoom': zoom }}>
    <CoverLetterPage template={template} resumeData={resumeData} letter={letter} presentation={presentation} onEdit={handleEdit} onSelect={selectElement}
      selectedId={selection?.id ?? null} onPages={setPages} onSignatureClick={pickSignature} />
    {pages > 1 && <p className="letter-over" role="status">This letter runs onto {pages} pages. Shorten it, or ask NIMBUS to “shorten this to about 300 words”.</p>}
  </div>

  return <div className="studio letter-studio">
    {topBar}
    <input ref={sigInputRef} className="upload-input" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label="Choose a signature image" onChange={onSignatureFile} />
    {notice && <p className="form-error letter-notice" role="alert">{notice} <button type="button" className="btn btn-link" onClick={() => setNotice('')}>Dismiss</button></p>}
    <EditorShell left={left} centre={canvas} right={right} leftLabel="NIMBUS" rightLabel="Details" centreLabel="Letter" />
    {printing && createPortal(<div className="print-root letter-print-root" aria-hidden="true"><LetterPrintPage template={template} resumeData={resumeData} letter={letter} presentation={presentation} /></div>, document.body)}
  </div>
}
