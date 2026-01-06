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

### 3. E2E Tests Require Rebuild

When modifying plugin behavior in `src/index.ts`:
- E2E tests run against the compiled `dist/index.js`
- Always run `npm run build` before running E2E tests
- Use `make test-all` to run unit tests + E2E tests with rebuild
