import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadRepoInstructions, loadPathInstructions } from './loader.js'

describe('loader', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('loadRepoInstructions', () => {
    it('should return file content when .github/copilot-instructions.md exists', () => {
      // Arrange
      const githubDir = path.join(tempDir, '.github')
      fs.mkdirSync(githubDir)
      const filePath = path.join(githubDir, 'copilot-instructions.md')
      const content = '# Repository Instructions\n\nFollow these guidelines.'
      fs.writeFileSync(filePath, content)

      // Act
      const result = loadRepoInstructions(tempDir)

      // Assert
      expect(result).toBe(content)
    })

    it('should return null when file does not exist', () => {
      // Arrange
      const githubDir = path.join(tempDir, '.github')
      fs.mkdirSync(githubDir)
      // Don't create the file

      // Act
      const result = loadRepoInstructions(tempDir)

      // Assert
      expect(result).toBeNull()
    })

    it('should return null when .github directory does not exist', () => {
      // Arrange - empty tempDir, no .github directory

      // Act
      const result = loadRepoInstructions(tempDir)

      // Assert
      expect(result).toBeNull()
    })

    it('should handle files with different content', () => {
      // Arrange
      const githubDir = path.join(tempDir, '.github')
      fs.mkdirSync(githubDir)
      const filePath = path.join(githubDir, 'copilot-instructions.md')
      const content = 'Simple content'
      fs.writeFileSync(filePath, content)

      // Act
      const result = loadRepoInstructions(tempDir)

      // Assert
      expect(result).toBe(content)
    })
  })

  describe('loadPathInstructions', () => {
    it('should load a single instruction file with frontmatter', () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })
      const filePath = path.join(instructionsDir, 'typescript.instructions.md')
      const content = `---
applyTo: "**/*.ts"
---
Use strict TypeScript.`
      fs.writeFileSync(filePath, content)

      // Act
      const result = loadPathInstructions(tempDir)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].file).toBe(filePath)
      expect(result[0].applyTo).toEqual(['**/*.ts'])
      expect(result[0].content).toBe('Use strict TypeScript.')
      expect(typeof result[0].matcher).toBe('function')
    })

    it('should load multiple instruction files', () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })

      const file1 = path.join(instructionsDir, 'typescript.instructions.md')
      fs.writeFileSync(file1, `---
applyTo: "**/*.ts"
---
TypeScript rules.`)

      const file2 = path.join(instructionsDir, 'react.instructions.md')
      fs.writeFileSync(file2, `---
applyTo:
  - "**/*.tsx"
  - "**/*.jsx"
---
React rules.`)

      // Act
      const result = loadPathInstructions(tempDir)

      // Assert
      expect(result).toHaveLength(2)
      
      // Find each result by file path since order may vary
      const tsResult = result.find(r => r.file.includes('typescript'))
      const reactResult = result.find(r => r.file.includes('react'))
      
      expect(tsResult).toBeDefined()
      expect(tsResult!.applyTo).toEqual(['**/*.ts'])
      expect(tsResult!.content).toBe('TypeScript rules.')

      expect(reactResult).toBeDefined()
      expect(reactResult!.applyTo).toEqual(['**/*.tsx', '**/*.jsx'])
      expect(reactResult!.content).toBe('React rules.')
    })

    it('should return empty array when instructions directory does not exist', () => {
      // Arrange - empty tempDir

      // Act
      const result = loadPathInstructions(tempDir)

      // Assert
      expect(result).toEqual([])
    })

    it('should return empty array when .github exists but instructions does not', () => {
      // Arrange
      fs.mkdirSync(path.join(tempDir, '.github'))

      // Act
      const result = loadPathInstructions(tempDir)

      // Assert
      expect(result).toEqual([])
    })

    it('should skip files without applyTo in frontmatter', () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })

      const file1 = path.join(instructionsDir, 'valid.instructions.md')
      fs.writeFileSync(file1, `---
applyTo: "**/*.ts"
---
Valid content.`)

      const file2 = path.join(instructionsDir, 'invalid.instructions.md')
      fs.writeFileSync(file2, `---
excludeAgent: code-review
---
No applyTo here.`)

      // Act
      const result = loadPathInstructions(tempDir)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].file).toBe(file1)
    })

    it('should skip files with empty applyTo', () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })

      const file1 = path.join(instructionsDir, 'empty.instructions.md')
      fs.writeFileSync(file1, `---
applyTo: ""
---
Empty applyTo.`)

      // Act
      const result = loadPathInstructions(tempDir)

      // Assert
      expect(result).toEqual([])
    })

    it('should only load *.instructions.md files', () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })

      const validFile = path.join(instructionsDir, 'valid.instructions.md')
      fs.writeFileSync(validFile, `---
applyTo: "**/*.ts"
---
Valid.`)

      const otherFile = path.join(instructionsDir, 'readme.md')
      fs.writeFileSync(otherFile, `---
applyTo: "**/*"
---
Should be ignored.`)

      // Act
      const result = loadPathInstructions(tempDir)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].file).toBe(validFile)
    })

    it('should create a working matcher from patterns', () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })

      const file = path.join(instructionsDir, 'typescript.instructions.md')
      fs.writeFileSync(file, `---
applyTo: "**/*.ts"
---
TypeScript rules.`)

      // Act
      const result = loadPathInstructions(tempDir)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].matcher('src/index.ts')).toBe(true)
      expect(result[0].matcher('lib/utils.ts')).toBe(true)
      expect(result[0].matcher('src/index.js')).toBe(false)
      expect(result[0].matcher('readme.md')).toBe(false)
    })

    it('should handle comma-separated patterns in applyTo', () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })

      const file = path.join(instructionsDir, 'web.instructions.md')
      fs.writeFileSync(file, `---
applyTo: "**/*.ts, **/*.js"
---
Web rules.`)

      // Act
      const result = loadPathInstructions(tempDir)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].applyTo).toEqual(['**/*.ts', '**/*.js'])
      expect(result[0].matcher('src/index.ts')).toBe(true)
      expect(result[0].matcher('src/index.js')).toBe(true)
      expect(result[0].matcher('src/index.py')).toBe(false)
    })

    it('should handle files without frontmatter', () => {
      // Arrange
      const instructionsDir = path.join(tempDir, '.github', 'instructions')
      fs.mkdirSync(instructionsDir, { recursive: true })

      const file = path.join(instructionsDir, 'nofront.instructions.md')
      fs.writeFileSync(file, 'Just content, no frontmatter.')

      // Act
      const result = loadPathInstructions(tempDir)

      // Assert
      expect(result).toEqual([]) // Should be skipped - no applyTo
    })
  })
})
