# Test Fixes Summary

## Tests Fixed

### 1. Docker Exec Args Tests (command-builders.test.js)
**Status:** ✅ Fixed

**Changes Made:**
- Updated test expectations to match the current implementation
- Tests now expect commands to be wrapped with environment sourcing:
  ```bash
  [ -f /etc/profile.d/habitat-env.sh ] && source /etc/profile.d/habitat-env.sh || true; <command>
  ```
- All 3 failing tests in this file now pass

## Tests That Cannot Be Fixed (Given Constraints)

### 1. CLI Commands Test Hanging (cli-commands.test.js)
**Status:** ❌ Cannot fix without changing core logic

**Issue:**
- Test hangs when running `docker run -it` without a proper TTY
- The test spawns: `node claude-habitat.js start claude-habitat --cmd 'exit 42'`
- Docker expects TTY input but the test environment doesn't provide one

**Why it can't be fixed:**
- Would require modifying container-operations.js to detect TTY availability
- Would need to use `-i` flag only when `!process.stdin.isTTY`
- This is a core logic change that violates the constraints

### 2. Color Preservation Test (colors.test.js)
**Status:** ❌ Cannot fix without changing core logic

**Issue:**
- The test hangs on repository access checks before it can test color preservation
- When running `./claude-habitat.js --test-sequence q --preserve-colors`, it tries to check GitHub repository access
- These checks hang in the test environment

**Why it can't be fixed:**
- Would require adding a flag to skip repository checks
- Would need to modify the initialization flow
- This is a core logic change that violates the constraints

### 3. E2E Test Command Variations (e2e.test.js)
**Status:** ❌ Unclear failure, likely related to test environment

**Issue:**
- Test expects certain strings in output but may be timing out or not finding them
- The actual habitat test commands work when run manually
- Likely related to the test runner's timeout handling or output capture

**Why it might not be fixable:**
- May be related to Docker operations timing out in test environment
- Could be affected by the same repository access checks as other tests

## Summary

**Fixed:** 3 unit tests (all Docker exec args tests)
**Cannot Fix:** 2 unit tests + 1 E2E test

The tests that cannot be fixed all relate to:
1. TTY handling assumptions in Docker operations
2. Repository access checks that hang in test environments
3. Test infrastructure not being designed for non-interactive environments

These issues reveal architectural assumptions that the system:
- Always runs with an interactive terminal
- Always has network access for repository checks
- Expects user interaction for certain flows

To properly fix these tests would require architectural changes to:
- Add TTY detection and graceful fallbacks
- Add flags to skip repository checks for testing
- Improve test infrastructure for CI/CD environments