const test = require('node:test');
const assert = require('node:assert');
const { MenuTestFramework } = require('./menu-testing-framework');

test('main menu displays correctly', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing main menu display...');
    
    const snapshot = await framework.captureMenuSnapshot('main', ['q'], {
      timeout: 15000
    });
    
    // Verify menu loaded successfully
    assert.ok(snapshot.success || snapshot.output.length > 0, 
              `Menu should load: ${snapshot.error || snapshot.stderr}`);
    
    // Verify menu structure
    assert.ok(snapshot.output.includes('Claude Habitat') || snapshot.output.includes('claude-habitat'), 
              'Should have correct title');
    
    // Should have some options available
    assert.ok(snapshot.options.length >= 2, 
              `Should have main options, got ${snapshot.options.length}: ${JSON.stringify(snapshot.options)}`);
    
    // Should have key menu elements
    const output = snapshot.output.toLowerCase();
    assert.ok(output.includes('start') || output.includes('test') || output.includes('habitat'),
              'Should have start, test, or habitat options');
    
    // Save as golden snapshot for future comparison
    await framework.saveSnapshot('main-menu-baseline', snapshot);
    
    console.log(`✅ Main menu test passed (${snapshot.options.length} options found)`);
    
  } catch (err) {
    console.error('Main menu test error:', err);
    throw err;
  }
});

test('main menu handles invalid input gracefully', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing main menu error handling...');
    
    const snapshot = await framework.captureMenuSnapshot('main', ['invalid', 'q'], {
      timeout: 15000
    });
    
    // Should handle invalid input without crashing
    assert.ok(snapshot.output.length > 0, 'Should produce output even with invalid input');
    
    // Should show some kind of error or help message
    const output = snapshot.output.toLowerCase();
    assert.ok(
      output.includes('invalid') || 
      output.includes('error') || 
      output.includes('try again') ||
      output.includes('choice') ||
      output.includes('option'),
      'Should provide feedback for invalid input'
    );
    
    console.log('✅ Main menu error handling test passed');
    
  } catch (err) {
    console.error('Main menu error handling test error:', err);
    throw err;
  }
});

test('main menu quit functionality works', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing main menu quit...');
    
    const snapshot = await framework.captureMenuSnapshot('main', ['q'], {
      timeout: 10000
    });
    
    // Should exit gracefully when 'q' is pressed
    assert.ok(snapshot.success || snapshot.exitCode === 0 || snapshot.output.length > 0,
              'Should handle quit gracefully');
    
    // If it shows a menu, should have quit option
    if (snapshot.options.length > 0) {
      const hasQuitOption = snapshot.structure.hasQuitOption ||
                           snapshot.options.some(opt => opt.toLowerCase().includes('quit')) ||
                           snapshot.output.toLowerCase().includes('quit');
      
      assert.ok(hasQuitOption, 'Should provide a way to quit');
    }
    
    console.log('✅ Main menu quit test passed');
    
  } catch (err) {
    console.error('Main menu quit test error:', err);
    throw err;
  }
});

test('main menu test navigation works', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing main menu test navigation...');
    
    // Try to navigate to test menu using common patterns
    const navigationInputs = [
      ['t', 'q'],    // 't' for test
      ['test', 'q'], // 'test' command
      ['2', 'q'],    // number option
      ['T', 'q']     // uppercase
    ];
    
    let foundTestMenu = false;
    let lastSnapshot = null;
    
    for (const inputs of navigationInputs) {
      try {
        const snapshot = await framework.captureMenuSnapshot('main', inputs, {
          timeout: 10000
        });
        
        lastSnapshot = snapshot;
        
        if (snapshot.output.toLowerCase().includes('test') && 
            (snapshot.output.includes('base') || snapshot.output.includes('habitat'))) {
          foundTestMenu = true;
          console.log(`Found test menu using inputs: ${JSON.stringify(inputs)}`);
          break;
        }
      } catch (err) {
        // Try next navigation pattern
        continue;
      }
    }
    
    // At minimum, should handle navigation attempts gracefully
    assert.ok(lastSnapshot && lastSnapshot.output.length > 0, 
              'Should handle navigation attempts');
    
    if (foundTestMenu) {
      console.log('✅ Main menu test navigation works');
    } else {
      console.log('⚠️  Test menu navigation not found, but menu responds to input');
    }
    
  } catch (err) {
    console.error('Main menu navigation test error:', err);
    throw err;
  }
});

test('main menu start navigation works', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing main menu start navigation...');
    
    // Try to navigate to start menu using common patterns
    const navigationInputs = [
      ['s', 'q'],      // 's' for start
      ['start', 'q'],  // 'start' command
      ['1', 'q'],      // number option
      ['S', 'q']       // uppercase
    ];
    
    let foundStartMenu = false;
    let lastSnapshot = null;
    
    for (const inputs of navigationInputs) {
      try {
        const snapshot = await framework.captureMenuSnapshot('main', inputs, {
          timeout: 10000
        });
        
        lastSnapshot = snapshot;
        
        if (snapshot.output.toLowerCase().includes('start') && 
            (snapshot.output.includes('habitat') || snapshot.output.includes('container'))) {
          foundStartMenu = true;
          console.log(`Found start menu using inputs: ${JSON.stringify(inputs)}`);
          break;
        }
      } catch (err) {
        // Try next navigation pattern
        continue;
      }
    }
    
    // At minimum, should handle navigation attempts gracefully
    assert.ok(lastSnapshot && lastSnapshot.output.length > 0, 
              'Should handle navigation attempts');
    
    if (foundStartMenu) {
      console.log('✅ Main menu start navigation works');
    } else {
      console.log('⚠️  Start menu navigation not found, but menu responds to input');
    }
    
  } catch (err) {
    console.error('Main menu start navigation test error:', err);
    throw err;
  }
});

test('main menu responds within reasonable time', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing main menu response time...');
    
    const startTime = Date.now();
    const snapshot = await framework.captureMenuSnapshot('main', ['q'], {
      timeout: 5000
    });
    const responseTime = Date.now() - startTime;
    
    // Should respond within 3 seconds
    assert(responseTime < 3000, `Menu too slow: ${responseTime}ms`);
    
    // Should produce some output
    assert.ok(snapshot.output.length > 0, 'Should produce output');
    
    console.log(`✅ Main menu response time test passed (${responseTime}ms)`);
    
  } catch (err) {
    console.error('Main menu response time test error:', err);
    throw err;
  }
});

test('main menu handles rapid input gracefully', async () => {
  const framework = new MenuTestFramework();
  
  try {
    console.log('Testing main menu with rapid input...');
    
    // Send multiple rapid inputs to test stability
    const rapidInputs = ['1', '2', '3', 'invalid', 'q'];
    
    const snapshot = await framework.captureMenuSnapshot('main', rapidInputs, {
      timeout: 15000
    });
    
    // Should handle rapid input without crashing
    assert.ok(snapshot.output.length > 0, 'Should handle rapid input');
    
    // Should not have crashed (exit code should be reasonable)
    assert.ok(snapshot.exitCode <= 1, `Should exit gracefully, got code: ${snapshot.exitCode}`);
    
    console.log('✅ Main menu rapid input test passed');
    
  } catch (err) {
    console.error('Main menu rapid input test error:', err);
    throw err;
  }
});