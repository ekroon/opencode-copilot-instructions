import { describe, it, expect } from 'vitest'
import { createMatcher, normalizePatterns } from './matcher'

describe('normalizePatterns', () => {
  it('returns empty array for undefined input', () => {
    expect(normalizePatterns(undefined)).toEqual([])
  })

  it('returns single pattern as array', () => {
    expect(normalizePatterns('**/*.ts')).toEqual(['**/*.ts'])
  })

  it('splits comma-separated patterns into array', () => {
    expect(normalizePatterns('**/*.ts,**/*.tsx')).toEqual(['**/*.ts', '**/*.tsx'])
  })

  it('trims whitespace around patterns in comma-separated string', () => {
    expect(normalizePatterns('**/*.ts , **/*.tsx , **/*.js')).toEqual([
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
    ])
  })

  it('returns array input unchanged', () => {
    const patterns = ['**/*.ts', '**/*.tsx']
    expect(normalizePatterns(patterns)).toEqual(patterns)
  })

  it('filters out empty patterns after splitting', () => {
    expect(normalizePatterns('**/*.ts,,**/*.tsx')).toEqual(['**/*.ts', '**/*.tsx'])
  })

  it('handles empty string input', () => {
    expect(normalizePatterns('')).toEqual([])
  })
})

describe('createMatcher', () => {
  describe('with empty patterns', () => {
    it('matches nothing when patterns array is empty', () => {
      const matcher = createMatcher([])
      expect(matcher('file.ts')).toBe(false)
      expect(matcher('src/index.ts')).toBe(false)
    })
  })

  describe('single pattern matching', () => {
    it('matches files with *.ts pattern in current directory', () => {
      const matcher = createMatcher(['*.ts'])
      expect(matcher('file.ts')).toBe(true)
      expect(matcher('index.ts')).toBe(true)
      expect(matcher('file.js')).toBe(false)
      expect(matcher('src/file.ts')).toBe(false) // Not in current directory
    })

    it('matches all files with * pattern', () => {
      const matcher = createMatcher(['*'])
      expect(matcher('file.ts')).toBe(true)
      expect(matcher('readme.md')).toBe(true)
      expect(matcher('src/file.ts')).toBe(false) // Not in current directory
    })
  })

  describe('recursive glob patterns', () => {
    it('matches all .ts files recursively with **/*.ts', () => {
      const matcher = createMatcher(['**/*.ts'])
      expect(matcher('file.ts')).toBe(true)
      expect(matcher('src/file.ts')).toBe(true)
      expect(matcher('src/utils/helper.ts')).toBe(true)
      expect(matcher('file.js')).toBe(false)
      expect(matcher('src/file.js')).toBe(false)
    })

    it('matches all files with ** pattern', () => {
      const matcher = createMatcher(['**'])
      expect(matcher('file.ts')).toBe(true)
      expect(matcher('src/file.ts')).toBe(true)
      expect(matcher('deep/nested/path/file.md')).toBe(true)
    })

    it('matches all files with **/* pattern', () => {
      const matcher = createMatcher(['**/*'])
      expect(matcher('file.ts')).toBe(true)
      expect(matcher('src/file.ts')).toBe(true)
      expect(matcher('deep/nested/path/file.md')).toBe(true)
    })
  })

  describe('directory-specific patterns', () => {
    it('matches .ts files only in src directory with src/**/*.ts', () => {
      const matcher = createMatcher(['src/**/*.ts'])
      expect(matcher('src/file.ts')).toBe(true)
      expect(matcher('src/utils/helper.ts')).toBe(true)
      expect(matcher('file.ts')).toBe(false)
      expect(matcher('lib/file.ts')).toBe(false)
      expect(matcher('src/file.js')).toBe(false)
    })

    it('matches files in specific nested directory', () => {
      const matcher = createMatcher(['src/components/**/*.tsx'])
      expect(matcher('src/components/Button.tsx')).toBe(true)
      expect(matcher('src/components/forms/Input.tsx')).toBe(true)
      expect(matcher('src/utils/helper.tsx')).toBe(false)
      expect(matcher('src/components/Button.ts')).toBe(false)
    })
  })

  describe('multiple patterns', () => {
    it('matches if any pattern matches', () => {
      const matcher = createMatcher(['**/*.ts', '**/*.tsx'])
      expect(matcher('file.ts')).toBe(true)
      expect(matcher('file.tsx')).toBe(true)
      expect(matcher('src/component.tsx')).toBe(true)
      expect(matcher('file.js')).toBe(false)
    })

    it('combines different pattern types', () => {
      const matcher = createMatcher(['*.md', 'src/**/*.ts'])
      expect(matcher('README.md')).toBe(true)
      expect(matcher('src/index.ts')).toBe(true)
      expect(matcher('docs/guide.md')).toBe(false) // *.md only matches root
      expect(matcher('index.ts')).toBe(false) // src/**/*.ts requires src/
    })
  })

  describe('edge cases', () => {
    it('handles paths with multiple extensions', () => {
      const matcher = createMatcher(['**/*.test.ts'])
      expect(matcher('file.test.ts')).toBe(true)
      expect(matcher('src/utils.test.ts')).toBe(true)
      expect(matcher('file.ts')).toBe(false)
      expect(matcher('file.test.js')).toBe(false)
    })

    it('handles dotfiles', () => {
      const matcher = createMatcher(['**/*.ts'])
      // By default picomatch doesn't match dotfiles with globs
      expect(matcher('.hidden.ts')).toBe(false)
    })

    it('handles paths starting with ./', () => {
      const matcher = createMatcher(['**/*.ts'])
      // Paths should be normalized without leading ./
      expect(matcher('src/file.ts')).toBe(true)
    })
  })
})
