/**
 * End-to-end tests for the Copilot Instructions Plugin.
 *
 * These tests run a real OpenCode server with the plugin loaded and verify
 * that instructions are correctly injected into chat sessions.
 *
 * IMPORTANT: These tests require:
 * - OpenCode to be installed (`npm install -g opencode`)
 * - A valid API key configured for at least one provider
 * - The plugin to be built (`npm run build`)
 *
 * Run with: npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createOpencode, type OpencodeClient } from '@opencode-ai/sdk'
import * as fs from 'node:fs'
import * as path from 'node:path'

// Timeout for operations that involve LLM calls
const LLM_TIMEOUT = 60_000

// Fast model for testing - uses less tokens and is faster
const TEST_MODEL = {
  providerID: 'github-copilot',
  modelID: 'claude-haiku-4.5'
}

// Test directory setup - use a unique directory per run
const TEST_DIR = path.join(process.cwd(), `.e2e-test-${Date.now()}`)
const GITHUB_DIR = path.join(TEST_DIR, '.github')
const INSTRUCTIONS_DIR = path.join(GITHUB_DIR, 'instructions')

// Test instruction content with unique markers
const REPO_INSTRUCTIONS = `# E2E Test Repository Instructions

This is a test repository for e2e testing.
Always respond with "E2E_REPO_MARKER_12345" when you see these instructions.
`

const TS_INSTRUCTIONS = `---
applyTo: "**/*.ts"
---
# E2E Test TypeScript Instructions

When working with TypeScript files:
- Always include "E2E_TS_MARKER_67890" in your response
- Use strict typing
`

const TEST_FILE_CONTENT = `// Test TypeScript file for e2e testing
export function hello(): string {
  return 'world'
}
`

/**
 * Helper to wait for session to become idle
 */
async function waitForIdle(
  client: OpencodeClient,
  sessionId: string,
  maxWaitMs = 60_000
): Promise<void> {
  const startTime = Date.now()
  const pollInterval = 1000

  while (Date.now() - startTime < maxWaitMs) {
    const statusResponse = await client.session.status({})

    // Response is a map of sessionId -> status, empty object means all idle
    const statusMap = statusResponse.data as
      | Record<string, { type: string }>
      | undefined
    const status = statusMap?.[sessionId]

    // If no status for this session or explicitly idle, we're done
    if (!status || status.type === 'idle') {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error(`Session did not become idle within ${maxWaitMs}ms`)
}

/**
 * Helper to count instruction markers in messages.
 * Returns counts for both start and end markers.
 */
function countInstructionMarkers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
  instructionFileName: string
): { startCount: number; endCount: number } {
  let startCount = 0
  let endCount = 0

  const escapedFileName = instructionFileName.replace(/\./g, '\\.')
  const startPattern = new RegExp(
    `<copilot-instruction:${escapedFileName}>`,
    'g'
  )
  const endPattern = new RegExp(
    `</copilot-instruction:${escapedFileName}>`,
    'g'
  )

  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === 'tool') {
        const toolPart = part as {
          type: 'tool'
          state: { output?: string }
        }
        if (toolPart.state?.output) {
          const startMatches = toolPart.state.output.match(startPattern)
          if (startMatches) {
            startCount += startMatches.length
          }
          const endMatches = toolPart.state.output.match(endPattern)
          if (endMatches) {
            endCount += endMatches.length
          }
        }
      }
    }
  }

  return { startCount, endCount }
}

/**
 * Full E2E tests that verify plugin behavior with real OpenCode server.
 *
 * NOTE: These tests are skipped by default because they:
 * - Require OpenCode to be installed
 * - Require API keys to be configured
 * - Make actual LLM API calls (costs money)
 * - Take a long time to run
 *
 * To run: OPENCODE_E2E=true npm run test:e2e
 */
describe.skipIf(!process.env.OPENCODE_E2E)('E2E: Copilot Instructions Plugin', () => {
  let client: OpencodeClient
  let server: { url: string; close(): void }
  let sessionId: string

  beforeAll(async () => {
    // Create test directory structure
    fs.mkdirSync(INSTRUCTIONS_DIR, { recursive: true })
    fs.writeFileSync(
      path.join(GITHUB_DIR, 'copilot-instructions.md'),
      REPO_INSTRUCTIONS
    )
    fs.writeFileSync(
      path.join(INSTRUCTIONS_DIR, 'typescript.instructions.md'),
      TS_INSTRUCTIONS
    )
    fs.writeFileSync(path.join(TEST_DIR, 'test.ts'), TEST_FILE_CONTENT)

    // Create opencode.json to load the local plugin
    const pluginPath = path.resolve(process.cwd(), 'dist/index.js')
    fs.writeFileSync(
      path.join(TEST_DIR, 'opencode.json'),
      JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          plugin: [pluginPath]
        },
        null,
        2
      )
    )

    // Change to test directory before starting server
    const originalCwd = process.cwd()
    process.chdir(TEST_DIR)

    try {
      // Start OpenCode server in test directory
      const opencode = await createOpencode({
        port: 0 // Random available port
      })

      client = opencode.client
      server = opencode.server

      console.log(`E2E test server started at ${server.url}`)
    } finally {
      process.chdir(originalCwd)
    }
  }, 60_000)

  afterAll(async () => {
    // Clean up server
    if (server) {
      server.close()
    }

    // Clean up test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  beforeEach(async () => {
    // Create a fresh session for each test
    const response = await client.session.create({
      body: {
        title: 'E2E Test Session'
      }
    })

    if (!response.data) {
      throw new Error('Failed to create session')
    }

    sessionId = response.data.id
  })

  describe('Repo-wide Instructions', () => {
    it(
      'should inject repo instructions on session creation',
      async () => {
        // Wait a bit for the session.created event to fire and instructions to be injected
        await new Promise((resolve) => setTimeout(resolve, 2000))

        // Get all messages in the session
        const messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })

        const messages = messagesResponse.data ?? []

        // Find a message containing the repo instructions
        const hasRepoInstructions = messages.some((msg) =>
          msg.parts.some((part) => {
            if (part.type === 'text') {
              const textPart = part as { type: 'text'; text: string }
              return textPart.text.includes('E2E_REPO_MARKER_12345')
            }
            return false
          })
        )

        expect(hasRepoInstructions).toBe(true)
      },
      LLM_TIMEOUT
    )
  })

  describe('Path-specific Instructions', () => {
    it(
      'should inject TypeScript instructions when reading a .ts file',
      async () => {
        const testFilePath = path.join(TEST_DIR, 'test.ts')

        // Send a prompt that asks the assistant to read a TypeScript file
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: TEST_MODEL,
            parts: [
              {
                type: 'text',
                text: `Please read the file at ${testFilePath} and tell me what it contains.`
              }
            ]
          }
        })

        // Wait for the session to become idle
        await waitForIdle(client, sessionId)

        // Get all messages
        const messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })

        const messages = messagesResponse.data ?? []

        // Look for tool call outputs that contain our TS marker
        let foundTsMarker = false
        let foundStartMarker = false
        let foundEndMarker = false

        for (const msg of messages) {
          for (const part of msg.parts) {
            if (part.type === 'tool') {
              const toolPart = part as {
                type: 'tool'
                tool: string
                state: { output?: string }
              }
              if (toolPart.state?.output) {
                if (toolPart.state.output.includes('E2E_TS_MARKER_67890')) {
                  foundTsMarker = true
                }
                if (
                  toolPart.state.output.includes(
                    '<copilot-instruction:typescript.instructions.md>'
                  )
                ) {
                  foundStartMarker = true
                }
                if (
                  toolPart.state.output.includes(
                    '</copilot-instruction:typescript.instructions.md>'
                  )
                ) {
                  foundEndMarker = true
                }
              }
            }
          }
        }

        expect(foundTsMarker).toBe(true)
        expect(foundStartMarker).toBe(true)
        expect(foundEndMarker).toBe(true)
      },
      LLM_TIMEOUT
    )

    it(
      'should not inject instructions for non-matching files',
      async () => {
        // Create a non-TypeScript file
        fs.writeFileSync(path.join(TEST_DIR, 'test.json'), '{"foo": "bar"}')
        const jsonFilePath = path.join(TEST_DIR, 'test.json')

        // Ask the assistant to read the JSON file
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: TEST_MODEL,
            parts: [
              {
                type: 'text',
                text: `Please read the file at ${jsonFilePath} and tell me what it contains.`
              }
            ]
          }
        })

        // Wait for completion
        await waitForIdle(client, sessionId)

        // Get messages
        const messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })

        const messages = messagesResponse.data ?? []

        // Should NOT find TS marker (start or end) in any tool output
        let foundStartMarker = false
        let foundEndMarker = false

        for (const msg of messages) {
          for (const part of msg.parts) {
            if (part.type === 'tool') {
              const toolPart = part as {
                type: 'tool'
                tool: string
                state: { output?: string }
              }
              if (
                toolPart.state?.output?.includes(
                  '<copilot-instruction:typescript.instructions.md>'
                )
              ) {
                foundStartMarker = true
              }
              if (
                toolPart.state?.output?.includes(
                  '</copilot-instruction:typescript.instructions.md>'
                )
              ) {
                foundEndMarker = true
              }
            }
          }
        }

        expect(foundStartMarker).toBe(false)
        expect(foundEndMarker).toBe(false)
      },
      LLM_TIMEOUT
    )
  })

  describe('Deduplication', () => {
    it(
      'should only inject instructions once per session',
      async () => {
        // Create TypeScript files
        fs.writeFileSync(
          path.join(TEST_DIR, 'test2.ts'),
          'export const foo = 1'
        )

        const file1 = path.join(TEST_DIR, 'test.ts')
        const file2 = path.join(TEST_DIR, 'test2.ts')

        // Ask to read the first file
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: TEST_MODEL,
            parts: [
              {
                type: 'text',
                text: `Please read the file at ${file1}`
              }
            ]
          }
        })

        await waitForIdle(client, sessionId)

        // Ask to read the second file
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: TEST_MODEL,
            parts: [
              {
                type: 'text',
                text: `Please also read the file at ${file2}`
              }
            ]
          }
        })

        await waitForIdle(client, sessionId)

        // Get messages
        const messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })

        const messages = messagesResponse.data ?? []

        // Count how many times the TS instruction markers appear (both start and end)
        let startMarkerCount = 0
        let endMarkerCount = 0

        for (const msg of messages) {
          for (const part of msg.parts) {
            if (part.type === 'tool') {
              const toolPart = part as {
                type: 'tool'
                state: { output?: string }
              }
              if (toolPart.state?.output) {
                const startMatches = toolPart.state.output.match(
                  /<copilot-instruction:typescript\.instructions\.md>/g
                )
                if (startMatches) {
                  startMarkerCount += startMatches.length
                }
                const endMatches = toolPart.state.output.match(
                  /<\/copilot-instruction:typescript\.instructions\.md>/g
                )
                if (endMatches) {
                  endMarkerCount += endMatches.length
                }
              }
            }
          }
        }

        // Should only appear once (first file read) - both start and end markers
        expect(startMarkerCount).toBe(1)
        expect(endMarkerCount).toBe(1)
      },
      LLM_TIMEOUT * 2
    )
  })

  describe('Undo/Revert Flow', () => {
    it(
      'should re-inject instructions after reverting a message containing the marker',
      async () => {
        // Create additional TypeScript files for this test
        fs.writeFileSync(
          path.join(TEST_DIR, 'undo-test1.ts'),
          'export const undo1 = 1'
        )
        fs.writeFileSync(
          path.join(TEST_DIR, 'undo-test2.ts'),
          'export const undo2 = 2'
        )
        fs.writeFileSync(
          path.join(TEST_DIR, 'undo-test3.ts'),
          'export const undo3 = 3'
        )

        const file1 = path.join(TEST_DIR, 'undo-test1.ts')
        const file2 = path.join(TEST_DIR, 'undo-test2.ts')
        const file3 = path.join(TEST_DIR, 'undo-test3.ts')

        // Step 1: Read first .ts file → instructions should be injected
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: TEST_MODEL,
            parts: [
              {
                type: 'text',
                text: `Please read the file at ${file1}`
              }
            ]
          }
        })

        await waitForIdle(client, sessionId)

        // Verify instructions were injected in step 1
        let messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })
        let messages = messagesResponse.data ?? []

        let markers = countInstructionMarkers(
          messages,
          'typescript.instructions.md'
        )
        expect(markers.startCount).toBe(1)
        expect(markers.endCount).toBe(1)

        // Step 2: Get the message ID of the assistant's response containing the tool call
        const assistantMessage = messages.find(
          (m) => m.info.role === 'assistant'
        )
        const messageIdToRevert = assistantMessage?.info.id

        expect(messageIdToRevert).toBeDefined()

        // Step 3: Read another .ts file → instructions should NOT be injected (deduplication)
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: TEST_MODEL,
            parts: [
              {
                type: 'text',
                text: `Please read the file at ${file2}`
              }
            ]
          }
        })

        await waitForIdle(client, sessionId)

        // Verify no new marker was injected
        messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })
        messages = messagesResponse.data ?? []

        markers = countInstructionMarkers(
          messages,
          'typescript.instructions.md'
        )
        // Still only 1 marker (from step 1)
        expect(markers.startCount).toBe(1)
        expect(markers.endCount).toBe(1)

        // Step 4: Revert both the assistant message and the user message that prompted it
        // First, find the user message that preceded the assistant message
        const userMessageBeforeAssistant = messages.find(
          (m) =>
            m.info.role === 'user' &&
            m.parts.some(
              (p) =>
                p.type === 'text' &&
                (p as { type: 'text'; text: string }).text.includes(file1)
            )
        )
        const userMessageIdToRevert = userMessageBeforeAssistant?.info.id

        // Revert the assistant message first
        await client.session.revert({
          path: { id: sessionId },
          body: { messageID: messageIdToRevert! }
        })

        // Also revert the user message if it exists and is different
        if (userMessageIdToRevert && userMessageIdToRevert !== messageIdToRevert) {
          await client.session.revert({
            path: { id: sessionId },
            body: { messageID: userMessageIdToRevert }
          })
        }

        // Wait a moment for the revert to take effect
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Step 5: Read a third .ts file → instructions SHOULD be re-injected
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: TEST_MODEL,
            parts: [
              {
                type: 'text',
                text: `Please read the file at ${file3}`
              }
            ]
          }
        })

        await waitForIdle(client, sessionId)

        // Verify marker was re-injected
        messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })
        messages = messagesResponse.data ?? []

        markers = countInstructionMarkers(
          messages,
          'typescript.instructions.md'
        )
        // Should have 1 marker again (re-injected after revert)
        expect(markers.startCount).toBe(1)
        expect(markers.endCount).toBe(1)
      },
      LLM_TIMEOUT * 3
    )

    it(
      'should NOT re-inject instructions after redo restores the marker',
      async () => {
        // Create TypeScript files for this test
        fs.writeFileSync(
          path.join(TEST_DIR, 'redo-test1.ts'),
          'export const redo1 = 1'
        )
        fs.writeFileSync(
          path.join(TEST_DIR, 'redo-test2.ts'),
          'export const redo2 = 2'
        )

        const file1 = path.join(TEST_DIR, 'redo-test1.ts')
        const file2 = path.join(TEST_DIR, 'redo-test2.ts')

        // Step 1: Read first .ts file → instructions should be injected
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: TEST_MODEL,
            parts: [
              {
                type: 'text',
                text: `Please read the file at ${file1}`
              }
            ]
          }
        })

        await waitForIdle(client, sessionId)

        // Verify instructions were injected in step 1
        let messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })
        let messages = messagesResponse.data ?? []

        let markers = countInstructionMarkers(
          messages,
          'typescript.instructions.md'
        )
        expect(markers.startCount).toBe(1)
        expect(markers.endCount).toBe(1)

        // Step 2: Get the message ID of the assistant's response containing the tool call
        const assistantMessage = messages.find(
          (m) => m.info.role === 'assistant'
        )
        const messageIdToRevert = assistantMessage?.info.id

        expect(messageIdToRevert).toBeDefined()

        // Step 3: Call session.revert() to undo that message
        await client.session.revert({
          path: { id: sessionId },
          body: { messageID: messageIdToRevert! }
        })

        // Wait a moment for the revert to take effect
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Step 4: Call session.unrevert() to redo (restore the message with the marker)
        await client.session.unrevert({
          path: { id: sessionId }
        })

        // Wait a moment for the unrevert to take effect
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Step 5: Read another .ts file → instructions should NOT be injected
        // because the marker is back in the message history
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: TEST_MODEL,
            parts: [
              {
                type: 'text',
                text: `Please read the file at ${file2}`
              }
            ]
          }
        })

        await waitForIdle(client, sessionId)

        // Step 6: Verify marker count is still 1 (no new injection after redo)
        messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })
        messages = messagesResponse.data ?? []

        markers = countInstructionMarkers(
          messages,
          'typescript.instructions.md'
        )
        // Should still have exactly 1 marker (from the restored message, no new injection)
        expect(markers.startCount).toBe(1)
        expect(markers.endCount).toBe(1)
      },
      LLM_TIMEOUT * 3
    )
  })

  describe('Compaction', () => {
    it(
      'should re-inject instructions after compaction clears state',
      async () => {
        // Create TypeScript files for this test
        fs.writeFileSync(
          path.join(TEST_DIR, 'compact-test1.ts'),
          'export const compact1 = 1'
        )
        fs.writeFileSync(
          path.join(TEST_DIR, 'compact-test2.ts'),
          'export const compact2 = 2'
        )
        fs.writeFileSync(
          path.join(TEST_DIR, 'compact-test3.ts'),
          'export const compact3 = 3'
        )

        const file1 = path.join(TEST_DIR, 'compact-test1.ts')
        const file2 = path.join(TEST_DIR, 'compact-test2.ts')
        const file3 = path.join(TEST_DIR, 'compact-test3.ts')

        // Step 1: Read first .ts file → instructions should be injected
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: TEST_MODEL,
            parts: [
              {
                type: 'text',
                text: `Please read the file at ${file1}`
              }
            ]
          }
        })

        await waitForIdle(client, sessionId)

        // Verify instructions were injected in step 1
        let messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })
        let messages = messagesResponse.data ?? []

        let markers = countInstructionMarkers(
          messages,
          'typescript.instructions.md'
        )
        expect(markers.startCount).toBe(1)
        expect(markers.endCount).toBe(1)

        // Step 2: Read another .ts file → instructions should NOT be injected (deduplication)
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: TEST_MODEL,
            parts: [
              {
                type: 'text',
                text: `Please read the file at ${file2}`
              }
            ]
          }
        })

        await waitForIdle(client, sessionId)

        // Verify no new marker was injected (still only 1)
        messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })
        messages = messagesResponse.data ?? []

        markers = countInstructionMarkers(
          messages,
          'typescript.instructions.md'
        )
        expect(markers.startCount).toBe(1)
        expect(markers.endCount).toBe(1)

        // Step 3: Trigger compaction via session.summarize (the compaction API)
        await client.session.summarize({
          path: { id: sessionId },
          body: {
            providerID: TEST_MODEL.providerID,
            modelID: TEST_MODEL.modelID
          }
        })

        // Step 4: Wait for compaction to complete (session becomes idle)
        await waitForIdle(client, sessionId)

        // Step 5: Read a third .ts file → instructions SHOULD be re-injected
        // (compaction clears the injected instructions state)
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            model: TEST_MODEL,
            parts: [
              {
                type: 'text',
                text: `Please read the file at ${file3}`
              }
            ]
          }
        })

        await waitForIdle(client, sessionId)

        // Verify marker was re-injected after compaction
        messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })
        messages = messagesResponse.data ?? []

        markers = countInstructionMarkers(
          messages,
          'typescript.instructions.md'
        )
        // After compaction, the old messages are summarized/replaced,
        // so we should see a fresh injection (1 marker from the post-compaction read)
        expect(markers.startCount).toBeGreaterThanOrEqual(1)
        expect(markers.endCount).toBeGreaterThanOrEqual(1)
      },
      LLM_TIMEOUT * 3
    )
  })
})

/**
 * Simpler E2E tests that don't require LLM calls.
 * These use the SDK to verify the server starts correctly.
 */
describe('E2E: Plugin Loading', () => {
  it('should start OpenCode server successfully', async () => {
    // Just verify we can start and stop a server
    const { server } = await createOpencode({ port: 0 })

    expect(server.url).toMatch(/^http:\/\//)

    server.close()
  }, 30_000)
})

/**
 * Export messages test - exports a session to JSON for manual inspection.
 * This is useful for debugging and verifying plugin behavior.
 *
 * Run with: OPENCODE_EXPORT_TEST=true npm run test:e2e
 */
describe.skipIf(!process.env.OPENCODE_EXPORT_TEST)(
  'E2E: Export Session Messages',
  () => {
    let client: OpencodeClient
    let server: { url: string; close(): void }

    beforeAll(async () => {
      const opencode = await createOpencode({ port: 0 })
      client = opencode.client
      server = opencode.server
    }, 30_000)

    afterAll(() => {
      if (server) {
        server.close()
      }
    })

    it(
      'should export session messages to a file',
      async () => {
        // Create a session
        const sessionResponse = await client.session.create({
          body: { title: 'Export Test Session' }
        })

        const sessionId = sessionResponse.data?.id
        if (!sessionId) {
          throw new Error('Failed to create session')
        }

        // Send a simple prompt
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            noReply: true, // Don't wait for LLM response
            parts: [
              {
                type: 'text',
                text: 'Hello, this is a test message.'
              }
            ]
          }
        })

        // Wait a moment
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Get messages
        const messagesResponse = await client.session.messages({
          path: { id: sessionId }
        })

        const messages = messagesResponse.data ?? []

        // Export to file
        const exportPath = path.join(process.cwd(), 'e2e-export.json')
        fs.writeFileSync(
          exportPath,
          JSON.stringify(
            {
              sessionId,
              timestamp: new Date().toISOString(),
              messages
            },
            null,
            2
          )
        )

        console.log(`Session exported to: ${exportPath}`)

        expect(messages.length).toBeGreaterThan(0)
      },
      30_000
    )
  }
)
