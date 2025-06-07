const { test } = require('node:test');
const assert = require('node:assert');

// Test pure functions without any mocking
const { buildDockerRunArgs, buildDockerExecArgs } = require('../../src/docker');
const { calculateCacheHash, parseRepoSpec } = require('../../src/utils');

// Docker pure functions
test('buildDockerRunArgs constructs basic run command', () => {
  const args = buildDockerRunArgs('run');
  assert.deepStrictEqual(args, ['run']);
});

test('buildDockerRunArgs adds detached flag', () => {
  const args = buildDockerRunArgs('run', { detached: true });
  assert.deepStrictEqual(args, ['run', '-d']);
});

test('buildDockerRunArgs adds container name', () => {
  const args = buildDockerRunArgs('run', { name: 'test-container' });
  assert.deepStrictEqual(args, ['run', '--name', 'test-container']);
});

test('buildDockerRunArgs adds environment variables', () => {
  const args = buildDockerRunArgs('run', { 
    environment: ['NODE_ENV=test', 'DEBUG=1'] 
  });
  assert.deepStrictEqual(args, ['run', '-e', 'NODE_ENV=test', '-e', 'DEBUG=1']);
});

test('buildDockerRunArgs combines all options', () => {
  const args = buildDockerRunArgs('run', {
    detached: true,
    name: 'test-container',
    environment: ['NODE_ENV=test'],
    image: 'ubuntu:22.04',
    initCommand: '/sbin/init'
  });
  
  const expected = [
    'run', '-d', 
    '--name', 'test-container',
    '-e', 'NODE_ENV=test',
    'ubuntu:22.04',
    '/sbin/init'
  ];
  
  assert.deepStrictEqual(args, expected);
});

test('buildDockerExecArgs constructs basic exec command', () => {
  const args = buildDockerExecArgs('container', 'echo hello');
  assert.deepStrictEqual(args, ['exec', 'container', 'bash', '-c', 'echo hello']);
});

test('buildDockerExecArgs adds user flag', () => {
  const args = buildDockerExecArgs('container', 'echo hello', 'testuser');
  assert.deepStrictEqual(args, ['exec', '-u', 'testuser', 'container', 'bash', '-c', 'echo hello']);
});

// Test existing pure functions still work
test('calculateCacheHash is deterministic', () => {
  const config1 = { name: 'test', repositories: [{ url: 'https://github.com/user/repo' }] };
  const config2 = { name: 'test', repositories: [{ url: 'https://github.com/user/repo' }] };
  
  const hash1 = calculateCacheHash(config1, []);
  const hash2 = calculateCacheHash(config2, []);
  
  assert.strictEqual(hash1, hash2);
});

test('parseRepoSpec handles basic URL with path', () => {
  const result = parseRepoSpec('https://github.com/user/repo:/workspace');
  
  assert.strictEqual(result.url, 'https://github.com/user/repo');
  assert.strictEqual(result.path, '/workspace');
  assert.strictEqual(result.branch, 'main');
});

test('parseRepoSpec handles URL with path and branch', () => {
  const result = parseRepoSpec('https://github.com/user/repo:/custom/path:develop');
  
  assert.strictEqual(result.url, 'https://github.com/user/repo');
  assert.strictEqual(result.path, '/custom/path');
  assert.strictEqual(result.branch, 'develop');
});

// Data transformation tests
test('buildDockerRunArgs is pure - same input produces same output', () => {
  const options = { detached: true, name: 'test' };
  
  const result1 = buildDockerRunArgs('run', options);
  const result2 = buildDockerRunArgs('run', options);
  
  assert.deepStrictEqual(result1, result2);
  
  // Verify input wasn't mutated
  assert.deepStrictEqual(options, { detached: true, name: 'test' });
});

// Edge cases and data validation
test('buildDockerRunArgs handles empty options', () => {
  const args = buildDockerRunArgs('run', {});
  assert.deepStrictEqual(args, ['run']);
});

test('buildDockerRunArgs handles undefined options', () => {
  const args = buildDockerRunArgs('run');
  assert.deepStrictEqual(args, ['run']);
});

test('buildDockerExecArgs handles null user', () => {
  const args = buildDockerExecArgs('container', 'cmd', null);
  assert.deepStrictEqual(args, ['exec', 'container', 'bash', '-c', 'cmd']);
});