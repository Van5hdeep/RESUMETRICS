import React, { useCallback, useEffect, useRef, useState } from 'react'

const FRAME = 280
// The visible crop shape sits this far inside the frame; the dimmed border around it is not saved.
const INSET = 14
const OUTPUT = 512
const MAX_ZOOM = 3
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/**
 * Instagram-style cropper: drag the photo inside the frame and zoom to choose what shows.
 * The result is rendered to a square JPEG so every template displays the same framing.
 */
function PhotoCropDialog({ source, shape = 'circle', initialCrop, onApply, onCancel }) {
  const imageRef = useRef(null)
  const dragRef = useRef(null)
  const dialogRef = useRef(null)
  const [natural, setNatural] = useState(null)
  const [zoom, setZoom] = useState(initialCrop?.zoom ?? 1)
  const [offset, setOffset] = useState(null)

  const baseScale = natural ? Math.max(FRAME / natural.width, FRAME / natural.height) : 1
  const scale = baseScale * zoom
  const displayWidth = natural ? natural.width * scale : FRAME
  const displayHeight = natural ? natural.height * scale : FRAME

  // Keep the photo covering the whole frame: no empty edges at any zoom.
  const clampOffset = useCallback((next, width = displayWidth, height = displayHeight) => ({
    x: clamp(next.x, FRAME - width, 0),
    y: clamp(next.y, FRAME - height, 0)
  }), [displayWidth, displayHeight])

  const onImageLoad = event => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget
    setNatural({ width, height })
    const startScale = Math.max(FRAME / width, FRAME / height) * (initialCrop?.zoom ?? 1)
    const centre = { x: (FRAME - width * startScale) / 2, y: (FRAME - height * startScale) / 2 }
    // A saved crop is stored as the frame centre in image coordinates, so it survives zoom changes.
    const start = initialCrop?.centerX != null
      ? { x: FRAME / 2 - initialCrop.centerX * width * startScale, y: FRAME / 2 - initialCrop.centerY * height * startScale }
      : centre
    setOffset({ x: clamp(start.x, FRAME - width * startScale, 0), y: clamp(start.y, FRAME - height * startScale, 0) })
  }

  const changeZoom = nextZoom => {
    if (!natural || !offset) return
    const value = clamp(nextZoom, 1, MAX_ZOOM)
    // Zoom around the centre of the frame so the chosen area stays in view.
    const centreX = (FRAME / 2 - offset.x) / scale
    const centreY = (FRAME / 2 - offset.y) / scale
    const nextScale = baseScale * value
    const width = natural.width * nextScale
    const height = natural.height * nextScale
    setZoom(value)
    setOffset(clampOffset({ x: FRAME / 2 - centreX * nextScale, y: FRAME / 2 - centreY * nextScale }, width, height))
  }

  const onPointerDown = event => {
    if (!offset) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startX: event.clientX, startY: event.clientY, origin: offset }
  }
  const onPointerMove = event => {
    const drag = dragRef.current
    if (!drag) return
    setOffset(clampOffset({ x: drag.origin.x + event.clientX - drag.startX, y: drag.origin.y + event.clientY - drag.startY }))
  }
  const onPointerUp = () => { dragRef.current = null }
  const onWheel = event => {
    event.preventDefault()
    changeZoom(zoom - event.deltaY * 0.0015)
  }
  const onFrameKeyDown = event => {
    const step = event.shiftKey ? 30 : 10
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (moves[event.key] && offset) {
      event.preventDefault()
      setOffset(clampOffset({ x: offset.x + moves[event.key][0], y: offset.y + moves[event.key][1] }))
    }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(zoom + .1) }
    if (event.key === '-') { event.preventDefault(); changeZoom(zoom - .1) }
  }

  useEffect(() => {
    const node = dialogRef.current
    if (!node) return undefined
    // Wheel zoom needs a non-passive listener so the page does not scroll underneath.
    const frame = node.querySelector('.photo-crop-frame')
    frame?.addEventListener('wheel', onWheel, { passive: false })
    return () => frame?.removeEventListener('wheel', onWheel)
  })

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    dialogRef.current?.querySelector('.photo-crop-frame')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const apply = () => {
    const image = imageRef.current
    if (!image || !natural || !offset) return
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const context = canvas.getContext('2d')
    const sourceSize = (FRAME - INSET * 2) / scale
    context.drawImage(image, (INSET - offset.x) / scale, (INSET - offset.y) / scale, sourceSize, sourceSize, 0, 0, OUTPUT, OUTPUT)
    onApply(canvas.toDataURL('image/jpeg', .9), {
      zoom,
      centerX: (FRAME / 2 - offset.x) / scale / natural.width,
      centerY: (FRAME / 2 - offset.y) / scale / natural.height
    })
  }

  return <div className="photo-crop-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
    <div className="photo-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-crop-title" ref={dialogRef}>
      <h2 id="photo-crop-title">Adjust profile photo</h2>
      <p>Drag to reposition. Zoom to fit the part you want to show.</p>
      <div
        className={`photo-crop-frame is-${shape === 'circle' ? 'circle' : 'rounded'}`}
        style={{ width: FRAME, height: FRAME }}
        tabIndex={0}
        role="application"
        aria-label="Photo crop area. Use arrow keys to move the photo, plus and minus to zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onFrameKeyDown}
      >
        <img
          ref={imageRef}
          src={source}
          alt=""
          draggable="false"
          onLoad={onImageLoad}
          style={{ width: displayWidth, height: displayHeight, transform: offset ? `translate(${offset.x}px, ${offset.y}px)` : undefined, opacity: offset ? 1 : 0 }}
        />
        <span className="photo-crop-mask" aria-hidden="true" />
        <span className="photo-crop-grid" aria-hidden="true" />
      </div>
      <label className="photo-crop-zoom">
        <span aria-hidden="true">−</span>
        <input type="range" min="1" max={MAX_ZOOM} step="0.01" value={zoom} onChange={event => changeZoom(Number(event.target.value))} aria-label="Zoom" />
        <span aria-hidden="true">+</span>
      </label>
      <div className="photo-crop-actions">
        <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" type="button" onClick={apply} disabled={!offset}>Apply</button>
      </div>
    </div>
  </div>
}

export default function ProfilePhotoControls({ photo, onChange, error = '' }) {
  const [cropOpen, setCropOpen] = useState(false)
  const original = photo?.originalSource || photo?.source
  const shape = photo?.shape || 'circle'

  // A freshly uploaded photo opens the cropper straight away.
  useEffect(() => {
    if (photo?.cropPending) setCropOpen(true)
  }, [photo?.cropPending])

  const applyCrop = (source, crop) => {
    onChange?.({ ...photo, source, originalSource: original, crop, cropPending: false, objectPosition: '50% 50%' })
    setCropOpen(false)
  }
  const cancelCrop = () => {
    setCropOpen(false)
    // Closing the first crop keeps the photo, centred, so it never stays half-configured.
    if (photo?.cropPending) onChange?.({ ...photo, cropPending: false })
  }

  if (!photo?.uploaded && !error) return null

  return <aside className="panel section-panel profile-photo-editor" aria-label="Profile photo">
    <div><span className="eyebrow">Profile photo</span><h2>Your photo</h2></div>
    {photo?.uploaded && <div className="profile-photo-summary">
      <img className={`profile-photo-thumb is-${shape === 'circle' ? 'circle' : 'rounded'}`} src={photo.source} alt="Your profile photo as it appears on the resume" />
      <div>
        <p className="muted">Drag and zoom to choose exactly what shows.</p>
        <button className="btn btn-secondary" type="button" onClick={() => setCropOpen(true)}>Adjust photo</button>
      </div>
    </div>}
    {error && <p className="profile-photo-error" role="alert">{error}</p>}
    {cropOpen && original && <PhotoCropDialog source={original} shape={shape} initialCrop={photo?.crop} onApply={applyCrop} onCancel={cancelCrop} />}
  </aside>
}
