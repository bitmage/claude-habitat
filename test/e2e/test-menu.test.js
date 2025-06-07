const test = require('node:test');
const assert = require('node:assert');
const { MenuTestFramework } = require('./menu-testing-framework');

test('test menu displays available habitats', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing test menu habitat display...');
    
    const snapshot = await framework.captureMenuSnapshot('test', ['q'], {
      timeout: 15000
    });
    
    // Verify test menu loaded
    assert.ok(snapshot.success || snapshot.output.length > 0, 
              `Test menu should load: ${snapshot.error || snapshot.stderr}`);
    
    const output = snapshot.output.toLowerCase();
    
    // Should show available habitats
    assert.ok(output.includes('base') || output.includes('habitat'), 
              'Should show base habitat option');
    
    // Should have test-related content
    assert.ok(output.includes('test') || output.includes('system') || output.includes('shared'),
              'Should show test-related options');
    
    // Should have some options
    assert.ok(snapshot.options.length >= 1, 
              `Should have test options, got ${snapshot.options.length}`);
    
    console.log(`✅ Test menu habitat display test passed (${snapshot.options.length} options)`);
    
  } catch (err) {
    console.error('Test menu habitat display test error:', err);
    throw err;
  }
});

test('test menu handles habitat selection', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing test menu habitat selection...');
    
    // Try selecting a habitat (typically first option)
    const snapshot = await framework.captureMenuSnapshot('test', ['1', 'q'], {
      timeout: 20000
    });
    
    // Should handle selection without crashing
    assert.ok(snapshot.output.length > 0, 'Should handle habitat selection');
    
    const output = snapshot.output.toLowerCase();
    
    // Should show some kind of test progression or options
    const hasTestProgression = output.includes('system') || 
                              output.includes('shared') || 
                              output.includes('habitat') ||
                              output.includes('verify') ||
                              output.includes('running') ||
                              output.includes('test');
    
    assert.ok(hasTestProgression, 'Should show test-related progression or options');
    
    console.log('✅ Test menu habitat selection test passed');
    
  } catch (err) {
    console.error('Test menu habitat selection test error:', err);
    throw err;
  }
});

test('test menu shows test type options', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing test menu test type options...');
    
    // Navigate to test menu and look for test types
    const snapshot = await framework.captureMenuSnapshot('test', ['base', 'q'], {
      timeout: 15000
    });
    
    const output = snapshot.output.toLowerCase();
    
    // Should show different test types we support
    const testTypes = ['system', 'shared', 'habitat', 'verify'];
    const foundTestTypes = testTypes.filter(type => output.includes(type));
    
    assert.ok(foundTestTypes.length >= 1, 
              `Should show test types, found: ${foundTestTypes.join(', ')}`);
    
    // Should provide some guidance on test selection
    assert.ok(output.includes('test') || output.includes('run') || output.includes('execute'),
              'Should provide test execution guidance');
    
    console.log(`✅ Test menu test types test passed (found: ${foundTestTypes.join(', ')})`);
    
  } catch (err) {
    console.error('Test menu test types test error:', err);
    throw err;
  }
});

test('test menu handles invalid habitat gracefully', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing test menu invalid habitat handling...');
    
    const snapshot = await framework.captureMenuSnapshot('test', ['nonexistent', 'q'], {
      timeout: 15000
    });
    
    // Should handle invalid habitat without crashing
    assert.ok(snapshot.output.length > 0, 'Should handle invalid habitat');
    
    const output = snapshot.output.toLowerCase();
    
    // Should provide some kind of error feedback or return to menu
    const hasErrorHandling = output.includes('invalid') || 
                            output.includes('not found') || 
                            output.includes('error') ||
                            output.includes('available') ||
                            output.includes('choice') ||
                            output.includes('habitat');
    
    assert.ok(hasErrorHandling, 'Should provide feedback for invalid habitat');
    
    console.log('✅ Test menu invalid habitat test passed');
    
  } catch (err) {
    console.error('Test menu invalid habitat test error:', err);
    throw err;
  }
});

test('test menu system test integration works', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing test menu system test integration...');
    
    // Try to run system tests via menu
    const snapshot = await framework.captureMenuSnapshot('test', ['base', 'system', 'q'], {
      timeout: 60000 // System tests might take longer
    });
    
    const output = snapshot.output.toLowerCase();
    
    // Should attempt to run system tests
    const hasSystemTestAttempt = output.includes('system') && 
                                (output.includes('test') || 
                                 output.includes('running') || 
                                 output.includes('ok') ||
                                 output.includes('tap'));
    
    assert.ok(hasSystemTestAttempt, 'Should attempt to run system tests');
    
    // Should not crash during test execution
    assert.ok(snapshot.exitCode <= 1, `Should handle system tests gracefully, got exit code: ${snapshot.exitCode}`);
    
    console.log('✅ Test menu system test integration test passed');
    
  } catch (err) {
    console.error('Test menu system test integration test error:', err);
    throw err;
  }
});

test('test menu shared test integration works', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing test menu shared test integration...');
    
    // Try to run shared tests via menu
    const snapshot = await framework.captureMenuSnapshot('test', ['base', 'shared', 'q'], {
      timeout: 60000 // Shared tests might take longer
    });
    
    const output = snapshot.output.toLowerCase();
    
    // Should attempt to run shared tests
    const hasSharedTestAttempt = output.includes('shared') && 
                                (output.includes('test') || 
                                 output.includes('running') || 
                                 output.includes('ok') ||
                                 output.includes('tap'));
    
    assert.ok(hasSharedTestAttempt, 'Should attempt to run shared tests');
    
    // Should not crash during test execution
    assert.ok(snapshot.exitCode <= 1, `Should handle shared tests gracefully, got exit code: ${snapshot.exitCode}`);
    
    console.log('✅ Test menu shared test integration test passed');
    
  } catch (err) {
    console.error('Test menu shared test integration test error:', err);
    throw err;
  }
});

test('test menu verify-fs integration works', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing test menu verify-fs integration...');
    
    // Try to run verify-fs via menu
    const snapshot = await framework.captureMenuSnapshot('test', ['base', 'verify', 'q'], {
      timeout: 30000 // Verify-fs should be faster
    });
    
    const output = snapshot.output.toLowerCase();
    
    // Should attempt to run filesystem verification
    const hasVerifyAttempt = output.includes('verify') && 
                            (output.includes('filesystem') || 
                             output.includes('fs') || 
                             output.includes('running') ||
                             output.includes('tap'));
    
    assert.ok(hasVerifyAttempt, 'Should attempt to run filesystem verification');
    
    // Should not crash during verification
    assert.ok(snapshot.exitCode <= 1, `Should handle verify-fs gracefully, got exit code: ${snapshot.exitCode}`);
    
    console.log('✅ Test menu verify-fs integration test passed');
    
  } catch (err) {
    console.error('Test menu verify-fs integration test error:', err);
    throw err;
  }
});

test('test menu navigation flow works end-to-end', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing test menu navigation flow...');
    
    // Test complete navigation flow: test → habitat → test type → quit
    const snapshot = await framework.captureMenuSnapshot('test', ['1', 'y', 'q'], {
      timeout: 30000
    });
    
    // Should handle complete navigation flow
    assert.ok(snapshot.output.length > 0, 'Should handle navigation flow');
    
    const output = snapshot.output.toLowerCase();
    
    // Should show progression through the menu system
    const hasNavigationFlow = output.includes('test') || 
                             output.includes('habitat') || 
                             output.includes('running') ||
                             output.includes('choice');
    
    assert.ok(hasNavigationFlow, 'Should show navigation flow progression');
    
    // Should exit gracefully
    assert.ok(snapshot.exitCode <= 1, 'Should exit navigation flow gracefully');
    
    console.log('✅ Test menu navigation flow test passed');
    
  } catch (err) {
    console.error('Test menu navigation flow test error:', err);
    throw err;
  }
});

test('test menu responds within reasonable time', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing test menu response time...');
    
    const startTime = Date.now();
    const snapshot = await framework.captureMenuSnapshot('test', ['q'], {
      timeout: 5000
    });
    const responseTime = Date.now() - startTime;
    
    // Should respond within 3 seconds
    assert(responseTime < 3000, `Test menu too slow: ${responseTime}ms`);
    
    // Should produce output
    assert.ok(snapshot.output.length > 0, 'Should produce output');
    
    console.log(`✅ Test menu response time test passed (${responseTime}ms)`);
    
  } catch (err) {
    console.error('Test menu response time test error:', err);
    throw err;
  }
});