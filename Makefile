.PHONY: test test-unit test-e2e test-all build clean install lint

# Run unit tests only (excludes E2E)
test: test-unit

# Run unit tests
test-unit:
	npm test

# Run E2E tests (requires OPENCODE_E2E=true)
test-e2e:
	OPENCODE_E2E=true npm run test:e2e

# Run all tests (unit + E2E)
test-all:
	npm run test:all
	OPENCODE_E2E=true npm run test:e2e

# Build the project
build:
	npm run build

# Install dependencies
install:
	npm install

# Clean build artifacts
clean:
	rm -rf dist

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
