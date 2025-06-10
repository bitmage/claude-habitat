const test = require('node:test');
const assert = require('node:assert');
const { 
  getHabitatInfrastructurePath, 
  getAllHabitatPaths, 
  normalizeContainerPath, 
  joinContainerPath,
  getWorkDir,
  getHabitatPath
} = require('../../src/path-helpers');

// Mock habitat configurations for testing
const normalHabitatConfig = {
  name: 'test-habitat',
  container: {
    work_dir: '/workspace'
  }
};

const bypassHabitatConfig = {
  name: 'claude-habitat',
  container: {
    work_dir: '/workspace'
  },
  claude: {
    bypass_habitat_construction: true
  }
};

test('getHabitatInfrastructurePath creates correct system path for normal habitat', () => {
  const result = getHabitatInfrastructurePath('system', normalHabitatConfig);
  assert.strictEqual(result, '/workspace/habitat/system');
});

test('getHabitatInfrastructurePath creates correct shared path for normal habitat', () => {
  const result = getHabitatInfrastructurePath('shared', normalHabitatConfig);
  assert.strictEqual(result, '/workspace/habitat/shared');
});

test('getHabitatInfrastructurePath creates correct local path for normal habitat', () => {
  const result = getHabitatInfrastructurePath('local', normalHabitatConfig);
  assert.strictEqual(result, '/workspace/habitat/local');
});

test('getHabitatInfrastructurePath creates correct system path for bypass habitat', () => {
  const result = getHabitatInfrastructurePath('system', bypassHabitatConfig);
  assert.strictEqual(result, '/workspace/system');
});

test('getHabitatInfrastructurePath creates correct shared path for bypass habitat', () => {
  const result = getHabitatInfrastructurePath('shared', bypassHabitatConfig);
  assert.strictEqual(result, '/workspace/shared');
});

test('getHabitatInfrastructurePath creates correct local path for bypass habitat', () => {
  const result = getHabitatInfrastructurePath('local', bypassHabitatConfig);
  assert.strictEqual(result, '/workspace/habitats/claude-habitat');
});

test('getHabitatInfrastructurePath throws on missing habitatConfig', () => {
  assert.throws(
    () => getHabitatInfrastructurePath('system', null),
    /habitatConfig parameter is required/
  );
});

test('getHabitatInfrastructurePath throws on missing component', () => {
  assert.throws(
    () => getHabitatInfrastructurePath(null, normalHabitatConfig),
    /component parameter is required/
  );
});

test('getHabitatInfrastructurePath throws on invalid component', () => {
  assert.throws(
    () => getHabitatInfrastructurePath('invalid', normalHabitatConfig),
    /Invalid component: invalid/
  );
});

test('getHabitatInfrastructurePath throws on missing work_dir', () => {
  const invalidConfig = { name: 'test' };
  assert.throws(
    () => getHabitatInfrastructurePath('system', invalidConfig),
    /Habitat configuration missing required container.work_dir/
  );
});

test('getAllHabitatPaths returns all infrastructure paths for normal habitat', () => {
  const result = getAllHabitatPaths(normalHabitatConfig);
  
  assert.strictEqual(result.system, '/workspace/habitat/system');
  assert.strictEqual(result.shared, '/workspace/habitat/shared');
  assert.strictEqual(result.local, '/workspace/habitat/local');
  assert.strictEqual(result.habitat, '/workspace/habitat');
  assert.strictEqual(result.workdir, '/workspace');
});

test('getAllHabitatPaths returns all infrastructure paths for bypass habitat', () => {
  const result = getAllHabitatPaths(bypassHabitatConfig);
  
  assert.strictEqual(result.system, '/workspace/system');
  assert.strictEqual(result.shared, '/workspace/shared');
  assert.strictEqual(result.local, '/workspace/habitats/claude-habitat');
  assert.strictEqual(result.habitat, '/workspace');
  assert.strictEqual(result.workdir, '/workspace');
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
  const workspaceConfig = { name: 'test', container: { work_dir: '/workspace' } };
  const srcConfig = { name: 'test', container: { work_dir: '/src' } };
  
  const workspacePaths = getAllHabitatPaths(workspaceConfig);
  const srcPaths = getAllHabitatPaths(srcConfig);
  
  // Should have same structure but different roots
  assert(workspacePaths.system.endsWith('/habitat/system'));
  assert(srcPaths.system.endsWith('/habitat/system'));
  assert.notStrictEqual(workspacePaths.system, srcPaths.system);
});

test('getWorkDir returns work directory from config', () => {
  const result = getWorkDir(normalHabitatConfig);
  assert.strictEqual(result, '/workspace');
});

test('getWorkDir throws on missing config', () => {
  assert.throws(
    () => getWorkDir(null),
    /habitatConfig parameter is required/
  );
});

test('getHabitatPath returns correct path for normal habitat', () => {
  const result = getHabitatPath(normalHabitatConfig);
  assert.strictEqual(result, '/workspace/habitat');
});

test('getHabitatPath returns correct path for bypass habitat', () => {
  const result = getHabitatPath(bypassHabitatConfig);
  assert.strictEqual(result, '/workspace');
});