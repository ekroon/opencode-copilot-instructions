import picomatch from 'picomatch'

export type Matcher = (path: string) => boolean

/**
 * Creates a matcher function that tests paths against glob patterns.
 * Returns a function that returns true if the path matches any of the patterns.
 *
 * @param patterns - Array of glob patterns to match against
 * @returns A function that tests if a path matches any pattern
 */
export function createMatcher(patterns: string[]): Matcher {
  if (patterns.length === 0) {
    return () => false
  }

  const isMatch = picomatch(patterns)
  return (path: string) => isMatch(path)
}

/**
 * Normalizes the applyTo field from frontmatter into an array of patterns.
 * Handles undefined, single strings, comma-separated strings, and arrays.
 *
 * @param applyTo - The applyTo value from frontmatter
 * @returns Normalized array of patterns
 */
export function normalizePatterns(applyTo: string | string[] | undefined): string[] {
  if (applyTo === undefined) {
    return []
  }

  if (Array.isArray(applyTo)) {
    return applyTo
  }

  // Handle string input - split by comma and trim whitespace
  return applyTo
    .split(',')
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0)
}
