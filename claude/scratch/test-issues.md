# Test Issues Analysis and Resolution Plan

## Overview

This document analyzes the current test failures in Claude Habitat and proposes solutions for each issue.

**Test Status Summary:**
- Unit Tests: 124/129 passing (4 failures, 1 hanging)
- E2E Tests: 6/7 passing (1 failure)

## Unit Test Failures

### 1. CLI Commands Test Hanging (cli-commands.test.js)

**Problem:**
The test `start command with runtime exit shows improved messaging` (line 256) hangs indefinitely when spawning:
```bash
node claude-habitat.js start claude-habitat --cmd 'exit 42'
```

**Root Cause:**
The Docker container is started with `-it` flags expecting TTY input, but the test environment doesn't provide a TTY, causing the process to hang with the error:
```
the input device is not a TTY
```

**Proposed Fix:**
Modify the Docker run command in `src/container-operations.js` to detect when stdin is not a TTY and adjust flags accordingly:
- Use `process.stdin.isTTY` to detect TTY availability
- When no TTY is available, use `-i` flag only (remove `-t`)
- This allows automated testing while preserving interactive behavior for users

### 2. Color Preservation Test (colors.test.js:95)

**Problem:**
The test expects ANSI color codes to be preserved when using `--preserve-colors` flag, but the output doesn't contain them.

**Current Behavior:**
- The flag is correctly parsed and passed to `runSequence`
- However, color codes are stripped from the output

**Proposed Fix:**
1. Investigate where colors are being stripped in the output pipeline
2. Ensure that when `preserveColors: true`, the color stripping logic in `src/colors.js` is bypassed
3. Check if the test environment needs special handling for color output

### 3. Docker Exec Args Tests (command-builders.test.js:64, 69, 125)

**Problem:**
Tests expect commands like `echo hello` to be passed directly to Docker, but they're now wrapped with:
```bash
[ -f /etc/profile.d/habitat-env.sh ] && source /etc/profile.d/habitat-env.sh || true; echo hello
```

**Root Cause:**
The implementation was changed to automatically source environment variables before executing commands (container-operations.js:48-49), but tests weren't updated.

**Proposed Fix:**
Update the test expectations to match the new behavior:
```javascript
// Old expectation
assert.deepStrictEqual(args, ['exec', 'test-container', 'echo', 'hello']);

// New expectation
assert.deepStrictEqual(args, [
  'exec', 'test-container', 'sh', '-c',
  '[ -f /etc/profile.d/habitat-env.sh ] && source /etc/profile.d/habitat-env.sh || true; echo hello'
]);
```

## E2E Test Failure

### 4. Test Command Variations (e2e.test.js)

**Problem:**
The test `claude-habitat test command variations work` is failing.

**Likely Causes:**
1. Missing test configurations in habitat configs
2. Changes to the test command implementation
3. Missing test files in the expected locations

**Proposed Investigation:**
1. Run the test in isolation to see the exact error
2. Check if test directories exist in the expected locations
3. Verify the test command implementation matches expectations

## Implementation Priority

1. **Fix Docker exec args tests** - Simple test expectation updates (5 min)
2. **Fix CLI hanging** - Add TTY detection to Docker operations (15 min)
3. **Fix color preservation** - Debug output pipeline (30 min)
4. **Fix E2E test** - Investigate and fix test command (30 min)

## Deeper Issues Revealed

### 1. TTY Handling
The system assumes interactive TTY availability, which breaks automated testing and CI/CD pipelines. This needs to be handled gracefully throughout the codebase.

### 2. Test-Implementation Drift
The Docker exec args tests reveal that tests weren't updated when implementation changed. This suggests:
- Need for better test documentation
- Consider test-driven development practices
- Add comments linking tests to implementation

### 3. Environment Variable Management
The automatic sourcing of `/etc/profile.d/habitat-env.sh` shows the system is trying to ensure consistent environment setup, but this adds complexity to command execution.

## Recommended Next Steps

1. **Immediate**: Fix the simple test expectation mismatches
2. **Short-term**: Add TTY detection and graceful fallbacks
3. **Medium-term**: Improve test documentation and add integration test coverage
4. **Long-term**: Consider simplifying environment variable management

## Testing Strategy Improvements

1. Add timeout wrappers to all spawn operations in tests
2. Create test utilities for common Docker operations
3. Add explicit documentation about test environment requirements
4. Consider mocking Docker operations for unit tests to avoid TTY issues