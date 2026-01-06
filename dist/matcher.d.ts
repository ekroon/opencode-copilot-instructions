export type Matcher = (path: string) => boolean;
/**
 * Creates a matcher function that tests paths against glob patterns.
 * Returns a function that returns true if the path matches any of the patterns.
 *
 * @param patterns - Array of glob patterns to match against
 * @returns A function that tests if a path matches any pattern
 */
export declare function createMatcher(patterns: string[]): Matcher;
/**
 * Normalizes the applyTo field from frontmatter into an array of patterns.
 * Handles undefined, single strings, comma-separated strings, and arrays.
 *
 * @param applyTo - The applyTo value from frontmatter
 * @returns Normalized array of patterns
 */
export declare function normalizePatterns(applyTo: string | string[] | undefined): string[];
//# sourceMappingURL=matcher.d.ts.map