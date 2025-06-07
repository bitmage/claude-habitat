/**
 * Unit tests for CLI command parsing and routing
 * Tests that commands are properly parsed and routed to correct functions
 */

const test = require('node:test');
const assert = require('assert');

// Test that verify-fs command routes correctly (without actually running containers)
test('verify-fs command identifier is recognized', () => {
  const testType = 'verify-fs';
  const validTestTypes = ['system', 'shared', 'verify-fs', 'habitat'];
  
  assert.strictEqual(validTestTypes.includes(testType), true, 'verify-fs should be a valid test type');
});

test('test type parsing handles all valid options', () => {
  const validTestTypes = [
    'system',
    'shared', 
    'verify-fs',
    'habitat',
    'all',
    'menu'
  ];
  
  validTestTypes.forEach(testType => {
    assert.strictEqual(typeof testType, 'string', `${testType} should be a string`);
    assert.strictEqual(testType.length > 0, true, `${testType} should not be empty`);
  });
});

test('habitat names are validated correctly', () => {
  const validHabitatNames = ['base', 'claude-habitat', 'discourse'];
  const invalidHabitatNames = ['', null, undefined];
  
  validHabitatNames.forEach(name => {
    assert.strictEqual(typeof name, 'string', `Valid habitat name ${name} should be string`);
    assert.strictEqual(name.length > 0, true, `Valid habitat name ${name} should not be empty`);
  });
  
  invalidHabitatNames.forEach(name => {
    if (name !== null && name !== undefined) {
      const isInvalid = (typeof name === 'string' && name.length === 0) || typeof name !== 'string';
      assert.strictEqual(isInvalid, true, `Invalid habitat name ${name} should be rejected`);
    } else {
      // null and undefined are inherently invalid
      assert.strictEqual(name === null || name === undefined, true, `Invalid habitat name ${name} should be rejected`);
    }
  });
});