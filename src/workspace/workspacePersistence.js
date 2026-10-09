// Keeps the open draft in sessionStorage so it survives leaving the workspace (dashboard, templates)
// and a refresh in the same tab. Undo history and File objects are deliberately not stored.
// The workspace snapshot includes a resumeId field that links the session to a Firestore document.
const STORAGE_KEY = 'resumetrics:workspace:v1'
const MAX_BYTES = 4_500_000
// Photos are data URLs; drop them first if the draft is too large for sessionStorage.
const PHOTO_BUDGET = 1_500_000
const transientModes = new Set(['file-selected', 'extracting', 'error'])

let cached

export function readWorkspaceSnapshot() {
  if (cached === undefined) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
      cached = parsed && parsed.version === 1 ? parsed.state : null
    } catch {
      cached = null
    }
    if (cached && transientModes.has(cached.workspaceMode)) cached.workspaceMode = cached.resumeData ? 'extraction-review' : 'initial'
  }
  // Ensure resumeId field exists for backward compatibility
  if (cached && cached.resumeId === undefined) {
    cached.resumeId = null
  }
  return cached
}

/** Initial value for a piece of MainPage state: the stored value when present, else the fallback. */
export function restored(key, fallback) {
  const snapshot = readWorkspaceSnapshot()
  if (snapshot && Object.hasOwn(snapshot, key) && snapshot[key] !== undefined) return snapshot[key]
  return typeof fallback === 'function' ? fallback() : fallback
}

/**
 * Write the workspace snapshot to sessionStorage.
 * 
 * The state object should include all workspace fields including:
 * - workspaceMode, resumeData, selectedTemplateId, resumePresentation
 * - uploadedFileName, parseMetadata, resumeName, fontColor, fontFamily
 * - globalFontSize, useGlobalTextColor, footerText, assistantMessages
 * - aiTab, confirmedSections, description, analysis, githubScan
 * - resumeId: unique identifier linking session to Firestore document
 * 
 * @param {Object} state - Complete workspace state object
 * @returns {Object} - { photoDropped: boolean } indicating if photo was removed due to size
 */
export function writeWorkspaceSnapshot(state) {
  let next = state
  let serialised = JSON.stringify({ version: 1, state: next })
  let photoDropped = false
  if (serialised.length > MAX_BYTES || (next.resumePresentation?.photo?.source?.length ?? 0) > PHOTO_BUDGET) {
    const { photo, ...presentation } = next.resumePresentation ?? {}
    next = { ...next, resumePresentation: { ...presentation, photo: photo ? { ...photo, source: undefined, originalSource: undefined, uploaded: false } : photo } }
    serialised = JSON.stringify({ version: 1, state: next })
    photoDropped = Boolean(photo?.source)
  }
  try {
    if (serialised.length <= MAX_BYTES) sessionStorage.setItem(STORAGE_KEY, serialised)
    cached = next
  } catch {
    // Storage full or blocked: the draft still works for this visit.
  }
  return { photoDropped }
}

export function clearWorkspaceSnapshot() {
  cached = null
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* nothing stored */ }
}
