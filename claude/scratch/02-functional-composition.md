# Phase 1: Functional Composition & Code Elegance - Execution Plan

## Overview
This plan implements domain-specific improvements that add unique value, updated based on RxJS decision:
- ~~Functional composition utilities~~ **REPLACED: Use RxJS operators instead**
- Declarative test framework with automatic setup/teardown  
- Configuration validation as data (JSON Schema with terse helpers)
- RxJS integration utilities for claude-habitat domain

**Recent Progress**: Path resolution and environment variable handling have been significantly improved with `HabitatPathHelpers` and `createHabitatPathHelpers()` (commits c8968cf, 1326220). 

**Architecture Decision**: Using RxJS for reactive patterns eliminates need for custom functional utilities. Focus on domain-specific abstractions.

## Implementation Steps

### Step 1: Add RxJS and Domain-Specific Utilities (60 minutes)

**Dependencies**: Add RxJS to package.json
```bash
npm install rxjs
```

**File: `src/rxjs-habitat.js`**

Create domain-specific RxJS utilities for claude-habitat:

```javascript
const { from, Subject, EMPTY } = require('rxjs');
const { tap, timeout, retry, map, mergeMap, catchError, finalize } = require('rxjs/operators');

/**
 * Convert async functions to RxJS observables
 */
const fromAsync = (asyncFn) => (...args) => from(asyncFn(...args));

/**
 * Validate required context properties
 */
const requireProps = (requiredProps) => (source$) =>
  source$.pipe(
    tap(ctx => {
      const missing = requiredProps.filter(prop => !(prop in ctx));
      if (missing.length > 0) {
        throw new Error(`Missing required context properties: ${missing.join(', ')}`);
      }
    })
  );

/**
 * Emit progress events for pipeline stages
 */
const tapProgress = (stageName, progressEmitter) => 
  tap(result => progressEmitter.next({ 
    stage: stageName, 
    status: 'completed', 
    result,
    timestamp: Date.now()
  }));

/**
 * Stage wrapper with timeout, retry, and progress tracking
 */
const stageOperator = (name, progressEmitter, options = {}) => (source$) => {
  const startTime = Date.now();
  
  progressEmitter.next({ 
    stage: name, 
    status: 'started', 
    timestamp: startTime 
  });

  const operators = [
    options.timeout ? timeout(options.timeout) : tap(),
    options.retry ? retry(options.retry) : tap(),
    tapProgress(name, progressEmitter),
    finalize(() => {
      const duration = Date.now() - startTime;
      progressEmitter.next({ 
        stage: name, 
        status: 'finished', 
        duration,
        timestamp: Date.now()
      });
    })
  ].filter(op => op !== tap()); // Remove empty taps

  return source$.pipe(...operators);
};

/**
 * Conditional execution based on context predicate
 */
const conditionalMap = (predicate, onTrue, onFalse = map(x => x)) => (source$) =>
  source$.pipe(
    mergeMap(ctx => predicate(ctx) ? 
      from([ctx]).pipe(onTrue) : 
      from([ctx]).pipe(onFalse)
    )
  );

/**
 * Docker operation with habitat-specific error handling
 */
const dockerOperation = (operation, progressEmitter) => (source$) =>
  source$.pipe(
    mergeMap(ctx => fromAsync(operation)(ctx)),
    catchError(error => {
      // Habitat-specific error handling
      if (error.message.includes('docker')) {
        progressEmitter.next({ 
          type: 'docker-error', 
          error: error.message,
          suggestion: 'Check Docker daemon is running and accessible'
        });
      }
      throw error;
    })
  );

module.exports = {
  fromAsync,
  requireProps,
  tapProgress,
  stageOperator,
  conditionalMap,
  dockerOperation
};
```

**Testing**: Create `test/unit/rxjs-habitat.test.js` with comprehensive tests for each utility.

### Step 2: Implement Declarative Test Framework (90 minutes)

**File: `src/test-framework.js`**

Create framework that eliminates repetitive test setup/teardown:

```javascript
// Core framework:
function createTest(options) {
  // Handle setup array, teardown array, timeout
  // Return function that accepts (name, testFn)
  // Manage cleanup in LIFO order
  // Handle setup failures with partial cleanup
}

// Predefined setup functions:
const setupFunctions = {
  buildImage: async (context) => { /* build test image, return cleanup */ },
  createContainer: async (context) => { /* create container, return cleanup */ },
  startContainer: async (context) => { /* start container, return cleanup */ },
  prepareWorkspace: async (context) => { /* setup workspace, return cleanup */ }
};
```

**Integration Points**:
- Update 2-3 existing tests to use new framework
- Focus on habitat build/start tests that currently have manual cleanup
- Ensure backward compatibility with existing tests

**Testing**: Create `test/unit/test-framework.test.js` testing setup/teardown, timeouts, error handling.

### Step 3: Configuration Validation as Data (120 minutes)

**Dependencies**: Add `ajv ajv-formats` to package.json

**File: `src/validation.js`**

Replace imperative validation with declarative schemas:

```javascript
// Terse schema helpers
const types = {
  string: (opts = {}) => ({ type: 'string', ...opts }),
  object: (properties, opts = {}) => { /* auto-extract required fields */ },
  // ... other helpers
};

// Comprehensive schemas
const habitatConfigSchema = object({
  name: string({ required: true, pattern: '^[a-z][a-z0-9-]*$' }),
  description: string({ required: true, minLength: 1 }),
  container: object({
    work_dir: string({ required: true, pattern: '^/' }),
    user: string({ required: true })
  }),
  // ... rest of schema
});

// Validation with helpful errors
function validateConfig(config, type = 'habitat') {
  const result = validator(config);
  if (!result.valid) {
    result.formattedErrors = formatValidationErrors(result.errors);
    result.suggestions = generateSuggestions(result.errors, type);
  }
  return result;
}
```

**Migration Strategy**:
- Create new validation alongside existing
- Update `src/config.js` to use new validation
- Keep old validation as fallback initially
- Test with all existing configs (base, claude-habitat, discourse)

### Step 4: Apply RxJS to Core Operations (60 minutes)

**File: `src/config.js`**

**Note**: Config loading with environment chain is already well-implemented with `createHabitatPathHelpers()`. Focus on validation with RxJS:

```javascript
const { from } = require('rxjs');
const { map, mergeMap, tap } = require('rxjs/operators');
const { validateConfig } = require('./validation');
const { requireProps, conditionalMap } = require('./rxjs-habitat');

// Enhanced config validation with RxJS
function validateConfigWithProgress(config, progressEmitter) {
  return from([config]).pipe(
    tap(() => progressEmitter.next({ stage: 'config-validation', status: 'started' })),
    map(validateConfig),
    tap(result => {
      if (!result.valid) {
        progressEmitter.next({ 
          type: 'validation-error', 
          errors: result.formattedErrors,
          suggestions: result.suggestions 
        });
        throw new Error(`Config validation failed: ${result.errors.join(', ')}`);
      }
    }),
    map(result => ({ validatedConfig: result.config }))
  );
}

// Example usage in existing operations
function loadConfigWithValidation(configPath, progressEmitter) {
  return from([configPath]).pipe(
    mergeMap(path => fromAsync(loadConfig)(path)),
    mergeMap(config => validateConfigWithProgress(config, progressEmitter))
  );
}
```

**Integration**:
- Replace manual validation in key areas with RxJS version
- Focus on operations that would benefit from progress reporting
- Maintain backward compatibility with existing loadConfig calls

### Step 5: Testing and Validation (60 minutes)

**Comprehensive Testing**:
- Run full test suite: `npm test`
- Test habitat startup: `./claude-habitat start base`
- Test config validation with intentionally broken configs
- Test functional composition with real scenarios

**Performance Verification**:
- Ensure no regression in startup time
- Verify error messages are more helpful than before
- Check that failed configs show actionable suggestions

**Documentation**:
- Update relevant code comments
- Document new utilities in files where they're used
- Add examples of functional composition patterns

## Risk Mitigation

### Breaking Changes
- Keep old validation functions until new system is proven
- Add feature flags if needed for gradual rollout
- Test against all existing habitat configs

### Rollback Plan
- Each step creates new files alongside existing
- Old functionality remains until explicit removal
- Git commits for each step allow easy rollback

### Validation Strategy
- Test new validation against all existing configs
- Ensure error messages are more helpful, not just different
- Verify no performance regression

## Success Criteria

1. **RxJS Integration**: Domain-specific RxJS utilities enable reactive patterns
2. **Test Framework**: At least 2 existing tests converted to use declarative setup
3. **Validation**: All configs validate with new system and show helpful errors
4. **No Regression**: All existing functionality works unchanged
5. **Performance**: No measurable slowdown in habitat startup
6. **Error Quality**: Config validation errors include actionable suggestions
7. **Foundation for 03**: RxJS utilities ready for event-driven architecture implementation

## Time Estimate: 5.5 hours total

**Reduced from 6.5 hours** by eliminating custom functional utilities and leveraging RxJS.

This represents focused improvements on domain-specific abstractions while leveraging proven libraries for reactive patterns.