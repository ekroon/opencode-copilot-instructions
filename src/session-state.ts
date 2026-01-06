import * as path from 'node:path'

/**
 * Encapsulates all session-related state for the Copilot Instructions plugin.
 * 
 * Manages three types of state:
 * 1. Path instruction injection tracking (with undo support via marker sync)
 * 2. Repo instruction injection tracking (one-time per session)
 * 3. Pending instructions for tool call lifecycle (ephemeral)
 */
export class SessionState {
  // Track which instruction files have been injected per session
  // Map<sessionID, Set<instructionFilePath>>
  private injectedPerSession = new Map<string, Set<string>>()

  // Track sessions where repo-wide instructions have been injected
  private repoInstructionsInjected = new Set<string>()

  // Track pending instructions to inject per tool call (ephemeral)
  // Map<callID, instructionText>
  private pendingInstructions = new Map<string, string>()

  // --- Path instruction tracking ---

  /**
   * Check if a file has been injected in a session.
   */
  isFileInjected(sessionId: string, file: string): boolean {
    const sessionFiles = this.injectedPerSession.get(sessionId)
    return sessionFiles?.has(file) ?? false
  }

  /**
   * Mark a file as injected in a session.
   */
  markFileInjected(sessionId: string, file: string): void {
    let sessionFiles = this.injectedPerSession.get(sessionId)
    if (!sessionFiles) {
      sessionFiles = new Set<string>()
      this.injectedPerSession.set(sessionId, sessionFiles)
    }
    sessionFiles.add(file)
  }

  /**
   * Clear the injection marker for a specific file in a session.
   * Used when an instruction is undone and needs to be re-injectable.
   */
  clearFileMarker(sessionId: string, file: string): void {
    const sessionFiles = this.injectedPerSession.get(sessionId)
    sessionFiles?.delete(file)
  }

  /**
   * Get all injected files for a session.
   * Returns a copy to prevent external modification.
   */
  getInjectedFiles(sessionId: string): Set<string> {
    const sessionFiles = this.injectedPerSession.get(sessionId)
    return new Set(sessionFiles ?? [])
  }

  /**
   * Synchronize injection state with actual markers present in message history.
   * This enables re-injection after undo operations.
   * 
   * @param presentMarkers - Set of instruction filenames (basenames) found in message history
   */
  syncWithMarkers(presentMarkers: Set<string>): void {
    for (const [_sessionId, injectedFiles] of this.injectedPerSession) {
      for (const file of injectedFiles) {
        const filename = path.basename(file)
        if (!presentMarkers.has(filename)) {
          injectedFiles.delete(file)
        }
      }
    }
  }

  // --- Repo instruction tracking ---

  /**
   * Check if repo instructions have been injected for a session.
   */
  hasRepoInstructions(sessionId: string): boolean {
    return this.repoInstructionsInjected.has(sessionId)
  }

  /**
   * Mark repo instructions as injected for a session.
   */
  markRepoInstructionsInjected(sessionId: string): void {
    this.repoInstructionsInjected.add(sessionId)
  }

  // --- Pending instructions (tool call lifecycle) ---

  /**
   * Store pending instructions to inject after a tool call completes.
   */
  setPending(callId: string, text: string): void {
    this.pendingInstructions.set(callId, text)
  }

  /**
   * Get pending instructions for a tool call without consuming them.
   */
  getPending(callId: string): string | undefined {
    return this.pendingInstructions.get(callId)
  }

  /**
   * Consume and return pending instructions for a tool call.
   * The instructions are deleted after retrieval.
   */
  consumePending(callId: string): string | undefined {
    const text = this.pendingInstructions.get(callId)
    if (text !== undefined) {
      this.pendingInstructions.delete(callId)
    }
    return text
  }
}
