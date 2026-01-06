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

  describe('tool.execute.before hook', () => {
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
      const output = { args: { filePath: path.join(tempDir, 'src/index.ts') } } as any

      // Act
      await hooks['tool.execute.before']!(input, output)

      // Assert
      expect(output.toolMessage).toBeDefined()
      expect(output.toolMessage).toContain('Use TypeScript strict mode.')
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
      const output = { args: { filePath: path.join(tempDir, 'src/utils.ts') } } as any

      // Act
      await hooks['tool.execute.before']!(input, output)

      // Assert
      expect(output.toolMessage).toBeDefined()
      expect(output.toolMessage).toContain('TypeScript editing rules.')
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
      const output = { args: { filePath: path.join(tempDir, 'src/new-file.ts') } } as any

      // Act
      await hooks['tool.execute.before']!(input, output)

      // Assert
      expect(output.toolMessage).toBeDefined()
      expect(output.toolMessage).toContain('TypeScript writing rules.')
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
      const output = { args: { filePath: path.join(tempDir, 'readme.md') } } as any

      // Act
      await hooks['tool.execute.before']!(input, output)

      // Assert
      expect(output.toolMessage).toBeUndefined()
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
      const output = { args: { command: 'npm test' } } as any

      // Act
      await hooks['tool.execute.before']!(input, output)

      // Assert
      expect(output.toolMessage).toBeUndefined()
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
      const output = { args: {} } as any

      // Act
      await hooks['tool.execute.before']!(input, output)

      // Assert
      expect(output.toolMessage).toBeUndefined()
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
      const filePath = path.join(tempDir, 'src/index.ts')

      // First call
      const output1 = { args: { filePath } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID, callID: 'call-1' }, output1)

      // Second call with same session and matching file
      const output2 = { args: { filePath: path.join(tempDir, 'src/other.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID, callID: 'call-2' }, output2)

      // Assert
      expect(output1.toolMessage).toBeDefined()
      expect(output1.toolMessage).toContain('TypeScript rules.')
      expect(output2.toolMessage).toBeUndefined() // Should not inject again
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
      const output1 = { args: { filePath: path.join(tempDir, 'src/index.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'session-1', callID: 'call-1' }, output1)

      // Different session
      const output2 = { args: { filePath: path.join(tempDir, 'src/index.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'session-2', callID: 'call-2' }, output2)

      // Assert
      expect(output1.toolMessage).toBeDefined()
      expect(output2.toolMessage).toBeDefined()
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
      const output = { args: { filePath: path.join(tempDir, 'src/index.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'session-1', callID: 'call-1' }, output)

      // Assert
      expect(output.toolMessage).toBeDefined()
      expect(output.toolMessage).toContain('TypeScript rules.')
      expect(output.toolMessage).toContain('Source directory rules.')
    })

    it('should prepend to existing toolMessage', async () => {
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
      const output = { 
        args: { filePath: path.join(tempDir, 'src/index.ts') },
        toolMessage: 'Existing message'
      } as any

      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'session-1', callID: 'call-1' }, output)

      // Assert
      expect(output.toolMessage).toContain('TypeScript rules.')
      expect(output.toolMessage).toContain('Existing message')
      // Instructions should come before existing message
      expect(output.toolMessage.indexOf('TypeScript rules.')).toBeLessThan(
        output.toolMessage.indexOf('Existing message')
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
      const output = { args: { filePath: 'src/index.ts' } } as any

      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'session-1', callID: 'call-1' }, output)

      // Assert
      expect(output.toolMessage).toBeDefined()
      expect(output.toolMessage).toContain('TypeScript rules.')
    })
  })
})
