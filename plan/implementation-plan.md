# OpenCode Plugin: Copilot Custom Instructions Support

## Project Overview

**Package Name**: `@ekroon/opencode-copilot-instructions`  
**Repository**: https://github.com/ekroon/opencode-copilot-instructions  
**Purpose**: OpenCode plugin that automatically loads GitHub Copilot custom instruction files and injects them into OpenCode's context.

## Background

### GitHub Copilot Custom Instructions

Copilot supports two types of repository custom instructions:

1. **Repository-wide instructions**: `.github/copilot-instructions.md`
   - Applies to all files in the repository
   - Simple markdown file with natural language instructions

2. **Path-specific instructions**: `.github/instructions/*.instructions.md`
   - Applies to files matching specific glob patterns
   - Uses YAML frontmatter with `applyTo` field for pattern matching
   - Example:
     ```markdown
     ---
     applyTo: "**/*.ts,**/*.tsx"
     ---
     
     When writing TypeScript code, always use strict mode...
     ```

### OpenCode Plugin System

OpenCode plugins can:
- Hook into events (`session.created`, `tool.execute.before`, etc.)
- Add custom tools
- Modify behavior before/after tool execution
- Use the SDK client for logging and other operations

Key hooks we'll use:
- `experimental.session.compacting` - Inject repo-wide instructions into compaction context
- `tool.execute.before` - Detect file access and inject path-specific instructions

## Implementation Strategy

### Option C: Dynamic Context Injection (Selected)

- **Repository-wide instructions** → Injected at startup and preserved across session compaction
- **Path-specific instructions** → Injected dynamically when relevant files are accessed

### Key Design Decisions

1. **Load at startup only** - Instructions are loaded once when the plugin initializes. Users can restart OpenCode or manually instruct the agent to re-read files if needed.

2. **No configuration required** - Plugin is enabled simply by adding it to the config. No additional options needed.

3. **npm package** - Publishable to npm, testable via local paths or GitHub URLs.

## Project Structure

```
opencode-copilot-instructions/
├── package.json
├── tsconfig.json
├── README.md
├── .gitignore
├── src/
│   ├── index.ts              # Main plugin export
│   ├── loader.ts             # File loading logic
│   ├── frontmatter.ts        # YAML frontmatter parser
│   └── matcher.ts            # Glob pattern matching
├── plan/
│   └── implementation-plan.md
└── dist/                     # Compiled output (gitignored)
```

## Dependencies

```json
{
  "name": "@ekroon/opencode-copilot-instructions",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "dependencies": {
    "picomatch": "^4.0.0"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "*"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "latest",
    "@types/node": "^22.0.0",
    "typescript": "^5.0.0"
  }
}
```

## Implementation Details

### 1. File Loading (`loader.ts`)

```typescript
// Load .github/copilot-instructions.md
function loadRepoInstructions(directory: string): string | null

// Load all .github/instructions/*.instructions.md files
function loadPathInstructions(directory: string): PathInstruction[]

interface PathInstruction {
  file: string           // Original file path
  applyTo: string[]      // Glob patterns from frontmatter
  content: string        // Instruction content (without frontmatter)
  matcher: Matcher       // Compiled glob matcher function
}
```

### 2. Frontmatter Parsing (`frontmatter.ts`)

Parse YAML frontmatter from instruction files:

```typescript
interface Frontmatter {
  applyTo?: string | string[]
  excludeAgent?: "code-review" | "coding-agent"
}

function parseFrontmatter(content: string): {
  frontmatter: Frontmatter
  body: string
}
```

Frontmatter format:
```yaml
---
applyTo: "**/*.ts,**/*.tsx"
excludeAgent: "code-review"
---
```

### 3. Pattern Matching (`matcher.ts`)

Use `picomatch` for glob pattern matching:

```typescript
import picomatch from "picomatch"

function createMatcher(patterns: string[]): (path: string) => boolean {
  return picomatch(patterns)
}
```

Supported glob patterns (from Copilot docs):
- `*` - All files in current directory
- `**` or `**/*` - All files in all directories
- `*.py` - All `.py` files in current directory
- `**/*.py` - All `.py` files recursively
- `src/**/*.py` - All `.py` files in `src` directory recursively

### 4. Main Plugin (`index.ts`)

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const CopilotInstructionsPlugin: Plugin = async ({ directory, client }) => {
  // Load instructions at startup
  const repoInstructions = loadRepoInstructions(directory)
  const pathInstructions = loadPathInstructions(directory)
  
  // Log what was loaded
  if (repoInstructions) {
    await client.app.log({
      service: "copilot-instructions",
      level: "info",
      message: "Loaded repository-wide Copilot instructions",
    })
  }
  
  if (pathInstructions.length > 0) {
    await client.app.log({
      service: "copilot-instructions",
      level: "info",
      message: `Loaded ${pathInstructions.length} path-specific instruction file(s)`,
    })
  }
  
  // Track injected instructions per session to avoid duplicates
  const injectedPerSession = new Map<string, Set<string>>()

  return {
    // Preserve repo-wide instructions during compaction
    "experimental.session.compacting": async (input, output) => {
      if (repoInstructions) {
        output.context.push(`## Copilot Custom Instructions\n\n${repoInstructions}`)
      }
      
      // Also include any path-specific instructions that were injected
      // (implementation depends on tracking mechanism)
    },
    
    // Inject path-specific instructions when files are accessed
    "tool.execute.before": async (input, output) => {
      if (!["read", "edit", "write"].includes(input.tool)) return
      
      const filePath = output.args?.filePath
      if (!filePath) return
      
      // Convert to relative path for matching
      const relativePath = getRelativePath(directory, filePath)
      
      // Find matching instructions
      const matchingInstructions = pathInstructions.filter(
        inst => inst.matcher(relativePath)
      )
      
      if (matchingInstructions.length > 0) {
        // Inject matching instructions
        // (mechanism TBD - may need to modify output or use SDK)
      }
    },
  }
}
```

## Testing Strategy

### Local Development Testing

1. Build the plugin:
   ```bash
   npm run build
   ```

2. In a test project, add to `opencode.json`:
   ```json
   {
     "plugin": ["file:/path/to/opencode-copilot-instructions"]
   }
   ```

3. Create test instruction files in the test project:
   - `.github/copilot-instructions.md`
   - `.github/instructions/typescript.instructions.md`

4. Start OpenCode and verify:
   - Check logs for "Loaded..." messages
   - Test that instructions affect AI responses

### GitHub URL Testing

After pushing to GitHub:
```json
{
  "plugin": ["github:ekroon/opencode-copilot-instructions"]
}
```

### npm Testing

After publishing:
```json
{
  "plugin": ["@ekroon/opencode-copilot-instructions"]
}
```

## Open Questions / TODOs

### High Priority

1. **Session context for `tool.execute.before`**: Verify what information is available in the hook input. Need session ID to track injected instructions per session.

2. **Path-specific injection mechanism**: Determine the best way to inject path-specific instructions:
   - Option A: Modify tool output to include instructions as context
   - Option B: Use SDK's `session.prompt` with `noReply: true`
   - Option C: Add to a shared context that's included in subsequent prompts

3. **Duplicate prevention**: Implement tracking to avoid injecting the same instructions multiple times in a session.

### Medium Priority

4. **Error handling**: Graceful handling of malformed files, missing directories, invalid YAML.

5. **Logging verbosity**: Consider adding debug-level logging for troubleshooting.

### Low Priority

6. **File watching**: Currently not implemented. Users can restart OpenCode to reload instructions.

7. **Configuration options**: Could add options for:
   - Enabling/disabling repo-wide vs path-specific instructions
   - Custom instruction file paths
   - Logging verbosity

## Implementation Checklist

- [ ] Initialize npm package with `package.json`
- [ ] Set up TypeScript configuration (`tsconfig.json`)
- [ ] Create `.gitignore`
- [ ] Implement `src/frontmatter.ts` - YAML frontmatter parser
- [ ] Implement `src/matcher.ts` - Glob pattern matching
- [ ] Implement `src/loader.ts` - File loading logic
- [ ] Implement `src/index.ts` - Main plugin
- [ ] Write `README.md` with usage instructions
- [ ] Test locally with file: protocol
- [ ] Test with GitHub URL
- [ ] Publish to npm

## References

- [OpenCode Plugin Documentation](https://opencode.ai/docs/plugins/)
- [OpenCode SDK Documentation](https://opencode.ai/docs/sdk/)
- [OpenCode Rules Documentation](https://opencode.ai/docs/rules/)
- [GitHub Copilot Custom Instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
- [picomatch - Glob matching library](https://github.com/micromatch/picomatch)
