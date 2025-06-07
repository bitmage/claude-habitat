# Container Creation E2E Tests Implementation Plan

## Problem Statement

We currently have no tests that capture the container creation process for claude-habitat. The `rel is not defined` error would have been caught by any test that actually builds containers from scratch. We need comprehensive e2e tests that:

1. **Wipe and rebuild containers** for `base` and `claude-habitat` habitats
2. **Test the complete build process** from Dockerfile to prepared image
3. **Run habitat tests** on the freshly built containers
4. **Catch build-time errors** that unit tests miss

## Current Test Coverage Gaps

### What We Have ✅
- **Unit tests**: Test pure functions and isolated components (63 tests)
- **E2E tests**: Test Docker operations and GitHub integration (13 tests)
- **Habitat tests**: Test infrastructure within existing containers

### What We're Missing ❌
- **No container build process testing** - Never test actual image creation
- **No base habitat testing** - Base habitat has no specific tests
- **No full lifecycle testing** - Don't test: build → verify → run → test
- **No regression testing for build failures** - Can't catch issues like `rel is not defined`

## Implementation Plan

### Phase 1: Base Infrastructure for Container Build Testing

#### 1.1 Create Container Build Test Utilities
**File**: `test/e2e/container-build-utils.js`
```javascript
// Utilities for container build testing
async function cleanupContainers(habitatName) {
  // Remove running containers
  // Remove prepared images 
  // Remove base images
}

async function buildHabitatFromScratch(habitatName) {
  // Force rebuild of base image
  // Force rebuild of prepared image
  // Return build logs and timings
}

async function validateContainerBuild(habitatName) {
  // Check image exists
  // Check container can start
  // Check basic functionality
}
```

#### 1.2 Add Base Habitat Configuration
**File**: `habitats/base/config.yaml` (enhance existing)
- Add meaningful tests for base habitat
- Add verify-fs section for base infrastructure
- Ensure base habitat is testable independently

### Phase 2: Container Creation E2E Tests

#### 2.1 Base Habitat Build Test
**File**: `test/e2e/base-habitat-build.test.js`
```javascript
test('base habitat builds from scratch and passes tests', async () => {
  // 1. Clean slate - remove all base habitat images/containers
  await cleanupContainers('base');
  
  // 2. Build base habitat from scratch
  const buildResult = await buildHabitatFromScratch('base');
  assert.ok(buildResult.success, 'Base habitat should build successfully');
  
  // 3. Validate build artifacts
  await validateContainerBuild('base');
  
  // 4. Run base habitat tests
  const testResult = await runHabitatTests('base');
  assert.ok(testResult.success, 'Base habitat tests should pass');
});

test('base habitat handles missing dependencies gracefully', async () => {
  // Test build failure scenarios
  // Test recovery mechanisms
});
```

#### 2.2 Claude-Habitat Build Test  
**File**: `test/e2e/claude-habitat-build.test.js`
```javascript
test('claude-habitat builds from scratch and passes all tests', async () => {
  // 1. Clean slate - remove all claude-habitat images/containers
  await cleanupContainers('claude-habitat');
  
  // 2. Build claude-habitat from scratch (includes base dependency)
  const buildResult = await buildHabitatFromScratch('claude-habitat');
  assert.ok(buildResult.success, 'Claude-habitat should build successfully');
  
  // 3. Validate build artifacts and prepared image
  await validateContainerBuild('claude-habitat');
  
  // 4. Run comprehensive tests
  const systemTests = await runSystemTests('claude-habitat');
  const sharedTests = await runSharedTests('claude-habitat');
  const habitatTests = await runHabitatSpecificTests('claude-habitat');
  const verifyFs = await runVerifyFs('claude-habitat');
  
  assert.ok(systemTests.success, 'System tests should pass');
  assert.ok(sharedTests.success, 'Shared tests should pass'); 
  assert.ok(habitatTests.success, 'Habitat-specific tests should pass');
  assert.ok(verifyFs.success, 'Filesystem verification should pass');
});

test('claude-habitat repository cloning works correctly', async () => {
  // Test the specific issue we just fixed
  // Ensure repository clones to correct location
  // Verify workspace structure is correct
});

test('claude-habitat handles npm install and test execution', async () => {
  // Test that setup commands work in container
  // Verify npm dependencies install correctly
  // Ensure unit and e2e tests can run within container
});
```

### Phase 3: Build Process Integration Tests

#### 3.1 Full Stack Build Test
**File**: `test/e2e/full-stack-build.test.js`
```javascript
test('complete rebuild of all habitats succeeds', async () => {
  // 1. Clean slate - remove ALL habitat images/containers
  await cleanupContainers('all');
  
  // 2. Build in dependency order: base → claude-habitat → discourse
  const baseResult = await buildHabitatFromScratch('base');
  const claudeResult = await buildHabitatFromScratch('claude-habitat');
  const discourseResult = await buildHabitatFromScratch('discourse');
  
  // 3. Validate all builds succeeded
  assert.ok(baseResult.success);
  assert.ok(claudeResult.success);
  assert.ok(discourseResult.success);
  
  // 4. Run comprehensive test suite across all habitats
  const allTestsResult = await runAllHabitatTests();
  assert.ok(allTestsResult.success, 'All habitat tests should pass after rebuild');
});

test('build performance remains acceptable', async () => {
  // Track build times
  // Ensure no major regressions
  // Test caching effectiveness
});
```

#### 3.2 Build Failure Recovery Tests
**File**: `test/e2e/build-failure-recovery.test.js`
```javascript
test('handles Dockerfile syntax errors gracefully', async () => {
  // Test with intentionally broken Dockerfile
  // Verify error messages are helpful
  // Test cleanup after failed builds
});

test('handles missing dependencies in setup commands', async () => {
  // Test with missing npm packages
  // Test with missing system tools
  // Verify error reporting and cleanup
});

test('handles network failures during repository cloning', async () => {
  // Mock network failures
  // Test retry mechanisms
  // Verify partial build cleanup
});
```

### Phase 4: npm Script Integration

#### 4.1 New npm Scripts
**File**: `package.json`
```json
{
  "scripts": {
    "test:build": "node --test 'test/e2e/**/*build*.test.js'",
    "test:build-base": "node --test test/e2e/base-habitat-build.test.js",
    "test:build-claude": "node --test test/e2e/claude-habitat-build.test.js",
    "test:build-all": "node --test test/e2e/full-stack-build.test.js",
    "test:complete": "npm run test:unit && npm run test:e2e && npm run test:build"
  }
}
```

#### 4.2 Enhanced test:all Script
```json
{
  "scripts": {
    "test:all": "npm run test:unit && npm run test:e2e && npm run test:habitat && npm run test:build"
  }
}
```

### Phase 5: CI/CD Integration Considerations

#### 5.1 Build Test Categories
- **Fast build tests** (< 5 minutes): Basic build validation
- **Slow build tests** (< 15 minutes): Complete rebuild and comprehensive testing
- **Nightly build tests**: Performance regression testing

#### 5.2 Resource Management
- Proper Docker image cleanup between tests
- Container resource limits for CI environments
- Parallel test execution where safe

### Phase 6: Test Infrastructure Enhancements

#### 6.1 Build Artifact Validation
```javascript
async function validateBuildArtifacts(habitatName) {
  // Verify image tags and metadata
  // Check image layer structure
  // Validate file permissions and ownership
  // Verify environment variables are set correctly
}
```

#### 6.2 Build Performance Monitoring
```javascript
async function measureBuildPerformance(habitatName) {
  // Track build times by phase
  // Monitor Docker layer caching effectiveness
  // Measure container startup times
  // Track test execution times within containers
}
```

#### 6.3 Build Log Analysis
```javascript
async function analyzeBuildLogs(buildOutput) {
  // Parse build output for warnings
  // Identify potential optimization opportunities
  // Flag security issues or bad practices
  // Extract performance metrics
}
```

## Implementation Order

1. **Create build test utilities** - Foundation for all build testing
2. **Add base habitat tests** - Ensure base habitat is properly testable
3. **Implement base habitat build test** - Start with simpler case
4. **Implement claude-habitat build test** - More complex case with repository cloning
5. **Add build failure scenarios** - Edge case testing
6. **Create full stack build test** - Integration testing
7. **Update npm scripts** - Easy access to build tests
8. **Add performance monitoring** - Regression prevention

## Success Criteria

- ✅ Can build base habitat from scratch and run tests
- ✅ Can build claude-habitat from scratch and run all test types
- ✅ Build tests catch issues like `rel is not defined` before they reach users
- ✅ Build performance is monitored and remains acceptable
- ✅ Failed builds are handled gracefully with proper cleanup
- ✅ Build tests are integrated into npm scripts and CI/CD
- ✅ All build tests complete in reasonable time (< 15 minutes total)

## Risk Mitigation

- **Long test execution times**: Parallel execution, efficient cleanup
- **Resource consumption**: Container limits, proper cleanup between tests
- **Flaky network operations**: Retry mechanisms, offline fallbacks where possible
- **CI/CD integration complexity**: Gradual rollout, feature flags for expensive tests
- **Docker daemon instability**: Health checks, daemon restart procedures

## Testing the Tests

Since these are e2e tests that test the testing infrastructure itself, we need:

1. **Smoke tests** to verify build test utilities work
2. **Mock scenarios** to test edge cases without full builds
3. **Canary deployments** to validate changes don't break CI/CD
4. **Manual testing procedures** for complex build scenarios

This comprehensive approach ensures we catch build-time issues early and maintain confidence in our container creation process.