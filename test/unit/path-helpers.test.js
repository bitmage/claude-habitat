const test = require('node:test');
const assert = require('node:assert');
const { 
  getHabitatInfrastructurePath, 
  getAllHabitatPaths, 
  normalizeContainerPath, 
  joinContainerPath 
} = require('../../src/path-helpers');

test('getHabitatInfrastructurePath creates correct system path', () => {
  const result = getHabitatInfrastructurePath('/workspace', 'system');
  assert.strictEqual(result, '/workspace/claude-habitat/system');
});

test('getHabitatInfrastructurePath creates correct shared path', () => {
  const result = getHabitatInfrastructurePath('/workspace', 'shared');
  assert.strictEqual(result, '/workspace/claude-habitat/shared');
});

test('getHabitatInfrastructurePath creates correct local path', () => {
  const result = getHabitatInfrastructurePath('/workspace', 'local');
  assert.strictEqual(result, '/workspace/claude-habitat/local');
});

test('getHabitatInfrastructurePath works with different work directories', () => {
  const result = getHabitatInfrastructurePath('/src', 'system');
  assert.strictEqual(result, '/src/claude-habitat/system');
});

test('getHabitatInfrastructurePath throws on missing workDir', () => {
  assert.throws(
    () => getHabitatInfrastructurePath(null, 'system'),
    /workDir parameter is required/
  );
});

test('getHabitatInfrastructurePath throws on missing component', () => {
  assert.throws(
    () => getHabitatInfrastructurePath('/workspace'),
    /component parameter is required/
  );
});

test('getHabitatInfrastructurePath throws on invalid component', () => {
  assert.throws(
    () => getHabitatInfrastructurePath('/workspace', 'invalid'),
    /Invalid component: invalid/
  );
});

test('getAllHabitatPaths returns all infrastructure paths', () => {
  const result = getAllHabitatPaths('/workspace');
  
  assert.strictEqual(result.system, '/workspace/claude-habitat/system');
  assert.strictEqual(result.shared, '/workspace/claude-habitat/shared');
  assert.strictEqual(result.local, '/workspace/claude-habitat/local');
  assert.strictEqual(result.root, '/workspace/claude-habitat');
});

test('getAllHabitatPaths works with different work directories', () => {
  const result = getAllHabitatPaths('/src');
  
  assert.strictEqual(result.system, '/src/claude-habitat/system');
  assert.strictEqual(result.shared, '/src/claude-habitat/shared');
  assert.strictEqual(result.local, '/src/claude-habitat/local');
  assert.strictEqual(result.root, '/src/claude-habitat');
});

test('normalizeContainerPath converts backslashes to forward slashes', () => {
  const result = normalizeContainerPath('C:\\workspace\\file.txt');
  assert.strictEqual(result, 'C:/workspace/file.txt');
});

test('normalizeContainerPath handles already normalized paths', () => {
  const result = normalizeContainerPath('/workspace/file.txt');
  assert.strictEqual(result, '/workspace/file.txt');
});

test('normalizeContainerPath handles empty and null inputs', () => {
  assert.strictEqual(normalizeContainerPath(''), '');
  assert.strictEqual(normalizeContainerPath(null), null);
  assert.strictEqual(normalizeContainerPath(undefined), undefined);
});

test('joinContainerPath joins paths with forward slashes', () => {
  const result = joinContainerPath('/workspace', 'subdir', 'file.txt');
  assert.strictEqual(result, '/workspace/subdir/file.txt');
});

test('joinContainerPath handles empty segments', () => {
  const result = joinContainerPath('/workspace', '', 'file.txt');
  assert.strictEqual(result, '/workspace/file.txt');
});

test('joinContainerPath is deterministic', () => {
  const path1 = joinContainerPath('/workspace', 'dir', 'file.txt');
  const path2 = joinContainerPath('/workspace', 'dir', 'file.txt');
  assert.strictEqual(path1, path2);
});

test('path helpers work consistently across different work directories', () => {
  const workspaceDir = '/workspace';
  const srcDir = '/src';
  
  const workspacePaths = getAllHabitatPaths(workspaceDir);
  const srcPaths = getAllHabitatPaths(srcDir);
  
  // Should have same structure but different roots
  assert(workspacePaths.system.endsWith('/claude-habitat/system'));
  assert(srcPaths.system.endsWith('/claude-habitat/system'));
  assert.notStrictEqual(workspacePaths.system, srcPaths.system);
});