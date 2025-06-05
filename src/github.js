const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const { fileExists } = require('./utils');

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

// Pure function: test git access (function of SSH key existence and repo path)
async function testGitAccess(repoPath, sshKeyPath) {
  if (!await fileExists(sshKeyPath)) {
    return { accessible: false, error: 'SSH key not found' };
  }

  try {
    // Test SSH connection to GitHub
    await execAsync(`ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "${sshKeyPath}" -T git@github.com 2>&1 | grep -q "successfully authenticated"`, { timeout: 10000 });
    
    // Test specific repository access
    const testResult = await execAsync(
      `GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o IdentitiesOnly=yes -i ${sshKeyPath}" git ls-remote --heads git@github.com:${repoPath}.git 2>&1`, 
      { timeout: 10000 }
    );
    
    if (testResult.stdout || testResult.stderr.includes('refs/heads')) {
      return { accessible: true, error: null };
    } else {
      return { accessible: false, error: 'Repository access denied - deploy key needed' };
    }
  } catch (err) {
    if (err.message.includes('Permission denied') || err.message.includes('publickey')) {
      return { accessible: false, error: 'Repository access denied - deploy key needed' };
    }
    return { accessible: false, error: 'SSH authentication failed' };
  }
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

// Main function: compose pure functions to test repository access
async function testRepositoryAccess(repoUrl, accessMode = 'write', options = {}) {
  try {
    const repoPath = parseRepoPath(repoUrl);
    if (!repoPath) {
      return { accessible: true, reason: 'Unknown URL format, skipping validation' };
    }
    
    const sshKeyPath = path.join(__dirname, '../shared/github_deploy_key');
    
    // Use system tools gh if available, fallback to system gh
    const ghCommand = options.ghCommand || path.join(__dirname, '../system/tools/bin/gh');
    
    // Test git access (needed for both read and write)
    const gitResult = await testGitAccess(repoPath, sshKeyPath);
    
    if (accessMode === 'read') {
      // Read mode: only need git access
      return gitResult.accessible 
        ? { accessible: true, reason: 'Read access verified', accessMode: 'read' }
        : { accessible: false, reason: `Git access failed: ${gitResult.error}`, needsDeployKey: gitResult.error?.includes('deploy key'), repoPath, accessMode: 'read' };
    }
    
    // Write mode: need both git and GitHub CLI access
    const ghResult = await testGitHubCliAccess(repoPath, ghCommand);
    
    const issues = [];
    if (!gitResult.accessible) {
      issues.push({
        type: 'git',
        error: gitResult.error,
        resolution: 'Add deploy key for git push access'
      });
    }
    
    if (!ghResult.accessible) {
      issues.push({
        type: 'github-cli',
        error: ghResult.error,
        resolution: 'Run `gh auth login` to authenticate GitHub CLI'
      });
    }
    
    if (issues.length === 0) {
      return { 
        accessible: true, 
        reason: 'Full write access verified (git + GitHub CLI)',
        accessMode: 'write'
      };
    }
    
    return { 
      accessible: false, 
      reason: issues.map(i => `${i.type}: ${i.error}`).join(', '),
      issues,
      needsDeployKey: issues.some(i => i.type === 'git' && gitResult.error?.includes('deploy key')),
      needsGitHubCli: issues.some(i => i.type === 'github-cli'),
      repoPath,
      accessMode: 'write'
    };
    
  } catch (err) {
    return { accessible: false, reason: `Error: ${err.message}` };
  }
}

module.exports = {
  parseRepoPath,
  testGitAccess,
  testGitHubCliAccess,
  testRepositoryAccess
};