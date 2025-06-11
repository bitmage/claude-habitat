# Phase 1: Functional Composition & Code Elegance - Execution Plan

## Overview
This plan implements the approved items from our Phase 1 discussion, updated based on recent improvements:
- Functional composition utilities (pipe, merge, when/unless, transform)
- Declarative test framework with automatic setup/teardown  
- Configuration validation as data (JSON Schema with terse helpers)

**Recent Progress**: Path resolution and environment variable handling have been significantly improved with `HabitatPathHelpers` and `createHabitatPathHelpers()` (commits c8968cf, 1326220). This plan now focuses on remaining functional composition opportunities.

## Implementation Steps

### Step 1: Create Functional Composition Utilities (60 minutes)

**File: `src/functional.js`**

Create core utilities that will be used throughout the codebase:

```javascript
// Essential functions to implement:
const pipe = (...fns) => async (value) => { /* compose async functions */ };
const merge = (key) => (objects) => { /* merge objects at key */ };
const when = (predicate, fn) => async (value) => { /* conditional execution */ };
const unless = (predicate, fn) => async (value) => { /* inverse conditional */ };
const transform = (transforms) => async (input) => { /* object property transforms */ };
const parallel = (tasks) => async (input) => { /* Promise.all with object shape */ };
```

**Testing**: Create `test/unit/functional.test.js` with comprehensive tests for each utility.

**Validation**: 
- Test pipe with 3-4 function composition
- Test merge with environment variable merging scenario
- Test when/unless with Docker image existence checks
- Test transform with file path resolution
- Test parallel with concurrent operations
- Verify all tests pass before proceeding

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

### Step 4: Refactor Remaining Config Operations with Composition (60 minutes)

**File: `src/config.js`**

**Note**: Config loading with environment chain is already well-implemented with `createHabitatPathHelpers()`. Focus on remaining areas:

```javascript
const { pipe, transform, when } = require('./functional');
const { validateConfig } = require('./validation');

// Image lifecycle operations
const buildImagePipeline = pipe(
  // Validate and prepare config
  async (config) => ({
    ...config,
    validated: await validateConfig(config, 'habitat')
  }),
  
  // Check image cache
  when(
    (ctx) => !ctx.rebuild,
    async (ctx) => ({
      ...ctx,
      imageExists: await dockerImageExists(ctx.config.image.tag)
    })
  ),
  
  // Conditional build
  when(
    (ctx) => !ctx.imageExists || ctx.rebuild,
    async (ctx) => {
      const buildResult = await buildImage(ctx.config);
      return { ...ctx, buildResult };
    }
  )
);

// Container operations
const containerCreationPipeline = pipe(
  // Prepare container config
  transform({
    envVars: (config) => compileEnvironmentVariables(config),
    volumes: (config) => resolveVolumeMounts(config),
    networks: (config) => setupNetworking(config)
  }),
  
  // Create and configure container
  async (config) => {
    const container = await createContainer(config);
    return { ...config, container };
  }
);
```

**Integration**:
- Apply to `image-lifecycle.js` build operations
- Apply to `container-lifecycle.js` creation logic
- Focus on operations not yet using path helpers

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

1. **Functional Composition**: Config loading uses pipe() and is more readable
2. **Test Framework**: At least 2 existing tests converted to use declarative setup
3. **Validation**: All configs validate with new system and show helpful errors
4. **No Regression**: All existing functionality works unchanged
5. **Performance**: No measurable slowdown in habitat startup
6. **Error Quality**: Config validation errors include actionable suggestions

## Time Estimate: 6.5 hours total

This represents a complete refactoring of core patterns while maintaining backward compatibility and improving code quality significantly.