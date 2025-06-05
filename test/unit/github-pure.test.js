const { test } = require('node:test');
const assert = require('node:assert');

// Test only pure GitHub functions - no file system or network operations
const { parseRepoPath } = require('../../src/github');

// Pure function tests - these should be instant
test('parseRepoPath handles complex repository names', () => {
  assert.strictEqual(parseRepoPath('git@github.com:org-name/repo-with-dashes.git'), 'org-name/repo-with-dashes');
  assert.strictEqual(parseRepoPath('https://github.com/user123/project_name.git'), 'user123/project_name');
  assert.strictEqual(parseRepoPath('git@github.com:company/project.name.git'), 'company/project.name');
});

test('parseRepoPath handles malformed inputs gracefully', () => {
  assert.strictEqual(parseRepoPath(''), null);
  assert.strictEqual(parseRepoPath(null), null);
  assert.strictEqual(parseRepoPath(undefined), null);
  assert.strictEqual(parseRepoPath(123), null);
  assert.strictEqual(parseRepoPath('not-a-url'), null);
  assert.strictEqual(parseRepoPath('https://notgithub.com/user/repo'), null);
});

test('parseRepoPath is pure - no side effects', () => {
  const input = 'git@github.com:user/repo.git';
  const result1 = parseRepoPath(input);
  const result2 = parseRepoPath(input);
  
  // Same input produces same output
  assert.strictEqual(result1, result2);
  assert.strictEqual(result1, 'user/repo');
  
  // Input is unchanged
  assert.strictEqual(input, 'git@github.com:user/repo.git');
});