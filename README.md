# Claude Habitat

Autonomous AI programming environments that are isolated, reproducible, and ready for Claude Code.

## Quick Start

```bash
# Clone and setup
git clone <repo-url> && cd claude-habitat && npm install

# Try the example
./claude-habitat discourse

# Or create your own (with AI assistance)
./claude-habitat add
```

## What You Get

When "Habitat" Claude runs in a container:
- **Complete isolation** from your host system
- **All development tools** pre-installed (`rg`, `fd`, `jq`, `yq`, `gh`, etc.)
- **Project code** cloned and ready
- **Services running** (databases, caches as needed)
- **Your personal preferences** from `shared/` directory

## 🎯 Architecture

**System overview**: [claude-habitat.js](claude-habitat.js) - Complete project architecture and subsystem composition

**Domain model**: [src/types.js](src/types.js) - Core concepts, terminology, and design patterns

**Build pipeline**: [src/phases.js](src/phases.js) - 12-phase progressive build system with intelligent caching

## 📋 Testing

### Quick Testing Commands
```bash
# Unit tests (run continuously during development)
npm test
npm run test:watch

# End-to-end tests (run before releases)
npm run test:e2e

# UI snapshot testing (run after UI changes)
npm run test:ui
npm run test:ui:view  # Generate and review snapshots

# Habitat-specific tests
./claude-habitat test base --system
./claude-habitat test discourse --all
```

### Testing Architecture
- **Unit tests**: Individual modules and functions (`test/unit/`)
- **E2E tests**: Complete user workflows (`test/e2e/`)
- **Habitat tests**: Environment-specific validation
- **UI snapshots**: Interactive flow verification

### Test Sequences
Simulate user interactions for UI testing:
```bash
./claude-habitat --test-sequence="q"     # Main menu
./claude-habitat --test-sequence="tq"    # Navigate to test menu
./claude-habitat --test-sequence="t2f"   # Test filesystem verification
./claude-habitat --test-sequence="h"     # Help display
```

## 🔧 Development Lifecycle

### Standard Workflow
1. **Understand**: Search codebase with `rg`, research best practices
2. **Plan**: Create todos, break down work, consider dependencies
3. **Test First**: Write unit/E2E tests before implementing
4. **Implement**: Start small, follow conventions, document with JSDoc
5. **Verify**: Full test suite, UI snapshots, manual testing
6. **Document**: Update CLAUDE.md for user-visible changes

### Code Quality Standards
- **Domain-driven naming**: Use terminology from [src/types.js](src/types.js)
- **Pure functions**: Prefer data transformation over stateful operations
- **Functional composition**: Small, focused modules with single responsibilities
- **Path resolution**: Use `rel()` for host paths, see [src/utils.js](src/utils.js)
- **Error handling**: Always provide actionable next steps

## 📁 Directory Structure

- **[`claude-habitat.js`](claude-habitat.js)** - Main entry point and architectural overview
- **[`src/`](src/)** - Core application modules with contextual JSDoc documentation
- **`claude/`** - Meta Claude instructions (maintenance, habitat creation)
- **`system/`** - Infrastructure managed by Claude Habitat (tools, base config)
- **`shared/`** - Your personal preferences across all projects
- **`habitats/`** - Individual project development environments
- **`test/`** - Comprehensive test suite (unit, E2E, UI)

## 🚀 Communication Preferences

### For Claude Working in This Codebase
- **Be concise**: Answer directly without unnecessary preamble
- **Focus on requests**: Address specific tasks, avoid tangential information
- **Self-document**: Use JSDoc extensively, link to related modules
- **Create proposals**: For improvements, create `claude/scratch/[name].md` proposals
- **Follow standards**: Use existing patterns, naming conventions, and architecture

Perfect for autonomous AI development without risk! 🤖
