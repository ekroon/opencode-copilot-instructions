import { type Matcher } from './matcher.js';
export interface PathInstruction {
    file: string;
    applyTo: string[];
    content: string;
    matcher: Matcher;
}
/**
 * Load repository-wide Copilot instructions from .github/copilot-instructions.md
 *
 * @param directory - The root directory to search in
 * @returns The file content as a string if found, null otherwise
 */
export declare function loadRepoInstructions(directory: string): string | null;
/**
 * Load path-specific Copilot instructions from .github/instructions/*.instructions.md
 *
 * @param directory - The root directory to search in
 * @returns Array of PathInstruction objects for each valid instruction file
 */
export declare function loadPathInstructions(directory: string): PathInstruction[];
//# sourceMappingURL=loader.d.ts.map