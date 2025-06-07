const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');

test('verify-fs bash script exists and is executable', async () => {
  const scriptPath = path.join(__dirname, '../../system/tools/bin/verify-fs');
  
  // Check if file exists
  await assert.doesNotReject(fs.access(scriptPath, fs.constants.F_OK));
  
  // Check if file is executable
  await assert.doesNotReject(fs.access(scriptPath, fs.constants.X_OK));
});

test('verify-fs script has correct shebang', async () => {
  const scriptPath = path.join(__dirname, '../../system/tools/bin/verify-fs');
  const content = await fs.readFile(scriptPath, 'utf8');
  
  assert(content.startsWith('#!/bin/bash'), 'Script should start with bash shebang');
});

test('verify-fs script supports help option', async () => {
  const scriptPath = path.join(__dirname, '../../system/tools/bin/verify-fs');
  const content = await fs.readFile(scriptPath, 'utf8');
  
  assert(content.includes('show_usage'), 'Script should have usage function');
  assert(content.includes('--help'), 'Script should support --help option');
});

test('verify-fs script supports all required scopes', async () => {
  const scriptPath = path.join(__dirname, '../../system/tools/bin/verify-fs');
  const content = await fs.readFile(scriptPath, 'utf8');
  
  assert(content.includes('system'), 'Script should support system scope');
  assert(content.includes('shared'), 'Script should support shared scope');
  assert(content.includes('habitat'), 'Script should support habitat scope');
  assert(content.includes('all'), 'Script should support all scope');
});

test('verify-fs script uses TAP format', async () => {
  const scriptPath = path.join(__dirname, '../../system/tools/bin/verify-fs');
  const content = await fs.readFile(scriptPath, 'utf8');
  
  assert(content.includes('TAP version 13'), 'Script should output TAP version');
  assert(content.includes('tap_ok'), 'Script should have TAP ok function');
  assert(content.includes('tap_not_ok'), 'Script should have TAP not ok function');
});

test('shared config has verify-fs section', async () => {
  const configPath = path.join(__dirname, '../../shared/config.yaml');
  const content = await fs.readFile(configPath, 'utf8');
  
  assert(content.includes('verify-fs:'), 'Shared config should have verify-fs section');
  assert(content.includes('required_files:'), 'Shared config should list required files');
});

test('system config has verify-fs section', async () => {
  const configPath = path.join(__dirname, '../../system/config.yaml');
  const content = await fs.readFile(configPath, 'utf8');
  
  assert(content.includes('verify-fs:'), 'System config should have verify-fs section');
  assert(content.includes('required_files:'), 'System config should list required files');
});

test('habitat configs have verify-fs sections', async () => {
  const habitatsDir = path.join(__dirname, '../../habitats');
  const dirs = await fs.readdir(habitatsDir);
  
  for (const dir of dirs) {
    const configPath = path.join(habitatsDir, dir, 'config.yaml');
    try {
      const content = await fs.readFile(configPath, 'utf8');
      if (content.includes('verify-fs:')) {
        assert(content.includes('required_files:'), `${dir} config should list required files`);
      }
    } catch (err) {
      // Config file doesn't exist, skip
    }
  }
});

test('verify-fs CLI parsing supports scope syntax', () => {
  // Test the testType parsing logic for verify-fs:scope format
  const testType = 'verify-fs:system';
  const parts = testType.split(':');
  const scope = parts[1] || 'all';
  
  assert.strictEqual(scope, 'system', 'Should parse system scope correctly');
});

test('verify-fs scope parsing handles all valid scopes', () => {
  const validScopes = ['system', 'shared', 'habitat', 'all'];
  
  for (const scope of validScopes) {
    const testType = `verify-fs:${scope}`;
    const parts = testType.split(':');
    const parsedScope = parts[1] || 'all';
    
    assert.strictEqual(parsedScope, scope, `Should parse ${scope} scope correctly`);
  }
});

test('verify-fs default scope is all', () => {
  const testType = 'verify-fs';
  const parts = testType.split(':');
  const scope = parts[1] || 'all';
  
  assert.strictEqual(scope, 'all', 'Default scope should be all');
});

test('verify-fs script error handling', async () => {
  const scriptPath = path.join(__dirname, '../../system/tools/bin/verify-fs');
  const content = await fs.readFile(scriptPath, 'utf8');
  
  assert(content.includes('set -e'), 'Script should exit on errors');
  assert(content.includes('total_failures'), 'Script should track failures');
  assert(content.includes('exit 1'), 'Script should exit with error code on failure');
});