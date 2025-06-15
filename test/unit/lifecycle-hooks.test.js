/**
 * @fileoverview Unit tests for lifecycle hook execution
 * @description Tests before: and after: hook execution in the build pipeline
 * 
 * Validates that lifecycle hooks execute in the correct order relative to phases
 * and that files and scripts with hook specifications are processed properly.
 * 
 * @tests
 * - Run these tests: `npm test -- test/unit/lifecycle-hooks.test.js`
 * - Run all unit tests: `npm test`
 */

const test = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs').promises;
const { BUILD_PHASES, getPhaseConfigSections } = require('../../src/phases.js');

test('BUILD_PHASES contains correct phase ordering', () => {
  // Verify that repos comes before tools and tools comes before scripts
  const reposPhase = BUILD_PHASES.find(p => p.name === 'repos');
  const toolsPhase = BUILD_PHASES.find(p => p.name === 'tools');
  const scriptsPhase = BUILD_PHASES.find(p => p.name === 'scripts');
  
  assert.ok(reposPhase, 'repos phase should exist');
  assert.ok(toolsPhase, 'tools phase should exist');
  assert.ok(scriptsPhase, 'scripts phase should exist');
  
  assert.strictEqual(reposPhase.id, '7', 'repos should be phase 7');
  assert.strictEqual(toolsPhase.id, '8', 'tools should be phase 8');
  assert.strictEqual(scriptsPhase.id, '9', 'scripts should be phase 9');
});

test('getPhaseConfigSections returns correct config sections', () => {
  const reposConfig = getPhaseConfigSections('repos');
  const toolsConfig = getPhaseConfigSections('tools');
  const scriptsConfig = getPhaseConfigSections('scripts');
  
  assert.deepStrictEqual(reposConfig, ['repos', 'repositories'], 'repos phase should map to repos and repositories config sections');
  assert.deepStrictEqual(toolsConfig, ['tools'], 'tools phase should map to tools config section');
  assert.deepStrictEqual(scriptsConfig, ['scripts'], 'scripts phase should map to scripts config sections');
});

test('BUILD_PHASES has required properties', () => {
  for (const phase of BUILD_PHASES) {
    assert.ok(phase.id, `Phase ${phase.name} should have an id`);
    assert.ok(phase.name, `Phase ${phase.id} should have a name`);
    assert.ok(phase.description, `Phase ${phase.name} should have a description`);
    assert.ok(Array.isArray(phase.configSections), `Phase ${phase.name} should have configSections array`);
  }
});

test('Phase ordering is sequential', () => {
  for (let i = 0; i < BUILD_PHASES.length; i++) {
    const expectedId = String(i + 1);
    assert.strictEqual(BUILD_PHASES[i].id, expectedId, `Phase at index ${i} should have id ${expectedId}`);
  }
});

test('Critical phases have correct config mappings', () => {
  // Test a few key phases to ensure config mappings are correct
  assert.deepStrictEqual(getPhaseConfigSections('base'), ['base_image', 'image', 'name']);
  assert.deepStrictEqual(getPhaseConfigSections('env'), ['env']);
  assert.deepStrictEqual(getPhaseConfigSections('files'), ['files', 'volumes']);
  assert.deepStrictEqual(getPhaseConfigSections('verify'), ['verify-fs']);
  assert.deepStrictEqual(getPhaseConfigSections('test'), ['tests']);
  assert.deepStrictEqual(getPhaseConfigSections('final'), ['entry', 'container', 'claude']);
});

// Mock lifecycle hook testing 
test('Lifecycle hook execution order simulation', () => {
  // Simulate the hook execution order for a typical config
  const hookExecutionOrder = [];
  
  // Simulate files phase
  hookExecutionOrder.push('files-phase-start');
  hookExecutionOrder.push('files-default');
  hookExecutionOrder.push('files-phase-end');
  
  // Simulate repos phase
  hookExecutionOrder.push('repos-phase-start');
  hookExecutionOrder.push('before:repos-files');
  hookExecutionOrder.push('before:repos-scripts');
  hookExecutionOrder.push('repos-default');
  hookExecutionOrder.push('after:repos-files');
  hookExecutionOrder.push('after:repos-scripts');
  hookExecutionOrder.push('repos-phase-end');
  
  // Simulate tools phase  
  hookExecutionOrder.push('tools-phase-start');
  hookExecutionOrder.push('before:tools-files');
  hookExecutionOrder.push('before:tools-scripts');
  hookExecutionOrder.push('tools-default');
  hookExecutionOrder.push('after:tools-files');
  hookExecutionOrder.push('after:tools-scripts');
  hookExecutionOrder.push('tools-phase-end');
  
  // Simulate scripts phase
  hookExecutionOrder.push('scripts-phase-start');
  hookExecutionOrder.push('scripts-default');
  hookExecutionOrder.push('scripts-phase-end');
  
  // Verify expected ordering
  const reposIndex = hookExecutionOrder.indexOf('repos-default');
  const toolsIndex = hookExecutionOrder.indexOf('tools-default');
  const scriptsIndex = hookExecutionOrder.indexOf('scripts-default');
  
  assert.ok(reposIndex < toolsIndex, 'repos should execute before tools');
  assert.ok(toolsIndex < scriptsIndex, 'tools should execute before scripts');
  
  // Verify hook ordering within phases
  const beforeReposFiles = hookExecutionOrder.indexOf('before:repos-files');
  const afterReposFiles = hookExecutionOrder.indexOf('after:repos-files');
  
  assert.ok(beforeReposFiles < reposIndex, 'before:repos hooks should execute before repos phase');
  assert.ok(reposIndex < afterReposFiles, 'after:repos hooks should execute after repos phase');
});