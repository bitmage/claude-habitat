/**
 * @fileoverview Unit tests for claude-habitat core functionality
 * @description Tests main entry point routing, configuration loading, and core utilities
 * 
 * Validates the primary claude-habitat module functions including cache hash generation,
 * repository specification parsing, and configuration loading workflows.
 * 
 * @tests
 * - Run these tests: `npm test -- test/unit/claude-habitat.test.js`
 * - Run all unit tests: `npm test`
 * - Test module: {@link module:claude-habitat} - Main entry point
 * - Test module: {@link module:utils} - Core utilities
 */

const test = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs').promises;
const habitat = require('../../claude-habitat.js');
const { calculateCacheHash, parseRepoSpec } = require('../../src/utils.js');

// Helper to create a temporary config file for testing
async function createTempConfig(config) {
  const tempDir = path.dirname(__filename);
  const tempPath = path.join(tempDir, `temp-config-${Date.now()}.yaml`);
  const yaml = require('js-yaml');
  await fs.writeFile(tempPath, yaml.dump(config));
  return tempPath;
}

// Helper to cleanup temp files
async function cleanup(filePath) {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore errors
  }
}

test('calculateCacheHash generates consistent hashes', () => {
  const config = {
    name: 'test-project',
    image: { tag: 'test:latest' },
    repositories: [{ url: 'https://github.com/test/repo', path: '/src' }],
    environment: ['TEST=value']  // Should be excluded from hash
  };
  
  // Same config should produce same hash
  const hash1 = calculateCacheHash(config, []);
  const hash2 = calculateCacheHash(config, []);
  assert.strictEqual(hash1, hash2);
  
  // Environment changes should not affect hash
  const configWithDiffEnv = { ...config, environment: ['TEST=different'] };
  const hash3 = calculateCacheHash(configWithDiffEnv, []);
  assert.strictEqual(hash1, hash3);
  
  // Repository changes should affect hash
  const configWithDiffRepo = { 
    ...config, 
    repositories: [{ url: 'https://github.com/test/other', path: '/src' }]
  };
  const hash4 = calculateCacheHash(configWithDiffRepo, []);
  assert.notStrictEqual(hash1, hash4);
  
  // Extra repos should affect hash
  const hash5 = calculateCacheHash(config, ['https://github.com/extra/repo:/plugins/extra']);
  assert.notStrictEqual(hash1, hash5);
  
  // Hash should be 12 characters
  assert.strictEqual(hash1.length, 12);
});

test('parseRepoSpec correctly parses repository specifications', () => {
  // Basic URL:PATH format
  const repo1 = parseRepoSpec('https://github.com/user/repo:/src');
  assert.deepStrictEqual(repo1, {
    url: 'https://github.com/user/repo',
    path: '/src',
    branch: 'main'
  });
  
  // With branch specification
  const repo2 = parseRepoSpec('https://github.com/user/repo:/src:develop');
  assert.deepStrictEqual(repo2, {
    url: 'https://github.com/user/repo',
    path: '/src',
    branch: 'develop'
  });
  
  // SSH format
  const repo3 = parseRepoSpec('git@github.com:user/repo:/plugins/my-plugin:feature');
  assert.deepStrictEqual(repo3, {
    url: 'git@github.com:user/repo',
    path: '/plugins/my-plugin',
    branch: 'feature'
  });
  
  // Should throw on invalid format
  assert.throws(
    () => parseRepoSpec('invalid-format'),
    /Invalid repo spec format \(expected URL:PATH\[:BRANCH\]\)/
  );
});

test('parseRepoSpec validates input', () => {
  // Missing required parameter
  assert.throws(
    () => parseRepoSpec(),
    /Missing required parameter: spec/
  );
  
  // Invalid format
  assert.throws(
    () => parseRepoSpec('no-colon'),
    /Invalid repo spec format \(expected URL:PATH\[:BRANCH\]\)/
  );
});

test('loadConfig validates file existence', async () => {
  // Non-existent file should fail validation
  await assert.rejects(
    async () => habitat.loadConfig('/non/existent/file.yaml'),
    /Configuration file not found/
  );
});

test('loadConfig loads and parses valid YAML file', async () => {
  const testConfig = {
    name: 'test-project',
    image: {
      dockerfile: './Dockerfile',
      tag: 'test:latest'
    },
    repositories: [
      { url: 'https://github.com/test/repo', path: '/src' }
    ],
    container: {
      work_dir: '/workspace',
      user: 'root'
    },
    env: [
      'USER=root',
      'WORKDIR=/workspace'
    ]
  };
  
  const configPath = await createTempConfig(testConfig);
  
  try {
    const config = await habitat.loadConfig(configPath);
    assert.strictEqual(config.name, 'test-project');
    assert.strictEqual(config.image.dockerfile, './Dockerfile');
    assert.strictEqual(config._configPath, configPath);
  } finally {
    await cleanup(configPath);
  }
});

test('calculateCacheHash validates inputs', () => {
  // Missing config
  assert.throws(
    () => calculateCacheHash(),
    /Invalid config/
  );
  
  // Invalid config type
  assert.throws(
    () => calculateCacheHash('not-an-object'),
    /Invalid config/
  );
  
  // Invalid extraRepos type
  assert.throws(
    () => calculateCacheHash({}, 'not-an-array'),
    /extraRepos must be an array/
  );
});

test('internal functions are not exposed in public API', () => {
  // These are now internal functions and should not be exposed
  assert.strictEqual(typeof habitat.buildBaseImage, 'undefined');
  assert.strictEqual(typeof habitat.cloneRepository, 'undefined');
  assert.strictEqual(typeof habitat.runSetupCommands, 'undefined');
  assert.strictEqual(typeof habitat.prepareWorkspace, 'undefined');
  assert.strictEqual(typeof habitat.runContainer, 'undefined');
  assert.strictEqual(typeof habitat.calculateCacheHash, 'undefined');
  assert.strictEqual(typeof habitat.parseRepoSpec, 'undefined');
  
  // Only these public methods should be exposed
  assert.strictEqual(typeof habitat.loadConfig, 'function');
  assert.strictEqual(typeof habitat.runHabitat, 'function');
});

test('command parsing handles multi-line YAML correctly', () => {
  const commands = [
    '- echo "Line 1"',
    '  echo "Line 2"',
    '  echo "Line 3"',
    '- echo "Second command"'
  ];
  
  // This would be used internally by runSetupCommands
  const parsed = [];
  let current = null;
  
  for (const line of commands) {
    if (line.startsWith('- ')) {
      if (current !== null) parsed.push(current);
      current = line.substring(2);
    } else if (current !== null) {
      current += '\n' + line.trim();
    }
  }
  if (current !== null) parsed.push(current);
  
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0], 'echo "Line 1"\necho "Line 2"\necho "Line 3"');
  assert.strictEqual(parsed[1], 'echo "Second command"');
});

test('environment variable parsing handles special cases', () => {
  const config = {
    environment: [
      '- NORMAL_VAR=value',
      '- SPACES_VAR=value with spaces',
      '- GITHUB_APP_PRIVATE_KEY_FILE=../key.pem',
      'GITHUB_APP_ID=12345'  // Without leading dash
    ]
  };
  
  const envVars = [];
  
  // Simulate the parsing logic from runHabitat
  for (const env of config.environment) {
    if (env && typeof env === 'string') {
      const cleanEnv = env.replace(/^- /, '');
      envVars.push(cleanEnv);
    }
  }
  
  assert.strictEqual(envVars.length, 4);
  assert.strictEqual(envVars[0], 'NORMAL_VAR=value');
  assert.strictEqual(envVars[1], 'SPACES_VAR=value with spaces');
  assert.strictEqual(envVars[2], 'GITHUB_APP_PRIVATE_KEY_FILE=../key.pem');
  assert.strictEqual(envVars[3], 'GITHUB_APP_ID=12345');
});

test('default values are applied correctly', () => {
  // parseRepoSpec defaults branch to 'main'
  const repo = parseRepoSpec('https://github.com/user/repo:/src');
  assert.strictEqual(repo.branch, 'main');
  
  // calculateCacheHash works with defaults
  const config = { name: 'test' };
  const hash = calculateCacheHash(config);
  assert.ok(hash); // Should not throw
});

test('cache hash excludes internal fields', () => {
  const config1 = {
    name: 'test',
    _configPath: '/path/to/config.yaml',  // Should be excluded
    environment: ['TEST=1'],              // Should be excluded
    repositories: [{ url: 'test' }]       // Should be included
  };
  
  const config2 = {
    name: 'test',
    _configPath: '/different/path.yaml',  // Different but should not matter
    environment: ['TEST=2'],               // Different but should not matter
    repositories: [{ url: 'test' }]        // Same, so hash should match
  };
  
  const hash1 = calculateCacheHash(config1);
  const hash2 = calculateCacheHash(config2);
  
  assert.strictEqual(hash1, hash2);
});