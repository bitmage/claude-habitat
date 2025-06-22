/**
 * @fileoverview Unit tests for configuration coalescing
 * @description Tests that environment variables are properly coalesced from
 * system → shared → habitat configuration in the correct priority order.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadHabitatEnvironmentFromConfig } = require('../../src/config');
const { rel } = require('../../src/utils');

test('config coalescing works system → shared → habitat', async () => {
  // Load discourse config which should coalesce system + shared + habitat
  const discourseConfigPath = rel('habitats/discourse/config.yaml');
  const config = await loadHabitatEnvironmentFromConfig(discourseConfigPath);
  
  // Check that system environment variables are set
  assert.ok(config._environment.SYSTEM_PATH, 'SYSTEM_PATH should be set from system config');
  assert.strictEqual(config._environment.SYSTEM_PATH, '/habitat/system', 'SYSTEM_PATH should be /habitat/system');
  
  // Check that shared environment variables are set
  assert.ok(config._environment.SHARED_PATH, 'SHARED_PATH should be set from shared config');  
  assert.strictEqual(config._environment.SHARED_PATH, '/habitat/shared', 'SHARED_PATH should be /habitat/shared');
  
  // Check that GitHub App variables from shared config are present
  assert.ok(config._environment.GITHUB_APP_ID, 'GITHUB_APP_ID should be set from shared config');
  assert.strictEqual(config._environment.GITHUB_APP_ID, '1357221', 'GITHUB_APP_ID should be correct');
  
  // Check that habitat-specific variables are set (discourse config)
  assert.ok(config._environment.WORKDIR, 'WORKDIR should be set from habitat config');
  assert.strictEqual(config._environment.WORKDIR, '/discourse', 'WORKDIR should be /discourse for discourse habitat');
  
  // Check that Rails-specific variables from discourse config are present
  assert.strictEqual(config._environment.RAILS_ENV, 'test', 'RAILS_ENV should be test from discourse config');
  
  // Verify priority: habitat overrides shared overrides system
  // WORKDIR is set differently in system (/workspace) vs discourse (/discourse)
  // Discourse should win
  assert.strictEqual(config._environment.WORKDIR, '/discourse', 'Habitat config should override system config');
});

test('environment variable expansion works correctly', async () => {
  const discourseConfigPath = rel('habitats/discourse/config.yaml');
  const config = await loadHabitatEnvironmentFromConfig(discourseConfigPath);
  
  // Check that GITHUB_APP_PEM_FILE expands SHARED_PATH correctly
  const expectedPemPath = '/habitat/shared/behold-the-power-of-claude.2025-06-04.private-key.pem';
  assert.strictEqual(config._environment.GITHUB_APP_PEM_FILE, expectedPemPath, 
    'GITHUB_APP_PEM_FILE should expand SHARED_PATH variable');
    
  // Check that SYSTEM_TOOLS_PATH expands SYSTEM_PATH correctly
  const expectedSystemToolsPath = '/habitat/system/tools/bin';
  assert.strictEqual(config._environment.SYSTEM_TOOLS_PATH, expectedSystemToolsPath,
    'SYSTEM_TOOLS_PATH should expand SYSTEM_PATH variable');
});

test('PATH variable coalescing includes all tool paths', async () => {
  const discourseConfigPath = rel('habitats/discourse/config.yaml');
  const config = await loadHabitatEnvironmentFromConfig(discourseConfigPath);
  
  const pathValue = config._environment.PATH;
  assert.ok(pathValue, 'PATH should be set');
  
  // Check that system tools are in PATH
  assert.ok(pathValue.includes('/habitat/system/tools/bin'), 'PATH should include system tools');
  
  // Check that shared tools are in PATH  
  assert.ok(pathValue.includes('/habitat/shared/tools/bin'), 'PATH should include shared tools');
  
  // Check that original PATH is preserved
  assert.ok(pathValue.includes('${PATH}') || pathValue.includes('/usr/bin'), 
    'PATH should preserve original system PATH');
});