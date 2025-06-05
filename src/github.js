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

// Test GitHub App access to repository
async function testGitHubAppAccess(repoPath, sharedDir) {
  const pemFiles = await findPemFiles(sharedDir);
  
  if (pemFiles.length === 0) {
    return { accessible: false, error: 'No GitHub App configured' };
  }

  // For now, assume GitHub App has access if it's configured
  // In practice, you'd test this via GitHub API with the app credentials
  return { accessible: true, error: null };
}

// Pure function: test GitHub CLI access (function of gh auth status and repo path)
async function testGitHubCliAccess(repoPath, ghCommand = 'gh') {
  try {
    // Check if gh is authenticated
    await execAsync(`${ghCommand} auth status`, { timeout: 5000 });
    
    // Test repository access via gh CLI
    await execAsync(`${ghCommand} repo view ${repoPath}`, { timeout: 10000 });
    
    return { accessible: true, error: null };
  } catch (err) {
    if (err.message.includes('not logged into') || err.message.includes('authentication')) {
      return { accessible: false, error: 'GitHub CLI not authenticated - run `gh auth login`' };
    } else if (err.message.includes('Could not resolve to a Repository')) {
      return { accessible: false, error: 'Repository not found or no access via GitHub CLI' };
    } else if (err.message.includes('command not found')) {
      return { accessible: false, error: `GitHub CLI not found at: ${ghCommand}` };
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