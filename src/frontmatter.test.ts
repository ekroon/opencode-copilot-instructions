import { describe, it, expect } from 'vitest'
import { parseFrontmatter, type Frontmatter, type ParsedContent } from './frontmatter'

describe('parseFrontmatter', () => {
  describe('valid frontmatter parsing', () => {
    it('should parse frontmatter with applyTo as string', () => {
      const content = `---
applyTo: "**/*.ts,**/*.tsx"
---

Instructions content here
`
      const result = parseFrontmatter(content)

      expect(result.frontmatter.applyTo).toBe('**/*.ts,**/*.tsx')
      expect(result.body).toBe('Instructions content here\n')
    })

    it('should parse frontmatter with applyTo as array', () => {
      const content = `---
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
---

Body content
`
      const result = parseFrontmatter(content)

      expect(result.frontmatter.applyTo).toEqual(['**/*.ts', '**/*.tsx'])
      expect(result.body).toBe('Body content\n')
    })

    it('should parse frontmatter with excludeAgent', () => {
      const content = `---
excludeAgent: "code-review"
---

Some instructions
`
      const result = parseFrontmatter(content)

      expect(result.frontmatter.excludeAgent).toBe('code-review')
      expect(result.body).toBe('Some instructions\n')
    })

    it('should parse frontmatter with excludeAgent coding-agent', () => {
      const content = `---
excludeAgent: "coding-agent"
---

Some instructions
`
      const result = parseFrontmatter(content)

      expect(result.frontmatter.excludeAgent).toBe('coding-agent')
    })

    it('should parse frontmatter with both applyTo and excludeAgent', () => {
      const content = `---
applyTo: "**/*.ts"
excludeAgent: "code-review"
---

Instructions
`
      const result = parseFrontmatter(content)

      expect(result.frontmatter.applyTo).toBe('**/*.ts')
      expect(result.frontmatter.excludeAgent).toBe('code-review')
      expect(result.body).toBe('Instructions\n')
    })
  })

  describe('no frontmatter', () => {
    it('should return empty frontmatter and full content as body when no frontmatter exists', () => {
      const content = 'Just some content without frontmatter'

      const result = parseFrontmatter(content)

      expect(result.frontmatter).toEqual({})
      expect(result.body).toBe('Just some content without frontmatter')
    })

    it('should handle content that starts with --- but has no closing ---', () => {
      const content = `---
applyTo: "test"
This is not valid frontmatter because no closing delimiter`

      const result = parseFrontmatter(content)

      expect(result.frontmatter).toEqual({})
      expect(result.body).toBe(content)
    })
  })

  describe('empty frontmatter', () => {
    it('should return empty frontmatter object when frontmatter section is empty', () => {
      const content = `---
---

Body content here
`
      const result = parseFrontmatter(content)

      expect(result.frontmatter).toEqual({})
      expect(result.body).toBe('Body content here\n')
    })

    it('should return empty frontmatter for whitespace-only frontmatter', () => {
      const content = `---
   
---

Body
`
      const result = parseFrontmatter(content)

      expect(result.frontmatter).toEqual({})
      expect(result.body).toBe('Body\n')
    })
  })

  describe('malformed YAML', () => {
    it('should return empty frontmatter for invalid YAML syntax', () => {
      const content = `---
applyTo: [invalid yaml
  - missing bracket
---

Body content
`
      const result = parseFrontmatter(content)

      expect(result.frontmatter).toEqual({})
      expect(result.body).toBe(content)
    })

    it('should handle YAML with invalid indentation gracefully', () => {
      const content = `---
applyTo:
- item1
  - nested wrong
---

Body
`
      const result = parseFrontmatter(content)

      // Should not throw, return empty or partial frontmatter
      expect(result).toBeDefined()
      expect(typeof result.body).toBe('string')
    })
  })

  describe('edge cases', () => {
    it('should handle empty string input', () => {
      const result = parseFrontmatter('')

      expect(result.frontmatter).toEqual({})
      expect(result.body).toBe('')
    })

    it('should handle content with only frontmatter (no body)', () => {
      const content = `---
applyTo: "**/*.ts"
---`
      const result = parseFrontmatter(content)

      expect(result.frontmatter.applyTo).toBe('**/*.ts')
      expect(result.body).toBe('')
    })

    it('should handle content with only frontmatter and trailing newline', () => {
      const content = `---
applyTo: "**/*.ts"
---
`
      const result = parseFrontmatter(content)

      expect(result.frontmatter.applyTo).toBe('**/*.ts')
      // The newline after --- is the delimiter terminator, not body content
      expect(result.body).toBe('')
    })

    it('should not treat --- in body as frontmatter delimiter', () => {
      const content = `---
applyTo: "test"
---

Some content
---
More content after horizontal rule
`
      const result = parseFrontmatter(content)

      expect(result.frontmatter.applyTo).toBe('test')
      expect(result.body).toContain('---')
      expect(result.body).toContain('More content after horizontal rule')
    })

    it('should return empty frontmatter for unquoted glob patterns (invalid YAML)', () => {
      // In YAML, * is an alias indicator, so unquoted glob patterns are invalid
      // Glob patterns MUST be quoted for valid YAML
      const content = `---
applyTo: **/*.ts
---

Body
`
      const result = parseFrontmatter(content)

      // Invalid YAML returns empty frontmatter and original content
      expect(result.frontmatter).toEqual({})
      expect(result.body).toBe(content)
    })

    it('should handle frontmatter with single-quoted string values', () => {
      const content = `---
applyTo: '**/*.ts'
---

Body
`
      const result = parseFrontmatter(content)

      expect(result.frontmatter.applyTo).toBe('**/*.ts')
    })

    it('should ignore unknown frontmatter properties', () => {
      const content = `---
applyTo: "test"
unknownField: "value"
anotherUnknown: 123
---

Body
`
      const result = parseFrontmatter(content)

      expect(result.frontmatter.applyTo).toBe('test')
      expect(result.frontmatter).not.toHaveProperty('unknownField')
      expect(result.frontmatter).not.toHaveProperty('anotherUnknown')
    })

    it('should handle Windows-style line endings (CRLF)', () => {
      const content = '---\r\napplyTo: "test"\r\n---\r\n\r\nBody content\r\n'

      const result = parseFrontmatter(content)

      expect(result.frontmatter.applyTo).toBe('test')
      expect(result.body).toContain('Body content')
    })
  })
})
