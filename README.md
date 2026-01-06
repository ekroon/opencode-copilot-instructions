# @ekroon/opencode-copilot-instructions

An OpenCode plugin that automatically loads GitHub Copilot custom instruction files and injects them into OpenCode's context.

## Installation

### From npm (recommended)

Add the plugin to your `opencode.json`:

```json
{
  "plugin": ["@ekroon/opencode-copilot-instructions"]
}
```

OpenCode will automatically install the package from npm on startup.

### From local files

For development or customization, you can use the local plugin approach:

1. Create `.opencode/plugin/` directory in your project
2. Bundle the plugin: `bun build ./src/index.ts --outfile=.opencode/plugin/copilot.js --target=node --external:@opencode-ai/plugin`
3. Create `.opencode/package.json` with dependencies:

```json
{
  "dependencies": {
    "front-matter": "^4.0.2",
    "picomatch": "^4.0.0"
  }
}
```

4. Run `bun install` in the `.opencode/` directory

## Usage

This plugin supports two types of GitHub Copilot instruction files:

### Repository-wide Instructions

Create `.github/copilot-instructions.md` in your repository root. These instructions apply to all files and are included in every session.

```markdown
# Project Guidelines

- Use TypeScript strict mode
- Prefer functional programming patterns
- Write comprehensive tests for all new code
```

### Path-specific Instructions

Create files matching `.github/instructions/*.instructions.md`. These instructions only apply when working with files that match the specified glob patterns.

Each file requires YAML frontmatter with an `applyTo` field:

```markdown
---
applyTo: "**/*.ts,**/*.tsx"
---

When writing TypeScript code:

- Always use explicit return types
- Prefer interfaces over type aliases for object shapes
- Use branded types for IDs
```

The `applyTo` field accepts a comma-separated list of glob patterns.

## How it Works

### Loading

Instructions are loaded once when the plugin initializes (at OpenCode startup). To reload instructions after changes, restart OpenCode.

### Injection

- **Repository-wide instructions**: Injected via the `experimental.session.compacting` hook, ensuring they persist across session compaction.

- **Path-specific instructions**: Injected via the `tool.execute.before` hook when file operations (read, edit, write) target files matching the `applyTo` patterns.

## Supported Glob Patterns

The plugin uses [picomatch](https://github.com/micromatch/picomatch) for pattern matching. Supported patterns include:

| Pattern | Description |
|---------|-------------|
| `*` | All files in current directory |
| `**` or `**/*` | All files in all directories |
| `*.py` | All `.py` files in current directory |
| `**/*.py` | All `.py` files recursively |
| `src/**/*.py` | All `.py` files in `src` directory recursively |
| `**/*.{ts,tsx}` | All `.ts` and `.tsx` files recursively |

Multiple patterns can be combined with commas: `**/*.ts,**/*.tsx,**/*.js`

## License

MIT
