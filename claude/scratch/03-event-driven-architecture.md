# Event-Driven Architecture Implementation Plan

## Goal
Transform long-running operations into event-driven pipelines with progress reporting and better user feedback.

## Prerequisites
This plan assumes functional composition utilities from `02-functional-composition.md` are implemented:
- `pipe`, `when`, `unless`, `transform`, `parallel` 
- Additional flow control functions defined below

## Extended Functional Composition

### Additional Higher-Order Functions for Pipelines

```javascript
// src/functional-pipeline.js - Extensions for event-driven architecture
const { pipe, when, unless, transform, parallel } = require('./functional');

/**
 * Conditional execution based on context predicate
 * @param {Function} predicate - Function that takes context and returns boolean
 * @param {Function} onTrue - Function to execute if predicate is true
 * @param {Function} onFalse - Optional function to execute if predicate is false
 */
const conditional = (predicate, onTrue, onFalse = (x) => x) => async (ctx) => {
  return predicate(ctx) ? await onTrue(ctx) : await onFalse(ctx);
};

/**
 * Execute function only if context has required properties
 * @param {Array<string>} requiredProps - Array of required property names
 * @param {Function} fn - Function to execute if all props exist
 */
const requireProps = (requiredProps, fn) => (ctx) => {
  const missing = requiredProps.filter(prop => !(prop in ctx));
  if (missing.length > 0) {
    throw new Error(`Missing required context properties: ${missing.join(', ')}`);
  }
  return fn(ctx);
};

/**
 * Merge result into context with optional key mapping
 * @param {string|Function} keyOrMapper - Key name or mapping function
 */
const mergeResult = (keyOrMapper) => async (ctx) => {
  if (typeof keyOrMapper === 'string') {
    return { ...ctx, [keyOrMapper]: ctx };
  } else if (typeof keyOrMapper === 'function') {
    return { ...ctx, ...keyOrMapper(ctx) };
  } else {
    return { ...ctx, result: ctx };
  }
};

/**
 * Execute with timeout and optional fallback
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {Function} fallback - Optional fallback function
 */
const withTimeout = (timeoutMs, fallback = null) => (fn) => async (ctx) => {
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
  );
  
  try {
    return await Promise.race([fn(ctx), timeoutPromise]);
  } catch (error) {
    if (fallback && error.message.includes('timed out')) {
      console.warn(`Operation timed out, using fallback: ${error.message}`);
      return await fallback(ctx);
    }
    throw error;
  }
};

/**
 * Execute with retry logic
 * @param {number} maxAttempts - Maximum number of attempts
 * @param {number} delayMs - Delay between attempts
 * @param {Function} shouldRetry - Optional predicate to determine if error is retryable
 */
const withRetry = (maxAttempts, delayMs = 1000, shouldRetry = () => true) => (fn) => async (ctx) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(ctx);
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      
      console.warn(`Attempt ${attempt} failed: ${error.message}. Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
};

/**
 * Execute multiple operations in sequence, collecting results
 * @param {Array<Function>} operations - Array of functions to execute
 */
const sequence = (operations) => async (ctx) => {
  const results = [];
  let currentCtx = ctx;
  
  for (const operation of operations) {
    const result = await operation(currentCtx);
    results.push(result);
    currentCtx = { ...currentCtx, ...result };
  }
  
  return { ...currentCtx, sequenceResults: results };
};

/**
 * Branch execution based on context value
 * @param {Function} selector - Function that extracts branch key from context
 * @param {Object} branches - Object mapping branch keys to functions
 * @param {Function} defaultBranch - Optional default function
 */
const branch = (selector, branches, defaultBranch = (x) => x) => async (ctx) => {
  const branchKey = selector(ctx);
  const branchFn = branches[branchKey] || defaultBranch;
  return await branchFn(ctx);
};

module.exports = {
  conditional,
  requireProps,
  mergeResult,
  withTimeout,
  withRetry,
  sequence,
  branch
};
```

### Unit Tests for Flow Control Functions

```javascript
// test/unit/functional-pipeline.test.js
const test = require('node:test');
const assert = require('node:assert');
const {
  conditional,
  requireProps,
  mergeResult,
  withTimeout,
  withRetry,
  sequence,
  branch
} = require('../../src/functional-pipeline');

test('conditional executes correct branch based on predicate', async () => {
  const isEven = (ctx) => ctx.value % 2 === 0;
  const double = (ctx) => ({ ...ctx, result: ctx.value * 2 });
  const triple = (ctx) => ({ ...ctx, result: ctx.value * 3 });
  
  const conditionalFn = conditional(isEven, double, triple);
  
  const evenResult = await conditionalFn({ value: 4 });
  assert.strictEqual(evenResult.result, 8);
  
  const oddResult = await conditionalFn({ value: 3 });
  assert.strictEqual(oddResult.result, 9);
});

test('requireProps validates required properties', async () => {
  const fn = requireProps(['name', 'age'], (ctx) => ({ ...ctx, valid: true }));
  
  const validCtx = { name: 'John', age: 30 };
  const result = await fn(validCtx);
  assert.ok(result.valid);
  
  const invalidCtx = { name: 'John' };
  await assert.rejects(
    () => fn(invalidCtx),
    /Missing required context properties: age/
  );
});

test('withTimeout enforces timeout limits', async () => {
  const slowFn = () => new Promise(resolve => setTimeout(() => resolve({ done: true }), 100));
  const fastFn = () => Promise.resolve({ done: true });
  
  const timeoutFn = withTimeout(50);
  
  // Fast function should succeed
  const fastResult = await timeoutFn(fastFn)({});
  assert.ok(fastResult.done);
  
  // Slow function should timeout
  await assert.rejects(
    () => timeoutFn(slowFn)({}),
    /Operation timed out after 50ms/
  );
});

test('withTimeout uses fallback on timeout', async () => {
  const slowFn = () => new Promise(resolve => setTimeout(() => resolve({ done: true }), 100));
  const fallback = () => Promise.resolve({ fallbackUsed: true });
  
  const timeoutFn = withTimeout(50, fallback);
  const result = await timeoutFn(slowFn)({});
  
  assert.ok(result.fallbackUsed);
});

test('withRetry retries failed operations', async () => {
  let attempts = 0;
  const flakyFn = () => {
    attempts++;
    if (attempts < 3) {
      throw new Error('Temporary failure');
    }
    return { success: true, attempts };
  };
  
  const retryFn = withRetry(5, 10);
  const result = await retryFn(flakyFn)({});
  
  assert.ok(result.success);
  assert.strictEqual(result.attempts, 3);
});

test('sequence executes operations in order', async () => {
  const addOne = (ctx) => ({ ...ctx, value: ctx.value + 1 });
  const double = (ctx) => ({ ...ctx, value: ctx.value * 2 });
  const square = (ctx) => ({ ...ctx, value: ctx.value ** 2 });
  
  const sequenceFn = sequence([addOne, double, square]);
  const result = await sequenceFn({ value: 2 });
  
  // (2 + 1) * 2 = 6, then 6^2 = 36
  assert.strictEqual(result.value, 36);
  assert.strictEqual(result.sequenceResults.length, 3);
});

test('branch selects correct execution path', async () => {
  const getType = (ctx) => ctx.type;
  const branches = {
    'user': (ctx) => ({ ...ctx, role: 'standard' }),
    'admin': (ctx) => ({ ...ctx, role: 'administrator' }),
  };
  const defaultBranch = (ctx) => ({ ...ctx, role: 'guest' });
  
  const branchFn = branch(getType, branches, defaultBranch);
  
  const userResult = await branchFn({ type: 'user' });
  assert.strictEqual(userResult.role, 'standard');
  
  const adminResult = await branchFn({ type: 'admin' });
  assert.strictEqual(adminResult.role, 'administrator');
  
  const unknownResult = await branchFn({ type: 'unknown' });
  assert.strictEqual(unknownResult.role, 'guest');
});
```

## Architecture

### Event Pipeline Framework
```javascript
// src/event-pipeline.js
const EventEmitter = require('events');

class Pipeline extends EventEmitter {
  constructor(name = 'pipeline') {
    super();
    this.name = name;
    this.stages = [];
    this.context = {};
    this.startTime = null;
    this.metrics = {
      stagesCompleted: 0,
      totalStages: 0,
      errors: []
    };
  }
  
  stage(name, action, options = {}) {
    this.stages.push({ 
      name, 
      action, 
      optional: options.optional || false,
      timeout: options.timeout,
      retry: options.retry || false
    });
    return this;
  }
  
  async run(initialContext = {}) {
    this.context = { ...initialContext };
    this.startTime = Date.now();
    this.metrics.totalStages = this.stages.length;
    
    this.emit('pipeline:start', {
      pipeline: this.name,
      totalStages: this.stages.length,
      context: this.context
    });
    
    try {
      for (let i = 0; i < this.stages.length; i++) {
        const stage = this.stages[i];
        await this.executeStage(stage, i);
      }
      
      this.emit('pipeline:complete', {
        pipeline: this.name,
        duration: Date.now() - this.startTime,
        context: this.context,
        metrics: this.metrics
      });
      
      return this.context;
      
    } catch (error) {
      this.emit('pipeline:error', {
        pipeline: this.name,
        error,
        duration: Date.now() - this.startTime,
        context: this.context,
        metrics: this.metrics
      });
      throw error;
    }
  }
  
  async executeStage(stage, index) {
    const stageStart = Date.now();
    
    this.emit('stage:start', {
      pipeline: this.name,
      stage: stage.name,
      index,
      progress: index / this.stages.length
    });
    
    try {
      // Handle timeout if specified
      const operation = stage.timeout 
        ? this.withTimeout(stage.action(this.context), stage.timeout)
        : stage.action(this.context);
      
      const result = await operation;
      
      // Update context if stage returns a value
      if (result !== undefined) {
        this.context = { ...this.context, ...result };
      }
      
      this.metrics.stagesCompleted++;
      
      this.emit('stage:complete', {
        pipeline: this.name,
        stage: stage.name,
        index,
        duration: Date.now() - stageStart,
        progress: (index + 1) / this.stages.length
      });
      
    } catch (error) {
      if (stage.optional) {
        this.emit('stage:warning', {
          pipeline: this.name,
          stage: stage.name,
          index,
          error,
          message: `Optional stage '${stage.name}' failed but continuing`
        });
        this.metrics.errors.push({ stage: stage.name, error: error.message, optional: true });
      } else {
        this.emit('stage:error', {
          pipeline: this.name,
          stage: stage.name,
          index,
          error,
          duration: Date.now() - stageStart
        });
        throw error;
      }
    }
  }
  
  withTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Stage timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }
  
  // Helper for progress reporting
  onProgress(callback) {
    this.on('stage:start', (data) => callback('start', data));
    this.on('stage:complete', (data) => callback('complete', data));
    this.on('stage:error', (data) => callback('error', data));
    this.on('stage:warning', (data) => callback('warning', data));
    return this;
  }
}

// Pipeline factory for common patterns using functional composition
function createBuildPipeline(config) {
  const { pipe, when, unless, conditional, requireProps, mergeResult, withTimeout, withRetry } = require('./functional-pipeline');
  
  return new Pipeline('habitat-build')
    .stage('validate-config', pipe(
      (ctx) => ctx.config,
      validateConfig,
      when(
        (validation) => !validation.valid,
        (validation) => { throw new Error(`Config validation failed: ${validation.errors.join(', ')}`); }
      ),
      (validation) => ({ validatedConfig: validation.config })
    ))
    
    .stage('check-base-image', pipe(
      requireProps(['config']),
      (ctx) => ctx.config.image.base,
      dockerImageExists,
      (imageExists) => ({ baseImageAvailable: imageExists })
    ))
    
    .stage('pull-base-image', 
      conditional(
        (ctx) => !ctx.baseImageAvailable,
        pipe(
          (ctx) => ctx.config.image.base,
          withTimeout(300000)(dockerPull), // 5 minute timeout
          () => ({ baseImageReady: true })
        ),
        () => ({ baseImageReady: true, skipped: 'image already available' })
      )
    )
    
    .stage('build-base', pipe(
      requireProps(['config']),
      (ctx) => ctx.config,
      withTimeout(600000)(buildBaseImage), // 10 minute timeout
      (baseTag) => ({ baseTag })
    ))
    
    .stage('prepare-workspace', pipe(
      requireProps(['config']),
      (ctx) => ctx.config,
      prepareWorkspace,
      () => ({ workspaceReady: true })
    ))
    
    .stage('clone-repositories', pipe(
      requireProps(['config']),
      (ctx) => ctx.config.repositories || [],
      parallel((repos) => repos.map(repo => 
        withTimeout(120000)(cloneRepository)(repo)
      )),
      (results) => ({ repositoriesCloned: results })
    ))
    
    .stage('run-setup-commands', pipe(
      requireProps(['config']),
      (ctx) => ctx.config,
      runSetupCommands,
      () => ({ setupComplete: true })
    ))
    
    .stage('create-final-image', pipe(
      requireProps(['config', 'baseTag']),
      (ctx) => ({ config: ctx.config, baseTag: ctx.baseTag }),
      ({ config, baseTag }) => createFinalImage(config, baseTag),
      (finalTag) => ({ finalImage: finalTag })
    ))
    
    .stage('verify-image', pipe(
      requireProps(['finalImage']),
      (ctx) => ctx.finalImage,
      verifyImageHealth,
      () => ({ verified: true })
    ), { optional: true }); // Optional verification
}
```

### Progress UI Integration
```javascript
// src/progress-ui.js
class ProgressReporter {
  constructor() {
    this.currentStage = null;
    this.progress = 0;
    this.startTime = null;
  }
  
  attach(pipeline) {
    pipeline.on('pipeline:start', (data) => {
      this.startTime = Date.now();
      console.log(`\n🚀 Starting ${data.pipeline}...`);
      console.log(`📋 ${data.totalStages} stages to complete\n`);
    });
    
    pipeline.on('stage:start', (data) => {
      this.currentStage = data.stage;
      this.progress = data.progress;
      
      const percent = Math.round(data.progress * 100);
      console.log(`[${percent.toString().padStart(3)}%] ${data.stage}...`);
    });
    
    pipeline.on('stage:complete', (data) => {
      const percent = Math.round(data.progress * 100);
      const duration = this.formatDuration(data.duration);
      console.log(`[${percent.toString().padStart(3)}%] ✅ ${data.stage} (${duration})`);
    });
    
    pipeline.on('stage:warning', (data) => {
      console.log(`[---] ⚠️  ${data.stage}: ${data.message}`);
    });
    
    pipeline.on('stage:error', (data) => {
      console.log(`[---] ❌ ${data.stage}: ${data.error.message}`);
    });
    
    pipeline.on('pipeline:complete', (data) => {
      const totalDuration = this.formatDuration(data.duration);
      console.log(`\n✅ ${data.pipeline} completed in ${totalDuration}`);
      
      if (data.metrics.errors.length > 0) {
        const warnings = data.metrics.errors.filter(e => e.optional).length;
        if (warnings > 0) {
          console.log(`⚠️  ${warnings} optional stage(s) had warnings`);
        }
      }
      console.log('');
    });
    
    pipeline.on('pipeline:error', (data) => {
      const totalDuration = this.formatDuration(data.duration);
      console.log(`\n❌ ${data.pipeline} failed after ${totalDuration}`);
      console.log(`Failed at stage: ${data.error.message}\n`);
    });
  }
  
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
}

// ASCII progress bar for long operations
class ProgressBar {
  constructor(width = 40) {
    this.width = width;
  }
  
  render(progress, stage) {
    const filled = Math.round(progress * this.width);
    const bar = '█'.repeat(filled) + '░'.repeat(this.width - filled);
    const percent = Math.round(progress * 100);
    
    process.stdout.write(`\r[${bar}] ${percent}% ${stage}`);
    
    if (progress >= 1) {
      process.stdout.write('\n');
    }
  }
}
```

### Integration with Existing Code
```javascript
// In src/habitat.js - replace linear build process
async function buildHabitatImage(configPath, extraRepos = []) {
  const config = await loadConfig(configPath);
  
  const buildPipeline = createBuildPipeline(config)
    .stage('add-extra-repos', async (ctx) => {
      if (extraRepos.length > 0) {
        ctx.config.repositories.push(...extraRepos);
      }
    }, { optional: true });
  
  const progressReporter = new ProgressReporter();
  progressReporter.attach(buildPipeline);
  
  try {
    const result = await buildPipeline.run({ config, extraRepos });
    return {
      baseTag: result.baseTag,
      preparedTag: result.finalImage
    };
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    throw error;
  }
}

// In src/testing.js - create test pipeline using functional composition
function createTestPipeline(habitat, testType) {
  const { pipe, conditional, requireProps, withRetry, branch } = require('./functional-pipeline');
  
  return new Pipeline('habitat-test')
    .stage('build-image', 
      conditional(
        (ctx) => ctx.rebuild,
        pipe(
          requireProps(['configPath']),
          (ctx) => ctx.configPath,
          buildHabitatImage,
          (result) => ({ imageTag: result.preparedTag })
        ),
        (ctx) => ({ imageTag: `claude-habitat-${ctx.habitat}:latest` })
      )
    )
    
    .stage('start-container', pipe(
      requireProps(['imageTag']),
      (ctx) => ctx.imageTag,
      withRetry(3, 2000)(startTestContainer),
      (container) => ({ container })
    ))
    
    .stage('run-tests', pipe(
      requireProps(['container', 'testType']),
      (ctx) => ({ container: ctx.container, testType: ctx.testType }),
      ({ container, testType }) => runTestSuite(container, testType),
      (results) => ({ testResults: results })
    ))
    
    .stage('collect-logs', pipe(
      requireProps(['container']),
      (ctx) => ctx.container,
      collectContainerLogs,
      (logs) => ({ logs })
    ), { optional: true })
    
    .stage('cleanup', pipe(
      requireProps(['container']),
      (ctx) => ctx.container,
      stopAndRemoveContainer,
      () => ({ cleanedUp: true })
    ), { optional: true });
}
```

## Benefits

### With Functional Composition
- **Declarative pipeline stages**: Clear data flow through pure functions
- **Composable operations**: Build complex stages from simple, testable functions
- **Automatic context management**: `requireProps` ensures stage preconditions
- **Built-in error handling**: `withTimeout`, `withRetry` provide resilience
- **Conditional execution**: `conditional`, `branch` enable smart stage skipping
- **Type safety**: Function signatures make context requirements explicit

### General Benefits  
- **Real-time progress feedback**: Users see exactly what's happening during long operations
- **Better error isolation**: Failed stages don't crash entire pipeline
- **Consistent logging and metrics**: Structured event emission for all operations
- **Easier testing**: Individual stages testable in isolation with mocked context
- **User-friendly progress reporting**: Visual progress bars and time estimates
- **Optional stages**: Non-critical operations can fail gracefully
- **Parallel execution**: `parallel` enables concurrent operations where safe

## Implementation Phases

### Phase 1: Core Framework (Day 1)
1. **Create functional-pipeline.js** with comprehensive unit tests
   - Implement all 7 higher-order functions
   - 100% test coverage before proceeding
   - Validate with property-based testing if needed

2. **Create event-pipeline.js** with core Pipeline class
   - Event emission and context management
   - Stage execution with timeout/optional support
   - Basic progress tracking

3. **Create progress-ui.js** for user interface
   - Progress bars and time estimates
   - Error formatting and suggestions

### Phase 2: Pipeline Integration (Day 2-3)
1. **Refactor build process** to use pipelines
   - Convert `buildHabitatImage` to use `createBuildPipeline`
   - Maintain backward compatibility during transition
   - Test with all existing habitat configs

2. **Refactor test process** to use pipelines
   - Convert test execution to use `createTestPipeline`
   - Add retry logic for flaky test scenarios
   - Improve test result reporting

### Phase 3: Advanced Features (Day 4-5)
1. **Add pipeline composition**: Pipelines that call other pipelines
2. **Add persistent state**: Pipeline checkpointing for long operations
3. **Add metrics collection**: Performance monitoring and optimization
4. **Create debugging tools**: Pipeline visualization and step-through debugging

## Testing Strategy

### Functional Composition Tests
```javascript
// Comprehensive unit tests for each higher-order function
test('all functional-pipeline utilities', async () => {
  // Test conditional, requireProps, withTimeout, withRetry, sequence, branch
  // Test error conditions and edge cases
  // Test composition of multiple utilities
});
```

### Pipeline Integration Tests
```javascript
// Test pipeline execution with mock stages
test('pipeline executes stages in order with context flow', async () => {
  const pipeline = new Pipeline('test')
    .stage('add-one', (ctx) => ({ value: ctx.value + 1 }))
    .stage('double', (ctx) => ({ value: ctx.value * 2 }));
    
  const result = await pipeline.run({ value: 5 });
  assert.strictEqual(result.value, 12); // (5 + 1) * 2
});
```

### End-to-End Pipeline Tests
```javascript
// Test real operations with pipeline framework
test('build pipeline creates working habitat', async () => {
  const buildPipeline = createBuildPipeline();
  const result = await buildPipeline.run({ 
    config: loadConfig('habitats/base/config.yaml') 
  });
  
  assert.ok(result.finalImage);
  assert.ok(await dockerImageExists(result.finalImage));
});
```

