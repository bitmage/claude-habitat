# Unified Logging Implementation Plan

## Goal
Replace scattered console.log/error calls with structured, contextual logging using pino.

## Architecture

### Core Logging Setup
```javascript
// src/logger.js
const pino = require('pino');

// Create base logger with environment-appropriate configuration
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'HH:MM:ss',
      messageFormat: '[{context}] {msg}'
    }
  },
  base: {
    version: require('../package.json').version
  }
});

// Create contextual child loggers
function createLogger(context) {
  return logger.child({ context });
}

// Specialized loggers for different subsystems
const loggers = {
  main: createLogger('main'),
  config: createLogger('config'),
  docker: createLogger('docker'),
  github: createLogger('github'),
  habitat: createLogger('habitat'),
  test: createLogger('test'),
  filesystem: createLogger('filesystem'),
  build: createLogger('build')
};

// Helper for creating operation-specific loggers
function createOperationLogger(operation, context = 'operation') {
  return createLogger(`${context}:${operation}`);
}

// Request ID tracking for long operations
let requestIdCounter = 0;
function createRequestLogger(operation) {
  const requestId = `req-${++requestIdCounter}`;
  return createLogger(`${operation}`).child({ requestId });
}

module.exports = {
  logger,
  createLogger,
  createOperationLogger,
  createRequestLogger,
  ...loggers
};
```

### Enhanced Logging Patterns
```javascript
// src/logging-patterns.js
const { createOperationLogger } = require('./logger');

// Operation wrapper with automatic logging
function withLogging(operationName, operation) {
  return async (...args) => {
    const log = createOperationLogger(operationName);
    const startTime = Date.now();
    
    log.info({ args: args.length }, 'Operation starting');
    
    try {
      const result = await operation(...args);
      const duration = Date.now() - startTime;
      
      log.info({ duration }, 'Operation completed successfully');
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      log.error({ 
        error: error.message, 
        stack: error.stack,
        duration 
      }, 'Operation failed');
      
      throw error;
    }
  };
}

// Progress logging for long operations
class ProgressLogger {
  constructor(operation, totalSteps) {
    this.log = createOperationLogger(operation);
    this.totalSteps = totalSteps;
    this.currentStep = 0;
    this.startTime = Date.now();
  }
  
  step(stepName, details = {}) {
    this.currentStep++;
    const progress = (this.currentStep / this.totalSteps) * 100;
    const elapsed = Date.now() - this.startTime;
    const estimatedTotal = elapsed * (this.totalSteps / this.currentStep);
    const remaining = estimatedTotal - elapsed;
    
    this.log.info({
      step: stepName,
      progress: Math.round(progress),
      stepNumber: this.currentStep,
      totalSteps: this.totalSteps,
      elapsed,
      remaining: remaining > 0 ? remaining : 0,
      ...details
    }, `Step ${this.currentStep}/${this.totalSteps}: ${stepName}`);
  }
  
  complete(details = {}) {
    const totalDuration = Date.now() - this.startTime;
    this.log.info({ 
      totalDuration,
      stepsCompleted: this.currentStep,
      ...details 
    }, 'Operation completed');
  }
  
  error(error, stepName = 'unknown') {
    const totalDuration = Date.now() - this.startTime;
    this.log.error({
      error: error.message,
      stack: error.stack,
      failedStep: stepName,
      stepsCompleted: this.currentStep,
      totalDuration
    }, 'Operation failed');
  }
}

// Structured error logging
function logError(context, error, additionalData = {}) {
  const log = createLogger(context);
  
  log.error({
    error: error.message,
    stack: error.stack,
    code: error.code,
    ...additionalData
  }, 'Error occurred');
}

// Performance monitoring
function withPerformanceLogging(operationName, thresholds = {}) {
  const slowThreshold = thresholds.slow || 5000; // 5 seconds
  const warnThreshold = thresholds.warn || 10000; // 10 seconds
  
  return function(operation) {
    return withLogging(operationName, async (...args) => {
      const log = createOperationLogger(operationName);
      const startTime = Date.now();
      
      const result = await operation(...args);
      const duration = Date.now() - startTime;
      
      if (duration > warnThreshold) {
        log.warn({ duration }, 'Operation was very slow');
      } else if (duration > slowThreshold) {
        log.info({ duration }, 'Operation was slow');
      }
      
      return result;
    });
  };
}

module.exports = {
  withLogging,
  ProgressLogger,
  logError,
  withPerformanceLogging
};
```

### Integration Examples

#### Docker Operations
```javascript
// src/docker.js
const { docker: log } = require('./logger');
const { withLogging, ProgressLogger } = require('./logging-patterns');

// Replace console.log with structured logging
const dockerRun = withLogging('docker-run', async (args) => {
  log.info({ args }, 'Starting docker run');
  
  const result = await execAsync(`docker ${args.join(' ')}`);
  
  log.info({ 
    stdout: result.stdout.substring(0, 200),
    stderr: result.stderr.substring(0, 200)
  }, 'Docker run completed');
  
  return result;
});

const buildBaseImage = withLogging('build-base-image', async (config, options = {}) => {
  const buildLog = log.child({ 
    habitat: config.name,
    rebuild: options.rebuild 
  });
  
  buildLog.info('Building base image');
  
  const progress = new ProgressLogger('build-base-image', 4);
  
  try {
    progress.step('Check existing image');
    const imageExists = await dockerImageExists(config.image.tag);
    
    if (imageExists && !options.rebuild) {
      buildLog.info('Using existing base image');
      return config.image.tag;
    }
    
    progress.step('Prepare build context');
    const buildContext = await prepareBuildContext(config);
    
    progress.step('Execute docker build');
    await dockerBuild(buildContext);
    
    progress.step('Verify image');
    await verifyImage(config.image.tag);
    
    progress.complete({ imageTag: config.image.tag });
    return config.image.tag;
    
  } catch (error) {
    progress.error(error);
    throw error;
  }
});
```

#### Habitat Operations
```javascript
// src/habitat.js
const { habitat: log, createRequestLogger } = require('./logger');
const { ProgressLogger, logError } = require('./logging-patterns');

async function startSession(configPath, extraRepos = [], overrideCommand = null, options = {}) {
  const sessionLog = createRequestLogger('start-session');
  
  sessionLog.info({ 
    configPath, 
    extraRepos: extraRepos.length,
    overrideCommand: !!overrideCommand,
    options 
  }, 'Starting habitat session');
  
  const progress = new ProgressLogger('start-session', 6);
  
  try {
    progress.step('Load configuration');
    const config = await loadConfig(configPath);
    
    progress.step('Calculate cache hash');
    const hash = calculateCacheHash(config, extraRepos);
    sessionLog.info({ hash }, 'Cache hash calculated');
    
    progress.step('Check prepared image');
    const preparedTag = `claude-habitat-${config.name}:${hash}`;
    const imageExists = await dockerImageExists(preparedTag);
    
    if (!imageExists || options.rebuild) {
      progress.step('Build environment');
      sessionLog.info({ rebuild: options.rebuild }, 'Building environment');
      await buildPreparedImage(config, preparedTag, extraRepos, options);
    } else {
      progress.step('Use cached image');
      sessionLog.info('Using cached prepared image');
    }
    
    progress.step('Parse environment');
    const envVars = parseEnvironmentVariables(config);
    sessionLog.info({ envCount: envVars.length }, 'Environment variables parsed');
    
    progress.step('Start container');
    const result = await runContainer(preparedTag, config, envVars, overrideCommand, options.tty);
    
    progress.complete({ container: result.container });
    sessionLog.info('Session completed successfully');
    
    return result;
    
  } catch (error) {
    progress.error(error);
    logError('habitat', error, { 
      configPath, 
      extraRepos: extraRepos.length 
    });
    throw error;
  }
}
```

#### Test Operations
```javascript
// src/testing.js
const { test: log } = require('./logger');
const { withPerformanceLogging } = require('./logging-patterns');

const runTestSuite = withPerformanceLogging('test-suite', {
  slow: 30000,  // 30 seconds
  warn: 120000  // 2 minutes
})(async (habitat, testType, options = {}) => {
  const testLog = log.child({ 
    habitat, 
    testType,
    rebuild: options.rebuild 
  });
  
  testLog.info('Starting test suite');
  
  // Test execution with detailed logging
  const results = [];
  
  for (const testFile of testFiles) {
    const testStart = Date.now();
    
    try {
      const result = await runSingleTest(testFile);
      const duration = Date.now() - testStart;
      
      results.push({ ...result, duration });
      
      testLog.info({ 
        test: testFile,
        passed: result.passed,
        duration 
      }, 'Test completed');
      
    } catch (error) {
      const duration = Date.now() - testStart;
      
      testLog.error({ 
        test: testFile,
        error: error.message,
        duration 
      }, 'Test failed');
      
      results.push({ 
        test: testFile, 
        passed: false, 
        error: error.message,
        duration 
      });
    }
  }
  
  const summary = {
    total: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
  };
  
  testLog.info(summary, 'Test suite completed');
  
  return { results, summary };
});
```

### Migration Strategy

#### Phase 1: Infrastructure (Day 1)
1. Add pino dependency: `npm install pino pino-pretty`
2. Create src/logger.js and src/logging-patterns.js
3. Update a few core files (docker.js, habitat.js) as examples

#### Phase 2: Systematic Replacement (Day 2-3)
1. Replace console.log/error in all src/ files
2. Add structured logging to error conditions
3. Add progress logging to long operations

#### Phase 3: Enhancement (Day 4-5)
1. Add performance monitoring
2. Create logging configuration
3. Add log rotation for production
4. Create log analysis tools

### Configuration
```javascript
// config/logging.js
module.exports = {
  development: {
    level: 'debug',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss'
      }
    }
  },
  
  production: {
    level: 'info',
    formatters: {
      level: (label) => ({ level: label })
    }
  },
  
  test: {
    level: 'error', // Quiet during tests
    transport: undefined
  }
};
```

## Benefits
- Structured, searchable logs
- Contextual information for debugging
- Performance monitoring built-in
- Progress tracking for long operations
- Consistent logging format
- Easy to add metrics/monitoring later

## Implementation Steps
1. Install pino dependencies
2. Create logging infrastructure
3. Replace console.log in docker.js and habitat.js
4. Add progress logging to build operations
5. Replace remaining console.log calls
6. Add performance monitoring
7. Test log output and formatting

This creates a solid foundation for observability that can grow with the system.