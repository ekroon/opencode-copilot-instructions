import { describe, it, expect } from 'vitest'
import { countTokens, formatTokenCount, formatTokenPercentage } from './tokens'

describe('tokens', () => {
  describe('countTokens', () => {
    it('should return 0 for empty string', () => {
      expect(countTokens('')).toBe(0)
    })

    it('should count tokens for simple text', () => {
      const count = countTokens('hello world')
      expect(count).toBeGreaterThan(0)
      expect(count).toBe(2) // "hello" and " world" are 2 tokens in cl100k_base
    })

    it('should count tokens for markdown content', () => {
      const markdown = `# Repository Instructions

This is the opencode-copilot-instructions plugin repository.

When working on this codebase:
- Follow TDD principles (write tests first)
- Use TypeScript strict mode
- All exports should be documented`

      const count = countTokens(markdown)
      expect(count).toBeGreaterThan(20)
      expect(count).toBeLessThan(100)
    })

    it('should count tokens for code content', () => {
      const code = `export function main(): void {
  console.log('Hello, world!')
}`
      const count = countTokens(code)
      expect(count).toBeGreaterThan(5)
    })

    it('should handle multi-line content consistently', () => {
      const text = 'line one\nline two\nline three'
      const count = countTokens(text)
      expect(count).toBeGreaterThan(0)
      expect(typeof count).toBe('number')
    })

    it('should handle special characters', () => {
      const text = '**/*.ts, **/*.tsx'
      const count = countTokens(text)
      expect(count).toBeGreaterThan(0)
    })

    it('should handle XML-like tags (instruction markers)', () => {
      const text = '<copilot-instruction:test.md>\n## Instructions\nDo stuff.\n</copilot-instruction:test.md>'
      const count = countTokens(text)
      expect(count).toBeGreaterThan(5)
    })
  })

  describe('formatTokenCount', () => {
    it('should show raw number for 0', () => {
      expect(formatTokenCount(0)).toBe('0')
    })

    it('should show raw number for counts below 2000', () => {
      expect(formatTokenCount(50)).toBe('50')
      expect(formatTokenCount(500)).toBe('500')
      expect(formatTokenCount(1000)).toBe('1000')
      expect(formatTokenCount(1999)).toBe('1999')
    })

    it('should switch to shortened format at exactly 2000 with no trailing zeros', () => {
      expect(formatTokenCount(2000)).toBe('2k')
    })

    it('should use dot as decimal separator and drop trailing zeros', () => {
      expect(formatTokenCount(2500)).toBe('2.5k')
      expect(formatTokenCount(2250)).toBe('2.25k')
      expect(formatTokenCount(10500)).toBe('10.5k')
      expect(formatTokenCount(12500)).toBe('12.5k')
    })

    it('should handle very large counts in shortened format', () => {
      expect(formatTokenCount(200000)).toBe('200k')
    })
  })

  describe('formatTokenPercentage', () => {
    it('should format percentage with 1 decimal place', () => {
      expect(formatTokenPercentage(1000, 200000)).toBe('0.5%')
    })

    it('should format small percentages', () => {
      expect(formatTokenPercentage(500, 200000)).toBe('0.3%')
    })

    it('should format larger percentages', () => {
      expect(formatTokenPercentage(20000, 200000)).toBe('10.0%')
    })

    it('should handle 100%', () => {
      expect(formatTokenPercentage(200000, 200000)).toBe('100.0%')
    })

    it('should handle zero context size gracefully', () => {
      expect(formatTokenPercentage(1000, 0)).toBe('N/A')
    })

    it('should show <0.1% for very small values instead of 0.0%', () => {
      expect(formatTokenPercentage(1, 200000)).toBe('<0.1%')
    })
  })
})
