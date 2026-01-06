import * as frontMatter from 'front-matter'

// Handle both ESM and CommonJS module formats
const fm = (frontMatter as any).default ?? frontMatter

export interface Frontmatter {
  applyTo?: string | string[]
  excludeAgent?: "code-review" | "coding-agent"
}

export interface ParsedContent {
  frontmatter: Frontmatter
  body: string
}

interface RawFrontmatter {
  applyTo?: unknown
  excludeAgent?: unknown
}

/**
 * Parses YAML frontmatter from markdown-style content.
 * Frontmatter must be delimited by --- at the start of the file.
 */
export function parseFrontmatter(content: string): ParsedContent {
  // Normalize line endings to \n for consistent parsing
  const normalized = content.replace(/\r\n/g, '\n')

  // Check if content has frontmatter
  if (!fm.test(normalized)) {
    return {
      frontmatter: {},
      body: content
    }
  }

  try {
    const parsed = fm(normalized) as { attributes: RawFrontmatter; body: string }
    const attrs = parsed.attributes

    // Extract only known properties with validation
    const result: Frontmatter = {}

    if (attrs.applyTo !== undefined) {
      // Accept string or array of strings
      if (typeof attrs.applyTo === 'string') {
        result.applyTo = attrs.applyTo
      } else if (Array.isArray(attrs.applyTo)) {
        result.applyTo = attrs.applyTo.filter((item: unknown): item is string => typeof item === 'string')
      }
    }

    if (attrs.excludeAgent !== undefined) {
      const agent = attrs.excludeAgent
      if (agent === 'code-review' || agent === 'coding-agent') {
        result.excludeAgent = agent
      }
    }

    return {
      frontmatter: result,
      body: parsed.body
    }
  } catch {
    // Malformed YAML - return original content as body
    return {
      frontmatter: {},
      body: content
    }
  }
}
