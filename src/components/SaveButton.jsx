import { useState } from 'react'

/**
 * Manual save button component for the resume editor
 * 
 * @param {Object} props
 * @param {Function} props.onSave - Async function to call when saving (should return promise)
 * @param {boolean} props.isSaving - Whether a save is currently in progress (from useFirestoreAutosave)
 */
export function SaveButton({ onSave, isSaving }) {
  const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('')
  
  const handleSave = async () => {
    // Prevent multiple concurrent save attempts
    if (isSaving || saveStatus === 'success') return
    
    try {
      setSaveStatus('idle')
      setErrorMessage('')
      
      // Call the save function (throws on error)
      await onSave()
      
      // Show success state
      setSaveStatus('success')
      
      // Reset to idle after 2 seconds
      setTimeout(() => {
        setSaveStatus('idle')
      }, 2000)
    } catch (error) {
      // Show error state
      setSaveStatus('error')
      setErrorMessage(error.message || 'Save failed')
      
      // Reset to idle after 3 seconds
      setTimeout(() => {
        setSaveStatus('idle')
        setErrorMessage('')
      }, 3000)
    }
  }
  
  // Button text based on state
  let buttonText = 'Save'
  if (isSaving) {
    buttonText = 'Saving...'
  } else if (saveStatus === 'success') {
    buttonText = 'Saved ✓'
  } else if (saveStatus === 'error') {
    buttonText = 'Save failed'
  }
  
  // Button styling based on state
  const baseClasses = 'px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm'
  let stateClasses = ''
  
  if (isSaving) {
    stateClasses = 'bg-gray-300 text-gray-600 cursor-not-allowed'
  } else if (saveStatus === 'success') {
    stateClasses = 'bg-green-500 text-white cursor-default'
  } else if (saveStatus === 'error') {
    stateClasses = 'bg-red-500 text-white hover:bg-red-600 cursor-pointer'
  } else {
    stateClasses = 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
  }
  
  return (
    <div className="flex flex-col items-start">
      <button
        onClick={handleSave}
        disabled={isSaving || saveStatus === 'success'}
        className={`${baseClasses} ${stateClasses}`}
        title={saveStatus === 'error' ? errorMessage : 'Save your resume now'}
      >
        {buttonText}
      </button>
      {saveStatus === 'error' && errorMessage && (
        <span className="text-xs text-red-500 mt-1">{errorMessage}</span>
      )}
    </div>
  )
}
