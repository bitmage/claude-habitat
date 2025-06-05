const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

const { parseRepoPath, testGitAccess, testGitHubCliAccess, testRepositoryAccess } = require('../src/github');

// Pure function tests (already covered in pure-functions.test.js, but adding a few more)
test('parseRepoPath handles complex repository names', () => {
  assert.strictEqual(parseRepoPath('git@github.com:org-name/repo-with-dashes.git'), 'org-name/repo-with-dashes');
  assert.strictEqual(parseRepoPath('https://github.com/org.name/repo_with_underscores'), 'org.name/repo_with_underscores');
  assert.strictEqual(parseRepoPath('git@github.com:123456789/numeric-org'), '123456789/numeric-org');
});

// Integration tests with dependency injection
test('testGitAccess with mock SSH key', async () => {
  // Create a temporary "SSH key" file for testing
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-habitat-test-'));
  const fakeSshKey = path.join(tempDir, 'test_key');
  
  try {
    // Test with non-existent SSH key
    const resultNoKey = await testGitAccess('user/repo', '/nonexistent/path');
    assert.strictEqual(resultNoKey.accessible, false);
    assert.strictEqual(resultNoKey.error, 'SSH key not found');
    
    // Create fake SSH key file
    await fs.writeFile(fakeSshKey, 'fake-ssh-key-content');
    
    // Test with existing SSH key (this will fail at SSH step, which is expected)
    const resultWithKey = await testGitAccess('user/repo', fakeSshKey);
    assert.strictEqual(resultWithKey.accessible, false);
    assert(resultWithKey.error.includes('SSH authentication failed') || resultWithKey.error.includes('Repository access denied'));
    
  } finally {
    // Cleanup
    try {
      await fs.unlink(fakeSshKey);
      await fs.rmdir(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
});

test('testGitHubCliAccess handles various scenarios', async () => {
  // Test with likely non-existent repository using system gh
  const ghPath = path.join(__dirname, '../system/tools/bin/gh');
  const result = await testGitHubCliAccess('definitely-not-a-real-user/definitely-not-a-real-repo', ghPath);
  
  // Should fail, but gracefully
  assert.strictEqual(result.accessible, false);
  assert(result.error.includes('not logged into') || 
         result.error.includes('Could not resolve') || 
         result.error.includes('GitHub CLI error') ||
         result.error.includes('GitHub CLI not authenticated'));
});

test('testRepositoryAccess composition', async () => {
  // Test with unknown URL format
  const result1 = await testRepositoryAccess('https://gitlab.com/user/repo');
  assert.strictEqual(result1.accessible, true);
  assert.strictEqual(result1.reason, 'Unknown URL format, skipping validation');
  
  // Test with GitHub URL (will fail due to no SSH key/auth, but tests the flow)
  const result2 = await testRepositoryAccess('https://github.com/definitely-not-real/repo', 'read');
  assert.strictEqual(result2.accessible, false);
  assert(result2.reason.includes('Git access failed'));
  assert.strictEqual(result2.accessMode, 'read');
  
  // Test write mode 
  const result3 = await testRepositoryAccess('git@github.com:definitely-not-real/repo', 'write');
  assert.strictEqual(result3.accessible, false);
  assert.strictEqual(result3.accessMode, 'write');
  assert(result3.needsDeployKey || result3.needsGitHubCli);
});

// Test error boundary conditions
test('GitHub functions handle malformed inputs gracefully', async () => {
  // Empty strings
  assert.strictEqual(parseRepoPath(''), null);
  assert.strictEqual(parseRepoPath(null), null);
  assert.strictEqual(parseRepoPath(undefined), null);
  
  // Invalid URLs
  assert.strictEqual(parseRepoPath('not-a-url'), null);
  assert.strictEqual(parseRepoPath('https://example.com'), null);
  
  // Test functions don't crash with edge cases
  const emptyResult = await testRepositoryAccess('');
  assert(emptyResult.accessible !== undefined);
});

// Test that functions are pure and don't have side effects
test('GitHub functions are pure', () => {
  const originalUrl = 'git@github.com:user/repo.git';
  let testUrl = originalUrl;
  
  // Function should not modify input
  const result = parseRepoPath(testUrl);
  assert.strictEqual(testUrl, originalUrl);
  assert.strictEqual(result, 'user/repo');
  
  // Multiple calls should return same result
  const result1 = parseRepoPath('https://github.com/user/repo');
  const result2 = parseRepoPath('https://github.com/user/repo');
  assert.strictEqual(result1, result2);
});