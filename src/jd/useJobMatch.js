import { useRef, useState } from 'react'
import { streamNdjson } from '../utils/readNdjson.js'
import { extractResumeDocument } from '../utils/extractResumeDocument.js'
import { customKeyword, extractJdKeywords, scoreKeywords } from '../../shared/jdKeywords.js'
import { extractJd } from '../../shared/jdExtract.js'
import { applyNimbusOperations } from '../nimbus/applyNimbusOperations.js'
import { settleLayout } from '../nimbus/useNimbusTurns.js'

/**
 * Keyword-driven job match (PLAN-030/031): read the posting (instantly, in the browser) → pick keywords → score → fixes.
 * adapter: { getResume(), elementIds(), snapshot(), restore(snapshot), applyOperations(ops) }
 * analysis (persisted): { runId, jobText, jd, keywords, step: 'keywords'|'results', baseline, fixes, fixState, fixesStatus }
 * The live score is not stored: callers derive it from the current resume with scoreKeywords, so it
 * follows every executed change, undo and manual edit.
 */
export default function useJobMatch({ analysis, setAnalysis, draft, setDraft, adapter, endpoints = { fixes: '/api/jd/fixes' } }) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef(null)
  const snapshotsRef = useRef(new Map())
  const orderRef = useRef(0)
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter

  // Keywords are found locally (shared/jdExtract.js), so this is instant; only an attached file needs reading first.
  const parse = async () => {
    setError('')
    let jobText = draft.trim()
    if (file) {
      setBusy(true)
      try {
        const extracted = await extractResumeDocument(file)
        jobText = [extracted.rawText, jobText].filter(Boolean).join('\n\n')
      } catch {
        setError('Could not read that file. Try a text-based PDF, a Word file, or paste the text.')
        setBusy(false)
        return
      }
      setBusy(false)
    }
    if (jobText.trim().length < 40) { setError('That job post looks too short. Paste the full post, including the requirements.'); return }
    const jd = extractJd(jobText)
    const keywords = extractJdKeywords(jd, jobText)
    if (!keywords.length) { setError('No skills or requirements were found in that text. Paste the requirements section of the post.'); return }
    snapshotsRef.current.clear()
    setAnalysis({ runId: Date.now(), jobText: jobText.slice(0, 20_000), jd, keywords, step: 'keywords', fixes: [], fixState: {}, skipped: {} })
    setDraft('')
    setFile(null)
  }

  const updateKeywords = change => setAnalysis(current => ({ ...current, keywords: change(current.keywords) }))
  const toggleKeyword = term => updateKeywords(keywords => keywords.map(keyword => keyword.term === term ? { ...keyword, selected: !keyword.selected } : keyword))
  const selectAll = (selected, group = null) => updateKeywords(keywords => keywords.map(keyword => !group || keyword.group === group ? { ...keyword, selected } : keyword))
  const addKeyword = term => {
    const keyword = customKeyword(term, analysis?.jobText)
    if (!keyword) return false
    if (analysis?.keywords?.some(item => item.term.toLowerCase() === keyword.term.toLowerCase())) return false
    updateKeywords(keywords => [...keywords, keyword])
    return true
  }

  const fetchFixes = async (keywords = analysis?.keywords) => {
    const resume = adapterRef.current.getResume()
    const rows = scoreKeywords(resume, keywords).rows
    setAnalysis(current => ({ ...current, fixes: (current.fixes ?? []).filter(fix => fix.local), fixState: {}, skipped: {}, fixesStatus: 'loading', fixesDegraded: false, fixesLimited: false }))
    snapshotsRef.current.clear()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamNdjson(endpoints.fixes, {
        body: { resumeData: resume, jd: analysis?.jd, keywords: rows, elementIds: adapterRef.current.elementIds() },
        signal: controller.signal,
        onEvent: event => {
          if (event.type === 'fixes') setAnalysis(current => ({ ...current, fixes: [...event.fixes, ...(current.fixes ?? []).filter(fix => fix.local)], fixesStatus: 'ready', fixesDegraded: Boolean(event.degraded), fixesLimited: Boolean(event.limited) }))
          else if (event.type === 'error') setAnalysis(current => ({ ...current, fixesStatus: 'error', fixesError: event.message }))
        }
      })
    } catch (caught) {
      if (!controller.signal.aborted) setAnalysis(current => ({ ...current, fixesStatus: 'error', fixesError: caught instanceof TypeError ? 'The job match service is offline.' : caught?.status ? caught.message : 'Changes could not be prepared.' }))
    } finally {
      abortRef.current = null
    }
  }

  /** Score the resume against the selected keywords; this score is the "from" of the final spotlight. */
  const scoreNow = () => {
    const result = scoreKeywords(adapterRef.current.getResume(), analysis?.keywords)
    setAnalysis(current => ({ ...current, step: 'results', baseline: result.score }))
    fetchFixes(analysis?.keywords)
  }

  /** How many points a fix would add right now (applied to a copy of the resume, then re-scored). */
  const impactOf = (fix, resume, keywords) => {
    if (fix.kind !== 'executable') return 0
    try {
      const next = applyNimbusOperations({ resumeData: resume }, fix.operations, { elementIds: [] }).resumeData
      return scoreKeywords(next, keywords).score - scoreKeywords(resume, keywords).score
    } catch { return 0 }
  }

  /**
   * The best score honest fixes can reach: every executable fix not yet applied, applied together to a copy.
   * Fixes that need facts the resume lacks ("ideas") are not counted. null while fixes are loading.
   */
  const reachableScore = (resume, keywords, fixes = analysis?.fixes, fixState = analysis?.fixState ?? {}) => {
    if (analysis?.fixesStatus !== 'ready') return null
    let next = resume
    for (const fix of (fixes ?? []).filter(item => item.kind === 'executable' && fixState[item.id]?.status !== 'done')) {
      try { next = applyNimbusOperations({ resumeData: next }, fix.operations, { elementIds: [] }).resumeData } catch { /* a fix that no longer applies adds nothing */ }
    }
    return scoreKeywords(next, keywords).score
  }

  const executeFix = async fix => {
    const before = adapterRef.current.snapshot()
    try {
      adapterRef.current.applyOperations(fix.operations)
    } catch (caught) {
      setAnalysis(current => ({ ...current, fixState: { ...current.fixState, [fix.id]: { error: caught.message } } }))
      return
    }
    snapshotsRef.current.set(fix.id, before)
    orderRef.current += 1
    const order = orderRef.current
    setAnalysis(current => ({ ...current, fixState: { ...current.fixState, [fix.id]: { status: 'done', order } } }))
    await settleLayout(160)
  }

  // Undoing a fix also undoes the fixes applied after it (they were built on top of it).
  const undoFix = async fix => {
    const snapshot = snapshotsRef.current.get(fix.id)
    const order = analysis?.fixState?.[fix.id]?.order
    if (!snapshot || !order) return
    adapterRef.current.restore(snapshot)
    setAnalysis(current => ({ ...current, fixState: Object.fromEntries(Object.entries(current.fixState).filter(([, state]) => !(state.order >= order))) }))
    await settleLayout(160)
  }

  const skipFix = fix => setAnalysis(current => ({ ...current, skipped: { ...current.skipped, [fix.id]: !current.skipped?.[fix.id] } }))

  /** A fix built on the client (e.g. the job-title check) joins the list so it can be applied and undone like the rest. */
  const addLocalFix = fix => setAnalysis(current => current.fixes?.some(item => item.id === fix.id) ? current : { ...current, fixes: [...(current.fixes ?? []), fix] })

  const editKeywords = () => setAnalysis(current => ({ ...current, step: 'keywords' }))
  const reset = () => { abortRef.current?.abort(); setAnalysis(null); setError(''); snapshotsRef.current.clear() }

  return {
    busy, error, file, setFile: next => { setFile(next); setError('') },
    parse, stop: () => abortRef.current?.abort(),
    toggleKeyword, selectAll, addKeyword, scoreNow, fetchFixes, impactOf, reachableScore,
    executeFix, undoFix, skipFix, addLocalFix, editKeywords, reset
  }
}
