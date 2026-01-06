---
status: pending
priority: low
---

# Architecture Improvements Plan

## Overview

Improve codebase architecture following Gang of Four design patterns for better extensibility and testability.

## Tasks

### 1. Dependency Injection for FileSystem (High Priority)

**Problem**: `fs` and `path` hardcoded in `src/loader.ts`, making unit testing difficult.

**Solution**: Inject FileSystem interface:

```typescript
interface FileSystem {
  readFile(path: string): string | null
  readDir(path: string): string[]
  exists(path: string): boolean
}

// Default implementation
const nodeFs: FileSystem = {
  readFile: (p) => fs.readFileSync(p, 'utf-8'),
  readDir: (p) => fs.readdirSync(p),
  exists: (p) => fs.existsSync(p)
}
```

- [ ] Create `src/filesystem.ts` with interface and default implementation
- [ ] Update `loader.ts` to accept FileSystem as parameter
- [ ] Update tests to use mock FileSystem

### 2. Strategy Pattern for Tool Path Extraction (Medium Priority)

**Problem**: `FILE_TOOLS` set is hardcoded; adding new tools requires code modification.

**Solution**: Extract `ToolPathExtractor` strategy:

```typescript
interface ToolPathExtractor {
  canHandle(toolName: string): boolean
  extractPath(args: unknown): string | null
}

const defaultExtractors: ToolPathExtractor[] = [
  {
    canHandle: (name) => ['read', 'edit', 'write'].includes(name),
    extractPath: (args) => (args as { filePath?: string })?.filePath ?? null
  }
]
```

- [ ] Create `src/tool-extractor.ts`
- [ ] Make extractors configurable via plugin options
- [ ] Write tests for custom extractors

### 3. Extract InstructionFormatter (Medium Priority)

**Problem**: Instruction formatting duplicated in multiple places.

**Solution**: Template Method pattern:

```typescript
interface InstructionFormatter {
  formatRepoInstruction(content: string): string
  formatPathInstruction(instruction: PathInstruction): string
}

const defaultFormatter: InstructionFormatter = {
  formatRepoInstruction: (content) => 
    `## Copilot Custom Instructions\n\n${content}`,
  formatPathInstruction: (inst) =>
    `<copilot-instruction:${basename(inst.file)}>\n## Path-Specific Instructions (applies to: ${inst.applyTo.join(', ')})\n\n${inst.content.trimEnd()}\n</copilot-instruction:${basename(inst.file)}>`
}
```

- [ ] Create `src/formatter.ts`
- [ ] Remove duplicate format strings from `index.ts`
- [ ] Make formatter configurable for custom formats

### 4. Configuration/Registry Pattern (Medium Priority)

**Problem**: Multiple hardcoded values violate Open/Closed principle.

**Solution**: Centralize configuration:

```typescript
interface PluginConfig {
  fileTools: string[]
  repoInstructionsPath: string
  pathInstructionsDir: string
  instructionFormatter?: InstructionFormatter
  toolExtractors?: ToolPathExtractor[]
}

const defaultConfig: PluginConfig = {
  fileTools: ['read', 'edit', 'write'],
  repoInstructionsPath: '.github/copilot-instructions.md',
  pathInstructionsDir: '.github/instructions'
}
```

- [ ] Create `src/config.ts` with defaults
- [ ] Update plugin to accept partial config
- [ ] Document configuration options in README

### 5. Separate Data from Behavior (Low Priority)

**Problem**: `PathInstruction` combines data and compiled matcher.

**Solution**: Interface segregation:

```typescript
// Pure data
interface PathInstructionData {
  file: string
  applyTo: string[]
  content: string
}

// With behavior (created by factory)
interface PathInstruction extends PathInstructionData {
  matcher: Matcher
  filename: string  // Computed from file
}
```

- [ ] Update interfaces in `src/loader.ts`
- [ ] Create factory function for PathInstruction creation

### 6. Command Pattern for Injection (Low Priority)

**Problem**: Injection logic scattered across multiple hooks.

**Solution**: Encapsulate as command:

```typescript
interface InjectCommand {
  prepare(input: ToolInput): void
  execute(output: ToolOutput): ToolOutput
  cleanup(messages: Message[]): void
}
```

- [ ] Create `src/inject-command.ts`
- [ ] Simplify hook implementations to delegate to command

## Acceptance Criteria

- FileSystem is injectable for testing
- New tools can be supported via configuration, not code changes
- Instruction format is customizable
- Core plugin accepts configuration object
- No hardcoded paths or tool names in main logic
