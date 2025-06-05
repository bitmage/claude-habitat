# Claude Habitat Test Suite

This directory contains tests organized by performance and scope to optimize development workflows.

## Test Categories

### 🚀 Unit Tests (`test/unit/`)
**Fast tests for development cycles (< 5 seconds)**
- Pure functions and business logic
- No external dependencies (Docker, network, file system)
- Run on every code change

```bash
npm test              # Default: runs unit tests only
npm run test:unit     # Explicit unit test run
npm run test:watch    # Watch mode for development
```

**Files:**
- `pure-functions.test.js` - Pure functions (parseRepoPath, buildDockerArgs, etc.)
- `claude-habitat.test.js` - Core logic and configuration parsing
- `menu.test.js` - Menu and CLI interaction logic
- `github-functions.test.js` - GitHub API functions (mocked)

### 🔗 Integration Tests (`test/integration/`)
**Medium-speed tests with external dependencies (10-30 seconds)**
- System tools integration
- Repository access workflows
- Authentication flows
- Run before commits or after significant changes

```bash
npm run test:integration
```

**Files:**
- `repository-access.test.js` - Full repository access workflow testing
- `../github-system-tools.test.js` - System tools fix verification

**Performance Notes:**
- May download system tools (gh, rg, fd, etc.) if not present
- Tests real GitHub API integration (with expected auth failures)
- Uses actual system tools infrastructure

### 🐳 End-to-End Tests (`test/e2e/`)
**Slow tests with heavy operations (30+ seconds)**
- Full Docker container lifecycle
- Tool installation simulation
- Complete habitat workflows
- Run before releases or major deployments

```bash
npm run test:e2e
```

**Files:**
- `e2e.test.js` - Docker operations, container creation, tool installation

**Performance Notes:**
- Downloads Docker images (ubuntu:22.04, ~29MB)
- Runs apt-get operations inside containers
- Creates and destroys actual Docker containers

## Development Workflow

### 🔄 During Active Development
```bash
npm test              # Fast unit tests only
npm run test:watch    # Continuous testing
```

### 🚀 Before Committing
```bash
npm run test:integration  # Verify system integration
npm test                  # Quick final check
```

### 📦 Before Releases
```bash
npm run test:all      # Complete test suite
```

## Test Performance Guidelines

### Unit Tests Should:
- ✅ Complete in under 5 seconds total
- ✅ Use mocks for external dependencies
- ✅ Test pure functions and business logic
- ✅ Be deterministic and repeatable

### Integration Tests May:
- ⚠️ Take 10-30 seconds due to tool downloads
- ⚠️ Access real external systems (with controlled failures)
- ⚠️ Download system tools if missing

### E2E Tests Will:
- 🐌 Take 30+ seconds due to Docker operations
- 🐌 Download images and packages
- 🐌 Create real containers and test full workflows

## Adding New Tests

### For Pure Functions:
```javascript
// test/unit/new-feature.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { myPureFunction } = require('../../src/module');

test('myPureFunction handles edge cases', () => {
  assert.strictEqual(myPureFunction(input), expectedOutput);
});
```

### For Integration:
```javascript
// test/integration/new-workflow.test.js
// May use real file system, system tools, GitHub API
```

### For E2E:
```javascript
// test/e2e/full-habitat.test.js
// May create Docker containers, install tools, full workflows
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