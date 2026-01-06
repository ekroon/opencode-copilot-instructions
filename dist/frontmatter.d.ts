export interface Frontmatter {
    applyTo?: string | string[];
    excludeAgent?: "code-review" | "coding-agent";
}
export interface ParsedContent {
    frontmatter: Frontmatter;
    body: string;
}
/**
 * Parses YAML frontmatter from markdown-style content.
 * Frontmatter must be delimited by --- at the start of the file.
 */
export declare function parseFrontmatter(content: string): ParsedContent;
//# sourceMappingURL=frontmatter.d.ts.map