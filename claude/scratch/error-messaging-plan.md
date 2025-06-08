# Error Messaging Improvement Plan

## Problem
When a habitat container exits (ctrl-c, command completion, or any termination), the system shows misleading "startup failed" messages even when the habitat successfully started and ran its command.

## Current Behavior
```
❌ Habitat startup failed: Error: Command failed with exit code 130
```

This message appears for:
- User pressing ctrl-c (exit code 130) 
- Normal command completion with non-zero exit
- Any container termination after successful startup

## Root Cause
The error handling doesn't distinguish between:
1. **Startup phase**: Container/command failed to start
2. **Runtime phase**: Container started successfully but exited later

## Solution Design

### Phase 1: Distinguish Startup vs Runtime Failures

**Track startup completion state:**
- Set flag when container successfully starts and command begins executing
- Use this flag to determine appropriate error messaging

**Error message logic:**
```javascript
if (!startupCompleted) {
  // True startup failure
  console.error(`❌ Habitat startup failed: ${error.message}`);
} else {
  // Runtime exit (normal or abnormal)
  if (exitCode === 130) {
    console.log(`ℹ️  Habitat interrupted by user (ctrl-c)`);
  } else if (exitCode === 0) {
    console.log(`✅ Habitat completed successfully`);
  } else {
    console.log(`ℹ️  Habitat exited with code ${exitCode}`);
  }
}
```

### Phase 2: Enhanced Exit Code Reporting

**Common exit codes to handle:**
- 0: Success
- 1: General error
- 2: Misuse of shell command
- 126: Command not executable
- 127: Command not found
- 130: Terminated by ctrl-c (SIGINT)
- 137: Killed (SIGKILL)
- 143: Terminated (SIGTERM)

### Phase 3: Startup Progress Tracking

**Track specific startup milestones:**
1. Container creation
2. Container start
3. Initial command execution
4. Service readiness (if applicable)

## Implementation Files

### Primary Changes
- `src/habitat.js`: Main habitat execution logic
- `src/docker.js`: Docker container management
- `src/command-executor.js`: CLI command handling

### Key Functions to Modify
- `runHabitat()`: Track startup state
- `runContainer()`: Enhanced error handling
- `executeCliCommand()`: Startup vs runtime distinction

## Testing Strategy

### Unit Tests
- Test startup failure scenarios
- Test runtime exit scenarios
- Test different exit codes
- Test ctrl-c handling

### E2E Tests
- Start habitat and ctrl-c immediately (startup failure)
- Start habitat, wait for ready, then ctrl-c (runtime exit)
- Test command completion scenarios
- Test error scenarios during startup vs runtime

## Implementation Steps

1. **Identify startup completion points**
   - Find where "habitat is ready" can be determined
   - Add startup state tracking

2. **Modify error handling**
   - Update runHabitat() error catch blocks
   - Distinguish startup vs runtime in error messages

3. **Add exit code interpretation**
   - Create helper function for exit code meanings
   - Integrate into error reporting

4. **Update tests**
   - Verify new messaging is accurate
   - Test edge cases and error scenarios

5. **Documentation**
   - Update troubleshooting docs with new error messages
   - Document exit code meanings

## Success Criteria

- ✅ No "startup failed" messages for runtime exits
- ✅ Clear distinction between startup and runtime errors
- ✅ Informative exit code reporting
- ✅ Ctrl-c shows appropriate user-friendly message
- ✅ All existing functionality preserved
- ✅ Tests validate new error messaging behavior