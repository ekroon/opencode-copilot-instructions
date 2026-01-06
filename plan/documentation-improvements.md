---
status: pending
priority: medium
---

# Documentation Improvements Plan

## Overview

Improve documentation for better developer experience and contributor onboarding.

## Tasks

### 1. README.md Enhancements

- [ ] Add API documentation for programmatic use
- [ ] Add troubleshooting section for common issues
- [ ] Add version compatibility info (OpenCode versions)
- [ ] Add visual directory structure example showing `.github/` layout
- [ ] Add link to changelog/releases

### 2. AGENTS.md Enhancements

- [ ] Document test commands (`npm test`, `make test`, `make test-e2e`)
- [ ] Document build command (`npm run build`)
- [ ] Document linting/formatting instructions
- [ ] Add dependency installation step (`npm install`)
- [ ] Update file organization tree to reflect current structure

### 3. JSDoc for Exported Functions

Add JSDoc comments to:

- [ ] `src/index.ts:40` - `CopilotInstructionsPlugin` main export
- [ ] `src/index.ts:57` - `log` function (explain log levels)
- [ ] `src/index.ts:96` - `event` handler
- [ ] `src/index.ts:136` - `experimental.session.compacting` hook
- [ ] `src/index.ts:142` - `tool.execute.before` hook
- [ ] `src/index.ts:191` - `tool.execute.after` hook
- [ ] `src/index.ts:203` - `experimental.chat.messages.transform` hook

### 4. Code Comments

- [ ] `src/index.ts:84-92` - Add explanatory comment for tracking state (injectedPerSession, repoInstructionsInjected, pendingInstructions)
- [ ] `src/frontmatter.ts:8` - Document `excludeAgent` property or remove if unused
- [ ] `src/loader.ts:66-68` - Document silent skip behavior for files without `applyTo`

### 5. Optional: Additional Documentation Files

- [ ] Consider adding CONTRIBUTING.md for contributor workflow
- [ ] Consider adding API.md for exported interfaces

## Acceptance Criteria

- All public exports have JSDoc with description, params, and return types
- README has clear installation, usage, and troubleshooting sections
- New contributors can set up and run tests from AGENTS.md alone
