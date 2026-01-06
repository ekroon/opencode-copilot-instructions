#!/bin/bash
set -e

# Release script for @ekroon/opencode-copilot-instructions
# Usage: ./scripts/release.sh <version>
# Examples:
#   ./scripts/release.sh 0.2.0
#   ./scripts/release.sh patch
#   ./scripts/release.sh minor
#   ./scripts/release.sh major

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${GREEN}==>${NC} $1"
}

print_error() {
    echo -e "${RED}Error:${NC} $1" >&2
}

print_warning() {
    echo -e "${YELLOW}Warning:${NC} $1"
}

# Validate version argument is provided
if [ -z "$1" ]; then
    print_error "Version argument is required"
    echo "Usage: $0 <version>"
    echo "Examples:"
    echo "  $0 0.2.0"
    echo "  $0 patch"
    echo "  $0 minor"
    echo "  $0 major"
    exit 1
fi

VERSION_ARG="$1"

# Validate version argument format
if [[ ! "$VERSION_ARG" =~ ^(patch|minor|major|[0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
    print_error "Invalid version argument: $VERSION_ARG"
    echo "Must be 'patch', 'minor', 'major', or a valid semver (e.g., 0.2.0)"
    exit 1
fi

# Ensure we're in the project root
cd "$(dirname "$0")/.."

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --staged --quiet; then
    print_error "You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Step 1: Run tests
print_step "Running tests..."
npm test

# Step 2: Bump version in package.json
print_step "Bumping version with: npm version $VERSION_ARG --no-git-tag-version"
npm version "$VERSION_ARG" --no-git-tag-version

# Step 3: Get the new version from package.json
NEW_VERSION=$(node -p "require('./package.json').version")
print_step "New version: $NEW_VERSION"

# Step 4: Commit the version bump
print_step "Creating commit: Release v$NEW_VERSION"
git add package.json package-lock.json
git commit -m "Release v$NEW_VERSION"

# Step 5: Create git tag
print_step "Creating git tag: v$NEW_VERSION"
git tag "v$NEW_VERSION"

# Step 6: Push commit and tag to origin
print_step "Pushing commit and tag to origin..."
git push origin
git push origin "v$NEW_VERSION"

# Step 7: Create GitHub release
print_step "Creating GitHub release..."
gh release create "v$NEW_VERSION" \
    --title "v$NEW_VERSION" \
    --generate-notes

print_step "Release v$NEW_VERSION completed successfully!"
echo ""
echo "The GitHub release has been created, which will trigger the publish workflow."
echo "Check the Actions tab for the publish status."
