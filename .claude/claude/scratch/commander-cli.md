# Commander.js CLI Refactor Proposal

## Overview

Replace the current 235-line custom CLI parser (`src/cli-parser.js`) with Commander.js to reduce code complexity, improve maintainability, and gain automatic help generation.

## Current State Analysis

**Current Implementation:**
- 235 lines of manual argument parsing
- Custom validation logic
- Manual help text generation in `src/command-executor.js`
- Recent bug: missing `continue` statement causing `--test-sequence=` to fail
- Maintenance overhead for CLI changes

**Current Command Structure:**
```bash
./claude-habitat start discourse --rebuild=repos
./claude-habitat test base --system --verify-fs=shared
./claude-habitat add
./claude-habitat --clean --preserve-colors
./claude-habitat --test-sequence=q --preserve-colors
```

## Proposed Changes

### 1. Add Commander.js Dependency
```json
// package.json
"dependencies": {
  "commander": "^11.1.0",  // Add this
  "js-yaml": "^4.1.0",
  "rxjs": "^7.8.2"
}
```

### 2. Replace CLI Parser Implementation
Replace `src/cli-parser.js` with Commander.js-based implementation:

```javascript
const { Command } = require('commander');

function parseCliArguments(argv) {
  const program = new Command();
  
  program
    .name('claude-habitat')
    .version('0.1.2')
    .option('-c, --config <file>', 'Path to configuration YAML file')
    .option('-r, --repo <repo>', 'Additional repository (URL:PATH[:BRANCH])', [])
    .option('--cmd <command>', 'Override claude command')
    .option('--tty', 'Force TTY allocation')
    .option('--no-tty', 'Disable TTY allocation')
    .option('--no-cleanup', 'Disable automatic container cleanup')
    .option('--clean', 'Remove all containers and images')
    .option('--clean-images [target]', 'Clean Docker images', 'all')
    .option('--list-configs', 'List available configurations')
    .option('--test-sequence <seq>', 'Run UI test sequence')
    .option('--preserve-colors', 'Preserve ANSI color codes');

  // Subcommands
  program.command('start [habitat]')
    .option('--rebuild [phase]', 'Force rebuild from phase')
    .option('--show-phases', 'Show build phases');
    
  program.command('test <habitat>')
    .option('--system', 'Run system tests')
    .option('--shared', 'Run shared tests')
    .option('--habitat', 'Run habitat tests')
    .option('--verify-fs [scope]', 'Filesystem verification', 'all');
    
  program.command('add');
  program.command('maintain');

  return program.parse(argv, { from: 'user' });
}
```

### 3. Remove Manual Help Generation
Delete help generation code from `src/command-executor.js` (~100 lines) since Commander.js provides this automatically.

### 4. Update Validation Logic
Simplify `validateCliOptions()` since Commander.js handles basic validation.

## Benefits

### Code Reduction
- **Remove ~235 lines** from `src/cli-parser.js`
- **Remove ~100 lines** of help text from `src/command-executor.js`
- **Total reduction: ~335 lines**

### Reliability
- **Eliminate custom parsing bugs** (like the recent missing `continue` issue)
- **Automatic argument validation**
- **Consistent help generation**

### Maintainability
- **Single source of truth** for CLI structure
- **Automatic help updates** when commands change
- **Standard library patterns** instead of custom logic

### Developer Experience
- **Automatic `--help` for all commands**
- **Consistent error messages**
- **Better argument validation**

## Implementation Plan

### Phase 1: Setup (1 hour)
1. Add Commander.js to dependencies
2. Create new CLI parser implementation
3. Update imports in `claude-habitat.js`

### Phase 2: Migration (2 hours)
1. Replace argument parsing logic
2. Update validation functions
3. Remove manual help generation
4. Update tests

### Phase 3: Testing (1 hour)
1. Run existing CLI tests
2. Verify all command patterns work
3. Test help generation
4. Test error handling

## Risks and Mitigation

### Risk: Breaking Changes
**Mitigation:** Commander.js can maintain exact same CLI interface

### Risk: Bundle Size
**Impact:** +50KB (Commander.js is lightweight compared to alternatives)
**Mitigation:** Acceptable for local development tool

### Risk: Test Compatibility
**Mitigation:** Update test expectations for improved error messages

## Validation Criteria

### Success Metrics
- [ ] All current CLI commands work identically
- [ ] Help generation is automatic and comprehensive
- [ ] Code reduction of 300+ lines
- [ ] All tests pass
- [ ] No breaking changes to user experience

### Test Coverage
- [ ] CLI parsing tests pass
- [ ] Help generation works for all commands
- [ ] Error handling improvements
- [ ] Subcommand validation

## Alternative Considered

**Native Node.js parseArgs:** Would reduce dependencies but require significant manual work for subcommands and help generation, providing minimal benefit over current implementation.

## Conclusion

Commander.js refactor provides significant code reduction, improved reliability, and better maintainability with minimal risk. The one-time migration effort pays dividends in reduced maintenance overhead and automatic CLI features.

**Recommendation:** Proceed with Commander.js migration.