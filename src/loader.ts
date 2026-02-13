import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseFrontmatter } from './frontmatter'
import { createMatcher, normalizePatterns, type Matcher } from './matcher'
import { countTokens } from './tokens'

export interface PathInstruction {
  file: string
  applyTo: string[]
  content: string
  matcher: Matcher
  tokenCount: number
}

export interface RepoInstruction {
  content: string
  tokenCount: number
}

/**
 * Load repository-wide Copilot instructions from .github/copilot-instructions.md
 *
 * @param directory - The root directory to search in
 * @returns A RepoInstruction with content and token count if found, null otherwise
 */
export function loadRepoInstructions(directory: string): RepoInstruction | null {
  const filePath = path.join(directory, '.github', 'copilot-instructions.md')

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return {
      content,
      tokenCount: countTokens(content)
    }
  } catch {
    return null
  }
}

/**
 * Load path-specific Copilot instructions from .github/instructions/*.instructions.md
 *
 * @param directory - The root directory to search in
 * @returns Array of PathInstruction objects for each valid instruction file
 */
export function loadPathInstructions(directory: string): PathInstruction[] {
  const instructionsDir = path.join(directory, '.github', 'instructions')

  let files: string[]
  try {
    files = fs.readdirSync(instructionsDir)
  } catch {
    return []
  }

  const result: PathInstruction[] = []

  for (const filename of files) {
    // Only process *.instructions.md files
    if (!filename.endsWith('.instructions.md')) {
      continue
    }

    const filePath = path.join(instructionsDir, filename)

    let content: string
    try {
      content = fs.readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }

    const parsed = parseFrontmatter(content)
    const patterns = normalizePatterns(parsed.frontmatter.applyTo)

    // Skip files without applyTo patterns
    if (patterns.length === 0) {
      continue
    }

    result.push({
      file: filePath,
      applyTo: patterns,
      content: parsed.body,
      matcher: createMatcher(patterns),
      tokenCount: countTokens(parsed.body)
    })
  }

  return result
}
