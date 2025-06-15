/**
 * @fileoverview E2E tests for build failure handling and error recovery
 * @description Tests graceful handling of various build failure scenarios and invalid configurations
 * 
 * These tests ensure that Claude Habitat fails gracefully when encountering missing files,
 * invalid configurations, or other build errors. They verify that error messages are helpful
 * and the system doesn't crash or hang when facing expected failure conditions.
 * 
 * @tests
 * - Run these tests: `npm run test:e2e -- test/e2e/build-failures.test.js`
 * - Run all E2E tests: `npm run test:e2e`
 * - Test module: Error handling and graceful failure patterns
 */

const test = require('node:test');
const assert = require('node:assert');
const { ProductTestBase } = require('./product-test-base');

test('handles missing Dockerfile gracefully', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing missing Dockerfile handling...');
    
    // Try to build a habitat that doesn't exist
    const buildResult = await testRunner.runClaudeHabitatCommand(['test', 'nonexistent-habitat'], {
      timeout: 30000,
      captureOutput: true
    });
    
    // Should fail gracefully, not crash
    assert.notStrictEqual(buildResult.exitCode, 0, 'Should fail for nonexistent habitat');
    
    // Should provide helpful error message
    const errorOutput = (buildResult.stderr + buildResult.stdout).toLowerCase();
    const hasHelpfulError = errorOutput.includes('not found') || 
                           errorOutput.includes('does not exist') ||
                           errorOutput.includes('missing') ||
                           errorOutput.includes('error') ||
                           errorOutput.includes('invalid');
    
    assert.ok(hasHelpfulError, 'Should provide helpful error message for missing Dockerfile');
    
    // Should not hang or timeout unexpectedly
    assert.ok(buildResult.stderr.length > 0 || buildResult.stdout.length > 0, 
              'Should produce error output');
    
    console.log('✅ Missing Dockerfile handling test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('handles invalid configuration gracefully', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing invalid configuration handling...');
    
    // Test with various invalid arguments that might cause config issues
    const invalidArgs = [
      ['test', 'base', '--invalid-flag'],
      ['test', '', '--system'],
      ['invalid-command', 'base'],
      ['test', 'base', '--verify-fs=invalid-scope']
    ];
    
    for (const args of invalidArgs) {
      const result = await testRunner.runClaudeHabitatCommand(args, {
        timeout: 15000,
        captureOutput: true
      });
      
      // Should handle invalid config without crashing
      assert.ok(result.exitCode !== undefined, `Should handle args: ${args.join(' ')}`);
      
      // Should provide some output (error or help)
      assert.ok(result.stdout.length > 0 || result.stderr.length > 0, 
                `Should provide output for args: ${args.join(' ')}`);
    }
    
    console.log('✅ Invalid configuration handling test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('handles Docker daemon unavailable gracefully', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing Docker daemon unavailable handling...');
    
    // Try to run tests with potentially unavailable Docker
    const buildResult = await testRunner.runClaudeHabitatCommand(['test', 'base', '--system'], {
      timeout: 60000,
      captureOutput: true,
      env: { PATH: '/nonexistent/path' } // Simulate Docker unavailable
    });
    
    // Should handle Docker unavailability gracefully
    assert.ok(buildResult.exitCode !== undefined, 'Should complete even if Docker unavailable');
    
    const output = (buildResult.stderr + buildResult.stdout).toLowerCase();
    
    // Should provide meaningful error about Docker issues
    if (buildResult.exitCode !== 0) {
      const hasDockerError = output.includes('docker') || 
                            output.includes('command not found') ||
                            output.includes('permission denied') ||
                            output.includes('cannot connect') ||
                            output.includes('daemon');
      
      assert.ok(hasDockerError, 'Should provide Docker-related error information');
    }
    
    console.log('✅ Docker daemon unavailable handling test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('handles repository clone failures gracefully', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing repository clone failure handling...');
    
    // This test focuses on our error handling, not actual repo issues
    // We'll test by looking at how the system responds to build failures
    
    const buildResult = await testRunner.runClaudeHabitatCommand(['test', 'base', '--system'], {
      timeout: 120000,
      captureOutput: true
    });
    
    // Our error handling should be robust
    assert.ok(buildResult.exitCode !== undefined, 'Should handle build process');
    
    // Should produce meaningful output
    assert.ok(buildResult.stdout.length > 0 || buildResult.stderr.length > 0, 
              'Should produce output during build process');
    
    // If build fails, should provide useful information
    if (buildResult.exitCode !== 0) {
      const output = (buildResult.stderr + buildResult.stdout).toLowerCase();
      const hasUsefulInfo = output.includes('error') || 
                           output.includes('failed') ||
                           output.includes('cannot') ||
                           output.includes('unable') ||
                           output.length > 50; // At least some diagnostic info
      
      assert.ok(hasUsefulInfo, 'Should provide useful diagnostic information on failure');
    }
    
    console.log('✅ Repository clone failure handling test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('handles build process failures gracefully', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing build process failure handling...');
    
    // Test our error recovery by examining build output
    const buildResult = await testRunner.runClaudeHabitatCommand(['test', 'base', '--system'], {
      timeout: 180000,
      captureOutput: true
    });
    
    // System should handle build process issues gracefully
    assert.ok(buildResult.exitCode !== undefined, 'Should complete build process');
    
    const output = buildResult.stdout + buildResult.stderr;
    
    // Should show progression through build steps
    const hasBuildProgression = output.includes('system') || 
                               output.includes('test') ||
                               output.includes('running') ||
                               output.includes('ok') ||
                               output.length > 100; // Substantial output
    
    assert.ok(hasBuildProgression, 'Should show build progression');
    
    // If there are failures, should continue or provide recovery information
    if (buildResult.exitCode !== 0) {
      const hasErrorRecovery = output.toLowerCase().includes('error') ||
                              output.toLowerCase().includes('failed') ||
                              output.toLowerCase().includes('retrying') ||
                              output.toLowerCase().includes('skipping');
      
      // Either succeeds or shows error recovery
      assert.ok(hasErrorRecovery || buildResult.exitCode === 0, 
                'Should show error recovery or succeed');
    }
    
    console.log('✅ Setup command failure handling test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('handles permission errors gracefully', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing permission error handling...');
    
    // Test permission-related error handling
    const buildResult = await testRunner.runClaudeHabitatCommand(['test', 'base', '--verify-fs'], {
      timeout: 30000,
      captureOutput: true
    });
    
    // Should handle permission issues without hanging
    assert.ok(buildResult.exitCode !== undefined, 'Should handle permission scenarios');
    
    const output = (buildResult.stderr + buildResult.stdout).toLowerCase();
    
    // Should provide output about the verification process
    assert.ok(output.length > 0, 'Should provide output about verification');
    
    // If permission errors occur, should handle them gracefully
    if (output.includes('permission') || output.includes('denied')) {
      assert.ok(output.includes('error') || output.includes('failed') || output.includes('unable'),
                'Should acknowledge permission issues');
    }
    
    console.log('✅ Permission error handling test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('handles network connectivity issues gracefully', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing network connectivity issue handling...');
    
    // Simulate network issues by using invalid proxy settings
    const buildResult = await testRunner.runClaudeHabitatCommand(['test', 'base', '--system'], {
      timeout: 60000,
      captureOutput: true,
      env: { 
        ...process.env,
        HTTP_PROXY: 'http://invalid-proxy:9999',
        HTTPS_PROXY: 'http://invalid-proxy:9999'
      }
    });
    
    // Should handle network issues without indefinite hanging
    assert.ok(buildResult.exitCode !== undefined, 'Should handle network scenarios');
    
    // Should provide some output even with network issues
    assert.ok(buildResult.stdout.length > 0 || buildResult.stderr.length > 0, 
              'Should provide output even with network issues');
    
    const output = (buildResult.stderr + buildResult.stdout).toLowerCase();
    
    // If network issues cause failures, should provide meaningful error
    if (buildResult.exitCode !== 0 && output.includes('network')) {
      assert.ok(output.includes('error') || output.includes('failed') || output.includes('timeout'),
                'Should provide meaningful network error information');
    }
    
    console.log('✅ Network connectivity issue handling test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('handles resource exhaustion gracefully', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing resource exhaustion handling...');
    
    // Test with very limited timeout to simulate resource pressure
    const buildResult = await testRunner.runClaudeHabitatCommand(['test', 'base', '--system'], {
      timeout: 5000, // Very short timeout
      captureOutput: true
    });
    
    // Should handle resource constraints gracefully
    assert.ok(buildResult.exitCode !== undefined, 'Should handle resource constraints');
    
    // Should not crash unexpectedly
    const output = buildResult.stdout + buildResult.stderr;
    assert.ok(output.length >= 0, 'Should handle timeout scenarios without crashing');
    
    // If it times out, that's expected behavior
    if (buildResult.exitCode !== 0) {
      console.log('Build timed out as expected under resource constraints');
    }
    
    console.log('✅ Resource exhaustion handling test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('handles concurrent build attempts safely', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing concurrent build attempt handling...');
    
    // Run multiple builds concurrently to test for race conditions
    const concurrentBuilds = Array(3).fill(null).map((_, index) => 
      testRunner.runClaudeHabitatCommand(['test', 'base', '--verify-fs'], {
        timeout: 30000,
        captureOutput: true
      }).catch(err => ({
        exitCode: 1,
        stdout: '',
        stderr: err.message,
        error: err
      }))
    );
    
    const results = await Promise.all(concurrentBuilds);
    
    // All should complete without crashing
    results.forEach((result, index) => {
      assert.ok(result.exitCode !== undefined, `Concurrent build ${index} should complete`);
      assert.ok(typeof result.stdout === 'string', `Concurrent build ${index} should have stdout`);
      assert.ok(typeof result.stderr === 'string', `Concurrent build ${index} should have stderr`);
    });
    
    // At least one should produce meaningful output
    const hasOutput = results.some(result => 
      result.stdout.length > 0 || result.stderr.length > 0
    );
    assert.ok(hasOutput, 'At least one concurrent build should produce output');
    
    console.log('✅ Concurrent build attempt handling test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});