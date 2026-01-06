import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseFrontmatter } from './frontmatter'
import { createMatcher, normalizePatterns, type Matcher } from './matcher'

export interface PathInstruction {
  file: string           // Original file path
  applyTo: string[]      // Glob patterns from frontmatter
  content: string        // Instruction content (without frontmatter)
  matcher: Matcher       // Compiled glob matcher function
}

/**
 * Load repository-wide Copilot instructions from .github/copilot-instructions.md
 *
 * @param directory - The root directory to search in
 * @returns The file content as a string if found, null otherwise
 */
export function loadRepoInstructions(directory: string): string | null {
  const filePath = path.join(directory, '.github', 'copilot-instructions.md')

  try {
    return fs.readFileSync(filePath, 'utf-8')
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
      matcher: createMatcher(patterns)
    })
  }

  return result
}
