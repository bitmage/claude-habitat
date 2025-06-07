const test = require('node:test');
const assert = require('node:assert');
const { ProductTestBase } = require('./product-test-base');

test('base habitat complete lifecycle works', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Starting base habitat lifecycle test...');
    
    // 1. Clean slate
    await testRunner.cleanupTestEnvironment('base');
    
    // 2. Build using our actual product code
    const buildResult = await testRunner.buildHabitatFromScratch('base', {
      timeout: 180000, // 3 minutes for base habitat
      verifyFs: false // Don't verify FS during build for speed
    });
    
    console.log(`Build completed in ${buildResult.duration}ms`);
    
    // Check build success
    assert.ok(buildResult.success, `Build failed: ${buildResult.error || buildResult.stderr}`);
    assert.ok(buildResult.testsExecuted, 'System tests should have executed');
    
    // 3. Verify the habitat works
    const verifyResult = await testRunner.verifyHabitat('base', {
      verifyFs: true
    });
    
    assert.ok(verifyResult.imageExists, 'Base image should exist after build');
    assert.ok(verifyResult.success, `Verification failed: ${verifyResult.error}`);
    
    console.log('✅ Base habitat lifecycle test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('base habitat builds within reasonable time', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing base habitat build performance...');
    
    // Clean slate
    await testRunner.cleanupTestEnvironment('base');
    
    // Time the build
    const buildTiming = await testRunner.timeHabitatBuild('base', {
      timeout: 300000 // 5 minutes max
    });
    
    console.log(`Build duration: ${buildTiming.duration}ms`);
    
    // Should build in under 3 minutes for first time
    assert(buildTiming.duration < 180000, `Build too slow: ${buildTiming.duration}ms`);
    assert.ok(buildTiming.success, 'Build should succeed');
    
    console.log('✅ Base habitat performance test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('base habitat caching works correctly', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing base habitat caching...');
    
    // Clean slate
    await testRunner.cleanupTestEnvironment('base');
    
    // First build (cold)
    const firstBuild = await testRunner.timeHabitatBuild('base', {
      timeout: 300000
    });
    
    assert.ok(firstBuild.success, 'First build should succeed');
    console.log(`First build: ${firstBuild.duration}ms`);
    
    // Second build (should use cache)
    const secondBuild = await testRunner.timeHabitatBuild('base', {
      timeout: 120000 // Should be much faster
    });
    
    assert.ok(secondBuild.success, 'Second build should succeed');
    console.log(`Second build: ${secondBuild.duration}ms`);
    
    // Second build should be significantly faster (at least 30% faster)
    assert(secondBuild.duration < firstBuild.duration * 0.7, 
      `Caching not effective: first=${firstBuild.duration}ms, second=${secondBuild.duration}ms`);
    
    console.log('✅ Base habitat caching test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('base habitat handles system tests correctly', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing base habitat system test integration...');
    
    // Build the habitat
    const buildResult = await testRunner.buildHabitatFromScratch('base', {
      timeout: 180000
    });
    
    assert.ok(buildResult.success, `Build failed: ${buildResult.error}`);
    assert.ok(buildResult.testsExecuted, 'System tests should execute during build');
    
    // Verify system tests can be run independently
    const systemTestResult = await testRunner.runClaudeHabitatCommand(['test', 'base', '--system'], {
      timeout: 60000,
      captureOutput: true
    });
    
    assert.strictEqual(systemTestResult.exitCode, 0, 'System tests should pass when run independently');
    assert(systemTestResult.stdout.includes('ok'), 'Should have TAP format output');
    
    console.log('✅ Base habitat system test integration passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('base habitat filesystem verification works', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing base habitat filesystem verification...');
    
    // Build the habitat
    const buildResult = await testRunner.buildHabitatFromScratch('base', {
      timeout: 180000
    });
    
    assert.ok(buildResult.success, `Build failed: ${buildResult.error}`);
    
    // Run filesystem verification
    const fsVerifyResult = await testRunner.runClaudeHabitatCommand(['test', 'base', '--verify-fs'], {
      timeout: 30000,
      captureOutput: true
    });
    
    assert.strictEqual(fsVerifyResult.exitCode, 0, 'Filesystem verification should pass');
    assert(fsVerifyResult.stdout.includes('TAP version'), 'Should have TAP format output');
    assert(fsVerifyResult.stdout.includes('ok'), 'Should have successful verifications');
    
    // Test specific scopes
    const systemFsResult = await testRunner.runClaudeHabitatCommand(['test', 'base', '--verify-fs=system'], {
      timeout: 15000,
      captureOutput: true
    });
    
    assert.strictEqual(systemFsResult.exitCode, 0, 'System filesystem verification should pass');
    
    console.log('✅ Base habitat filesystem verification test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});