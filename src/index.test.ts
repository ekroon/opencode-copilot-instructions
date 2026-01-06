import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { CopilotInstructionsPlugin } from './index.js'

// Note: getRelativePath is now an internal function (not exported)
// to avoid OpenCode treating it as a plugin. It is tested indirectly
// through the tool.execute.before hook tests which use various path formats.

describe('CopilotInstructionsPlugin', () => {
  let tempDir: string
  let mockClient: any
  let logMessages: string[]

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-'))
    logMessages = []
    mockClient = {
      app: {
        log: vi.fn((options: { body: { service: string; level: string; message: string } }) => {
          logMessages.push(options.body.message)
        })
      }
    }
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function createPluginInput() {
    return {
      directory: tempDir,
      client: mockClient,
      project: {} as any,
      worktree: tempDir,
      serverUrl: new URL('http://localhost:3000'),
      $: {} as any
    }
  }

  describe('initialization', () => {
    it('should load and log repo-wide instructions', async () => {
      // Arrange
      const githubDir = path.join(tempDir, '.github')
      fs.mkdirSync(githubDir, { recursive: true })
      fs.writeFileSync(
        path.join(githubDir, 'copilot-instructions.md'),
        '# Repo Instructions\n\nFollow these rules.'
      )

      // Act
      await CopilotInstructionsPlugin(createPluginInput())

      // Assert
      expect(mockClient.app.log).toHaveBeenCalled()
      expect(logMessages.some(msg => msg.includes('copilot-instructions.md'))).toBe(true)
    })

    it('should load and log path-specific instructions', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
Use TypeScript strict mode.`
      )

      // Act
      await CopilotInstructionsPlugin(createPluginInput())

      // Assert
      expect(mockClient.app.log).toHaveBeenCalled()
      expect(logMessages.some(msg => msg.includes('typescript.instructions.md'))).toBe(true)
    })

    it('should handle no instructions gracefully', async () => {
      // Arrange - empty tempDir, no .github

      // Act
      const hooks = await CopilotInstructionsPlugin(createPluginInput())

      // Assert
      expect(hooks).toBeDefined()
      expect(mockClient.app.log).toHaveBeenCalled()
      expect(logMessages.some(msg => msg.includes('No') || msg.includes('none'))).toBe(true)
    })

    it('should log both repo and path instructions when both exist', async () => {
      // Arrange
      const githubDir = path.join(tempDir, '.github')
      const instructionsDir = path.join(githubDir, 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })

      fs.writeFileSync(
        path.join(githubDir, 'copilot-instructions.md'),
        '# Repo Instructions'
      )
      fs.writeFileSync(
        path.join(instructionsDir, 'ts.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TS rules.`
      )

      // Act
      await CopilotInstructionsPlugin(createPluginInput())

      // Assert
      expect(mockClient.app.log).toHaveBeenCalled()
      expect(logMessages.some(msg => msg.includes('copilot-instructions.md'))).toBe(true)
      expect(logMessages.some(msg => msg.includes('ts.instructions.md'))).toBe(true)
    })
  })

  describe('experimental.session.compacting hook', () => {
    it('should inject repo-wide instructions into compaction context', async () => {
      // Arrange
      const githubDir = path.join(tempDir, '.github')
      fs.mkdirSync(githubDir, { recursive: true })
      const repoContent = '# Repo Instructions\n\nFollow these rules.'
      fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), repoContent)

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { sessionID: 'session-1' }
      const output = { context: [] as string[], prompt: undefined }

      // Act
      await hooks['experimental.session.compacting']!(input, output)

      // Assert
      expect(output.context).toHaveLength(1)
      expect(output.context[0]).toContain('## Copilot Custom Instructions')
      expect(output.context[0]).toContain(repoContent)
    })

    it('should not inject anything when no repo instructions exist', async () => {
      // Arrange - no .github directory

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { sessionID: 'session-1' }
      const output = { context: [] as string[], prompt: undefined }

      // Act
      await hooks['experimental.session.compacting']!(input, output)

      // Assert
      expect(output.context).toHaveLength(0)
    })

    it('should preserve existing context entries', async () => {
      // Arrange
      const githubDir = path.join(tempDir, '.github')
      fs.mkdirSync(githubDir, { recursive: true })
      fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), 'Instructions')

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { sessionID: 'session-1' }
      const output = { context: ['Existing context'], prompt: undefined }

      // Act
      await hooks['experimental.session.compacting']!(input, output)

      // Assert
      expect(output.context).toHaveLength(2)
      expect(output.context[0]).toBe('Existing context')
      expect(output.context[1]).toContain('Instructions')
    })
  })

  describe('tool.execute hooks', () => {
    // Helper to simulate the full tool execution flow
    async function executeToolWithHooks(
      hooks: any,
      input: { tool: string; sessionID: string; callID: string },
      args: any,
      existingOutput: string = 'File contents here'
    ) {
      const beforeOutput = { args } as any
      await hooks['tool.execute.before']!(input, beforeOutput)
      
      const afterOutput = { title: '', output: existingOutput, metadata: {} }
      await hooks['tool.execute.after']!(input, afterOutput)
      
      return { beforeOutput, afterOutput }
    }

    it('should inject matching path instructions for read tool', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
Use TypeScript strict mode.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { tool: 'read', sessionID: 'session-1', callID: 'call-1' }
      const args = { filePath: path.join(tempDir, 'src/index.ts') }

      // Act
      const { afterOutput } = await executeToolWithHooks(hooks, input, args)

      // Assert
      expect(afterOutput.output).toContain('Use TypeScript strict mode.')
    })

    it('should inject matching path instructions for edit tool', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript editing rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { tool: 'edit', sessionID: 'session-1', callID: 'call-1' }
      const args = { filePath: path.join(tempDir, 'src/utils.ts') }

      // Act
      const { afterOutput } = await executeToolWithHooks(hooks, input, args)

      // Assert
      expect(afterOutput.output).toContain('TypeScript editing rules.')
    })

    it('should inject matching path instructions for write tool', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript writing rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { tool: 'write', sessionID: 'session-1', callID: 'call-1' }
      const args = { filePath: path.join(tempDir, 'src/new-file.ts') }

      // Act
      const { afterOutput } = await executeToolWithHooks(hooks, input, args)

      // Assert
      expect(afterOutput.output).toContain('TypeScript writing rules.')
    })

    it('should not inject for non-matching files', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { tool: 'read', sessionID: 'session-1', callID: 'call-1' }
      const args = { filePath: path.join(tempDir, 'readme.md') }
      const originalOutput = 'File contents'

      // Act
      const { afterOutput } = await executeToolWithHooks(hooks, input, args, originalOutput)

      // Assert - output should remain unchanged (no instructions appended)
      expect(afterOutput.output).toBe(originalOutput)
      expect(afterOutput.output).not.toContain('TypeScript rules.')
    })

    it('should skip non-file tools', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { tool: 'bash', sessionID: 'session-1', callID: 'call-1' }
      const args = { command: 'npm test' }
      const originalOutput = 'Command output'

      // Act
      const { afterOutput } = await executeToolWithHooks(hooks, input, args, originalOutput)

      // Assert
      expect(afterOutput.output).toBe(originalOutput)
    })

    it('should skip tools without filePath in args', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { tool: 'read', sessionID: 'session-1', callID: 'call-1' }
      const args = {}
      const originalOutput = 'Some output'

      // Act
      const { afterOutput } = await executeToolWithHooks(hooks, input, args, originalOutput)

      // Assert
      expect(afterOutput.output).toBe(originalOutput)
    })

    it('should prevent duplicate injection per session', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const sessionID = 'session-1'

      // First call
      const { afterOutput: afterOutput1 } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID, callID: 'call-1' },
        { filePath: path.join(tempDir, 'src/index.ts') }
      )

      // Second call with same session and matching file
      const { afterOutput: afterOutput2 } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID, callID: 'call-2' },
        { filePath: path.join(tempDir, 'src/other.ts') },
        'Second file contents'
      )

      // Assert
      expect(afterOutput1.output).toContain('TypeScript rules.')
      expect(afterOutput2.output).not.toContain('TypeScript rules.') // Should not inject again
      expect(afterOutput2.output).toBe('Second file contents')
    })

    it('should allow injection in different sessions', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())

      // First session
      const { afterOutput: afterOutput1 } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID: 'session-1', callID: 'call-1' },
        { filePath: path.join(tempDir, 'src/index.ts') }
      )

      // Different session
      const { afterOutput: afterOutput2 } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID: 'session-2', callID: 'call-2' },
        { filePath: path.join(tempDir, 'src/index.ts') }
      )

      // Assert
      expect(afterOutput1.output).toContain('TypeScript rules.')
      expect(afterOutput2.output).toContain('TypeScript rules.')
    })

    it('should inject multiple matching instructions', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript rules.`
      )
      fs.writeFileSync(
        path.join(instructionsDir, 'src.instructions.md'),
        `---
applyTo: "src/**/*"
---
Source directory rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const { afterOutput } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID: 'session-1', callID: 'call-1' },
        { filePath: path.join(tempDir, 'src/index.ts') }
      )

      // Assert
      expect(afterOutput.output).toContain('TypeScript rules.')
      expect(afterOutput.output).toContain('Source directory rules.')
    })

    it('should append instructions to existing tool output', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const existingOutput = 'File contents here'
      const { afterOutput } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID: 'session-1', callID: 'call-1' },
        { filePath: path.join(tempDir, 'src/index.ts') },
        existingOutput
      )

      // Assert
      expect(afterOutput.output).toContain('TypeScript rules.')
      expect(afterOutput.output).toContain(existingOutput)
      // Original output should come before instructions
      expect(afterOutput.output.indexOf(existingOutput)).toBeLessThan(
        afterOutput.output.indexOf('TypeScript rules.')
      )
    })

    it('should handle relative file paths', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const { afterOutput } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID: 'session-1', callID: 'call-1' },
        { filePath: 'src/index.ts' }
      )

      // Assert
      expect(afterOutput.output).toContain('TypeScript rules.')
    })

    it('should include applyTo pattern in header for single pattern', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
Use TypeScript strict mode.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const { afterOutput } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID: 'session-1', callID: 'call-1' },
        { filePath: path.join(tempDir, 'src/index.ts') }
      )

      // Assert
      expect(afterOutput.output).toContain('## Path-Specific Instructions (applies to: **/*.ts)')
      expect(afterOutput.output).toContain('Use TypeScript strict mode.')
    })

    it('should include applyTo patterns in header for multiple patterns (array)', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'web-files.instructions.md'),
        `---
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
---
Web file rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const { afterOutput } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID: 'session-1', callID: 'call-1' },
        { filePath: path.join(tempDir, 'src/component.tsx') }
      )

      // Assert
      expect(afterOutput.output).toContain('## Path-Specific Instructions (applies to: **/*.ts, **/*.tsx, **/*.js)')
      expect(afterOutput.output).toContain('Web file rules.')
    })

    it('should include applyTo pattern for each instruction when multiple match', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript rules.`
      )
      fs.writeFileSync(
        path.join(instructionsDir, 'src.instructions.md'),
        `---
applyTo: "src/**/*"
---
Source directory rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const { afterOutput } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID: 'session-1', callID: 'call-1' },
        { filePath: path.join(tempDir, 'src/index.ts') }
      )

      // Assert - each instruction should have its own header with applyTo pattern
      expect(afterOutput.output).toContain('## Path-Specific Instructions (applies to: **/*.ts)')
      expect(afterOutput.output).toContain('TypeScript rules.')
      expect(afterOutput.output).toContain('## Path-Specific Instructions (applies to: src/**/*)')
      expect(afterOutput.output).toContain('Source directory rules.')
    })

    it('should include instruction marker in injected output', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const { afterOutput } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID: 'session-1', callID: 'call-1' },
        { filePath: path.join(tempDir, 'src/index.ts') }
      )

      // Assert - should include a marker that can be detected for re-injection logic
      expect(afterOutput.output).toMatch(/<!-- copilot-instruction:.+\.instructions\.md -->/)
    })

    it('should re-inject instructions after undo removes them from history', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const sessionID = 'session-1'

      // First call - inject instructions
      const { afterOutput: afterOutput1 } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID, callID: 'call-1' },
        { filePath: path.join(tempDir, 'src/index.ts') }
      )
      expect(afterOutput1.output).toContain('TypeScript rules.')

      // Second call - should NOT inject (already injected)
      const { afterOutput: afterOutput2 } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID, callID: 'call-2' },
        { filePath: path.join(tempDir, 'src/other.ts') },
        'Other file contents'
      )
      expect(afterOutput2.output).toBe('Other file contents')

      // Simulate /undo - messages transform hook is called with history that doesn't contain our marker
      const messagesOutput = { messages: [] as any[] }
      await hooks['experimental.chat.messages.transform']!({}, messagesOutput)

      // Third call - should re-inject because marker is gone from history
      const { afterOutput: afterOutput3 } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID, callID: 'call-3' },
        { filePath: path.join(tempDir, 'src/another.ts') }
      )
      expect(afterOutput3.output).toContain('TypeScript rules.')
    })

    it('should NOT re-inject if marker is still present in message history', async () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      fs.writeFileSync(
        path.join(instructionsDir, 'typescript.instructions.md'),
        `---
applyTo: "**/*.ts"
---
TypeScript rules.`
      )

      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const sessionID = 'session-1'

      // First call - inject instructions
      const { afterOutput: afterOutput1 } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID, callID: 'call-1' },
        { filePath: path.join(tempDir, 'src/index.ts') }
      )
      expect(afterOutput1.output).toContain('TypeScript rules.')

      // Simulate messages transform with our marker still present in a tool output
      const messagesOutput = {
        messages: [{
          info: { sessionID } as any,
          parts: [{
            type: 'tool',
            state: { status: 'completed', output: afterOutput1.output }
          }] as any[]
        }]
      }
      await hooks['experimental.chat.messages.transform']!({}, messagesOutput)

      // Second call - should NOT inject because marker is still in history
      const { afterOutput: afterOutput2 } = await executeToolWithHooks(
        hooks,
        { tool: 'read', sessionID, callID: 'call-2' },
        { filePath: path.join(tempDir, 'src/other.ts') },
        'Other file contents'
      )
      expect(afterOutput2.output).toBe('Other file contents')
    })
  })
})
