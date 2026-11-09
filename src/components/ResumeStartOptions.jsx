import { useState } from 'react'

const acceptedExtensions = ['pdf', 'docx', 'txt']
const fileTypeStyles = {
  pdf: { label: 'PDF', color: '#e5484d', soft: '#ffe9ea' },
  docx: { label: 'DOCX', color: '#2f6fe4', soft: '#e7efff' },
  txt: { label: 'TXT', color: '#5f6b82', soft: '#eef0f5' }
}

const getExtension = fileName => String(fileName || '').split('.').pop().toLocaleLowerCase()

const formatFileSize = bytes => {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileTypeIcon({ fileName, size = 40 }) {
  const style = fileTypeStyles[getExtension(fileName)] ?? fileTypeStyles.txt
  return <svg className="file-type-icon" width={size} height={size * 1.2} viewBox="0 0 40 48" aria-hidden="true">
    <path d="M6 2h20l10 10v32a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill={style.soft} stroke={style.color} strokeWidth="1.5" />
    <path d="M26 2v8a2 2 0 0 0 2 2h8" fill="none" stroke={style.color} strokeWidth="1.5" />
    <rect x="1" y="26" width={style.label.length > 3 ? 32 : 26} height="13" rx="3" fill={style.color} />
    <text x={style.label.length > 3 ? 17 : 14} y="35.6" textAnchor="middle" fill="#fff" fontSize="8.5" fontWeight="800" fontFamily="inherit">{style.label}</text>
  </svg>
}

function UploadIllustration() {
  const sheet = (type, transform) => {
    const style = fileTypeStyles[type]
    return <g transform={transform}>
      <path d="M8 0h44l16 16v72a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V6a6 6 0 0 1 6-6Z" fill={`url(#upload-${type})`} />
      <path d="M52 0v12a4 4 0 0 0 4 4h12" fill="rgba(255,255,255,.35)" />
      <rect x="12" y="34" width="34" height="5" rx="2.5" fill="rgba(255,255,255,.75)" />
      <rect x="12" y="45" width="42" height="5" rx="2.5" fill="rgba(255,255,255,.6)" />
      <rect x="12" y="56" width="28" height="5" rx="2.5" fill="rgba(255,255,255,.6)" />
      <text x="35" y="82" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800" letterSpacing=".04em" fontFamily="inherit">{style.label}</text>
    </g>
  }
  return <svg className="upload-illustration" viewBox="0 0 220 130" aria-hidden="true">
    <defs>
      <linearGradient id="upload-pdf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff7a7f" /><stop offset="1" stopColor="#e5484d" /></linearGradient>
      <linearGradient id="upload-docx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6ea2ff" /><stop offset="1" stopColor="#2f6fe4" /></linearGradient>
      <linearGradient id="upload-txt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a3adc2" /><stop offset="1" stopColor="#66728a" /></linearGradient>
      <filter id="upload-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#2d3a6b" floodOpacity=".18" /></filter>
    </defs>
    <g filter="url(#upload-shadow)">
      {sheet('pdf', 'translate(36 26) rotate(-14)')}
      {sheet('txt', 'translate(122 12) rotate(14)')}
      {sheet('docx', 'translate(76 10)')}
    </g>
  </svg>
}

export function LinkedInMark({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#0a66c2" /><path fill="#fff" d="M7.1 9.6h-2.6V19h2.6V9.6Zm.2-2.9a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0ZM19.5 13.4c0-2.6-1.4-3.9-3.3-3.9-1.5 0-2.2.8-2.6 1.4V9.6H11V19h2.6v-4.7c0-1.2.2-2.4 1.8-2.4 1.5 0 1.5 1.4 1.5 2.5V19h2.6v-5.6Z" /></svg>
}

export default function ResumeStartOptions({ onImport, onFile, onCreate, onImportLinkedIn, selectedFile = null, onRead }) {
  const [dragging, setDragging] = useState(false)
  const [dropError, setDropError] = useState('')

  const acceptFile = file => {
    if (!file) return
    if (!acceptedExtensions.includes(getExtension(file.name))) {
      setDropError('That file type is not supported. Use a PDF, DOCX or TXT file.')
      return
    }
    setDropError('')
    onFile?.(file)
  }

  const handleDrop = event => {
    event.preventDefault()
    setDragging(false)
    acceptFile(event.dataTransfer.files?.[0])
  }

  return <section className="resume-start-options" aria-label="Start a resume">
    <div className="resume-start-intro"><h2>Choose how you want to begin.</h2></div>
    <div className="resume-start-grid">
      <article className="resume-start-card import-start-card">
        <div className="start-card-heading"><h3>Upload your resume</h3><span>Recommended</span></div>
        <div
          className={`upload-dropzone${dragging ? ' is-dragging' : ''}${selectedFile ? ' is-compact' : ''}`}
          onDragEnter={event => { event.preventDefault(); setDragging(true) }}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
          onDrop={handleDrop}
        >
          {selectedFile
            ? <div className="upload-file-row" aria-live="polite">
              <FileTypeIcon fileName={selectedFile.name} size={34} />
              <span className="upload-file-details"><b>{selectedFile.name}</b><small>{formatFileSize(selectedFile.size)}<span aria-hidden="true">|</span><em>Ready to read</em></small></span>
            </div>
            : <>
              <UploadIllustration />
              <p className="upload-dropzone-title">Drag and drop your resume here</p>
              <button className="upload-dropzone-add" type="button" onClick={onImport} aria-label="Choose a file" title="Choose a file">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </>}
        </div>
        {!selectedFile && <div className="upload-meta"><span>Accepted formats: PDF, DOCX, TXT</span><span>Text-based files work best</span></div>}
        {dropError && <p className="upload-error" role="alert">{dropError}</p>}
        {selectedFile && <div className="upload-actions">
          <button className="btn btn-secondary" type="button" onClick={onImport}>Change file</button>
          <button className="btn btn-primary" type="button" onClick={onRead}>Read document</button>
        </div>}
      </article>

      <article className="resume-start-card scratch-start-card">
        <span className="start-card-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17.5V20h2.5L18.8 7.7l-2.5-2.5L4 17.5Z" /><path d="m14.8 6.2 2.5 2.5M13 20h7" /></svg></span>
        <h3>Start from scratch</h3>
        <p>Pick a template and fill it in section by section.</p>
        <button className="btn btn-secondary" type="button" onClick={onCreate}>Start building</button>
      </article>

      <article className="resume-start-card scratch-start-card linkedin-start-card">
        <span className="start-card-icon is-linkedin"><LinkedInMark size={26} /></span>
        <h3>Import from LinkedIn</h3>
        <p>On LinkedIn open your profile, choose <b>Resources → Save to PDF</b>, then upload that file here.</p>
        <button className="btn btn-secondary" type="button" onClick={onImportLinkedIn}>Choose LinkedIn PDF</button>
      </article>
    </div>
  </section>
}
