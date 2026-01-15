.PHONY: test test-unit test-e2e test-all build clean install lint

# =============================================================================
# Test Targets
# =============================================================================
# This project has 2 types of tests:
#   1. Unit tests (src/*.test.ts except e2e.test.ts) - fast, no external deps
#   2. E2E tests (src/e2e.test.ts) - requires OpenCode, makes real LLM calls
#
# Expected test counts:
#   - Unit tests: ~140 tests across 6 files
#   - E2E tests: 9 tests
# =============================================================================

# Run unit tests only (excludes E2E) - use this for quick iteration
test: build test-unit

# Run unit tests without rebuild
test-unit:
	npm test

# Run ALL E2E tests (requires API keys configured)
# This includes LLM integration tests and the export debug test
# Note: Creates e2e-export.json in project root (can be gitignored)
# Expected: 9 passed
test-e2e: build
	OPENCODE_E2E=true OPENCODE_EXPORT_TEST=true npm run test:e2e

# Run ALL tests (unit + E2E)
# This is what CI should run and what "run all tests" means.
# Expected output:
#   - First run (npm run test:all): unit tests pass, E2E tests skipped
#   - Second run (OPENCODE_E2E=true): all 9 E2E tests pass
test-all: build
	npm run test:all
	OPENCODE_E2E=true OPENCODE_EXPORT_TEST=true npm run test:e2e

# Build the project
build:
	npm run build

# Install dependencies
install:
	npm install

# Clean build artifacts
clean:
	rm -rf dist e2e-export.json

# Lint the code
lint:
	npm run lint

# Release helpers
release-patch:
	./scripts/release.sh patch

release-minor:
	./scripts/release.sh minor

release-major:
	./scripts/release.sh major
