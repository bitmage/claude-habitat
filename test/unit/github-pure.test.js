const { test } = require('node:test');
const assert = require('node:assert');

const { 
  parseRepoPath, 
  buildGitHubJWT, 
  parseGitHubApiResponse, 
  categorizeGitHubCliError, 
  categorizeSSHError 
} = require('../../src/github');

// Repository path parsing tests
test('parseRepoPath handles GitHub SSH URLs', () => {
  assert.strictEqual(parseRepoPath('git@github.com:user/repo.git'), 'user/repo');
  assert.strictEqual(parseRepoPath('git@github.com:user/repo'), 'user/repo');
  assert.strictEqual(parseRepoPath('git@github.com:org-name/repo-with-dashes.git'), 'org-name/repo-with-dashes');
});

test('parseRepoPath handles GitHub HTTPS URLs', () => {
  assert.strictEqual(parseRepoPath('https://github.com/user/repo'), 'user/repo');
  assert.strictEqual(parseRepoPath('https://github.com/user/repo.git'), 'user/repo');
  assert.strictEqual(parseRepoPath('https://github.com/org.name/repo_with_underscores'), 'org.name/repo_with_underscores');
});

test('parseRepoPath handles invalid inputs', () => {
  assert.strictEqual(parseRepoPath(''), null);
  assert.strictEqual(parseRepoPath(null), null);
  assert.strictEqual(parseRepoPath(undefined), null);
  assert.strictEqual(parseRepoPath('not-a-url'), null);
  assert.strictEqual(parseRepoPath('https://gitlab.com/user/repo'), null);
});

test('parseRepoPath is pure - no side effects', () => {
  const originalUrl = 'git@github.com:user/repo.git';
  let testUrl = originalUrl;
  
  const result = parseRepoPath(testUrl);
  assert.strictEqual(testUrl, originalUrl); // Input not mutated
  assert.strictEqual(result, 'user/repo');
  
  // Multiple calls return same result
  assert.strictEqual(parseRepoPath('https://github.com/user/repo'), parseRepoPath('https://github.com/user/repo'));
});

// JWT building tests
test('buildGitHubJWT creates valid JWT structure', () => {
  const appId = '12345';
  const issuedAt = 1640995200; // Fixed timestamp for predictable test
  const expiresAt = 1640995800; // 10 minutes later
  
  const result = buildGitHubJWT(appId, issuedAt, expiresAt);
  
  assert(typeof result.headerB64 === 'string');
  assert(typeof result.payloadB64 === 'string');
  assert(typeof result.unsignedToken === 'string');
  
  // Should be base64 URL-safe (no +, /, or = characters)
  assert(!result.headerB64.includes('+'));
  assert(!result.headerB64.includes('/'));
  assert(!result.headerB64.includes('='));
  
  assert(!result.payloadB64.includes('+'));
  assert(!result.payloadB64.includes('/'));
  assert(!result.payloadB64.includes('='));
  
  // Unsigned token should be header.payload
  assert.strictEqual(result.unsignedToken, `${result.headerB64}.${result.payloadB64}`);
});

test('buildGitHubJWT is deterministic', () => {
  const appId = '12345';
  const issuedAt = 1640995200;
  const expiresAt = 1640995800;
  
  const result1 = buildGitHubJWT(appId, issuedAt, expiresAt);
  const result2 = buildGitHubJWT(appId, issuedAt, expiresAt);
  
  assert.deepStrictEqual(result1, result2);
});

test('buildGitHubJWT handles different app IDs', () => {
  const issuedAt = 1640995200;
  const expiresAt = 1640995800;
  
  const result1 = buildGitHubJWT('12345', issuedAt, expiresAt);
  const result2 = buildGitHubJWT('67890', issuedAt, expiresAt);
  
  assert.notStrictEqual(result1.payloadB64, result2.payloadB64);
  assert.notStrictEqual(result1.unsignedToken, result2.unsignedToken);
});

// GitHub API response parsing tests
test('parseGitHubApiResponse handles successful responses', () => {
  const validResponse = JSON.stringify({ id: 123, name: 'test-repo' });
  const result = parseGitHubApiResponse(validResponse);
  
  assert.strictEqual(result.accessible, true);
  assert.strictEqual(result.error, null);
  assert.deepStrictEqual(result.data, { id: 123, name: 'test-repo' });
});

test('parseGitHubApiResponse handles error responses', () => {
  const errorResponse = JSON.stringify({ message: 'Not Found' });
  const result = parseGitHubApiResponse(errorResponse, 'Repository access');
  
  assert.strictEqual(result.accessible, false);
  assert.strictEqual(result.error, 'Repository access failed: Not Found');
  assert.deepStrictEqual(result.data, { message: 'Not Found' });
});

test('parseGitHubApiResponse handles invalid JSON', () => {
  const invalidJson = 'not valid json {';
  const result = parseGitHubApiResponse(invalidJson, 'Test API');
  
  assert.strictEqual(result.accessible, false);
  assert(result.error.includes('Invalid JSON response from Test API'));
  assert.strictEqual(result.data, null);
});

test('parseGitHubApiResponse uses default context', () => {
  const errorResponse = JSON.stringify({ message: 'Unauthorized' });
  const result = parseGitHubApiResponse(errorResponse);
  
  assert.strictEqual(result.error, 'API call failed: Unauthorized');
});

// GitHub CLI error categorization tests
test('categorizeGitHubCliError identifies authentication errors', () => {
  const authErrors = [
    'not logged into any GitHub hosts',
    'authentication required',
    'auth status failed'
  ];
  
  authErrors.forEach(errorMsg => {
    const result = categorizeGitHubCliError(errorMsg);
    assert.strictEqual(result.type, 'auth');
    assert(result.message.includes('not authenticated'));
  });
});

test('categorizeGitHubCliError identifies not found errors', () => {
  const notFoundError = 'Could not resolve to a Repository with the name \'user/nonexistent\'';
  const result = categorizeGitHubCliError(notFoundError);
  
  assert.strictEqual(result.type, 'not_found');
  assert(result.message.includes('Repository not found'));
});

test('categorizeGitHubCliError identifies missing tool errors', () => {
  const missingToolError = 'gh: command not found';
  const result = categorizeGitHubCliError(missingToolError);
  
  assert.strictEqual(result.type, 'missing_tool');
  assert.strictEqual(result.message, 'GitHub CLI not found');
});

test('categorizeGitHubCliError handles unknown errors', () => {
  const unknownError = 'Some unexpected error occurred';
  const result = categorizeGitHubCliError(unknownError);
  
  assert.strictEqual(result.type, 'unknown');
  assert.strictEqual(result.message, 'GitHub CLI error: Some unexpected error occurred');
});

// SSH error categorization tests
test('categorizeSSHError identifies authentication errors', () => {
  const sshAuthErrors = [
    'Permission denied (publickey)',
    'publickey authentication failed'
  ];
  
  sshAuthErrors.forEach(errorMsg => {
    const result = categorizeSSHError(errorMsg);
    assert.strictEqual(result.type, 'auth');
    assert.strictEqual(result.message, 'SSH authentication failed');
  });
});

test('categorizeSSHError identifies access denied errors', () => {
  const accessDeniedError = 'Repository access denied';
  const result = categorizeSSHError(accessDeniedError);
  
  assert.strictEqual(result.type, 'access_denied');
  assert.strictEqual(result.message, 'Repository access denied');
});

test('categorizeSSHError handles unknown errors', () => {
  const unknownError = 'Connection timeout';
  const result = categorizeSSHError(unknownError);
  
  assert.strictEqual(result.type, 'unknown');
  assert.strictEqual(result.message, 'Git access failed: Connection timeout');
});

// Edge cases and data validation
test('Pure functions handle edge cases gracefully', () => {
  // Empty/null inputs
  assert.strictEqual(parseRepoPath(''), null);
  assert.strictEqual(parseRepoPath(null), null);
  
  // Error categorization with empty strings
  const emptyCliResult = categorizeGitHubCliError('');
  assert.strictEqual(emptyCliResult.type, 'unknown');
  
  const emptySSHResult = categorizeSSHError('');
  assert.strictEqual(emptySSHResult.type, 'unknown');
  
  // JWT with edge case timestamps
  const jwtResult = buildGitHubJWT('0', 0, 0);
  assert(typeof jwtResult.unsignedToken === 'string');
  assert(jwtResult.unsignedToken.length > 0);
});