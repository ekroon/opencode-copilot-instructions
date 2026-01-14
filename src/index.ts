import * as path from 'node:path'
import type { Plugin } from '@opencode-ai/plugin'
import type { Event, EventSessionCompacted } from '@opencode-ai/sdk'
import { loadRepoInstructions, loadPathInstructions, type PathInstruction } from './loader'
import { SessionState } from './session-state'

/**
 * Type guard to check if an event is a session.compacted event.
 * Narrows the Event union type to EventSessionCompacted.
 */
function isSessionCompactedEvent(event: Event): event is EventSessionCompacted {
  return event.type === 'session.compacted'
}

/**
 * Convert an absolute path to a relative path from the given directory.
 * If the path is already relative, returns it as-is.
 * Note: This is intentionally NOT exported to avoid OpenCode treating it as a plugin
 */
function getRelativePath(directory: string, filePath: string): string {
  // Normalize directory path (remove trailing slash)
  const normalizedDir = directory.endsWith('/') ? directory.slice(0, -1) : directory

  // If path is already relative (doesn't start with /), return as-is
  if (!path.isAbsolute(filePath)) {
    return filePath
  }

  // Use path.relative to compute relative path
  return path.relative(normalizedDir, filePath)
}

// Tools that work with file paths
const FILE_TOOLS = new Set(['read', 'edit', 'write'])

/**
 * Extract instruction filenames from markers in text.
 * Markers have the format: <copilot-instruction:FILENAME>
 */
function extractInstructionMarkers(text: string): Set<string> {
  const markers = new Set<string>()
  const regex = /<copilot-instruction:([^>]+)>/g
  let match
  while ((match = regex.exec(text)) !== null) {
    markers.add(match[1])
  }
  return markers
}

export const CopilotInstructionsPlugin: Plugin = async (ctx) => {
  const { directory, client } = ctx

  // Validate directory is provided and is a string
  if (!directory || typeof directory !== 'string') {
    console.error('[copilot-instructions] Invalid directory:', directory, 'ctx:', Object.keys(ctx))
    throw new Error(`Plugin requires a valid directory string, got: ${typeof directory}`)
  }

  // Store directory in a local const to ensure closure captures it properly
  const projectDir = directory

  // Load instructions at startup
  const repoInstructions = loadRepoInstructions(projectDir)
  const pathInstructions = loadPathInstructions(projectDir)

  // Helper to log messages
  const log = (message: string, level: 'info' | 'debug' = 'info') => {
    client.app.log({
      body: {
        service: 'copilot-instructions',
        level,
        message
      }
    })
  }

  // Log what was loaded
  if (repoInstructions) {
    log('Loaded repo instructions from .github/copilot-instructions.md')
  }

  if (pathInstructions.length > 0) {
    for (const instruction of pathInstructions) {
      const filename = path.basename(instruction.file)
      log(`Loaded path instructions from ${filename}`)
    }
  }

  if (!repoInstructions && pathInstructions.length === 0) {
    log('No Copilot instructions found')
  }

  // Encapsulated state management
  const state = new SessionState()

  return {
    // Listen for session events
    event: async ({ event }) => {
      // Log all events for debugging
      log(`Event received: ${event.type}`, 'debug')

      // Clear path-specific injection state on compaction to allow re-injection
      if (isSessionCompactedEvent(event)) {
        const sessionId = event.properties.sessionID
        log(`session.compacted event received for session ${sessionId}`)
        state.clearSession(sessionId)
        log(`Cleared path-specific injection state for session ${sessionId}, instructions will be re-injected on next file access`)
      }
    },

    // Inject repo-wide instructions into the system prompt on every LLM call
    'experimental.chat.system.transform': async (_input, output) => {
      if (repoInstructions) {
        output.system.push(`Instructions from: .github/copilot-instructions.md\n${repoInstructions}`)
      }
    },

    // Preserve repo-wide instructions during compaction
    'experimental.session.compacting': async (_input, output) => {
      if (repoInstructions) {
        output.context.push(`Instructions from: .github/copilot-instructions.md\n${repoInstructions}`)
      }
    },

    'tool.execute.before': async (input, output) => {
      // Only handle file tools
      if (!FILE_TOOLS.has(input.tool)) {
        return
      }

      // Get file path from args
      const filePath = output.args?.filePath
      if (!filePath || typeof filePath !== 'string') {
        return
      }

      // Convert to relative path for matching
      const relativePath = getRelativePath(projectDir, filePath)

      // Find matching instructions that haven't been injected yet
      const matchingInstructions: PathInstruction[] = []

      for (const instruction of pathInstructions) {
        // Skip if already injected in this session
        if (state.isFileInjected(input.sessionID, instruction.file)) {
          continue
        }

        // Check if file matches this instruction's patterns
        if (instruction.matcher(relativePath)) {
          matchingInstructions.push(instruction)
          state.markFileInjected(input.sessionID, instruction.file)
        }
      }

      // Store matching instructions to inject in tool.execute.after
      if (matchingInstructions.length > 0) {
        const instructionText = matchingInstructions
          .map(i => {
            const filename = path.basename(i.file)
            const patterns = i.applyTo.join(', ')
            return `<copilot-instruction:${filename}>\n## Path-Specific Instructions (applies to: ${patterns})\n\n${i.content.trimEnd()}\n</copilot-instruction:${filename}>`
          })
          .join('\n\n')

        state.setPending(input.callID, instructionText)
        log(`Queued ${matchingInstructions.length} path instructions for ${relativePath}`, 'debug')
      }
    },

    'tool.execute.after': async (input, output) => {
      // Check if we have pending instructions for this tool call
      const instructionText = state.consumePending(input.callID)
      if (instructionText) {
        // Append instructions to the tool output
        output.output = `${output.output}\n\n${instructionText}`
        log(`Injected path instructions for call ${input.callID}`, 'debug')
      }
    },

    'experimental.chat.messages.transform': async (_input, output) => {
      // Scan all messages to find which instruction markers are present
      const presentMarkers = new Set<string>()

      for (const message of output.messages) {
        for (const part of message.parts) {
          if (part.type === 'tool') {
            // Tool state can be pending, running, or completed
            // Only completed state has output
            const toolState = part.state as { output?: string }
            if (toolState?.output) {
              const markers = extractInstructionMarkers(toolState.output)
              for (const marker of markers) {
                presentMarkers.add(marker)
              }
            }
          }
        }
      }

      // Sync injection state with actual markers in message history
      // This enables re-injection after undo operations
      state.syncWithMarkers(presentMarkers)
    }
  }
}

// Default export for easier loading
export default CopilotInstructionsPlugin
