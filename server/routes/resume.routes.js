import { Router } from 'express'
import { AIConfigurationError } from '../config/env.js'
import { analyzeResumeAgainstRole } from '../services/resumeAI.js'
import { normalizeResumeData } from '../services/resumeData.js'
import { extractCompleteResumeDocument, extractSourceFallbackDocument, MAX_DOCUMENT_CHARACTERS, normalizeResumeDocument } from '../services/resumeExtraction.js'
import { buildSkillAwareRoleAnalysis } from '../../shared/roleAnalysis.js'
import { ResumeEditPlanError } from '../../shared/resumeEditPlan.js'
import { createResumeEditPlan } from '../services/resumeEdit.js'

const router = Router()
const MAX_JOB_DESCRIPTION_LENGTH = 12_000
const MAX_EDIT_INSTRUCTION_LENGTH = 4_000

function configurationError(response) {
  return response.status(503).json({ ok: false, error: 'AI backend is not configured. Check the server environment configuration.' })
}

router.post('/extract', async (request, response) => {
  const { document, resumeText } = request.body ?? {}
  const sourceDocument = normalizeResumeDocument(document ?? { resumeText })

  if (!sourceDocument.rawText) {
    return response.status(400).json({ ok: false, error: 'A document with readable text must be provided.' })
  }

  if (sourceDocument.rawText.length > MAX_DOCUMENT_CHARACTERS) {
    return response.status(400).json({ ok: false, error: `This document contains more than ${MAX_DOCUMENT_CHARACTERS.toLocaleString()} readable characters. Split it into smaller files and try again.` })
  }

  try {
    const result = await extractCompleteResumeDocument(sourceDocument)
    return response.json({ ok: true, ...result })
  } catch (error) {
    console.error('Resume extraction failed:', error)
    if (error instanceof AIConfigurationError) return configurationError(response)
    const result = extractSourceFallbackDocument(sourceDocument)
    return response.json({ ok: true, ...result })
  }
})

router.post('/analyze', async (request, response) => {
  const { resumeData, jobDescription, evidenceScope } = request.body ?? {}
  if (!resumeData || typeof resumeData !== 'object') return response.status(400).json({ ok: false, error: 'resumeData must be provided.' })
  if (typeof jobDescription !== 'string' || !jobDescription.trim()) return response.status(400).json({ ok: false, error: 'jobDescription must be a non-empty string.' })
  if (jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) return response.status(400).json({ ok: false, error: `jobDescription must be ${MAX_JOB_DESCRIPTION_LENGTH.toLocaleString()} characters or fewer.` })

  const normalizedResumeData = normalizeResumeData(resumeData)
  try {
    const analysis = await analyzeResumeAgainstRole({
      resumeData: normalizedResumeData,
      jobDescription: jobDescription.trim(),
      includeProfileSignals: evidenceScope === 'linkedin-profile'
    })
    return response.json({ ok: true, analysis, analysisMethod: 'ai' })
  } catch (error) {
    console.error('Role alignment analysis failed:', error)
    const analysis = buildSkillAwareRoleAnalysis(normalizedResumeData, jobDescription.trim())
    return response.json({ ok: true, analysis, analysisMethod: 'skill-fallback' })
  }
})

router.post('/edit', async (request, response) => {
  const { instruction, workspaceContext } = request.body ?? {}
  if (typeof instruction !== 'string' || !instruction.trim()) {
    return response.status(400).json({ ok: false, error: 'instruction must be a non-empty string.' })
  }
  if (instruction.length > MAX_EDIT_INSTRUCTION_LENGTH) {
    return response.status(400).json({ ok: false, error: `instruction must be ${MAX_EDIT_INSTRUCTION_LENGTH.toLocaleString()} characters or fewer.` })
  }
  if (!workspaceContext || typeof workspaceContext !== 'object' || Array.isArray(workspaceContext) || !workspaceContext.resumeData) {
    return response.status(400).json({ ok: false, error: 'Current resume workspace context must be provided.' })
  }

  try {
    const plan = await createResumeEditPlan({ instruction: instruction.trim(), workspaceContext })
    return response.json({ ok: true, plan })
  } catch (error) {
    console.error('Resume edit planning failed:', error)
    if (error instanceof AIConfigurationError) return configurationError(response)
    if (error instanceof ResumeEditPlanError || error instanceof SyntaxError) {
      return response.status(502).json({ ok: false, error: 'The AI returned an edit that could not be applied safely. Please rephrase your request.' })
    }
    return response.status(502).json({ ok: false, error: 'Could not prepare this resume edit right now. Please try again.' })
  }
})

export default router
