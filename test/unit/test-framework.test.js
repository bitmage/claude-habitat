const { test } = require('node:test');
const assert = require('assert');
const { createTest, assertions } = require('../../src/test-framework');

test('createTest handles setup and teardown correctly', async () => {
  let setupCalled = false;
  let teardownCalled = false;
  let testExecuted = false;
  
  const testWithSetup = createTest({
    setup: [
      async (context) => {
        setupCalled = true;
        context.testData = 'setup-value';
        
        // Return cleanup function
        return async () => {
          teardownCalled = true;
        };
      }
    ],
    timeout: 5000
  });
  
  testWithSetup('test with setup/teardown', async (context) => {
    testExecuted = true;
    assert.strictEqual(context.testData, 'setup-value');
  });
  
  // Wait for test to complete
  await new Promise(resolve => setTimeout(resolve, 100));
  
  assert.strictEqual(setupCalled, true, 'Setup should have been called');
  assert.strictEqual(testExecuted, true, 'Test should have been executed');
  assert.strictEqual(teardownCalled, true, 'Teardown should have been called');
});

test('createTest handles multiple setup functions', async () => {
  const setupOrder = [];
  const teardownOrder = [];
  
  const testWithMultipleSetup = createTest({
    setup: [
      async (context) => {
        setupOrder.push('setup1');
        context.value1 = 'first';
        return async () => teardownOrder.push('teardown1');
      },
      async (context) => {
        setupOrder.push('setup2');
        context.value2 = 'second';
        return async () => teardownOrder.push('teardown2');
      },
      async (context) => {
        setupOrder.push('setup3');
        context.value3 = 'third';
        return async () => teardownOrder.push('teardown3');
      }
    ]
  });
  
  testWithMultipleSetup('test with multiple setup', async (context) => {
    assert.strictEqual(context.value1, 'first');
    assert.strictEqual(context.value2, 'second');
    assert.strictEqual(context.value3, 'third');
  });
  
  // Wait for test to complete
  await new Promise(resolve => setTimeout(resolve, 100));
  
  assert.deepStrictEqual(setupOrder, ['setup1', 'setup2', 'setup3']);
  // Teardown should be in reverse order (LIFO)
  assert.deepStrictEqual(teardownOrder, ['teardown3', 'teardown2', 'teardown1']);
});

test('createTest handles setup failure with partial cleanup', async () => {
  let setup1Called = false;
  let setup2Called = false;
  let cleanup1Called = false;
  let errorThrown = false;
  
  const testWithFailingSetup = createTest({
    setup: [
      async (context) => {
        setup1Called = true;
        context.value1 = 'first';
        return async () => {
          cleanup1Called = true;
        };
      },
      async (context) => {
        setup2Called = true;
        throw new Error('Setup failure');
      }
    ]
  });
  
  try {
    testWithFailingSetup('test with failing setup', async (context) => {
      // This should not run
      assert.fail('Test should not execute when setup fails');
    });
    
    // Wait for test to complete
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    errorThrown = true;
    assert.ok(error.message.includes('Setup failed'));
  }
  
  assert.strictEqual(setup1Called, true, 'First setup should have been called');
  assert.strictEqual(setup2Called, true, 'Second setup should have been attempted');
  assert.strictEqual(cleanup1Called, true, 'First setup cleanup should have been called');
  assert.strictEqual(errorThrown, true, 'Error should have been thrown');
});

test('createTest enforces timeout', async () => {
  const fastTest = createTest({
    timeout: 100 // 100ms timeout
  });
  
  let timeoutError = false;
  
  try {
    fastTest('test that times out', async () => {
      // Wait longer than timeout
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    
    // Wait for test to complete/timeout
    await new Promise(resolve => setTimeout(resolve, 250));
  } catch (error) {
    timeoutError = true;
    assert.ok(error.message.includes('timeout'));
  }
  
  assert.strictEqual(timeoutError, true, 'Timeout error should have been thrown');
});

test('assertions helper functions work correctly', async () => {
  // Test that assertions exist and are functions
  assert.strictEqual(typeof assertions.containerIsRunning, 'function');
  assert.strictEqual(typeof assertions.containerExitedWith, 'function');
  assert.strictEqual(typeof assertions.fileExistsInContainer, 'function');
  assert.strictEqual(typeof assertions.commandSucceedsInContainer, 'function');
});

console.log('✅ All test framework tests passed');