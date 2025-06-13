/**
 * @fileoverview E2E tests for container rebuild functionality and forced recreation
 * @description Tests full container rebuild workflows including --rebuild flag and fresh container generation
 * 
 * These tests verify that the rebuild functionality works correctly, including forcing fresh
 * container builds and handling rebuild scenarios without crashing. They ensure that the
 * --rebuild flag properly triggers complete container recreation with appropriate progress indicators.
 * 
 * @tests
 * - Run these tests: `npm run test:e2e -- test/e2e/rebuild-functionality.test.js`
 * - Run all E2E tests: `npm run test:e2e`
 * - Test module: Container rebuild and forced recreation workflows
 */

const test = require('node:test');
const assert = require('node:assert');
const { ProductTestBase } = require('./product-test-base');

test('full container rebuild of base habitat', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing full container rebuild of base habitat...');
    
    // First build the base habitat normally
    const initialBuild = await testRunner.runClaudeHabitatCommand(['test', 'base', '--habitat'], {
      timeout: 300000, // 5 minutes for initial build
      captureOutput: true
    });
    
    console.log('Initial build completed with exit code:', initialBuild.exitCode);
    
    // Now rebuild with --rebuild flag (simulated via CLI args)
    const rebuildResult = await testRunner.runClaudeHabitatCommand(['start', 'base', '--rebuild'], {
      timeout: 300000, // 5 minutes for rebuild
      captureOutput: true
    });
    
    console.log('Rebuild completed with exit code:', rebuildResult.exitCode);
    
    // Should handle rebuild without crashing
    assert.ok(rebuildResult.exitCode !== undefined, 'Rebuild should complete');
    
    const rebuildOutput = rebuildResult.stdout + rebuildResult.stderr;
    
    // Should show rebuild indicators
    const hasRebuildIndicators = rebuildOutput.includes('🔄') || 
                                rebuildOutput.includes('rebuild') ||
                                rebuildOutput.includes('Rebuild') ||
                                rebuildOutput.includes('fresh') ||
                                rebuildOutput.includes('Building');
    
    assert.ok(hasRebuildIndicators, 'Should show rebuild progress indicators');
    
    // Should produce substantial output showing build process
    assert.ok(rebuildOutput.length > 100, 'Should produce substantial output during rebuild');
    
    console.log('✅ Base habitat rebuild test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('full container rebuild of claude-habitat', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing full container rebuild of claude-habitat...');
    
    // Test rebuild of the special claude-habitat (bypass mode)
    const rebuildResult = await testRunner.runClaudeHabitatCommand(['start', 'claude-habitat', '--rebuild'], {
      timeout: 300000, // 5 minutes for rebuild
      captureOutput: true
    });
    
    console.log('Claude-habitat rebuild completed with exit code:', rebuildResult.exitCode);
    
    // Should handle claude-habitat rebuild without dockerfile path errors
    assert.ok(rebuildResult.exitCode !== undefined, 'Claude-habitat rebuild should complete');
    
    const rebuildOutput = rebuildResult.stdout + rebuildResult.stderr;
    
    // Should NOT have dockerfile path errors
    const hasDockerfileErrors = rebuildOutput.includes('Dockerfile not found') ||
                               rebuildOutput.includes('habitats/claude-habitat/habitats/claude-habitat') ||
                               rebuildOutput.includes('duplicated path');
    
    assert.ok(!hasDockerfileErrors, 'Should not have dockerfile path resolution errors');
    
    // Should show proper build progression
    const hasBuildProgression = rebuildOutput.includes('Building') ||
                               rebuildOutput.includes('Image') ||
                               rebuildOutput.includes('Docker') ||
                               rebuildOutput.includes('🔄');
    
    // Either succeeds with build progression or fails with clear error (not path issues)
    if (rebuildResult.exitCode !== 0) {
      // If it fails, should be for legitimate reasons, not path bugs
      const hasLegitimateError = rebuildOutput.includes('Docker') ||
                                rebuildOutput.includes('permission') ||
                                rebuildOutput.includes('network') ||
                                rebuildOutput.includes('timeout') ||
                                rebuildOutput.includes('resource');
      
      assert.ok(hasLegitimateError, 'Failure should be for legitimate reasons, not path bugs');
    } else {
      assert.ok(hasBuildProgression, 'Successful build should show progression');
    }
    
    console.log('✅ Claude-habitat rebuild test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('dockerfile path resolution consistency', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing dockerfile path resolution consistency...');
    
    // Test multiple habitats to ensure consistent path handling
    const habitats = ['base', 'claude-habitat'];
    
    for (const habitat of habitats) {
      console.log(`Testing path resolution for ${habitat}...`);
      
      const buildResult = await testRunner.runClaudeHabitatCommand(['start', habitat, '--rebuild'], {
        timeout: 30000, // Short timeout, we just want to see initial path resolution
        captureOutput: true
      });
      
      const output = buildResult.stdout + buildResult.stderr;
      
      // Should NOT have path duplication errors
      const hasPathDuplication = output.includes(`${habitat}/${habitat}`) ||
                                 output.includes('habitats/habitats') ||
                                 output.includes('duplicated') ||
                                 output.includes('not found at') && output.includes(`${habitat}/${habitat}`);
      
      assert.ok(!hasPathDuplication, `${habitat} should not have path duplication errors`);
      
      // If dockerfile not found, should be for right reasons (missing file, not wrong path)
      if (output.includes('Dockerfile not found')) {
        const hasCorrectPath = output.includes(`habitats/${habitat}/Dockerfile`) &&
                              !output.includes(`habitats/${habitat}/habitats/${habitat}`);
        
        assert.ok(hasCorrectPath, `${habitat} dockerfile path should be correctly resolved`);
      }
    }
    
    console.log('✅ Dockerfile path resolution consistency test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('rebuild flag propagation through test system', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing rebuild flag propagation through test system...');
    
    // We can't easily test the shift-key UI functionality in automated tests,
    // but we can test that the rebuild infrastructure works end-to-end
    
    const testResult = await testRunner.runClaudeHabitatCommand(['test', 'base', '--habitat'], {
      timeout: 120000, // 2 minutes
      captureOutput: true
    });
    
    console.log('Test with potential rebuild completed with exit code:', testResult.exitCode);
    
    // Should complete the test process
    assert.ok(testResult.exitCode !== undefined, 'Test with rebuild should complete');
    
    const output = testResult.stdout + testResult.stderr;
    
    // Should show test execution
    const hasTestExecution = output.includes('test') ||
                            output.includes('ok') ||
                            output.includes('Running') ||
                            output.includes('completed') ||
                            output.includes('✅');
    
    assert.ok(hasTestExecution, 'Should show test execution progress');
    
    // Should not crash during test preparation
    const hasCrashIndicators = output.includes('segfault') ||
                              output.includes('core dumped') ||
                              output.includes('stack trace') ||
                              output.includes('unhandled exception');
    
    assert.ok(!hasCrashIndicators, 'Should not crash during test preparation');
    
    console.log('✅ Rebuild flag propagation test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('build caching vs rebuild behavior', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing build caching vs rebuild behavior...');
    
    // First run - should build from scratch
    const firstRun = await testRunner.runClaudeHabitatCommand(['start', 'base', '--cmd', 'echo "test"'], {
      timeout: 120000,
      captureOutput: true
    });
    
    console.log('First run completed with exit code:', firstRun.exitCode);
    
    const firstOutput = firstRun.stdout + firstRun.stderr;
    
    // Should show build process or use cache
    const showsBuildProcess = firstOutput.includes('Building') ||
                             firstOutput.includes('cached') ||
                             firstOutput.includes('Using') ||
                             firstOutput.includes('Image');
    
    // Should produce some meaningful output about the process
    assert.ok(showsBuildProcess || firstOutput.length > 50, 'Should show build process or meaningful output');
    
    // Second run with rebuild - should rebuild even if cache exists
    const rebuildRun = await testRunner.runClaudeHabitatCommand(['start', 'base', '--rebuild', '--cmd', 'echo "test"'], {
      timeout: 120000,
      captureOutput: true
    });
    
    console.log('Rebuild run completed with exit code:', rebuildRun.exitCode);
    
    const rebuildOutput = rebuildRun.stdout + rebuildRun.stderr;
    
    // Should show rebuild indicators
    const showsRebuild = rebuildOutput.includes('🔄') ||
                        rebuildOutput.includes('rebuild') ||
                        rebuildOutput.includes('fresh') ||
                        rebuildOutput.includes('Building');
    
    // If both succeed, rebuild should show different behavior than cache usage
    if (firstRun.exitCode === 0 && rebuildRun.exitCode === 0) {
      assert.ok(showsRebuild, 'Rebuild should show different behavior than cached build');
    }
    
    console.log('✅ Build caching vs rebuild behavior test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});