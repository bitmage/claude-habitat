/**
 * @fileoverview Unit tests for habitat configuration validation
 * @description Tests the config validation system that ensures habitat configurations
 * have required environment variables (USER, WORKDIR) and valid structure before
 * container creation.
 * 
 * Validates both positive and negative test cases for configuration validation,
 * ensuring proper error messages guide users to fix invalid configurations.
 * 
 * @tests
 * - Run these tests: `npm test -- test/unit/config-validation.test.js`
 * - Run all unit tests: `npm test`
 * - Test module: {@link module:config-validation} - Configuration validation and help system
 */

const test = require('node:test');
const assert = require('node:assert');
const { validateHabitatConfig, getConfigValidationHelp } = require('../../src/config-validation');

test('config validation catches missing USER environment variable', () => {
  const invalidConfig = { 
    name: 'test',
    container: {},
    env: ['WORKDIR=/workspace'] // Missing USER
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /Missing required environment variable: USER/
  );
});

test('config validation catches missing WORKDIR environment variable', () => {
  const invalidConfig = { 
    name: 'test',
    container: {},
    env: ['USER=root'] // Missing WORKDIR
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /Missing required environment variable: WORKDIR/
  );
});

test('config validation catches relative WORKDIR path', () => {
  const invalidConfig = { 
    name: 'test',
    container: {},
    env: [
      'USER=root',
      'WORKDIR=workspace'  // Missing leading /
    ]
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /WORKDIR environment variable must be absolute path/
  );
});

test('config validation catches missing container section', () => {
  const invalidConfig = { name: 'test' };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /Missing required section: container/
  );
});

test('config validation catches missing env section', () => {
  const invalidConfig = { 
    name: 'test',
    container: {}
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /Missing required section: env/
  );
});

test('config validation catches empty USER', () => {
  const invalidConfig = { 
    name: 'test',
    container: {},
    env: [
      'USER=',  // Empty USER
      'WORKDIR=/workspace'
    ]
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /USER environment variable must be non-empty/
  );
});

test('config validation passes with valid config', () => {
  const validConfig = {
    name: 'test',
    container: {},
    env: [
      'USER=root',
      'WORKDIR=/workspace'
    ]
  };
  
  assert.strictEqual(validateHabitatConfig(validConfig), true);
});

test('config validation validates repository paths', () => {
  const invalidConfig = {
    name: 'test',
    container: {},
    env: [
      'USER=root',
      'WORKDIR=/workspace'
    ],
    repositories: [
      {
        url: 'https://github.com/test/repo',
        path: 'relative/path'  // Should be absolute
      }
    ]
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /repositories\[0\].path must be absolute path/
  );
});

test('config validation passes with valid repositories', () => {
  const validConfig = {
    name: 'test',
    container: {},
    env: [
      'USER=root',
      'WORKDIR=/workspace'
    ],
    repositories: [
      {
        url: 'https://github.com/test/repo',
        path: '/workspace/repo'
      }
    ]
  };
  
  assert.strictEqual(validateHabitatConfig(validConfig), true);
});

test('getConfigValidationHelp provides helpful error messages for USER', () => {
  const error = new Error('Missing required environment variable: USER in test');
  const helpMessage = getConfigValidationHelp(error);
  
  assert(helpMessage.includes('Suggestion:'));
  assert(helpMessage.includes('env:'));
  assert(helpMessage.includes('USER=node'));
});

test('getConfigValidationHelp provides helpful error messages for WORKDIR', () => {
  const error = new Error('Missing required environment variable: WORKDIR in test');
  const helpMessage = getConfigValidationHelp(error);
  
  assert(helpMessage.includes('Suggestion:'));
  assert(helpMessage.includes('env:'));
  assert(helpMessage.includes('WORKDIR=/workspace'));
});

test('config validation handles optional startup_delay', () => {
  const validConfig = {
    name: 'test',
    container: {
      startup_delay: 5
    },
    env: [
      'USER=root',
      'WORKDIR=/workspace'
    ]
  };
  
  assert.strictEqual(validateHabitatConfig(validConfig), true);
});

test('config validation catches invalid startup_delay', () => {
  const invalidConfig = {
    name: 'test',
    container: {
      startup_delay: -1
    },
    env: [
      'USER=root',
      'WORKDIR=/workspace'
    ]
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /container.startup_delay must be a non-negative number/
  );
});

test('config validation catches missing name', () => {
  const invalidConfig = {
    container: {},
    env: [
      'USER=root',
      'WORKDIR=/workspace'
    ]
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /Missing required config: name/
  );
});

test('config validation handles variable references in WORKDIR', () => {
  const validConfig = {
    name: 'test',
    container: {},
    env: [
      'USER=root',
      'WORKDIR=${WORKSPACE_ROOT}/app'  // Variable reference should pass validation
    ]
  };
  
  assert.strictEqual(validateHabitatConfig(validConfig), true);
});