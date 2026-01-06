---
status: pending
priority: high
---

# Clean Code Improvements Plan

## Overview

Refactor codebase following Uncle Bob's Clean Code principles for better maintainability and readability.

## Tasks

### 1. Extract SessionState Class (High Priority)

**Problem**: `src/index.ts:85-92` uses 3 separate Maps/Sets for state tracking, creating complex coupling.

**Solution**: Extract into a `SessionState` class:

```typescript
class SessionState {
  private injectedPerSession = new Map<string, Set<string>>()
  private repoInstructionsInjected = new Set<string>()
  private pendingInstructions = new Map<string, string>()

  markFileInjected(sessionId: string, filename: string): void
  isFileInjected(sessionId: string, filename: string): boolean
  clearFileMarker(sessionId: string, filename: string): void
  // ... etc
}
```

- [ ] Create `src/session-state.ts`
- [ ] Write tests first (TDD)
- [ ] Migrate state management from `index.ts`

### 2. Fix Type Safety (High Priority)

**Problem**: `src/index.ts:106` uses `(event.properties as any)?.info?.id`

**Solution**: Define proper event types:

- [ ] Create event type discriminated union or interface
- [ ] Remove all `as any` casts
- [ ] Add type guards where needed

### 3. Reduce Function Size (Medium Priority)

**Problem**: `CopilotInstructionsPlugin` is ~200 lines, violating SRP.

**Solution**: Extract focused helper functions:

- [ ] Extract `formatInstructionText(instructions: PathInstruction[]): string`
- [ ] Extract `handleSessionCreated(event, ctx): void`
- [ ] Extract `handleFileToolBefore(input, ctx): void`
- [ ] Extract `handleFileToolAfter(input, output): ToolOutput`

### 4. Flatten Nested Conditionals (Medium Priority)

**Problem**: `src/index.ts:100-131` has 4 levels of nesting.

**Solution**: Use early returns:

```typescript
// Before
if (event.type === 'session.created') {
  if (event.properties) {
    if (sessionId) {
      // ...
    }
  }
}

// After
if (event.type !== 'session.created') return
if (!event.properties) return
const sessionId = ...
if (!sessionId) return
// ...
```

- [ ] Refactor event handler with early returns
- [ ] Refactor tool.execute.before with early returns

### 5. Extract Named Constants (Medium Priority)

**Problem**: Magic strings like `FILE_TOOLS` at line 24.

**Solution**:

- [ ] Add comment explaining *why* these specific tools
- [ ] Consider making configurable via plugin options

### 6. Fix Silent Error Handling (Medium Priority)

**Problem**: `src/loader.ts:58-60` swallows errors silently.

**Solution**:

- [ ] Log warning when file read fails
- [ ] Log warning for malformed YAML in frontmatter

### 7. DRY Violations (Low Priority)

**Problem**: `path.basename(instruction.file)` repeated 3 times.

**Solution**:

- [ ] Add `filename` property to `PathInstruction` interface, OR
- [ ] Create helper function `getInstructionFilename(instruction)`

### 8. Consistent Null Handling (Low Priority)

**Problem**: `loadRepoInstructions` returns `null`, `loadPathInstructions` returns `[]`.

**Solution**:

- [ ] Standardize on one approach (prefer empty array/string over null)
- [ ] Or use Result type for explicit error handling

## Acceptance Criteria

- No `as any` type casts in codebase
- No function longer than 50 lines
- No nesting deeper than 2 levels
- All errors logged, not silently swallowed
- State management encapsulated in SessionState class
