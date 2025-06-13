# Dependency Injection Implementation Plan

## Current State vs Target State

### Current: Direct Imports
```javascript
// claude-habitat.js
const { startSession } = require('./src/habitat');
const { runTestMode } = require('./src/testing');
const { cleanAllImages } = require('./src/image-management');

function main() {
  // Direct usage of imported functions
  if (options.start) {
    return startSession(configPath);
  }
}
```

### Target: Dependency Injection
```javascript
// claude-habitat.js
function createSystemDependencies() {
  return {
    habitatManager: require('./src/habitat'),
    testRunner: require('./src/habitat-testing'),
    imageManager: require('./src/image-management'),
    configLoader: require('./src/config'),
    errorHandler: require('./src/errors'),
    sceneRunner: require('./src/scenes/scene-runner'),
    // etc...
  };
}

function main() {
  const deps = createSystemDependencies();
  
  if (options.start) {
    return deps.habitatManager.startSession(configPath);
  }
  
  if (options.interactive) {
    return deps.sceneRunner.runInteractive(mainMenuScene, deps);
  }
}
```

## Implementation Steps

1. **Create Dependency Container**
   - Add `createSystemDependencies()` function to claude-habitat.js
   - Import all major subsystems 
   - Return structured dependency object

2. **Update Scene System**
   - Modify scene-context.js to accept dependencies
   - Pass dependencies through scene chain
   - Update scenes to use injected dependencies instead of direct imports

3. **Update CLI Commands**
   - Modify command-executor.js to accept dependencies
   - Pass dependencies to all command implementations
   - Remove direct imports from command functions

4. **Benefits Achieved**
   - claude-habitat.js becomes true architectural overview
   - All subsystems referenced in one place
   - Easier testing (can inject mocks)
   - Clearer dependency relationships
   - Single place to understand system composition

## Files to Modify

- `claude-habitat.js` - Add dependency container
- `src/scenes/scene-context.js` - Accept dependencies
- `src/scenes/*.js` - Use injected dependencies  
- `src/command-executor.js` - Accept dependencies
- All scene and command files - Remove direct imports

## Migration Strategy

1. Implement dependency container first
2. Update scene system (contained scope)
3. Update command system (contained scope)  
4. Test thoroughly with existing functionality
5. Clean up unused direct imports

This maintains the router pattern while making dependencies explicit and testable.