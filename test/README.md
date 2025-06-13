# Claude Habitat Test Suite

This directory contains comprehensive test coverage organized by performance and scope to optimize development workflows. All test files include JSDoc preambles explaining their purpose, testing approach, and execution commands.

## Test Categories

### 🚀 Unit Tests (`test/unit/`)
**Fast tests for development cycles (< 5 seconds)**
- Pure functions and business logic
- No external dependencies (Docker, network, file system)
- Run on every code change

```bash
npm test              # Default: runs unit tests only
node --test test/unit/*.js  # Explicit unit test run
```

**Files:**
- `claude-habitat.test.js` - Core functionality, cache hashing, repository parsing
- `cli-commands.test.js` - CLI command parsing and execution behaviors
- `colors.test.js` - Terminal color formatting utilities
- `command-builders.test.js` - Docker command argument construction
- `config-validation.test.js` - Habitat configuration validation system
- `filesystem-verification.test.js` - Filesystem verification and operations
- `github-pure.test.js` - Pure GitHub utility functions
- `github-system-tools.test.js` - GitHub system tools integration
- `habitat-detection.test.js` - Habitat detection and path resolution
- `main-entry-point.test.js` - Main application entry point validation
- `menu.test.js` - Interactive menu system functionality
- `path-helpers.test.js` - Habitat path helper utilities
- `tilde-menu.test.js` - Tilde-based menu navigation system
- `verify-fs.test.js` - Filesystem verification script testing

### 🐳 End-to-End Tests (`test/e2e/`)
**Comprehensive workflow tests with full system integration (30+ seconds)**
- Full Docker container lifecycle
- Complete habitat workflows
- Authentication and repository access
- UI and CLI interaction flows
- Run before releases or major deployments

```bash
npm run test:e2e               # All E2E tests
npm run test:e2e -- test/e2e/specific.test.js  # Specific test
```

**Files:**
- `base-habitat-product.test.js` - Base habitat lifecycle and performance validation
- `build-failures.test.js` - Build failure handling and error recovery workflows
- `claude-authentication.test.js` - Claude authentication and API connectivity
- `claude-in-habitat.test.js` - Claude execution within habitat containers
- `e2e.test.js` - Core CLI and configuration functionality
- `environment-consistency.test.js` - Environment variable consistency across layers
- `github-functions.test.js` - GitHub integration and repository access workflows
- `rebuild-functionality.test.js` - Container rebuild and caching functionality
- `repository-access.test.js` - Repository access verification workflows
- `ui-colors.test.js` - UI color rendering and terminal formatting
- `ui-sequences.test.js` - UI sequence execution and error handling
- `ui-verification.test.js` - UI testing methodology and gap analysis

**Performance Notes:**
- Downloads Docker images (ubuntu:22.04, ~29MB)
- Runs apt-get operations inside containers
- Creates and destroys actual Docker containers
- Tests real GitHub API integration
- May download system tools (gh, rg, fd, etc.) if not present

### 🏠 Habitat Tests
**Environment-specific tests for different habitat configurations**
- System tests validate infrastructure and tool availability
- Shared tests validate user configuration and environment setup
- Habitat tests validate specific project environment configurations

```bash
./claude-habitat test --system      # System infrastructure tests
./claude-habitat test --shared      # User configuration tests  
./claude-habitat test discourse     # Specific habitat tests
./claude-habitat test --all         # All habitat tests
```

**System Tests (`system/tests/`):**
- `test-core-tools.sh` - Core system tools availability (rg, fd, jq, yq, gh)
- `test-file-operations.sh` - File operations and directory structure validation
- `test-git-auth.sh` - GitHub App authentication configuration

**Shared Tests (`shared/tests/`):**
- `test-user-config.sh` - User configuration and shared environment validation

**Habitat-Specific Tests (`habitats/*/tests/`):**
- `discourse/tests/test-discourse-setup.sh` - Discourse development environment
- `claude-habitat/tests/test-tools-and-auth.sh` - Self-hosting tools and authentication
- `claude-habitat/tests/test-claude-habitat-inception.sh` - Self-hosting validation

## Development Workflow

### 🔄 During Active Development
```bash
npm test                    # Fast unit tests only
node --test test/unit/*.js  # Explicit unit test run
```

### 🚀 Before Committing
```bash
npm run test:e2e -- test/e2e/e2e.test.js  # Core E2E validation
npm test                                   # Quick final unit test check
```

### 📦 Before Releases
```bash
npm run test:e2e          # Complete E2E test suite
npm run test:ui:view      # Verify UI snapshots
./claude-habitat test --all  # All habitat tests
```

### 🎨 UI Testing
```bash
npm run test:ui           # Generate UI test snapshots
npm run test:ui:view      # View and verify UI snapshots
./claude-habitat --test-sequence="q"     # Test specific UI sequence
./claude-habitat --test-sequence="t2f"   # Test complete workflow
```

## Test Performance Guidelines

### Unit Tests Should:
- ✅ Complete in under 5 seconds total
- ✅ Use mocks for external dependencies
- ✅ Test pure functions and business logic
- ✅ Be deterministic and repeatable

### E2E Tests Will:
- 🐌 Take 30+ seconds due to Docker operations
- 🐌 Download images and packages
- 🐌 Create real containers and test full workflows
- 🐌 Test complete authentication and repository workflows

### Habitat Tests May:
- ⚠️ Take 10-60 seconds depending on environment setup
- ⚠️ Download and install system tools if missing
- ⚠️ Access real external systems (GitHub, repositories)
- ⚠️ Create temporary containers for validation

## Adding New Tests

### For Unit Tests:
```javascript
/**
 * @fileoverview Unit tests for [specific functionality]
 * @description Tests [what is being tested and why]
 * 
 * @tests
 * - Run these tests: `npm test -- test/unit/new-feature.test.js`
 * - Run all unit tests: `npm test`
 * - Test module: {@link module:module-name} - [description]
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { myPureFunction } = require('../../src/module');

test('myPureFunction handles edge cases', () => {
  assert.strictEqual(myPureFunction(input), expectedOutput);
});
```

### For E2E Tests:
```javascript
/**
 * @fileoverview E2E tests for [specific workflow]
 * @description Tests [end-to-end workflow description]
 * 
 * @tests
 * - Run these tests: `npm run test:e2e -- test/e2e/new-workflow.test.js`
 * - Run all E2E tests: `npm run test:e2e`
 * - Test modules: [relevant modules being tested]
 */

// May create Docker containers, install tools, full workflows
```

### For Habitat Tests:
```bash
#!/bin/bash
# [Test Type]: [Test Purpose]
# @fileoverview [What this test validates]
# @description [Detailed explanation]
# 
# @tests
# - Run this test: ./path/to/test.sh
# - Run all habitat tests: ./claude-habitat test --all
# - Related config: [relevant config file]
```

## Troubleshooting

### "Tests are slow"
- Make sure you're running `npm test` (unit only) not `npm run test:all`
- Check if integration tests are downloading tools unnecessarily

### "Docker tests failing"
- Ensure Docker is running: `docker --version`
- Check Docker permissions: `docker ps`

### "Tool installation timeout"
- Integration tests may need internet access for tool downloads
- Increase timeout or run `system/tools/install-tools.sh` manually first

## Best Practices

1. **Write unit tests first** - Fast feedback loop
2. **Pure functions are easier to test** - No mocking needed
3. **Integration tests for user workflows** - Test the full experience
4. **E2E tests for critical paths only** - They're expensive
5. **Mock external dependencies in unit tests** - Keep them fast
6. **Use dependency injection** - Makes mocking possible