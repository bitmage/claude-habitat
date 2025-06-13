/**
 * @module github
 * @description GitHub integration and repository access for Claude Habitat
 * 
 * Handles GitHub repository operations, authentication testing, and repository
 * access verification. Supports both HTTPS and SSH access patterns with
 * proper error categorization and recovery suggestions.
 * 
 * ## GitHub App Authentication Setup
 * 
 * Claude Habitat uses GitHub Apps for repository access. To set up:
 * 
 * ### 1. Create GitHub App
 * - Navigate to https://github.com/settings/apps
 * - Click "New GitHub App"
 * - **Name**: Choose unique name (e.g., "Claude Code Bot")  
 * - **Homepage URL**: `https://github.com` (or any valid URL)
 * - **Description**: "Bot for Claude Code automated development"
 * - **Webhook**: Uncheck "Active" (not needed)
 * 
 * ### 2. Set Permissions
 * - **Contents**: Read & Write (clone and push code)
 * - **Pull requests**: Read & Write (create and update PRs)
 * - **Metadata**: Read (auto-selected)
 * - **Actions**: Read (optional, for workflow status)
 * - **Checks**: Read (optional, for check status)
 * 
 * ### 3. Generate Private Key
 * - After creation, go to app settings page
 * - Scroll to "Private keys" section
 * - Click "Generate a private key"
 * - Download and save the `.pem` file to `shared/` directory
 * 
 * ### 4. Install App
 * - Go to app settings → "Install App"
 * - Install on account/organization with repositories
 * - Select repositories for Claude access
 * 
 * @requires module:types - Domain model definitions
 * @requires module:standards/path-resolution - Path handling conventions
 * @requires module:standards/error-handling - Error recovery patterns
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/github-pure.test.js`
 * - E2E tests: `npm run test:e2e -- test/e2e/github-functions.test.js`
 * - Run all tests: `npm test`
 */

const path = require('path');
// @see {@link module:standards/path-resolution} for project-root relative path conventions using rel()
const { fileExists, findPemFiles, executeCommand, categorizeError, rel } = require('./utils');

// Pure function: extract repo path from URL
function parseRepoPath(repoUrl) {
  if (!repoUrl || typeof repoUrl !== 'string') {
    return null;
  }
  
  if (repoUrl.startsWith('git@github.com:')) {
    return repoUrl.replace('git@github.com:', '').replace('.git', '');
  } else if (repoUrl.startsWith('https://github.com/')) {
    return repoUrl.replace('https://github.com/', '').replace('.git', '');
  }
  return null;
}

// Pure function: create JWT header and payload for GitHub App
function buildGitHubJWT(appId, issuedAt, expiresAt) {
  const header = '{"alg":"RS256","typ":"JWT"}';
  const payload = `{"iat":${issuedAt},"exp":${expiresAt},"iss":"${appId}"}`;
  
  // Base64 encode with URL-safe characters
  const headerB64 = Buffer.from(header).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const payloadB64 = Buffer.from(payload).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  
  return { headerB64, payloadB64, unsignedToken: `${headerB64}.${payloadB64}` };
}

// Pure function: parse GitHub API response
function parseGitHubApiResponse(responseBody, context = 'API call') {
  try {
    const data = JSON.parse(responseBody);
    
    if (data.message) {
      return { accessible: false, error: `${context} failed: ${data.message}`, data };
    }
    
    return { accessible: true, error: null, data };
  } catch (err) {
    return { accessible: false, error: `Invalid JSON response from ${context}: ${err.message}`, data: null };
  }
}

// Pure function: categorize GitHub CLI errors
function categorizeGitHubCliError(errorMessage) {
  const categoryMap = {
    'not logged into': { type: 'auth', message: 'GitHub CLI not authenticated - run `gh auth login`' },
    'authentication': { type: 'auth', message: 'GitHub CLI not authenticated - run `gh auth login`' },
    'auth': { type: 'auth', message: 'GitHub CLI not authenticated - run `gh auth login`' },
    'Could not resolve to a Repository': { type: 'not_found', message: 'Repository not found or no access via GitHub CLI' },
    'command not found': { type: 'missing_tool', message: 'GitHub CLI not found' }
  };
  
  const result = categorizeError(errorMessage, categoryMap);
  // Maintain original error message format for unknown errors
  if (result.type === 'unknown') {
    return { type: 'unknown', message: `GitHub CLI error: ${errorMessage}` };
  }
  return result;
}

// Pure function: categorize SSH errors
function categorizeSSHError(errorMessage) {
  const categoryMap = {
    'Permission denied': { type: 'auth', message: 'SSH authentication failed' },
    'publickey': { type: 'auth', message: 'SSH authentication failed' },
    'Repository access denied': { type: 'access_denied', message: 'Repository access denied' }
  };
  
  const result = categorizeError(errorMessage, categoryMap);
  // Maintain original error message format for unknown errors
  if (result.type === 'unknown') {
    return { type: 'unknown', message: `Git access failed: ${errorMessage}` };
  }
  return result;
}

// Test GitHub App access to repository using direct API calls
async function testGitHubAppAccess(repoPath, sharedDir) {
  const pemFiles = await findPemFiles(sharedDir);
  
  if (pemFiles.length === 0) {
    return { accessible: false, error: 'No GitHub App configured' };
  }

  try {
    // Use the 2025-06-04 key that's referenced in the config
    const pemFile = pemFiles.find(f => f.includes('2025-06-04')) || pemFiles[0];
    const appId = '1357221'; // From config
    
    // Generate JWT for GitHub App
    const now = Math.floor(Date.now() / 1000);
    const { unsignedToken } = buildGitHubJWT(appId, now, now + 600);
    
    // Create signature using openssl
    const signResult = await executeCommand(
      `echo -n "${unsignedToken}" | openssl dgst -sha256 -sign "${pemFile}" | base64 -w 0 | tr '+/' '-_' | tr -d '='`
    );
    const signature = signResult.output;
    
    const jwt = `${unsignedToken}.${signature.trim()}`;
    
    // Get installations using system curl
    const installationsCmd = `curl -s -H "Authorization: Bearer ${jwt}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations"`;
    const installationsExecResult = await executeCommand(installationsCmd);
    const installationsResponse = installationsExecResult.output;
    const installationsResult = parseGitHubApiResponse(installationsResponse, 'Get installations');
    
    if (!installationsResult.accessible) {
      return installationsResult;
    }
    
    const installations = installationsResult.data;
    if (!installations || installations.length === 0) {
      return { accessible: false, error: 'GitHub App has no installations' };
    }
    
    const installationId = installations[0].id;
    
    // Get installation token
    const tokenCmd = `curl -s -X POST -H "Authorization: Bearer ${jwt}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations/${installationId}/access_tokens"`;
    const tokenExecResult = await executeCommand(tokenCmd);
    const tokenResponse = tokenExecResult.output;
    const tokenResult = parseGitHubApiResponse(tokenResponse, 'Get installation token');
    
    if (!tokenResult.accessible) {
      return tokenResult;
    }
    
    const tokenData = tokenResult.data;
    if (!tokenData.token) {
      return { accessible: false, error: `Failed to get installation token: ${tokenResponse}` };
    }
    
    // Test repository access
    const repoCmd = `curl -s -H "Authorization: token ${tokenData.token}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/${repoPath}"`;
    const repoExecResult = await executeCommand(repoCmd);
    const repoResponse = repoExecResult.output;
    const repoResult = parseGitHubApiResponse(repoResponse, 'Repository access');
    
    return repoResult;
  } catch (err) {
    return { accessible: false, error: `GitHub App authentication failed: ${err.message}` };
  }
}

// Test GitHub CLI access (function of gh auth status and repo path)
async function testGitHubCliAccess(repoPath, ghCommand = null) {
  try {
    // Use system gh tool if no command specified
    const gh = ghCommand || rel('system/tools/bin/gh');
    
    // Check if gh is authenticated
    await executeCommand(`${gh} auth status`, { timeout: 5000 });
    
    // Test repository access via gh CLI
    await executeCommand(`${gh} repo view ${repoPath}`, { timeout: 10000 });
    
    return { accessible: true, error: null };
  } catch (err) {
    const errorCategory = categorizeGitHubCliError(err.message);
    return { accessible: false, error: errorCategory.message, errorType: errorCategory.type };
  }
}

// Test Git access using SSH key (for backward compatibility with integration tests)
async function testGitAccess(repoPath, sshKeyPath) {
  try {
    if (!await fileExists(sshKeyPath)) {
      return { accessible: false, error: 'SSH key not found' };
    }
    
    // Test SSH connection to GitHub
    const testCmd = `ssh -i "${sshKeyPath}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -T git@github.com`;
    await executeCommand(testCmd, { timeout: 10000 });
    
    return { accessible: true, error: null };
  } catch (err) {
    const errorCategory = categorizeSSHError(err.message);
    return { accessible: false, error: errorCategory.message, errorType: errorCategory.type };
  }
}

// Main function: test repository access using GitHub App
async function testRepositoryAccess(repoUrl, accessMode = 'write', options = {}) {
  try {
    const repoPath = parseRepoPath(repoUrl);
    if (!repoPath) {
      return { accessible: true, reason: 'Unknown URL format, skipping validation' };
    }
    
    // Test GitHub App access
    const sharedDir = rel('shared');
    const appResult = await testGitHubAppAccess(repoPath, sharedDir);
    
    if (appResult.accessible) {
      return { 
        accessible: true, 
        reason: `GitHub App access verified for ${accessMode} mode`,
        accessMode: accessMode
      };
    } else {
      return { 
        accessible: false, 
        reason: appResult.error,
        needsGitHubApp: true,
        repoPath,
        accessMode: accessMode
      };
    }
    
  } catch (err) {
    return { accessible: false, reason: `Error: ${err.message}` };
  }
}

module.exports = {
  // Pure functions (easily testable)
  parseRepoPath,
  buildGitHubJWT,
  parseGitHubApiResponse,
  categorizeGitHubCliError,
  categorizeSSHError,
  
  // Composed functions (integration testing)
  testGitAccess,
  testGitHubAppAccess,
  testGitHubCliAccess,
  testRepositoryAccess
};