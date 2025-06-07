# Product-Focused E2E Tests Implementation Plan

## Problem Statement

Our current e2e tests focus on external infrastructure (Docker daemon, file systems) rather than testing **our actual product**. We need tests that exercise the complete lifecycle of claude-habitat as users experience it, plus a way to test interactive menus that currently have no coverage.

## Current State Analysis

### What We Currently Test (Should Remove) ❌
- **External Docker infrastructure** - Basic Docker daemon operations
- **Ubuntu containers and package installation** - Not our product
- **Generic file operations** - Standard Unix operations
- **Mock scenarios** - Don't test real product behavior

### What We Should Test (Our Product) ✅
- **Complete habitat build process** - Our container creation logic
- **Configuration processing** - Our YAML parsing and validation
- **Repository cloning workflows** - Our specific cloning logic
- **File copying and setup commands** - Our habitat construction
- **Interactive menus** - Our CLI user experience
- **Error handling and recovery** - Our error scenarios

## Implementation Plan

### Phase 1: Core Product E2E Test Infrastructure

#### 1.1 Create Product Test Base Class
**File**: `test/e2e/product-test-base.js`
```javascript
class ProductTestBase {
  constructor() {
    this.testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.cleanupActions = [];
  }

  // Clean slate - remove all test artifacts
  async cleanupTestEnvironment(habitatName) {
    // Remove any running containers with test prefix
    // Remove any images with test tags
    // Clean up any temporary files
  }

  // Build habitat from scratch using our product code
  async buildHabitatFromScratch(habitatName) {
    // Use actual ./claude-habitat.js process
    // Capture all output and timing
    // Return structured result
  }

  // Verify habitat works correctly
  async verifyHabitat(habitatName) {
    // Start container
    // Run habitat tests
    // Verify file structure
    // Check setup commands worked
  }
}
```

#### 1.2 Remove External Infrastructure Tests
**Files to Delete/Gut**:
- Remove Docker daemon testing from `test/e2e/e2e.test.js`
- Remove Ubuntu container testing
- Remove generic package installation testing
- Keep only our wrapper function validation

### Phase 2: Base Habitat Product Testing

#### 2.1 Base Habitat Full Lifecycle Test
**File**: `test/e2e/base-habitat-product.test.js`
```javascript
test('base habitat complete lifecycle works', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    // 1. Clean slate
    await testRunner.cleanupTestEnvironment('base');
    
    // 2. Build using our actual product code
    const buildResult = await testRunner.buildHabitatFromScratch('base');
    assert.ok(buildResult.success, `Build failed: ${buildResult.error}`);
    assert.ok(buildResult.baseImageCreated, 'Base image should be created');
    assert.ok(buildResult.preparedImageCreated, 'Prepared image should be created');
    
    // 3. Verify the habitat works
    const verifyResult = await testRunner.verifyHabitat('base');
    assert.ok(verifyResult.containerStarts, 'Container should start');
    assert.ok(verifyResult.systemTestsPass, 'System tests should pass');
    assert.ok(verifyResult.filesystemVerified, 'Filesystem should be verified');
    
    // 4. Test habitat-specific functionality
    assert.ok(verifyResult.systemToolsWork, 'System tools should work');
    assert.ok(verifyResult.sharedConfigApplied, 'Shared config should be applied');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('base habitat handles missing Dockerfile gracefully', async () => {
  // Test error scenarios specific to our product
});

test('base habitat caching works correctly', async () => {
  // Test our caching logic
  // Build twice, second should be faster
});
```

#### 2.2 Base Habitat Configuration Testing
**File**: `test/e2e/base-habitat-config.test.js`
```javascript
test('base habitat processes config.yaml correctly', async () => {
  // Test our configuration processing
  // Verify environment variables applied
  // Verify setup commands executed
  // Verify file operations worked
});

test('base habitat handles invalid config gracefully', async () => {
  // Test our validation and error handling
});
```

### Phase 3: Claude-Habitat Product Testing

#### 3.1 Claude-Habitat Full Lifecycle Test
**File**: `test/e2e/claude-habitat-product.test.js`
```javascript
test('claude-habitat complete lifecycle works', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    // 1. Clean slate
    await testRunner.cleanupTestEnvironment('claude-habitat');
    
    // 2. Build using our actual product code
    const buildResult = await testRunner.buildHabitatFromScratch('claude-habitat');
    assert.ok(buildResult.success, `Build failed: ${buildResult.error}`);
    assert.ok(buildResult.repositoryCloned, 'Repository should be cloned');
    assert.ok(buildResult.npmInstallSucceeded, 'npm install should succeed');
    assert.ok(buildResult.testsRanInContainer, 'Tests should run in container');
    
    // 3. Verify repository cloning worked correctly
    assert.ok(buildResult.repositoryAtCorrectPath, 'Repo should be at /workspace');
    assert.ok(buildResult.packageJsonExists, 'package.json should exist');
    assert.ok(buildResult.nodeModulesExists, 'node_modules should exist');
    
    // 4. Verify our specific setup commands
    assert.ok(buildResult.dockerSocketAccessible, 'Docker socket should be accessible');
    assert.ok(buildResult.claudeHabitatToolsWork, 'Claude-habitat tools should work');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('claude-habitat repository cloning edge cases', async () => {
  // Test the specific cloning logic we just fixed
  // Test workspace directory conflicts
  // Test branch selection
});

test('claude-habitat self-contained mode works', async () => {
  // Test bypass_habitat_construction: true
  // Verify reduced setup time
  // Verify core functionality still works
});
```

#### 3.2 Claude-Habitat Integration Testing
**File**: `test/e2e/claude-habitat-integration.test.js`
```javascript
test('claude-habitat can run its own tests inside container', async () => {
  // Build claude-habitat
  // Start container
  // Run npm test inside container
  // Verify tests pass
});

test('claude-habitat GitHub integration works', async () => {
  // Test GitHub App authentication within container
  // Test repository access from within container
  // Test tool installation within container
});
```

### Phase 4: Interactive Menu Testing Infrastructure

#### 4.1 Menu Snapshot Testing Framework
**File**: `test/e2e/menu-testing-framework.js`
```javascript
class MenuTestFramework {
  constructor() {
    this.snapshots = new Map();
  }

  // Capture menu output as snapshot
  async captureMenuSnapshot(menuType, inputs = []) {
    const result = await this.runInteractiveMenu(menuType, inputs);
    return {
      output: result.stdout,
      structure: this.parseMenuStructure(result.stdout),
      options: this.extractMenuOptions(result.stdout),
      timing: result.duration
    };
  }

  // Run menu in automated mode
  async runInteractiveMenu(menuType, inputs) {
    // Spawn ./claude-habitat with specific menu
    // Send automated inputs
    // Capture all output
    // Handle timeouts gracefully
  }

  // Parse menu structure for comparison
  parseMenuStructure(output) {
    return {
      title: this.extractTitle(output),
      options: this.extractOptions(output),
      instructions: this.extractInstructions(output),
      layout: this.analyzeLayout(output)
    };
  }

  // Compare menu snapshots intelligently
  compareMenus(snapshot1, snapshot2) {
    return {
      structureMatches: this.compareStructure(snapshot1.structure, snapshot2.structure),
      optionsMatch: this.compareOptions(snapshot1.options, snapshot2.options),
      layoutSimilar: this.compareLayout(snapshot1.layout, snapshot2.layout),
      differences: this.findDifferences(snapshot1, snapshot2)
    };
  }
}
```

#### 4.2 Main Menu Testing
**File**: `test/e2e/main-menu.test.js`
```javascript
test('main menu displays correctly', async () => {
  const framework = new MenuTestFramework();
  
  const snapshot = await framework.captureMenuSnapshot('main');
  
  // Verify menu structure
  assert.ok(snapshot.structure.title.includes('Claude Habitat'), 'Should have correct title');
  assert.ok(snapshot.options.length >= 4, 'Should have main options');
  assert.ok(snapshot.options.some(opt => opt.includes('start')), 'Should have start option');
  assert.ok(snapshot.options.some(opt => opt.includes('test')), 'Should have test option');
  
  // Save as golden snapshot for future comparison
  await framework.saveSnapshot('main-menu-baseline', snapshot);
});

test('main menu handles invalid input gracefully', async () => {
  const framework = new MenuTestFramework();
  
  const snapshot = await framework.captureMenuSnapshot('main', ['invalid', 'q']);
  
  assert.ok(snapshot.output.includes('Invalid'), 'Should show error for invalid input');
  assert.ok(snapshot.output.includes('Claude Habitat'), 'Should return to menu');
});

test('main menu navigation works', async () => {
  const framework = new MenuTestFramework();
  
  // Test navigation to test menu
  const testMenuSnapshot = await framework.captureMenuSnapshot('main', ['t', 'b']);
  assert.ok(testMenuSnapshot.output.includes('test'), 'Should navigate to test menu');
});
```

#### 4.3 Test Menu Testing
**File**: `test/e2e/test-menu.test.js`
```javascript
test('test menu displays available habitats', async () => {
  const framework = new MenuTestFramework();
  
  const snapshot = await framework.captureMenuSnapshot('test');
  
  assert.ok(snapshot.options.some(opt => opt.includes('base')), 'Should show base habitat');
  assert.ok(snapshot.options.some(opt => opt.includes('claude-habitat')), 'Should show claude-habitat');
  assert.ok(snapshot.structure.instructions.length > 0, 'Should have instructions');
});

test('habitat test submenu works', async () => {
  const framework = new MenuTestFramework();
  
  // Navigate: main → test → base → system tests
  const snapshot = await framework.captureMenuSnapshot('test', ['1', 'y']);
  
  assert.ok(snapshot.output.includes('system'), 'Should show system test option');
  assert.ok(snapshot.output.includes('shared'), 'Should show shared test option');
  assert.ok(snapshot.output.includes('habitat'), 'Should show habitat test option');
});
```

#### 4.4 Menu Regression Testing
**File**: `test/e2e/menu-regression.test.js`
```javascript
test('menu layouts remain consistent', async () => {
  const framework = new MenuTestFramework();
  
  // Load baseline snapshots
  const baselineMain = await framework.loadSnapshot('main-menu-baseline');
  const baselineTest = await framework.loadSnapshot('test-menu-baseline');
  
  // Capture current snapshots
  const currentMain = await framework.captureMenuSnapshot('main');
  const currentTest = await framework.captureMenuSnapshot('test');
  
  // Compare with AI-assisted analysis
  const mainComparison = framework.compareMenus(baselineMain, currentMain);
  const testComparison = framework.compareMenus(baselineTest, currentTest);
  
  // Allow minor differences but catch major regressions
  assert.ok(mainComparison.structureMatches, `Main menu structure changed: ${mainComparison.differences}`);
  assert.ok(testComparison.structureMatches, `Test menu structure changed: ${testComparison.differences}`);
});
```

### Phase 5: Error Scenario Testing

#### 5.1 Build Failure Testing
**File**: `test/e2e/build-failures.test.js`
```javascript
test('handles missing Dockerfile gracefully', async () => {
  // Test our error handling, not Docker's
});

test('handles repository clone failures gracefully', async () => {
  // Test our retry logic and error reporting
});

test('handles setup command failures gracefully', async () => {
  // Test our error recovery
});
```

#### 5.2 Configuration Error Testing
**File**: `test/e2e/config-errors.test.js`
```javascript
test('validates configuration files correctly', async () => {
  // Test our config validation
});

test('provides helpful error messages for config issues', async () => {
  // Test our user experience for errors
});
```

### Phase 6: Performance and Efficiency Testing

#### 6.1 Build Performance Testing
**File**: `test/e2e/build-performance.test.js`
```javascript
test('base habitat builds within acceptable time', async () => {
  const startTime = Date.now();
  await buildHabitatFromScratch('base');
  const duration = Date.now() - startTime;
  
  // Should build in under 2 minutes (first time)
  assert(duration < 120000, `Build too slow: ${duration}ms`);
});

test('cached builds are significantly faster', async () => {
  // First build
  const firstBuildTime = await timeHabitatBuild('base');
  
  // Second build (should use cache)
  const secondBuildTime = await timeHabitatBuild('base');
  
  // Should be at least 50% faster
  assert(secondBuildTime < firstBuildTime * 0.5, 'Caching not effective');
});
```

#### 6.2 Resource Usage Testing
**File**: `test/e2e/resource-usage.test.js`
```javascript
test('builds use reasonable disk space', async () => {
  // Monitor disk usage during builds
  // Ensure we're not bloating images
});

test('builds clean up properly', async () => {
  // Verify no orphaned containers/images
  // Test our cleanup logic
});
```

## Implementation Order

1. **Create ProductTestBase class** - Foundation for all product testing
2. **Remove external infrastructure tests** - Clean up current e2e tests
3. **Implement base habitat product tests** - Start with simpler case
4. **Implement claude-habitat product tests** - More complex scenario
5. **Create menu testing framework** - Novel interactive testing approach
6. **Add main menu tests** - Most critical user interface
7. **Add test menu tests** - Secondary but important interface
8. **Add error scenario tests** - Edge case coverage
9. **Add performance tests** - Regression prevention
10. **Add menu regression tests** - Prevent UI regressions

## Success Criteria

- ✅ **Full product lifecycle tested** - Build → Start → Test → Cleanup
- ✅ **Both base and claude-habitat work** - Core habitats verified
- ✅ **Interactive menus tested** - No more UI regressions
- ✅ **Error scenarios covered** - Graceful failure handling
- ✅ **Performance monitored** - Build times remain reasonable
- ✅ **Tests run efficiently** - Complete suite under 10 minutes
- ✅ **No external dependencies** - Only test our product
- ✅ **Catch build-time issues** - Would have caught `rel is not defined`

## Efficiency Measures

### Small, Fast Containers
- **base habitat**: Minimal system setup, small image
- **claude-habitat**: Self-contained mode, no large dependencies
- **No large repositories**: Focus on our build process, not payload

### Optimized Test Strategy
- **Parallel test execution** where safe
- **Shared setup/teardown** for related tests
- **Smart caching** - Don't rebuild unnecessarily
- **Fast cleanup** - Efficient resource management

### Menu Testing Innovation
- **Snapshot-based comparison** - Leverage AI for intelligent comparison
- **Automated input simulation** - No manual intervention needed
- **Structure-focused testing** - Test meaning, not exact formatting
- **Regression detection** - Catch UI changes before they reach users

## Risk Mitigation

- **Build failures**: Comprehensive error scenario testing
- **Performance regression**: Monitoring and alerting on build times
- **Resource leaks**: Automatic cleanup and verification
- **Menu complexity**: Incremental testing approach
- **CI/CD integration**: Gradual rollout with feature flags

This approach transforms our e2e testing from "testing external tools" to "testing our actual product as users experience it" while adding the missing interactive menu testing capability.