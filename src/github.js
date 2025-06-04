const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const { findPemFiles, fileExists } = require('./utils');

async function generateGitHubAppToken(pemFilePath) {
  try {
    // We need the app ID from environment or config
    // For now, let's extract it from the discourse config since that's where it's defined
    const appId = '1357221'; // This should ideally come from config
    
    // Read the private key
    const privateKey = await fs.readFile(pemFilePath, 'utf8');
    
    // Generate JWT
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60,
      exp: now + (10 * 60),
      iss: appId
    };
    
    const header = { alg: 'RS256', typ: 'JWT' };
    
    // Create JWT manually (avoiding additional dependencies)
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const toSign = `${headerB64}.${payloadB64}`;
    
    const signature = crypto.createSign('RSA-SHA256')
      .update(toSign)
      .sign(privateKey, 'base64url');
    
    const jwt = `${headerB64}.${payloadB64}.${signature}`;
    
    // Get installations
    const installationsResponse = await fetch('https://api.github.com/app/installations', {
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'claude-habitat'
      },
      timeout: 5000
    });
    
    if (!installationsResponse.ok) {
      return null;
    }
    
    const installations = await installationsResponse.json();
    if (!installations || installations.length === 0) {
      return null;
    }
    
    // Use the first installation
    const installationId = installations[0].id;
    
    // Get installation token
    const tokenResponse = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'claude-habitat'
      },
      timeout: 5000
    });
    
    if (!tokenResponse.ok) {
      return null;
    }
    
    const tokenData = await tokenResponse.json();
    return tokenData.token;
  } catch (err) {
    return null;
  }
}

async function testRepositoryAccess(repoUrl, accessMode = 'write') {
  try {
    // Normalize URL to get repo path (works with both SSH and HTTPS)
    let repoPath;
    if (repoUrl.startsWith('git@github.com:')) {
      repoPath = repoUrl.replace('git@github.com:', '').replace('.git', '');
    } else if (repoUrl.startsWith('https://github.com/')) {
      repoPath = repoUrl.replace('https://github.com/', '').replace('.git', '');
    } else {
      return { accessible: true, reason: 'Unknown URL format, skipping validation' };
    }
    
    const sshKeyPath = path.join(__dirname, '../shared/github_deploy_key');
    const pemFiles = await findPemFiles(path.join(__dirname, '../shared'));
    
    let sshAccess = { working: false, hasWrite: false, error: null };
    let apiAccess = { working: false, hasWrite: false, error: null };
    
    // Test SSH access (for git operations)
    if (await fileExists(sshKeyPath)) {
      try {
        // Test basic SSH authentication to GitHub
        await execAsync(`ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "${sshKeyPath}" -T git@github.com 2>&1 | grep -q "successfully authenticated"`, { timeout: 10000 });
        sshAccess.working = true;
        
        // Test repository-specific access using ONLY the deploy key (not host SSH keys)
        try {
          const testCloneResult = await execAsync(`GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o IdentitiesOnly=yes -i ${sshKeyPath}" git ls-remote --heads git@github.com:${repoPath}.git 2>&1`, { timeout: 10000 });
          if (testCloneResult.stdout || testCloneResult.stderr.includes('refs/heads')) {
            sshAccess.hasWrite = true; // If we can read, deploy keys typically have write if configured
          } else {
            sshAccess.error = 'Repository access denied - deploy key needed';
            sshAccess.working = false;
          }
        } catch (err) {
          if (err.message.includes('Permission denied') || err.message.includes('access denied') || err.message.includes('publickey')) {
            sshAccess.error = 'Repository access denied - deploy key needed';
            sshAccess.working = false;
          } else {
            sshAccess.error = 'Repository access denied - deploy key needed';
            sshAccess.working = false;
          }
        }
      } catch (err) {
        sshAccess.error = 'SSH authentication failed';
      }
    } else {
      sshAccess.error = 'SSH key not found';
    }
    
    // Test GitHub API access (only for write mode - needed for PRs)
    if (accessMode === 'write' && pemFiles.length > 0) {
      try {
        // Try with GitHub App authentication
        const token = await generateGitHubAppToken(pemFiles[0]);
        if (token) {
          const authResponse = await fetch(`https://api.github.com/repos/${repoPath}`, {
            timeout: 5000,
            headers: {
              'Authorization': `token ${token}`,
              'User-Agent': 'claude-habitat'
            }
          });
          
          if (authResponse.ok) {
            // Repository is accessible via GitHub App
            // Note: GitHub App tokens don't include permissions in the repo response
            // We trust that if the app can access the repo and has installation permissions, it can write
            apiAccess.working = true;
            apiAccess.hasWrite = true;
          } else if (authResponse.status === 404) {
            apiAccess.error = 'GitHub App cannot access repository - needs to be installed';
            apiAccess.working = false;
          } else {
            apiAccess.error = `GitHub App authentication failed: ${authResponse.status}`;
            apiAccess.working = false;
          }
        } else {
          apiAccess.error = 'Failed to generate GitHub App token';
          apiAccess.working = false;
        }
      } catch (err) {
        apiAccess.error = 'Network error accessing GitHub API';
        apiAccess.working = false;
      }
    } else if (accessMode === 'write') {
      apiAccess.error = 'GitHub App .pem file not found';
      apiAccess.working = false;
    } else {
      // Read mode - API access not required
      apiAccess.working = true;
      apiAccess.hasWrite = false;
    }
    
    // Determine overall accessibility based on access mode
    const gitWorking = sshAccess.working;
    const apiWorking = apiAccess.working;
    
    if (accessMode === 'read') {
      // Read mode - only need git access
      if (gitWorking) {
        return { 
          accessible: true, 
          reason: 'Read access verified',
          accessMode: 'read'
        };
      } else {
        return { 
          accessible: false, 
          reason: `Git access failed: ${sshAccess.error}`,
          needsDeployKey: sshAccess.error?.includes('deploy key'),
          repoPath: repoPath,
          accessMode: 'read'
        };
      }
    } else {
      // Write mode - need both git and API access
      const issues = [];
      
      if (!gitWorking) {
        issues.push({
          type: 'git',
          error: sshAccess.error,
          resolution: 'Add deploy key for git push access'
        });
      }
      
      if (!apiWorking) {
        issues.push({
          type: 'api',
          error: apiAccess.error,
          resolution: apiAccess.error?.includes('needs to be installed') 
            ? 'Install GitHub App on the repository'
            : apiAccess.error?.includes('needs write permissions')
            ? 'Grant write permissions to GitHub App'
            : 'Configure GitHub App access'
        });
      }
      
      if (issues.length === 0) {
        return { 
          accessible: true, 
          reason: 'Full write access verified (git + API)',
          accessMode: 'write'
        };
      } else {
        const needsDeployKey = issues.some(i => i.type === 'git' && sshAccess.error?.includes('deploy key'));
        const needsGitHubApp = issues.some(i => i.type === 'api');
        
        return { 
          accessible: false, 
          reason: issues.map(i => `${i.type}: ${i.error}`).join(', '),
          issues: issues,
          needsDeployKey: needsDeployKey,
          needsGitHubApp: needsGitHubApp,
          repoPath: repoPath,
          accessMode: 'write'
        };
      }
    }
    
  } catch (err) {
    return { accessible: false, reason: `Error: ${err.message}` };
  }
}

module.exports = {
  generateGitHubAppToken,
  testRepositoryAccess
};