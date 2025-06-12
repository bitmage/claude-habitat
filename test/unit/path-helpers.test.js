const test = require('node:test');
const assert = require('node:assert');
const { 
  HabitatPathHelpers,
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
  },
  // Since we're testing synchronous HabitatPathHelpers, we need to provide
  // env variables that would normally come from system/shared configs
  env: [
    'WORKDIR=/workspace',
    'HABITAT_PATH=${WORKDIR}/habitat',
    'SYSTEM_PATH=${HABITAT_PATH}/system',
    'SHARED_PATH=${HABITAT_PATH}/shared',
    'LOCAL_PATH=${HABITAT_PATH}/local'
  ]
};

const bypassHabitatConfig = {
  name: 'claude-habitat',
  container: {
    work_dir: '/workspace'
  },
  claude: {
    bypass_habitat_construction: true
  },
  env: [
    'WORKDIR=/workspace',
    'HABITAT_PATH=${WORKDIR}',
    'SYSTEM_PATH=${WORKDIR}/system',
    'SHARED_PATH=${WORKDIR}/shared', 
    'LOCAL_PATH=${WORKDIR}/habitats/claude-habitat'
  ]
};

// Tests for new HabitatPathHelpers class
test('HabitatPathHelpers resolves paths for bypass habitat', () => {
  const habitat_rel = new HabitatPathHelpers(bypassHabitatConfig);
  
  assert.strictEqual(habitat_rel('WORKDIR'), '/workspace');
  assert.strictEqual(habitat_rel('WORKDIR', 'CLAUDE.md'), '/workspace/CLAUDE.md');
  assert.strictEqual(habitat_rel('SYSTEM_PATH'), '/workspace/system');
  assert.strictEqual(habitat_rel('SYSTEM_PATH', 'tools/bin/rg'), '/workspace/system/tools/bin/rg');
  assert.strictEqual(habitat_rel('SHARED_PATH'), '/workspace/shared');
  assert.strictEqual(habitat_rel('LOCAL_PATH'), '/workspace/habitats/claude-habitat');
});

test('HabitatPathHelpers resolves paths for normal habitat', () => {
  const habitat_rel = new HabitatPathHelpers(normalHabitatConfig);
  
  assert.strictEqual(habitat_rel('WORKDIR'), '/workspace');
  assert.strictEqual(habitat_rel('HABITAT_PATH'), '/workspace/habitat');
  assert.strictEqual(habitat_rel('SYSTEM_PATH'), '/workspace/habitat/system');
  assert.strictEqual(habitat_rel('SHARED_PATH'), '/workspace/habitat/shared');
  assert.strictEqual(habitat_rel('LOCAL_PATH'), '/workspace/habitat/local');
});

test('HabitatPathHelpers throws on missing environment variable', () => {
  const habitat_rel = new HabitatPathHelpers(normalHabitatConfig);
  
  assert.throws(
    () => habitat_rel('INVALID_VAR'),
    /Environment variable 'INVALID_VAR' is not defined in configuration/
  );
});

test('HabitatPathHelpers handles variable resolution', () => {
  const config = {
    name: 'test',
    claude: { bypass_habitat_construction: true },
    env: [
      'WORKDIR=/workspace',
      'TOOLS_PATH=${WORKDIR}/tools',
      'BIN_PATH=${TOOLS_PATH}/bin'
    ]
  };
  
  const habitat_rel = new HabitatPathHelpers(config);
  assert.strictEqual(habitat_rel('TOOLS_PATH'), '/workspace/tools');
  assert.strictEqual(habitat_rel('BIN_PATH'), '/workspace/tools/bin');
});

// Legacy function tests
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

test('getHabitatInfrastructurePath throws on missing environment', () => {
  const invalidConfig = { name: 'test' };
  assert.throws(
    () => getHabitatInfrastructurePath('system', invalidConfig),
    /Environment variable 'SYSTEM_PATH' is not defined in configuration/
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
  const workspaceConfig = { 
    name: 'test', 
    container: { work_dir: '/workspace' },
    env: [
      'WORKDIR=/workspace',
      'HABITAT_PATH=${WORKDIR}/habitat',
      'SYSTEM_PATH=${HABITAT_PATH}/system',
      'SHARED_PATH=${HABITAT_PATH}/shared',
      'LOCAL_PATH=${HABITAT_PATH}/local'
    ]
  };
  const srcConfig = { 
    name: 'test', 
    container: { work_dir: '/src' },
    env: [
      'WORKDIR=/src',
      'HABITAT_PATH=${WORKDIR}/habitat',
      'SYSTEM_PATH=${HABITAT_PATH}/system',
      'SHARED_PATH=${HABITAT_PATH}/shared',
      'LOCAL_PATH=${HABITAT_PATH}/local'
    ]
  };
  
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