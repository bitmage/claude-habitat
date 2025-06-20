# Event-Driven Architecture Implementation Plan

## Goal
Replace silent, long-running operations with real-time progress reporting and better error handling.

## What We're Changing
Transform these operations from "wait with no feedback" to "real-time progress":

1. **Container builds** (`src/habitat.js`) - Building Docker images from config.yaml files
2. **Test execution** (`src/testing.js`) - Running habitat validation tests  
3. **Container startup** (`src/container-lifecycle.js`) - Starting and initializing containers

**Current User Experience:**
```
$ ./claude-habitat start discourse
Building habitat... (5 minute wait with no feedback)
✅ Habitat ready
```

**Target User Experience:**
```
$ ./claude-habitat start discourse
🚀 Starting discourse build...
📋 6 stages to complete

[16%] Validating configuration...
[16%] ✅ Validating configuration (0.2s)
[33%] Building base image...
[33%] ✅ Building base image (2m 15s)
[50%] Cloning repositories...
[50%] ✅ Cloning repositories (45s)
[66%] Running setup commands...
[66%] ✅ Running setup commands (1m 30s)
[83%] Creating final image...
[83%] ✅ Creating final image (30s)
[100%] Starting container...
[100%] ✅ Starting container (5s)

✅ discourse ready in 5m 25s
```

## Prerequisites
- Add RxJS dependency: `npm install rxjs`
- Domain-specific RxJS utilities from `02-functional-composition.md`

## Core Architecture

**Two new files:**
1. `src/event-pipeline.js` - RxJS-based pipeline framework
2. `src/progress-ui.js` - Progress bars and time estimates

**Key concept:** Replace linear async functions with observable pipelines that emit progress events.

## Code Transformation Examples

### Before: Silent Container Build
```javascript
// Current src/habitat.js - No progress feedback
async function buildHabitatImage(configPath) {
  const config = await loadConfig(configPath);
  await validateConfig(config);
  await buildBaseImage(config);
  await cloneRepositories(config);
  await runSetupCommands(config);
  return await createFinalImage(config);
  // User waits 5+ minutes with no feedback
}
```

### After: Real-time Progress
```javascript
// New src/habitat.js - With progress reporting
function createBuildPipeline(config) {
  return new EventPipeline('habitat-build')
    .stage('validate-config', /* validate and emit progress */)
    .stage('build-base-image', /* build with progress updates */)
    .stage('clone-repositories', /* clone with progress */)
    .stage('run-setup', /* setup with progress */)
    .stage('create-final-image', /* finalize with progress */);
}

async function buildHabitatImage(configPath) {
  const config = await loadConfig(configPath);
  const pipeline = createBuildPipeline(config);
  
  // Attach progress UI
  const progressReporter = new ProgressReporter();
  progressReporter.attach(pipeline);
  
  return await pipeline.run({ config });
  // User sees real-time progress: [25%] Building base image...
}
```

### Benefits
- **User feedback** - Users see exactly what's happening during long operations
- **Better errors** - Failed stages show specific error with context, not just "build failed"
- **Consistent interface** - All long operations use same progress reporting
- **Easier testing** - Individual stages testable in isolation

## Implementation Strategy

### Phase 1: Add RxJS Foundation (1-2 hours)
1. Add RxJS dependency: `npm install rxjs`
2. Create `src/event-pipeline.js` and `src/progress-ui.js`
3. Unit tests for pipeline framework

### Phase 2: Transform Container Build (2-3 hours)  
1. Update `src/habitat.js` to use pipeline for `buildHabitatImage()`
2. Test with existing habitat configs (base, claude-habitat, discourse)
3. Verify progress reporting works correctly

### Phase 3: Transform Test Execution (1-2 hours)
1. Update `src/testing.js` to use pipeline for test runs
2. Add progress reporting to test sequences

**Total Time Estimate: 4-7 hours**

## Technical Details

*Note: The following sections contain implementation specifics that can be referenced during development but aren't essential for understanding the high-level approach.*

<details>
<summary>Detailed RxJS Implementation (Click to expand)</summary>

### Pipeline Factory Implementation
```javascript
// Pipeline factory using RxJS operators
function createBuildPipeline(config) {
  return new EventPipeline('habitat-build')
    .stage('validate-config', /* RxJS validation pipeline */)
    .stage('build-base-image', /* RxJS build pipeline */)
    .stage('clone-repositories', /* RxJS clone pipeline */)
    // ... other stages
}
```

```javascript
// Essential implementation patterns for reference
class EventPipeline {
  constructor(name) { /* RxJS Subject for progress events */ }
  stage(name, operator, options) { /* Add stage to pipeline */ }
  run(context) { /* Execute all stages sequentially */ }
  onProgress(callback) { /* Subscribe to progress events */ }
}

class ProgressReporter {
  attach(pipeline) { /* Listen to pipeline events, display progress */ }
  formatDuration(ms) { /* Convert ms to human-readable time */ }
}

// Key RxJS operators for domain:
// - fromAsync: Convert async functions to observables  
// - requireProps: Validate context has required properties
// - conditionalMap: Branch execution based on predicate
// - stageOperator: Wrap stages with timeout/retry/progress
```
</details>

