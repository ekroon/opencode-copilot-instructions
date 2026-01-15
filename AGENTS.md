# Agent Instructions

## Orchestration Pattern

When working on this codebase, follow these principles:

### 1. Always Orchestrate (Unless Being Orchestrated)

If you are the primary agent handling a user request:
- Break down complex tasks into smaller, well-defined subtasks
- Use subagents to handle each subtask
- Coordinate the results and ensure integration

If you are already being orchestrated by another agent:
- Focus on completing your specific assigned task
- Do not spawn additional orchestration layers
- Return clear, concise results to the orchestrating agent

### 2. Test-Driven Development (TDD)

All implementation work MUST follow TDD:

1. **Write Tests First**: Before implementing any functionality, write failing tests that describe the expected behavior
2. **Run Tests to Verify Failure**: Confirm the tests fail for the right reasons
3. **Implement Minimal Code**: Write just enough code to make the tests pass
4. **Refactor**: Clean up the code while keeping tests green
5. **Repeat**: Continue the cycle for each piece of functionality

### TDD Workflow for Each Module

```
1. Create test file (e.g., src/frontmatter.test.ts)
2. Write test cases covering:
   - Happy path scenarios
   - Edge cases
   - Error handling
3. Run tests - verify they fail
4. Create implementation file (e.g., src/frontmatter.ts)
5. Implement until tests pass
6. Refactor if needed
```

### Test Structure

Use Vitest for testing. Tests should:
- Be descriptive with clear test names
- Test one concept per test
- Use arrange-act-assert pattern
- Include both positive and negative test cases

### File Organization

```
src/
├── index.ts              # Main plugin export
├── index.test.ts         # Plugin integration tests
├── loader.ts             # File loading logic
├── loader.test.ts        # Loader tests
├── frontmatter.ts        # YAML frontmatter parser
├── frontmatter.test.ts   # Frontmatter tests
├── matcher.ts            # Glob pattern matching
└── matcher.test.ts       # Matcher tests
```

### Implementation Order

Follow this sequence to ensure proper dependency management:

1. `frontmatter.ts` - No internal dependencies
2. `matcher.ts` - No internal dependencies
3. `loader.ts` - Depends on frontmatter and matcher
4. `index.ts` - Depends on loader

Each module should be fully tested before moving to the next.

### 3. Test Types and Running Tests

This project has **2 types of tests**:

| Type | Location | Description | Requirements |
|------|----------|-------------|--------------|
| **Unit tests** | `src/*.test.ts` (except e2e) | Fast tests, no external deps | None |
| **E2E tests** | `src/e2e.test.ts` | Full integration with OpenCode | API keys configured |

#### Running Tests via Makefile

| Command | Description | Expected Output |
|---------|-------------|-----------------|
| `make test` | Build + run unit tests | ~140 tests pass |
| `make test-unit` | Run unit tests only (no build) | ~140 tests pass |
| `make test-e2e` | Build + run E2E tests | 9 pass |
| `make test-all` | Build + unit + E2E tests | All tests pass |

**When asked to "run E2E tests"**, use `make test-e2e`. This runs the full E2E test suite with real LLM calls.

**When asked to "run all tests"**, use `make test-all`. This runs both unit and E2E tests.

#### E2E Test Details

The E2E tests in `src/e2e.test.ts` include:
- **Repo-wide instructions** - verifies system prompt injection
- **Path-specific instructions** - verifies tool output injection
- **Deduplication** - verifies instructions only inject once per session
- **Undo/Revert flow** - verifies re-injection after undo
- **Compaction** - verifies re-injection after session compaction

E2E tests require:
- OpenCode installed
- API keys configured (uses `github-copilot` provider with `claude-haiku-4.5`)
- Plugin built (`dist/index.js` must exist)

#### Why E2E Tests Show "Skipped"

- `make test-all` runs tests twice: once without `OPENCODE_E2E=true` (E2E skipped), once with it (E2E runs)
- Expected: "9 passed" for `make test-e2e`

### 4. E2E Tests Require Rebuild

When modifying plugin behavior in `src/index.ts`:
- E2E tests run against the compiled `dist/index.js`
- Always run `npm run build` before running E2E tests
- The Makefile targets handle this automatically

### 5. Manual Testing with OpenCode

When manually testing the plugin with OpenCode, use the `XDG_CONFIG_HOME` override to avoid loading the global config (which may also have the plugin installed, causing duplicate instruction injection):

```bash
XDG_CONFIG_HOME=/tmp opencode
```

This ensures only the local project's `opencode.json` is loaded, which references the local build at `dist/index.js`.

To verify the correct config is loaded:
```bash
XDG_CONFIG_HOME=/tmp opencode debug config
```

The `plugin` array should only contain the local file path, not the npm package.
