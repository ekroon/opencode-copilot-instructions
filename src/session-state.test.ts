import { describe, it, expect, beforeEach } from 'vitest'
import { SessionState } from './session-state'

describe('SessionState', () => {
  let state: SessionState

  beforeEach(() => {
    state = new SessionState()
  })

  describe('path instruction tracking', () => {
    it('should return false for files not yet injected', () => {
      expect(state.isFileInjected('session-1', '/path/to/file.md')).toBe(false)
    })

    it('should return true after marking file as injected', () => {
      state.markFileInjected('session-1', '/path/to/file.md')
      expect(state.isFileInjected('session-1', '/path/to/file.md')).toBe(true)
    })

    it('should track files per session independently', () => {
      state.markFileInjected('session-1', '/path/to/file.md')
      
      expect(state.isFileInjected('session-1', '/path/to/file.md')).toBe(true)
      expect(state.isFileInjected('session-2', '/path/to/file.md')).toBe(false)
    })

    it('should track multiple files per session', () => {
      state.markFileInjected('session-1', '/path/to/file1.md')
      state.markFileInjected('session-1', '/path/to/file2.md')
      
      expect(state.isFileInjected('session-1', '/path/to/file1.md')).toBe(true)
      expect(state.isFileInjected('session-1', '/path/to/file2.md')).toBe(true)
      expect(state.isFileInjected('session-1', '/path/to/file3.md')).toBe(false)
    })

    it('should clear file marker for specific session', () => {
      state.markFileInjected('session-1', '/path/to/file.md')
      state.markFileInjected('session-2', '/path/to/file.md')
      
      state.clearFileMarker('session-1', '/path/to/file.md')
      
      expect(state.isFileInjected('session-1', '/path/to/file.md')).toBe(false)
      expect(state.isFileInjected('session-2', '/path/to/file.md')).toBe(true)
    })

    it('should handle clearing non-existent file gracefully', () => {
      // Should not throw
      state.clearFileMarker('session-1', '/path/to/nonexistent.md')
      expect(state.isFileInjected('session-1', '/path/to/nonexistent.md')).toBe(false)
    })

    it('should handle clearing from non-existent session gracefully', () => {
      // Should not throw
      state.clearFileMarker('nonexistent-session', '/path/to/file.md')
    })
  })

  describe('syncWithMarkers', () => {
    it('should clear files whose markers are not present', () => {
      state.markFileInjected('session-1', '/path/to/file1.md')
      state.markFileInjected('session-1', '/path/to/file2.md')
      
      // Only file1.md marker is present (basename match)
      const presentMarkers = new Set(['file1.md'])
      state.syncWithMarkers(presentMarkers)
      
      expect(state.isFileInjected('session-1', '/path/to/file1.md')).toBe(true)
      expect(state.isFileInjected('session-1', '/path/to/file2.md')).toBe(false)
    })

    it('should sync across all sessions', () => {
      state.markFileInjected('session-1', '/path/to/file.md')
      state.markFileInjected('session-2', '/path/to/file.md')
      
      // No markers present - should clear from all sessions
      const presentMarkers = new Set<string>()
      state.syncWithMarkers(presentMarkers)
      
      expect(state.isFileInjected('session-1', '/path/to/file.md')).toBe(false)
      expect(state.isFileInjected('session-2', '/path/to/file.md')).toBe(false)
    })

    it('should keep files whose markers are present', () => {
      state.markFileInjected('session-1', '/path/to/keep.md')
      
      const presentMarkers = new Set(['keep.md'])
      state.syncWithMarkers(presentMarkers)
      
      expect(state.isFileInjected('session-1', '/path/to/keep.md')).toBe(true)
    })

    it('should handle empty state gracefully', () => {
      const presentMarkers = new Set(['file.md'])
      // Should not throw
      state.syncWithMarkers(presentMarkers)
    })
  })

  describe('repo instruction tracking', () => {
    it('should return false for sessions without repo instructions', () => {
      expect(state.hasRepoInstructions('session-1')).toBe(false)
    })

    it('should return true after marking repo instructions injected', () => {
      state.markRepoInstructionsInjected('session-1')
      expect(state.hasRepoInstructions('session-1')).toBe(true)
    })

    it('should track repo instructions per session independently', () => {
      state.markRepoInstructionsInjected('session-1')
      
      expect(state.hasRepoInstructions('session-1')).toBe(true)
      expect(state.hasRepoInstructions('session-2')).toBe(false)
    })
  })

  describe('pending instructions', () => {
    it('should return undefined for non-existent call', () => {
      expect(state.getPending('call-1')).toBeUndefined()
    })

    it('should store and retrieve pending instructions', () => {
      state.setPending('call-1', 'instruction text')
      expect(state.getPending('call-1')).toBe('instruction text')
    })

    it('should track pending instructions per call independently', () => {
      state.setPending('call-1', 'instruction 1')
      state.setPending('call-2', 'instruction 2')
      
      expect(state.getPending('call-1')).toBe('instruction 1')
      expect(state.getPending('call-2')).toBe('instruction 2')
    })

    it('should consume and clear pending instructions', () => {
      state.setPending('call-1', 'instruction text')
      
      const result = state.consumePending('call-1')
      
      expect(result).toBe('instruction text')
      expect(state.getPending('call-1')).toBeUndefined()
    })

    it('should return undefined when consuming non-existent call', () => {
      expect(state.consumePending('nonexistent')).toBeUndefined()
    })
  })

  describe('getInjectedFiles', () => {
    it('should return empty set for non-existent session', () => {
      const files = state.getInjectedFiles('session-1')
      expect(files.size).toBe(0)
    })

    it('should return all injected files for session', () => {
      state.markFileInjected('session-1', '/path/to/file1.md')
      state.markFileInjected('session-1', '/path/to/file2.md')
      
      const files = state.getInjectedFiles('session-1')
      
      expect(files.size).toBe(2)
      expect(files.has('/path/to/file1.md')).toBe(true)
      expect(files.has('/path/to/file2.md')).toBe(true)
    })

    it('should return a copy, not the internal set', () => {
      state.markFileInjected('session-1', '/path/to/file.md')
      
      const files = state.getInjectedFiles('session-1')
      files.delete('/path/to/file.md')  // Modify the returned set
      
      // Internal state should be unchanged
      expect(state.isFileInjected('session-1', '/path/to/file.md')).toBe(true)
    })
  })

  describe('clearSession', () => {
    it('should clear all file injection state for a session', () => {
      state.markFileInjected('session-1', '/path/to/file1.md')
      state.markFileInjected('session-1', '/path/to/file2.md')
      
      state.clearSession('session-1')
      
      expect(state.isFileInjected('session-1', '/path/to/file1.md')).toBe(false)
      expect(state.isFileInjected('session-1', '/path/to/file2.md')).toBe(false)
    })

    it('should clear repo instructions state for a session', () => {
      state.markRepoInstructionsInjected('session-1')
      
      state.clearSession('session-1')
      
      expect(state.hasRepoInstructions('session-1')).toBe(false)
    })

    it('should not affect other sessions', () => {
      state.markFileInjected('session-1', '/path/to/file.md')
      state.markFileInjected('session-2', '/path/to/file.md')
      state.markRepoInstructionsInjected('session-1')
      state.markRepoInstructionsInjected('session-2')
      
      state.clearSession('session-1')
      
      // session-1 should be cleared
      expect(state.isFileInjected('session-1', '/path/to/file.md')).toBe(false)
      expect(state.hasRepoInstructions('session-1')).toBe(false)
      
      // session-2 should be unchanged
      expect(state.isFileInjected('session-2', '/path/to/file.md')).toBe(true)
      expect(state.hasRepoInstructions('session-2')).toBe(true)
    })

    it('should handle clearing non-existent session gracefully', () => {
      // Should not throw
      state.clearSession('nonexistent-session')
    })

    it('should not affect pending instructions (they are per-call, not per-session)', () => {
      state.setPending('call-1', 'instruction text')
      
      state.clearSession('session-1')
      
      // Pending instructions should remain (they're keyed by callID, not sessionID)
      expect(state.getPending('call-1')).toBe('instruction text')
    })
  })
})
