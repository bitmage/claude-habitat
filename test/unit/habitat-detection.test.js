/**
 * Unit tests for habitat detection and path resolution
 * Ensures we don't regress on the path issues that broke habitat detection
 */

const test = require('node:test');
const assert = require('assert');
const path = require('path');
const { rel } = require('../../src/utils');
const { fileExists } = require('../../src/utils');

test('rel() function creates correct paths relative to project root', () => {
  const habitatPath = rel('habitats', 'claude-habitat', 'config.yaml');
  const expectedPath = path.join(__dirname, '../../habitats/claude-habitat/config.yaml');
  
  assert.strictEqual(habitatPath, expectedPath);
});

test('rel() function handles single path segment', () => {
  const habitatsDir = rel('habitats');
  const expectedPath = path.join(__dirname, '../../habitats');
  
  assert.strictEqual(habitatsDir, expectedPath);
});

test('rel() function handles multiple path segments', () => {
  const toolPath = rel('system', 'tools', 'bin', 'gh');
  const expectedPath = path.join(__dirname, '../../system/tools/bin/gh');
  
  assert.strictEqual(toolPath, expectedPath);
});

test('habitat configuration files exist and are accessible', async () => {
  // Test that known habitat configs exist
  const baseConfigPath = rel('habitats', 'base', 'config.yaml');
  const claudeHabitatConfigPath = rel('habitats', 'claude-habitat', 'config.yaml');
  
  assert.strictEqual(await fileExists(baseConfigPath), true, 'Base habitat config should exist');
  assert.strictEqual(await fileExists(claudeHabitatConfigPath), true, 'Claude habitat config should exist');
});

test('system and shared directories are accessible', async () => {
  const systemConfigPath = rel('system', 'config.yaml');
  const sharedConfigPath = rel('shared', 'config.yaml');
  
  assert.strictEqual(await fileExists(systemConfigPath), true, 'System config should exist');
  assert.strictEqual(await fileExists(sharedConfigPath), true, 'Shared config should exist');
});

test('rel() paths are absolute, not relative', () => {
  const testPath = rel('test', 'file.txt');
  
  assert.strictEqual(path.isAbsolute(testPath), true, 'rel() should return absolute paths');
});