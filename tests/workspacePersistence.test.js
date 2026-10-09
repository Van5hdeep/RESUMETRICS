import assert from 'node:assert/strict'
import { writeWorkspaceSnapshot, readWorkspaceSnapshot, restored, clearWorkspaceSnapshot } from '../src/workspace/workspacePersistence.js'

// Mock sessionStorage for Node.js environment
const sessionStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} }
  }
})()
global.sessionStorage = sessionStorageMock

// Test: resumeId field is included in workspace snapshot
clearWorkspaceSnapshot()
sessionStorageMock.clear()

const stateWithResumeId = {
  workspaceMode: 'editor-ready',
  resumeData: { fullName: 'Test User', email: 'test@example.com' },
  selectedTemplateId: 'modern',
  resumeName: 'My Resume',
  resumeId: 'test-resume-id-123'
}

writeWorkspaceSnapshot(stateWithResumeId)
const restored1 = readWorkspaceSnapshot()
assert.equal(restored1.resumeId, 'test-resume-id-123', 'resumeId should be preserved in snapshot')
assert.equal(restored1.workspaceMode, 'editor-ready')
assert.equal(restored1.resumeName, 'My Resume')

// Test: resumeId can be null
clearWorkspaceSnapshot()
sessionStorageMock.clear()

const stateWithNullResumeId = {
  workspaceMode: 'editor-ready',
  resumeData: { fullName: 'Test User' },
  resumeId: null
}

writeWorkspaceSnapshot(stateWithNullResumeId)
const restored2 = readWorkspaceSnapshot()
assert.equal(restored2.resumeId, null, 'null resumeId should be preserved')

// Test: backward compatibility - missing resumeId defaults to null
clearWorkspaceSnapshot()
sessionStorageMock.clear()

const stateWithoutResumeId = {
  workspaceMode: 'editor-ready',
  resumeData: { fullName: 'Test User' }
}

writeWorkspaceSnapshot(stateWithoutResumeId)
const restored3 = readWorkspaceSnapshot()
assert.equal(restored3.resumeId, null, 'missing resumeId should default to null for backward compatibility')

// Test: restored() helper works with resumeId
clearWorkspaceSnapshot()
sessionStorageMock.clear()

writeWorkspaceSnapshot({ resumeId: 'stored-id', workspaceMode: 'initial' })
assert.equal(restored('resumeId', null), 'stored-id', 'restored() should return stored resumeId')
assert.equal(restored('resumeId', 'fallback'), 'stored-id', 'restored() should prefer stored value over fallback')

clearWorkspaceSnapshot()
sessionStorageMock.clear()
assert.equal(restored('resumeId', 'fallback-id'), 'fallback-id', 'restored() should return fallback when no snapshot exists')

// Test: resumeId survives photo dropping
clearWorkspaceSnapshot()
sessionStorageMock.clear()

const largePhoto = 'data:image/png;base64,' + 'A'.repeat(2_000_000)
const stateWithLargePhoto = {
  workspaceMode: 'editor-ready',
  resumeData: { fullName: 'Test User' },
  resumePresentation: {
    photo: {
      source: largePhoto,
      originalSource: largePhoto,
      uploaded: true
    }
  },
  resumeId: 'photo-test-id'
}

const result = writeWorkspaceSnapshot(stateWithLargePhoto)
assert.equal(result.photoDropped, true, 'photo should be dropped when too large')

const restored4 = readWorkspaceSnapshot()
assert.equal(restored4.resumeId, 'photo-test-id', 'resumeId should survive photo dropping')
assert.equal(restored4.resumePresentation?.photo?.source, undefined, 'photo source should be dropped')
assert.equal(restored4.workspaceMode, 'editor-ready', 'other fields should remain intact')

console.log('✓ All workspacePersistence tests passed')
