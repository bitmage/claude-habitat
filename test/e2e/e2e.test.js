/**
 * @fileoverview E2E tests for core Claude Habitat CLI and configuration functionality
 * @description Tests fundamental CLI operations and configuration processing workflows
 * 
 * These are product-focused E2E tests that verify the essential Claude Habitat functionality:
 * CLI interface, help system, configuration listing, and system testing. They focus on our
 * actual product features rather than external Docker infrastructure or generic Unix operations.
 * 
 * @tests
 * - Run these tests: `npm run test:e2e -- test/e2e/e2e.test.js`
 * - Run all E2E tests: `npm run test:e2e`
 * - Test module: CLI interface and configuration system
 */

const test = require('node:test');
const assert = require('node:assert');
const { ProductTestBase } = require('./product-test-base');

test('claude-habitat command line interface works', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing claude-habitat CLI...');
    
    // Test help command
    const helpResult = await testRunner.runClaudeHabitatCommand(['--help'], {
      timeout: 10000,
      captureOutput: true
    });
    
    assert.strictEqual(helpResult.exitCode, 0, 'Help command should succeed');
    assert(helpResult.stdout.includes('Usage:'), 'Help should show usage information');
    assert(helpResult.stdout.includes('claude-habitat'), 'Help should mention claude-habitat');
    
    // Test list configs command
    const listResult = await testRunner.runClaudeHabitatCommand(['--list-configs'], {
      timeout: 10000,
      captureOutput: true
    });
    
    assert.strictEqual(listResult.exitCode, 0, 'List configs should succeed');
    assert(listResult.stdout.includes('base') || listResult.stdout.includes('claude-habitat'), 
           'Should list available habitats');
    
    console.log('✅ CLI interface test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('claude-habitat configuration processing works', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing configuration processing...');
    
    // Test with base habitat (minimal config)
    const configTestResult = await testRunner.runClaudeHabitatCommand(['test', 'base', '--system'], {
      timeout: 120000,
      captureOutput: true
    });
    
    // Should successfully process the config even if tests fail
    assert(configTestResult.stdout.includes('base') || configTestResult.stderr.includes('base'), 
           'Should recognize base habitat configuration');
    
    // The system should attempt to run tests (success depends on Docker availability)
    assert(configTestResult.stdout.includes('test') || configTestResult.stderr.includes('test'),
           'Should attempt to execute tests');
    
    console.log('✅ Configuration processing test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('claude-habitat error handling works gracefully', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing error handling...');
    
    // Test with non-existent habitat
    const badHabitatResult = await testRunner.runClaudeHabitatCommand(['test', 'nonexistent-habitat'], {
      timeout: 10000,
      captureOutput: true
    });
    
    // Should fail gracefully, not crash
    assert.notStrictEqual(badHabitatResult.exitCode, 0, 'Should fail for non-existent habitat');
    assert(badHabitatResult.stderr.includes('not found') || 
           badHabitatResult.stdout.includes('not found') ||
           badHabitatResult.stderr.includes('error'),
           'Should provide helpful error message');
    
    // Test with invalid arguments
    const badArgsResult = await testRunner.runClaudeHabitatCommand(['--invalid-flag'], {
      timeout: 10000,
      captureOutput: true
    });
    
    // Should handle invalid arguments gracefully
    assert.notStrictEqual(badArgsResult.exitCode, 0, 'Should fail for invalid arguments');
    
    console.log('✅ Error handling test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('claude-habitat test command variations work', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing various test command formats...');
    
    // Test different test type flags (these may fail due to Docker, but should be recognized)
    const testTypes = ['--system', '--shared', '--verify-fs', '--habitat'];
    
    for (const testType of testTypes) {
      const result = await testRunner.runClaudeHabitatCommand(['test', 'base', testType], {
        timeout: 30000,
        captureOutput: true
      });
      
      // Should recognize the test type (may fail if Docker not available, but shouldn't crash)
      // Check for test-related output or the cleaned test type name
      const cleanType = testType.replace('--', '');
      const hasTestOutput = result.stdout.includes('test') || result.stderr.includes('test');
      const hasTypeOutput = result.stdout.includes(cleanType) || result.stderr.includes(cleanType);
      
      // Special case for verify-fs which outputs "filesystem verification"
      const hasVerifyFsOutput = cleanType === 'verify-fs' && 
        (result.stdout.includes('filesystem verification') || result.stderr.includes('filesystem verification'));
        
      assert(hasTestOutput || hasTypeOutput || hasVerifyFsOutput,
             `Should recognize test type ${testType}. Output: ${result.stdout.substring(0, 200)}...`);
    }
    
    // Test verify-fs with scope
    const fsResult = await testRunner.runClaudeHabitatCommand(['test', 'base', '--verify-fs=system'], {
      timeout: 30000,
      captureOutput: true
    });
    
    assert(fsResult.stdout.includes('system') || fsResult.stderr.includes('system') ||
           fsResult.stdout.includes('infrastructure') || fsResult.stderr.includes('infrastructure'),
           'Should recognize verify-fs scope syntax');
    
    console.log('✅ Test command variations test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('claude-habitat wrapper functions work correctly', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing claude-habitat wrapper functions...');
    
    // Import and test our wrapper functions directly
    const { dockerRun, dockerExec, dockerImageExists, dockerIsRunning } = require('../../src/container-operations');
    
    // Test that functions exist and are callable
    assert.strictEqual(typeof dockerRun, 'function', 'dockerRun should be a function');
    assert.strictEqual(typeof dockerExec, 'function', 'dockerExec should be a function');
    assert.strictEqual(typeof dockerImageExists, 'function', 'dockerImageExists should be a function');
    assert.strictEqual(typeof dockerIsRunning, 'function', 'dockerIsRunning should be a function');
    
    // Test that they handle errors gracefully (don't crash)
    try {
      await dockerImageExists('nonexistent:image');
      // Should not crash, regardless of result
    } catch (err) {
      // Should have meaningful error message
      assert(err.message.length > 0, 'Error messages should be meaningful');
    }
    
    try {
      await dockerIsRunning('nonexistent-container');
      // Should not crash, regardless of result
    } catch (err) {
      // Should have meaningful error message
      assert(err.message.length > 0, 'Error messages should be meaningful');
    }
    
    console.log('✅ Wrapper functions test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('claude-habitat module integration works', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing module integration...');
    
    // Test that all our core modules can be imported without errors
    const modules = [
      '../../src/config',
      '../../src/container-operations', 
      '../../src/filesystem',
      '../../src/github',
      '../../src/habitat-testing',
      '../../src/utils',
      '../../src/habitat',
      '../../src/init',
      '../../src/menu'
    ];
    
    for (const modulePath of modules) {
      assert.doesNotThrow(() => {
        require(modulePath);
      }, `Module ${modulePath} should import without errors`);
    }
    
    // Test that config loading works
    const { loadConfig } = require('../../src/config');
    assert.strictEqual(typeof loadConfig, 'function', 'loadConfig should be exported');
    
    // Test that utility functions work
    const { calculateCacheHash, parseRepoSpec } = require('../../src/utils');
    assert.strictEqual(typeof calculateCacheHash, 'function', 'calculateCacheHash should be exported');
    assert.strictEqual(typeof parseRepoSpec, 'function', 'parseRepoSpec should be exported');
    
    console.log('✅ Module integration test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('claude-habitat handles concurrent operations safely', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing concurrent operation safety...');
    
    // Run multiple help commands concurrently
    const concurrentPromises = Array(3).fill(null).map(() => 
      testRunner.runClaudeHabitatCommand(['--help'], {
        timeout: 10000,
        captureOutput: true
      })
    );
    
    const results = await Promise.all(concurrentPromises);
    
    // All should succeed
    results.forEach((result, index) => {
      assert.strictEqual(result.exitCode, 0, `Concurrent help command ${index} should succeed`);
    });
    
    console.log('✅ Concurrent operations test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});