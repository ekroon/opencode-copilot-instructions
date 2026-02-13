import * as path from 'node:path'

/**
 * Encapsulates all session-related state for the Copilot Instructions plugin.
 * 
 * Manages two types of state:
 * 1. Path instruction injection tracking (with undo support via marker sync)
 * 2. Pending instructions for tool call lifecycle (ephemeral)
 */
export class SessionState {
  // Map<sessionID, Map<instructionFilePath, tokenCount>>
  private injectedPerSession = new Map<string, Map<string, number>>()

  // Map<callID, { text: string, loadedFiles: Array<{ file: string; tokenCount: number }> }>
  private pendingInstructions = new Map<string, { text: string; loadedFiles: Array<{ file: string; tokenCount: number }> }>()

  // Map<sessionID, contextWindowSize>
  private contextSizePerSession = new Map<string, number>()

  // Map<sessionID, contextSize that was logged> — tracks what context size was last logged
  private contextLoggedSessions = new Map<string, number>()

  // Sessions where repo instruction info has been shown in metadata.loaded
  private repoInfoShownSessions = new Set<string>()

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
  markFileInjected(sessionId: string, file: string, tokenCount: number): void {
    let sessionFiles = this.injectedPerSession.get(sessionId)
    if (!sessionFiles) {
      sessionFiles = new Map<string, number>()
      this.injectedPerSession.set(sessionId, sessionFiles)
    }
    sessionFiles.set(file, tokenCount)
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
    return new Set(sessionFiles?.keys() ?? [])
  }

  /**
   * Sum token counts for all instructions currently injected in a session.
   */
  getInjectedTokens(sessionId: string): number {
    const sessionFiles = this.injectedPerSession.get(sessionId)
    if (!sessionFiles) return 0
    let total = 0
    for (const tokens of sessionFiles.values()) {
      total += tokens
    }
    return total
  }

  /**
   * Synchronize injection state with actual markers present in message history.
   * This enables re-injection after undo operations.
   * 
   * @param presentMarkers - Set of instruction filenames (basenames) found in message history
   */
  syncWithMarkers(presentMarkers: Set<string>): void {
    for (const [_sessionId, injectedFiles] of this.injectedPerSession) {
      for (const file of injectedFiles.keys()) {
        const filename = path.basename(file)
        if (!presentMarkers.has(filename)) {
          injectedFiles.delete(file)
        }
      }
    }
  }

  /**
   * Clear path-specific injection state for a session.
   * Used when a session is compacted to allow re-injection of instructions.
   * Note: Does not clear pending instructions as they are keyed by callID, not sessionID.
   */
  clearSession(sessionId: string): void {
    this.injectedPerSession.delete(sessionId)
    this.contextSizePerSession.delete(sessionId)
    this.contextLoggedSessions.delete(sessionId)
    this.repoInfoShownSessions.delete(sessionId)
  }

  // --- Context size tracking ---

  setContextSize(sessionId: string, contextSize: number): void {
    this.contextSizePerSession.set(sessionId, contextSize)
  }

  getContextSize(sessionId: string): number {
    return this.contextSizePerSession.get(sessionId) ?? 0
  }

  // --- Context logging tracking ---

  /**
   * Check if context has been logged for a session with a specific context size.
   * Returns true only if previously logged with the same context size,
   * allowing re-logging when the model (and its context window) changes.
   */
  isContextLogged(sessionId: string, contextSize: number): boolean {
    return this.contextLoggedSessions.get(sessionId) === contextSize
  }

  markContextLogged(sessionId: string, contextSize: number): void {
    this.contextLoggedSessions.set(sessionId, contextSize)
  }

  // --- Repo info display tracking ---

  isRepoInfoShown(sessionId: string): boolean {
    return this.repoInfoShownSessions.has(sessionId)
  }

  markRepoInfoShown(sessionId: string): void {
    this.repoInfoShownSessions.add(sessionId)
  }

  // --- Pending instructions (tool call lifecycle) ---

  /**
   * Store pending instructions to inject after a tool call completes.
   */
  setPending(callId: string, text: string, loadedFiles: Array<{ file: string; tokenCount: number }> = []): void {
    this.pendingInstructions.set(callId, { text, loadedFiles })
  }

  /**
   * Get pending instructions for a tool call without consuming them.
   */
  getPending(callId: string): string | undefined {
    return this.pendingInstructions.get(callId)?.text
  }

  /**
   * Consume and return pending instructions for a tool call.
   * The instructions are deleted after retrieval.
   * Returns both the instruction text and the loaded file paths.
   */
  consumePending(callId: string): { text: string; loadedFiles: Array<{ file: string; tokenCount: number }> } | undefined {
    const entry = this.pendingInstructions.get(callId)
    if (entry !== undefined) {
      this.pendingInstructions.delete(callId)
    }
    return entry
  }
}
