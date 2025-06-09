# Event-Driven Architecture Implementation Plan

## Goal
Transform long-running operations into event-driven pipelines with progress reporting and better user feedback.

## MicroQL Integration Note
MicroQL looks promising for query composition but is orthogonal to event-driven architecture. We could potentially use it later for querying system state, but events are about real-time progress and notifications.

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

// Pipeline factory for common patterns
function createBuildPipeline(config) {
  return new Pipeline('habitat-build')
    .stage('validate-config', async (ctx) => {
      const validation = validateConfig(ctx.config);
      if (!validation.valid) {
        throw new Error(`Config validation failed: ${validation.errors.join(', ')}`);
      }
      return { validatedConfig: validation.config };
    })
    
    .stage('check-base-image', async (ctx) => {
      const imageExists = await dockerImageExists(ctx.config.image.base);
      return { baseImageAvailable: imageExists };
    })
    
    .stage('pull-base-image', async (ctx) => {
      if (!ctx.baseImageAvailable) {
        await dockerPull(ctx.config.image.base);
      }
      return { baseImageReady: true };
    }, { timeout: 300000 }) // 5 minute timeout for image pulls
    
    .stage('build-base', async (ctx) => {
      const baseTag = await buildBaseImage(ctx.config);
      return { baseTag };
    }, { timeout: 600000 }) // 10 minute timeout for builds
    
    .stage('prepare-workspace', async (ctx) => {
      await prepareWorkspace(ctx.config);
      return { workspaceReady: true };
    })
    
    .stage('clone-repositories', async (ctx) => {
      const results = await Promise.all(
        ctx.config.repositories.map(repo => cloneRepository(repo))
      );
      return { repositoriesCloned: results };
    }, { timeout: 120000 }) // 2 minute timeout for git operations
    
    .stage('run-setup-commands', async (ctx) => {
      await runSetupCommands(ctx.config);
      return { setupComplete: true };
    })
    
    .stage('create-final-image', async (ctx) => {
      const finalTag = await createFinalImage(ctx.config, ctx.baseTag);
      return { finalImage: finalTag };
    })
    
    .stage('verify-image', async (ctx) => {
      await verifyImageHealth(ctx.finalImage);
      return { verified: true };
    }, { optional: true }); // Optional verification
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

// In src/testing.js - create test pipeline
function createTestPipeline(habitat, testType) {
  return new Pipeline('habitat-test')
    .stage('build-image', async (ctx) => {
      if (ctx.rebuild) {
        const result = await buildHabitatImage(ctx.configPath);
        return { imageTag: result.preparedTag };
      } else {
        // Use existing image
        return { imageTag: `claude-habitat-${ctx.habitat}:latest` };
      }
    })
    
    .stage('start-container', async (ctx) => {
      const container = await startTestContainer(ctx.imageTag);
      return { container };
    })
    
    .stage('run-tests', async (ctx) => {
      const results = await runTestSuite(ctx.container, ctx.testType);
      return { testResults: results };
    })
    
    .stage('collect-logs', async (ctx) => {
      const logs = await collectContainerLogs(ctx.container);
      return { logs };
    }, { optional: true })
    
    .stage('cleanup', async (ctx) => {
      await stopAndRemoveContainer(ctx.container);
      return { cleanedUp: true };
    }, { optional: true });
}
```

## Benefits
- Real-time progress feedback for long operations
- Better error isolation and recovery
- Consistent logging and metrics
- Easier testing of individual stages
- User-friendly progress reporting
- Optional stages for non-critical operations

## Implementation Steps
1. Create src/event-pipeline.js with core framework
2. Create src/progress-ui.js for user interface
3. Refactor build process to use pipelines
4. Refactor test process to use pipelines
5. Add pipeline-based logging and metrics
6. Create tests for pipeline scenarios

## Future MicroQL Integration
Once event pipelines are established, we could add MicroQL for querying pipeline state:

```javascript
// Query pipeline status
const status = microql`
  pipeline(name: "habitat-build") {
    state
    progress
    currentStage
    stages {
      name
      status
      duration
    }
  }
`;
```

This would allow sophisticated querying of system state but is separate from the core event-driven architecture.