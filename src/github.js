const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const { fileExists, findPemFiles } = require('./utils');

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
    const header = '{"alg":"RS256","typ":"JWT"}';
    const payload = `{"iat":${Math.floor(Date.now() / 1000)},"exp":${Math.floor(Date.now() / 1000) + 600},"iss":"${appId}"}`;
    
    // Base64 encode
    const headerB64 = Buffer.from(header).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const payloadB64 = Buffer.from(payload).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    
    // Create signature using openssl
    const { stdout: signature } = await execAsync(
      `echo -n "${headerB64}.${payloadB64}" | openssl dgst -sha256 -sign "${pemFile}" | base64 -w 0 | tr '+/' '-_' | tr -d '='`
    );
    
    const jwt = `${headerB64}.${payloadB64}.${signature.trim()}`;
    
    // Get installations using system curl (faster than spawning gh for API calls)
    const installationsCmd = `curl -s -H "Authorization: Bearer ${jwt}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations"`;
    const { stdout: installationsResponse } = await execAsync(installationsCmd);
    const installations = JSON.parse(installationsResponse);
    
    if (!installations || installations.length === 0) {
      return { accessible: false, error: 'GitHub App has no installations' };
    }
    
    const installationId = installations[0].id;
    
    // Get installation token
    const tokenCmd = `curl -s -X POST -H "Authorization: Bearer ${jwt}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations/${installationId}/access_tokens"`;
    const { stdout: tokenResponse } = await execAsync(tokenCmd);
    const tokenData = JSON.parse(tokenResponse);
    
    if (!tokenData.token) {
      return { accessible: false, error: `Failed to get installation token: ${tokenResponse}` };
    }
    
    // Test repository access
    const repoCmd = `curl -s -H "Authorization: token ${tokenData.token}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/${repoPath}"`;
    const { stdout: repoResponse } = await execAsync(repoCmd);
    const repoData = JSON.parse(repoResponse);
    
    if (repoData.message) {
      return { accessible: false, error: `Repository access failed: ${repoData.message}` };
    }
    
    return { accessible: true, error: null };
  } catch (err) {
    return { accessible: false, error: `GitHub App authentication failed: ${err.message}` };
  }
}

// Pure function: test GitHub CLI access (function of gh auth status and repo path)
async function testGitHubCliAccess(repoPath, ghCommand = null) {
  try {
    // Use system gh tool if no command specified
    const gh = ghCommand || path.join(__dirname, '../system/tools/bin/gh');
    
    // Check if gh is authenticated
    await execAsync(`${gh} auth status`, { timeout: 5000 });
    
    // Test repository access via gh CLI
    await execAsync(`${gh} repo view ${repoPath}`, { timeout: 10000 });
    
    return { accessible: true, error: null };
  } catch (err) {
    if (err.message.includes('not logged into') || err.message.includes('authentication')) {
      return { accessible: false, error: 'GitHub CLI not authenticated - run `gh auth login`' };
    } else if (err.message.includes('Could not resolve to a Repository')) {
      return { accessible: false, error: 'Repository not found or no access via GitHub CLI' };
    } else if (err.message.includes('command not found')) {
      return { accessible: false, error: `GitHub CLI not found` };
    }
    return { accessible: false, error: `GitHub CLI error: ${err.message}` };
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
    const sharedDir = path.join(__dirname, '../shared');
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
  parseRepoPath,
  testGitHubAppAccess,
  testRepositoryAccess
};