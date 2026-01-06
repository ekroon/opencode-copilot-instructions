import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import { createMatcher, normalizePatterns } from './matcher.js';
/**
 * Load repository-wide Copilot instructions from .github/copilot-instructions.md
 *
 * @param directory - The root directory to search in
 * @returns The file content as a string if found, null otherwise
 */
export function loadRepoInstructions(directory) {
    const filePath = path.join(directory, '.github', 'copilot-instructions.md');
    try {
        return fs.readFileSync(filePath, 'utf-8');
    }
    catch {
        return null;
    }
}
/**
 * Load path-specific Copilot instructions from .github/instructions/*.instructions.md
 *
 * @param directory - The root directory to search in
 * @returns Array of PathInstruction objects for each valid instruction file
 */
export function loadPathInstructions(directory) {
    const instructionsDir = path.join(directory, '.github', 'instructions');
    let files;
    try {
        files = fs.readdirSync(instructionsDir);
    }
    catch {
        return [];
    }
    const result = [];
    for (const filename of files) {
        // Only process *.instructions.md files
        if (!filename.endsWith('.instructions.md')) {
            continue;
        }
        const filePath = path.join(instructionsDir, filename);
        let content;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        }
        catch {
            continue;
        }
        const parsed = parseFrontmatter(content);
        const patterns = normalizePatterns(parsed.frontmatter.applyTo);
        // Skip files without applyTo patterns
        if (patterns.length === 0) {
            continue;
        }
        result.push({
            file: filePath,
            applyTo: patterns,
            content: parsed.body,
            matcher: createMatcher(patterns)
        });
    }
    return result;
}
//# sourceMappingURL=loader.js.map