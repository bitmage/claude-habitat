/**
 * Unit tests for filesystem verification functionality
 * Tests the configuration parsing and validation logic
 */

const test = require('node:test');
const assert = require('assert');
const { verifyFilesystem } = require('../../src/filesystem');

test('verifyFilesystem returns early when no verification configured', async () => {
  const configWithoutVerification = {};
  
  const result = await verifyFilesystem(configWithoutVerification, 'test-container');
  
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.message, 'No filesystem verification configured');
});

test('verifyFilesystem handles empty required files list', async () => {
  const config = {
    'verify-fs': {
      required_files: []
    }
  };
  
  const result = await verifyFilesystem(config, 'test-container');
  
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.message, 'All 0 required files verified');
});

test('verifyFilesystem handles missing verify-fs.required_files', async () => {
  const config = {
    'verify-fs': {}
  };
  
  const result = await verifyFilesystem(config, 'test-container');
  
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.message, 'No filesystem verification configured');
});

test('verifyFilesystem handles null required_files', async () => {
  const config = {
    'verify-fs': {
      required_files: null
    }
  };
  
  const result = await verifyFilesystem(config, 'test-container');
  
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.message, 'No filesystem verification configured');
});