import { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react'
import { saveResume } from '../utils/userApi.js'

// Autosave debounce delay in milliseconds
const AUTOSAVE_DEBOUNCE_MS = 200

/**
 * Custom hook for managing debounced Firestore autosave operations
 * 
 * @param {Object} params - Hook parameters
 * @param {Object} params.workspaceState - Complete workspace snapshot object
 * @param {boolean} params.isAuthenticated - Authentication status from useAuth()
 * @param {boolean} params.isEditorReady - Whether workspace mode is 'editor-ready'
 * @param {Function} params.onResumeIdGenerated - Callback when resume ID is generated on first save
 * 
 * @description
 * This hook implements debounced Firestore persistence alongside sessionStorage.
 * It consolidates rapid state changes into single writes with a 200ms debounce window.
 * All errors are handled silently to avoid disrupting the user editing experience.
 * 
 * Requirements addressed:
 * - 7.3: Adds Firestore save logic without modifying sessionStorage behavior
 * - 10.1: Activates when workspace component mounts with authenticated user
 */
export function useFirestoreAutosave({
  workspaceState,
  resumeId,
  isAuthenticated,
  isEditorReady,
  isHydrating,
  onResumeIdGenerated
}) {
  // Ref for tracking the debounce timer
  // Using ref instead of state to avoid re-renders and ensure cleanup works correctly
  const debounceTimerRef = useRef(null)
  
  // Ref for tracking the current resume ID
  // Sync synchronously during render to prevent stale ID at save time
  const resumeIdRef = useRef(resumeId)
  // Update ref synchronously on every render (no useEffect delay)
  resumeIdRef.current = resumeId
  
  // Track whether a save operation is currently in flight
  const saveInProgressRef = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  
  // Queue for pending save when a save is already in progress
  const pendingSaveRef = useRef(null)
  
  // Baseline state for dirty checking (set after hydration or successful save)
  const baselineStateRef = useRef(null)
  
  /**
   * Save workspace state to Firestore with authentication and validation checks
   * 
   * Requirements addressed:
   * - 1.1, 1.2, 1.3: Executes after debounce window expires
   * - 4.1, 4.2: Silent error handling with console logging
   * - 5.1, 5.2: Authentication gating before save operations
   * - 5.4: Uses saveResume from userApi.js
   * 
   * @param {Object} state - Complete workspace snapshot to save
   * @param {string} saveType - Either 'autosave' or 'manual' for logging purposes
   */
  const saveToFirestore = useCallback(async (state, saveType = 'autosave') => {
    // Requirement 5.1: Verify authentication before initiating save
    if (!isAuthenticated) {
      if (import.meta.env.DEV) {
        console.log('[Firestore Autosave] Skipped: User not authenticated')
      }
      return
    }
    
    // Requirement 10.5: Only save when editor is ready with valid resume data
    if (!isEditorReady || !state?.resumeData) {
      if (import.meta.env.DEV) {
        console.log('[Firestore Autosave] Skipped: Editor not ready or no resume data', {
          isEditorReady,
          hasResumeData: Boolean(state?.resumeData)
        })
      }
      return
    }
    
    // Requirement 8.5, 10.3: Skip if workspace is cleared/reset (null or initial mode)
    if (!state || state.workspaceMode === 'initial') {
      if (import.meta.env.DEV) {
        console.log('[Firestore Autosave] Skipped: Workspace cleared or reset')
      }
      return
    }
    
    // Prevent duplicate document creation: if a save is in progress for a new resume, queue this save
    if (saveInProgressRef.current && !resumeIdRef.current) {
      if (import.meta.env.DEV) {
        console.log('[Firestore Autosave] Save in progress for new resume, queueing this save')
      }
      pendingSaveRef.current = state
      return
    }
    
    try {
      // Mark save as in progress
      saveInProgressRef.current = true
      setIsSaving(true)
      
      // Get current resume ID for this save operation
      const resumeId = resumeIdRef.current
      
      // TEMPORARY: Enhanced logging to verify fix
      if (import.meta.env.DEV) {
        console.log('[Firestore ' + saveType.toUpperCase() + '] Starting save operation...', {
          saveType,
          resumeId: resumeId || '(will generate new)',
          timestamp: new Date().toISOString()
        })
      }
      
      // Requirement 6.3, 6.4: Prepare payload with draftContent and metadata
      const payload = {
        draftContent: state.resumeData,  // Just the resume data, not the whole workspace state
        templateId: state.selectedTemplateId,
        title: state.resumeName || 'Untitled Resume'
      }
      
      // Requirement 5.4: Use existing saveResume function from userApi.js
      // Requirement 5.5: Writes to users/{uid}/resumes/{resumeId} via backend
      const response = await saveResume(resumeId, payload)
      
      // Requirement 3.4: Store generated resume ID if this was the first save
      if (response.resume?.id && !resumeIdRef.current) {
        resumeIdRef.current = response.resume.id
        // Notify parent component about the generated ID
        if (onResumeIdGenerated) {
          onResumeIdGenerated(response.resume.id)
        }
        if (import.meta.env.DEV) {
          console.log('[Firestore Autosave] Generated new resume ID:', response.resume.id)
        }
      }
      
      if (import.meta.env.DEV) {
        console.log('[Firestore Autosave] Save completed successfully', {
          resumeId: resumeIdRef.current,
          timestamp: new Date().toISOString()
        })
      }
      
      // Update baseline after successful save for dirty checking
      baselineStateRef.current = JSON.stringify(state.resumeData)
      
      // Process queued save if one exists
      const queuedState = pendingSaveRef.current
      pendingSaveRef.current = null
      
      if (queuedState) {
        if (import.meta.env.DEV) {
          console.log('[Firestore Autosave] Processing queued save')
        }
        // Recursively save the queued state
        await saveToFirestore(queuedState)
      }
    } catch (error) {
      // Requirement 4.1: Log error to browser console
      // Requirement 4.2: Silent failure - no user-visible notification
      // Requirement 4.5: Log authentication failures
      
      // Categorize error type for better debugging
      let errorType = 'unknown'
      let errorDetails = {
        message: error.message,
        resumeId: resumeIdRef.current,
        authenticated: isAuthenticated,
        editorReady: isEditorReady,
        timestamp: new Date().toISOString()
      }
      
      // Network errors (fetch failures, timeouts)
      if (error.name === 'TypeError' || error.message.includes('fetch') || error.message.includes('network')) {
        errorType = 'network'
        errorDetails.recovery = 'Next state change will trigger retry'
        errorDetails.userImpact = 'None - sessionStorage still works'
      }
      // Authentication errors (401, token expired, not authenticated)
      else if (error.message.includes('not authenticated') || 
               error.message.includes('Unauthorized') ||
               error.message.includes('401')) {
        errorType = 'authentication'
        errorDetails.recovery = 'Skip saves until re-authentication'
        errorDetails.authContext = 'Token may be expired or user session invalid'
      }
      // Permission errors (403, Firestore rules)
      else if (error.message.includes('Forbidden') || 
               error.message.includes('403') ||
               error.message.includes('permission')) {
        errorType = 'permission'
        errorDetails.recovery = 'Skip saves - may indicate configuration issue'
        errorDetails.permissionContext = 'Firestore security rules or backend authorization'
      }
      // Resume not found (404) - document was deleted
      else if (error.message.includes('Resume not found') || 
               error.message.includes('not found') ||
               error.message.includes('404')) {
        errorType = 'not_found'
        errorDetails.recovery = 'Reset resumeId to null and stop saving stale ID'
        // Reset resumeId so we don't keep trying to save to deleted document
        resumeIdRef.current = null
        if (onResumeIdGenerated) {
          // Notify parent to clear its resumeId state
          onResumeIdGenerated(null)
        }
      }
      // Validation errors (400, malformed data)
      else if (error.message.includes('Bad Request') || 
               error.message.includes('400') ||
               error.message.includes('validation') ||
               error.message.includes('invalid')) {
        errorType = 'validation'
        errorDetails.recovery = 'Next valid state change will trigger retry'
        errorDetails.payloadSize = state ? JSON.stringify(state).length : 0
      }
      // Server errors (500, backend failures)
      else if (error.message.includes('500') ||
               error.message.includes('Internal Server Error') ||
               error.message.includes('Server Error')) {
        errorType = 'server'
        errorDetails.recovery = 'Retry on next state change'
        errorDetails.note = 'Consider exponential backoff for production'
      }
      
      // Log comprehensive error with categorization
      console.error(`[Firestore Autosave] ${errorType.toUpperCase()} ERROR:`, errorDetails)
      
      // Clear queued save on error to prevent cascading failures
      pendingSaveRef.current = null
      
      // Re-throw for manual save error handling
      throw error
    } finally {
      // Mark save as complete
      saveInProgressRef.current = false
      setIsSaving(false)
    }
  }, [isAuthenticated, isEditorReady, onResumeIdGenerated])
  
  /**
   * Set baseline when hydration completes
   * This prevents autosave from triggering on freshly-loaded state
   */
  useEffect(() => {
    if (!isHydrating && workspaceState?.resumeData && !baselineStateRef.current) {
      baselineStateRef.current = JSON.stringify(workspaceState.resumeData)
      if (import.meta.env.DEV) {
        console.log('[Firestore Autosave] Baseline set after hydration')
      }
    }
  }, [isHydrating, workspaceState])
  
  /**
   * Debounced save effect
   * 
   * Requirements addressed:
   * - 1.1, 1.2: Debounces rapid state changes into single write
   * - 1.3: Uses 200ms debounce window
   * - 1.4: Clears timer on unmount/re-render
   * - 1.5: Executes save with final state after debounce expires
   * - 8.1: Consolidates writes to reduce API calls
   * - 8.5, 10.3: Cancels pending saves on workspace reset
   * - 10.5: Only activates when editor-ready with valid resumeData
   */
  useEffect(() => {
    // Requirement 10.5: Skip if no workspace state exists
    if (!workspaceState) return
    
    // Requirement 8.5, 10.3: Cancel pending saves if workspace is cleared/reset
    if (!workspaceState.resumeData || workspaceState.workspaceMode === 'initial') {
      // Clear any pending timer to prevent saving cleared/null state
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
        if (import.meta.env.DEV) {
          console.log('[Firestore Autosave] Cancelled pending save: Workspace reset or cleared')
        }
      }
      // Clear baseline so next workspace starts fresh
      baselineStateRef.current = null
      return
    }
    
    // Requirement 10.5: Gate at effect level - only schedule saves when editor is ready with valid data
    // This prevents unnecessary timer allocation and cleanup cycles
    if (!isEditorReady) {
      // Clear any pending timer if workspace is no longer in valid state
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
        if (import.meta.env.DEV) {
          console.log('[Firestore Autosave] Cancelled pending save: Editor not ready')
        }
      }
      return
    }
    
    // Skip autosave during hydration to prevent duplicate document creation on Open
    if (isHydrating) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
        if (import.meta.env.DEV) {
          console.log('[Firestore Autosave] Cancelled pending save: Hydrating')
        }
      }
      return
    }
    
    // Dirty check: only save if state has changed from baseline
    const currentStateStr = JSON.stringify(workspaceState.resumeData)
    if (baselineStateRef.current && currentStateStr === baselineStateRef.current) {
      if (import.meta.env.DEV) {
        console.log('[Firestore Autosave] Skipped: State unchanged from baseline')
      }
      return
    }
    
    // Requirement 1.2: Clear existing timer when new state change arrives
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      if (import.meta.env.DEV) {
        console.log('[Firestore Autosave] Debounce window reset: New state change detected')
      }
    }
    
    if (import.meta.env.DEV) {
      console.log(`[Firestore Autosave] Debounce window started: ${AUTOSAVE_DEBOUNCE_MS}ms`)
    }
    
    // Requirement 1.3: Schedule new save with 200ms debounce delay
    debounceTimerRef.current = setTimeout(() => {
      // Requirement 1.5: Execute save with final state after window expires
      saveToFirestore(workspaceState, 'autosave').catch(err => {
        // Errors already logged in saveToFirestore, swallow here for autosave
      })
    }, AUTOSAVE_DEBOUNCE_MS)
    
    // Requirement 1.4: Cleanup function clears timer on unmount or before next effect
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [workspaceState, saveToFirestore, isEditorReady])
  
  /**
   * Visibility change effect - flush on tab hide or page unload
   * 
   * Requirements addressed:
   * - Flush pending saves when user hides tab or navigates away
   * - Prevents data loss from pending debounced saves
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && workspaceState && isAuthenticated && isEditorReady) {
        // Cancel debounce and save immediately
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
          debounceTimerRef.current = null
        }
        saveToFirestore(workspaceState).catch(err => {
          console.error('[Firestore Autosave] Visibility flush save failed:', err)
        })
      }
    }
    
    const handlePageHide = () => {
      if (workspaceState && isAuthenticated && isEditorReady) {
        // Cancel debounce and save immediately
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
          debounceTimerRef.current = null
        }
        saveToFirestore(workspaceState).catch(err => {
          console.error('[Firestore Autosave] Pagehide flush save failed:', err)
        })
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [workspaceState, isAuthenticated, isEditorReady, saveToFirestore])
  
  /**
   * Flush-on-unmount effect
   * 
   * Requirements addressed:
   * - 9.3: Flush pending debounced save when navigating away from workspace
   * - 10.2: Cancel pending operations and ensure final state is saved on unmount
   * 
   * This effect runs only once on component mount and returns a cleanup function
   * that executes on final unmount. It ensures that any pending save operation
   * is immediately flushed before the component is destroyed, preventing data loss.
   */
  useEffect(() => {
    // This effect has no dependencies, so it only runs on mount
    // The cleanup function runs on unmount
    return () => {
      // Requirement 10.2: Cancel the pending debounced timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      
      // Requirement 9.3: Execute immediate save if there was pending work
      // Only flush if we have valid workspace state and authentication context
      if (workspaceState && isAuthenticated && isEditorReady) {
        // Execute immediate save without debounce
        // Use catch to handle async errors gracefully (silent failure)
        saveToFirestore(workspaceState, 'autosave').catch(err => {
          // Log flush save errors but don't propagate
          console.error('Flush save on unmount failed:', err)
        })
      }
    }
    // Empty dependency array: cleanup only runs on final unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
  /**
   * Force an immediate save, canceling any pending debounced save
   * Returns a promise that resolves/rejects based on save outcome
   * Prevents duplicate document creation for new resumes by waiting if a save is in flight
   */
  const saveNow = useCallback(async () => {
    // Cancel any pending debounced save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
      if (import.meta.env.DEV) {
        console.log('[Firestore Manual Save] Cancelled pending autosave')
      }
    }
    
    // If a save is already in progress, wait for it to complete
    if (saveInProgressRef.current) {
      if (import.meta.env.DEV) {
        console.log('[Firestore Manual Save] Waiting for in-progress save to complete...')
      }
      // Poll until save completes (with timeout)
      const maxWaitMs = 5000
      const startTime = Date.now()
      while (saveInProgressRef.current && (Date.now() - startTime) < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      if (saveInProgressRef.current) {
        throw new Error('Timed out waiting for in-progress save')
      }
    }
    
    // Execute immediate save (this will throw on error for the caller to handle)
    await saveToFirestore(workspaceState, 'manual')
  }, [workspaceState, saveToFirestore])
  
  /**
   * Cancel any pending debounced save without executing it
   */
  const cancelPendingSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
  }, [])
  
  // Return imperative API for manual saves and saving state
  return {
    saveNow,
    cancelPendingSave,
    isSaving
  }
}
