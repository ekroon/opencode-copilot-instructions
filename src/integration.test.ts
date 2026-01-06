import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { CopilotInstructionsPlugin } from './index.js'

describe('Integration Tests', () => {
  let tempDir: string
  let mockClient: any
  let logMessages: string[]

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-test-'))
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

  /**
   * Helper to create a directory structure from a map
   */
  function createFileStructure(structure: Record<string, string | null>) {
    for (const [filePath, content] of Object.entries(structure)) {
      const fullPath = path.join(tempDir, filePath)
      const dir = path.dirname(fullPath)
      fs.mkdirSync(dir, { recursive: true })
      if (content !== null) {
        fs.writeFileSync(fullPath, content)
      }
    }
  }

  describe('Full plugin workflow', () => {
    beforeEach(() => {
      // Create realistic file structure
      createFileStructure({
        '.github/copilot-instructions.md': `# Repository Guidelines

This is a TypeScript project. Follow these rules:
- Use strict mode
- Write tests for all code
- Document public APIs`,

        '.github/instructions/typescript.instructions.md': `---
applyTo: "**/*.ts"
---
## TypeScript Guidelines

- Use explicit types for function parameters and return values
- Prefer interfaces over type aliases for object shapes
- Use readonly where applicable`,

        '.github/instructions/react.instructions.md': `---
applyTo:
  - "**/*.tsx"
  - "**/*.jsx"
---
## React Guidelines

- Use functional components with hooks
- Memoize expensive computations
- Keep components small and focused`,

        'src/index.ts': `export function main() {
  console.log('Hello, world!')
}`,

        'src/components/Button.tsx': `import React from 'react'

export function Button({ children }: { children: React.ReactNode }) {
  return <button>{children}</button>
}`
      })
    })

    it('should load repo and path instructions during initialization', async () => {
      // Act
      await CopilotInstructionsPlugin(createPluginInput())

      // Assert - verify logs show all instructions were loaded
      expect(logMessages.some(msg => msg.includes('copilot-instructions.md'))).toBe(true)
      expect(logMessages.some(msg => msg.includes('typescript.instructions.md'))).toBe(true)
      expect(logMessages.some(msg => msg.includes('react.instructions.md'))).toBe(true)
    })

    it('should inject repo instructions via compacting hook', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { sessionID: 'integration-session-1' }
      const output = { context: [] as string[], prompt: undefined }

      // Act
      await hooks['experimental.session.compacting']!(input, output)

      // Assert
      expect(output.context).toHaveLength(1)
      expect(output.context[0]).toContain('## Copilot Custom Instructions')
      expect(output.context[0]).toContain('Repository Guidelines')
      expect(output.context[0]).toContain('Use strict mode')
    })

    it('should inject TypeScript instructions for .ts files', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { tool: 'read', sessionID: 'ts-session-1', callID: 'call-1' }
      const output = { args: { filePath: path.join(tempDir, 'src/index.ts') } } as any

      // Act
      await hooks['tool.execute.before']!(input, output)

      // Assert
      expect(output.toolMessage).toBeDefined()
      expect(output.toolMessage).toContain('TypeScript Guidelines')
      expect(output.toolMessage).toContain('explicit types')
      expect(output.toolMessage).not.toContain('React Guidelines')
    })

    it('should inject React instructions for .tsx files', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { tool: 'read', sessionID: 'react-session-1', callID: 'call-1' }
      const output = { args: { filePath: path.join(tempDir, 'src/components/Button.tsx') } } as any

      // Act
      await hooks['tool.execute.before']!(input, output)

      // Assert
      expect(output.toolMessage).toBeDefined()
      expect(output.toolMessage).toContain('React Guidelines')
      expect(output.toolMessage).toContain('functional components')
      expect(output.toolMessage).not.toContain('TypeScript Guidelines')
    })

    it('should not inject instructions for non-matching files', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const input = { tool: 'read', sessionID: 'other-session-1', callID: 'call-1' }
      const output = { args: { filePath: path.join(tempDir, 'README.md') } } as any

      // Act
      await hooks['tool.execute.before']!(input, output)

      // Assert
      expect(output.toolMessage).toBeUndefined()
    })

    it('should prevent duplicate injection across multiple calls in same session', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const sessionID = 'dedup-session-1'

      // First call - TypeScript file
      const output1 = { args: { filePath: path.join(tempDir, 'src/index.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID, callID: 'call-1' }, output1)

      // Second call - another TypeScript file in same session
      const output2 = { args: { filePath: path.join(tempDir, 'src/utils.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID, callID: 'call-2' }, output2)

      // Third call - React file (different instructions)
      const output3 = { args: { filePath: path.join(tempDir, 'src/components/Button.tsx') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID, callID: 'call-3' }, output3)

      // Fourth call - another React file (should be deduplicated)
      const output4 = { args: { filePath: path.join(tempDir, 'src/components/Input.tsx') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID, callID: 'call-4' }, output4)

      // Assert
      expect(output1.toolMessage).toContain('TypeScript Guidelines')
      expect(output2.toolMessage).toBeUndefined() // Deduplicated
      expect(output3.toolMessage).toContain('React Guidelines')
      expect(output4.toolMessage).toBeUndefined() // Deduplicated
    })

    it('should handle full workflow with compacting followed by tool operations', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const sessionID = 'full-workflow-session'

      // First, simulate compacting
      const compactOutput = { context: ['Previous context item'], prompt: undefined }
      await hooks['experimental.session.compacting']!({ sessionID }, compactOutput)

      // Then, simulate file reads
      const readOutput1 = { args: { filePath: path.join(tempDir, 'src/index.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID, callID: 'call-1' }, readOutput1)

      const readOutput2 = { args: { filePath: path.join(tempDir, 'src/components/Button.tsx') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID, callID: 'call-2' }, readOutput2)

      // Assert - compacting should have repo instructions
      expect(compactOutput.context).toHaveLength(2)
      expect(compactOutput.context[0]).toBe('Previous context item')
      expect(compactOutput.context[1]).toContain('Repository Guidelines')

      // Assert - tool operations should have path-specific instructions
      expect(readOutput1.toolMessage).toContain('TypeScript Guidelines')
      expect(readOutput2.toolMessage).toContain('React Guidelines')
    })

    it('should work with edit and write tools', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())

      // Test edit tool
      const editOutput = { args: { filePath: path.join(tempDir, 'src/index.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'edit', sessionID: 'tools-session-1', callID: 'call-1' }, editOutput)

      // Test write tool (new session to avoid dedup)
      const writeOutput = { args: { filePath: path.join(tempDir, 'src/new-file.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'write', sessionID: 'tools-session-2', callID: 'call-2' }, writeOutput)

      // Assert
      expect(editOutput.toolMessage).toContain('TypeScript Guidelines')
      expect(writeOutput.toolMessage).toContain('TypeScript Guidelines')
    })
  })

  describe('Edge case: Empty repository (no .github folder)', () => {
    beforeEach(() => {
      // Create only source files, no .github
      createFileStructure({
        'src/index.ts': 'export const hello = "world"',
        'package.json': '{"name": "test"}'
      })
    })

    it('should initialize without errors', async () => {
      // Act
      const hooks = await CopilotInstructionsPlugin(createPluginInput())

      // Assert
      expect(hooks).toBeDefined()
      expect(hooks['experimental.session.compacting']).toBeDefined()
      expect(hooks['tool.execute.before']).toBeDefined()
    })

    it('should log that no instructions were found', async () => {
      // Act
      await CopilotInstructionsPlugin(createPluginInput())

      // Assert
      expect(logMessages.some(msg => msg.toLowerCase().includes('no'))).toBe(true)
    })

    it('should not inject anything on compacting', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const output = { context: [] as string[], prompt: undefined }

      // Act
      await hooks['experimental.session.compacting']!({ sessionID: 'empty-session' }, output)

      // Assert
      expect(output.context).toHaveLength(0)
    })

    it('should not inject anything on tool operations', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const output = { args: { filePath: path.join(tempDir, 'src/index.ts') } } as any

      // Act
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'empty-session', callID: 'call-1' }, output)

      // Assert
      expect(output.toolMessage).toBeUndefined()
    })
  })

  describe('Edge case: Only repo-wide instructions', () => {
    beforeEach(() => {
      createFileStructure({
        '.github/copilot-instructions.md': `# Project Rules

Always follow clean code principles.`,
        'src/index.ts': 'export const value = 42'
      })
    })

    it('should load only repo instructions', async () => {
      // Act
      await CopilotInstructionsPlugin(createPluginInput())

      // Assert
      expect(logMessages.some(msg => msg.includes('copilot-instructions.md'))).toBe(true)
      // No path-specific instructions should be loaded (no files in .github/instructions/)
      expect(logMessages.some(msg => msg.includes('path instructions'))).toBe(false)
    })

    it('should inject repo instructions on compacting', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const output = { context: [] as string[], prompt: undefined }

      // Act
      await hooks['experimental.session.compacting']!({ sessionID: 'repo-only-session' }, output)

      // Assert
      expect(output.context).toHaveLength(1)
      expect(output.context[0]).toContain('Project Rules')
      expect(output.context[0]).toContain('clean code principles')
    })

    it('should not inject path instructions on tool operations', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const output = { args: { filePath: path.join(tempDir, 'src/index.ts') } } as any

      // Act
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'repo-only-session', callID: 'call-1' }, output)

      // Assert
      expect(output.toolMessage).toBeUndefined()
    })
  })

  describe('Edge case: Only path-specific instructions', () => {
    beforeEach(() => {
      createFileStructure({
        '.github/instructions/python.instructions.md': `---
applyTo: "**/*.py"
---
Use type hints for all functions.`,
        'app/main.py': 'def hello(): pass'
      })
    })

    it('should load only path instructions', async () => {
      // Act
      await CopilotInstructionsPlugin(createPluginInput())

      // Assert
      expect(logMessages.some(msg => msg.includes('python.instructions.md'))).toBe(true)
      expect(logMessages.some(msg => msg.includes('copilot-instructions.md'))).toBe(false)
    })

    it('should not inject anything on compacting', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const output = { context: [] as string[], prompt: undefined }

      // Act
      await hooks['experimental.session.compacting']!({ sessionID: 'path-only-session' }, output)

      // Assert
      expect(output.context).toHaveLength(0)
    })

    it('should inject path instructions for matching files', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const output = { args: { filePath: path.join(tempDir, 'app/main.py') } } as any

      // Act
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'path-only-session', callID: 'call-1' }, output)

      // Assert
      expect(output.toolMessage).toBeDefined()
      expect(output.toolMessage).toContain('type hints')
    })

    it('should not inject for non-matching files', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const output = { args: { filePath: path.join(tempDir, 'app/config.json') } } as any

      // Act
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'path-only-session', callID: 'call-1' }, output)

      // Assert
      expect(output.toolMessage).toBeUndefined()
    })
  })

  describe('Edge case: Multiple instructions matching same file', () => {
    beforeEach(() => {
      createFileStructure({
        '.github/instructions/typescript.instructions.md': `---
applyTo: "**/*.ts"
---
TypeScript rules apply.`,

        '.github/instructions/src.instructions.md': `---
applyTo: "src/**/*"
---
Source directory rules apply.`,

        '.github/instructions/tests.instructions.md': `---
applyTo: "**/*.test.ts"
---
Test file rules apply.`,

        'src/utils.ts': 'export const util = () => {}',
        'src/utils.test.ts': 'describe("utils", () => {})'
      })
    })

    it('should inject all matching instructions for a file', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const output = { args: { filePath: path.join(tempDir, 'src/utils.ts') } } as any

      // Act
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'multi-match-session', callID: 'call-1' }, output)

      // Assert - should have both typescript and src rules
      expect(output.toolMessage).toContain('TypeScript rules apply')
      expect(output.toolMessage).toContain('Source directory rules apply')
    })

    it('should inject three matching instructions for test files in src', async () => {
      // Arrange
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const output = { args: { filePath: path.join(tempDir, 'src/utils.test.ts') } } as any

      // Act
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'triple-match-session', callID: 'call-1' }, output)

      // Assert - should have all three rules
      expect(output.toolMessage).toContain('TypeScript rules apply')
      expect(output.toolMessage).toContain('Source directory rules apply')
      expect(output.toolMessage).toContain('Test file rules apply')
    })
  })

  describe('Edge case: Instructions with complex glob patterns', () => {
    beforeEach(() => {
      createFileStructure({
        '.github/instructions/config.instructions.md': `---
applyTo:
  - "*.config.js"
  - "*.config.ts"
  - ".github/**/*"
---
Configuration file rules.`,

        'vitest.config.ts': 'export default {}',
        'eslint.config.js': 'module.exports = {}',
        '.github/workflows/ci.yml': 'name: CI',
        'src/config.ts': 'export const config = {}'
      })
    })

    it('should match root-level config files', async () => {
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      
      const output1 = { args: { filePath: path.join(tempDir, 'vitest.config.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'glob-session-1', callID: 'call-1' }, output1)
      
      const output2 = { args: { filePath: path.join(tempDir, 'eslint.config.js') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'glob-session-2', callID: 'call-2' }, output2)

      expect(output1.toolMessage).toContain('Configuration file rules')
      expect(output2.toolMessage).toContain('Configuration file rules')
    })

    it('should match .github folder files', async () => {
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const output = { args: { filePath: path.join(tempDir, '.github/workflows/ci.yml') } } as any

      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'glob-session-3', callID: 'call-1' }, output)

      expect(output.toolMessage).toContain('Configuration file rules')
    })

    it('should not match non-config files in src', async () => {
      const hooks = await CopilotInstructionsPlugin(createPluginInput())
      const output = { args: { filePath: path.join(tempDir, 'src/config.ts') } } as any

      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'glob-session-4', callID: 'call-1' }, output)

      // src/config.ts doesn't match *.config.ts (root only) or .github/**/*
      expect(output.toolMessage).toBeUndefined()
    })
  })

  describe('Session isolation', () => {
    beforeEach(() => {
      createFileStructure({
        '.github/copilot-instructions.md': 'Repo instructions.',
        '.github/instructions/ts.instructions.md': `---
applyTo: "**/*.ts"
---
TS instructions.`,
        'src/index.ts': 'export {}'
      })
    })

    it('should maintain separate state per session', async () => {
      const hooks = await CopilotInstructionsPlugin(createPluginInput())

      // Session 1 - first call
      const output1a = { args: { filePath: path.join(tempDir, 'src/index.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'session-A', callID: 'call-1' }, output1a)

      // Session 2 - first call
      const output2a = { args: { filePath: path.join(tempDir, 'src/index.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'session-B', callID: 'call-2' }, output2a)

      // Session 1 - second call (should be deduplicated)
      const output1b = { args: { filePath: path.join(tempDir, 'src/other.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'session-A', callID: 'call-3' }, output1b)

      // Session 2 - second call (should be deduplicated)
      const output2b = { args: { filePath: path.join(tempDir, 'src/other.ts') } } as any
      await hooks['tool.execute.before']!({ tool: 'read', sessionID: 'session-B', callID: 'call-4' }, output2b)

      // Assert - first calls should have instructions
      expect(output1a.toolMessage).toContain('TS instructions')
      expect(output2a.toolMessage).toContain('TS instructions')

      // Assert - second calls should be deduplicated
      expect(output1b.toolMessage).toBeUndefined()
      expect(output2b.toolMessage).toBeUndefined()
    })
  })
})
