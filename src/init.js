const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const { exec, spawn } = require('child_process');
const execAsync = promisify(exec);

const { colors, findPemFiles, fileExists } = require('./utils');
const { testRepositoryAccess } = require('./github');
const { loadConfig } = require('./config');

// Check initialization status
async function checkInitializationStatus() {
  const status = {
    githubApp: false,
    docker: false,
    claude: false,
    completedSteps: 0,
    totalSteps: 3
  };

  try {
    // Check for GitHub App (.pem files)
    const pemFiles = await findPemFiles(path.join(__dirname, '..', 'shared'));
    status.githubApp = pemFiles.length > 0;
    if (status.githubApp) status.completedSteps++;

    // Check Docker
    try {
      await execAsync('docker --version');
      await execAsync('docker ps');
      status.docker = true;
      status.completedSteps++;
    } catch {
      status.docker = false;
    }

    // Check Claude Code
    try {
      await execAsync('claude --version');
      status.claude = true;
      status.completedSteps++;
    } catch {
      status.claude = false;
    }
  } catch (err) {
    console.warn('Warning: Error checking initialization status:', err.message);
  }

  return status;
}

// Check if GitHub App auth is available
async function hasGitHubAppAuth() {
  const pemFiles = await findPemFiles(path.join(__dirname, '..', 'shared'));
  return pemFiles.length > 0;
}

// Check habitat repositories for access issues
async function checkHabitatRepositories(habitatsDir) {
  const habitatStatus = [];
  
  try {
    const dirs = await fs.readdir(habitatsDir);
    for (const dir of dirs) {
      const configPath = path.join(habitatsDir, dir, 'config.yaml');
      if (await fileExists(configPath)) {
        try {
          const config = await loadConfig(configPath);
          const repoResults = [];
          
          if (config.repositories && Array.isArray(config.repositories)) {
            for (const repo of config.repositories) {
              if (repo.url) {
                const accessMode = repo.access || 'write';
                const result = await testRepositoryAccess(repo.url, accessMode);
                repoResults.push({
                  url: repo.url,
                  accessMode: accessMode,
                  ...result
                });
              }
            }
          }
          
          const hasIssues = repoResults.some(r => !r.accessible);
          habitatStatus.push({
            name: dir,
            hasIssues,
            repositories: repoResults
          });
        } catch (err) {
          habitatStatus.push({
            name: dir,
            hasIssues: true,
            error: `Config error: ${err.message}`
          });
        }
      }
    }
  } catch (err) {
    console.warn('Warning: Could not check habitat repositories:', err.message);
  }
  
  return habitatStatus;
}

// Run complete initialization process
async function runInitialization() {
  console.log(colors.green('\n=== Claude Habitat Initialization ===\n'));
  
  const status = await checkInitializationStatus();
  
  console.log('Current Status:\n');
  console.log(`${status.docker ? '✅' : '❌'} Docker: ${status.docker ? 'Working' : 'Not accessible'}`);
  console.log(`${status.claude ? '✅' : '❌'} Claude Code: ${status.claude ? 'Installed' : 'Not found'}`);
  console.log(`${status.githubApp ? '✅' : '❌'} GitHub App: ${status.githubApp ? 'Configured' : 'Not configured'}`);
  console.log('');
  
  if (!status.docker || !status.claude) {
    console.log(colors.red('⚠️  Prerequisites missing. Please install:'));
    if (!status.docker) console.log('   - Docker (https://docs.docker.com/get-docker/)');
    if (!status.claude) console.log('   - Claude Code CLI (npm install -g @anthropic-ai/claude-code)');
    console.log('\nRun initialization again after installing prerequisites.');
    return;
  }
  
  if (status.githubApp) {
    console.log(colors.green('✅ All setup complete! You\'re ready to use Claude Habitat.'));
    return;
  }
  
  console.log('Let\'s complete your setup...\n');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const ask = (question) => new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
  
  try {
    // GitHub App setup
    if (!status.githubApp) {
      console.log(colors.yellow('=== Step 1: GitHub App Setup ==='));
      console.log('This enables Claude to create pull requests and use GitHub API.\n');
      
      console.log('We need to create a GitHub App for authentication.');
      console.log('This will open GitHub in your browser.\n');
      
      const proceed = await ask('Ready to set up GitHub App? [Y/n]: ');
      if (proceed.toLowerCase() !== 'n' && proceed.toLowerCase() !== 'no') {
        // Open GitHub App creation page
        const url = 'https://github.com/settings/apps/new';
        
        try {
          if (process.platform === 'darwin') {
            spawn('open', [url]);
          } else if (process.platform === 'win32') {
            spawn('start', [url], { shell: true });
          } else {
            spawn('xdg-open', [url]);
          }
          console.log(`Opening: ${url}`);
        } catch {
          console.log(`Please visit: ${url}`);
        }
        
        console.log('\nInstructions:');
        console.log('1. Fill in app name (e.g., "Claude Code Bot")');
        console.log('2. Set homepage URL to any valid URL');
        console.log('3. Uncheck "Active" under Webhook');
        console.log('4. Set permissions:');
        console.log('   - Contents: Read & Write');
        console.log('   - Pull requests: Read & Write');
        console.log('   - Metadata: Read');
        console.log('5. Click "Create GitHub App"');
        console.log('6. Generate a private key and download it');
        console.log('7. Install the app on your repositories\n');
        
        await ask('Press Enter when you\'ve downloaded the .pem file...');
        
        console.log('\nNow move your .pem file to the shared directory:');
        console.log(`   mv ~/Downloads/your-app.*.pem ${path.join(__dirname, '..', 'shared/')}`);
        console.log('');
        
        await ask('Press Enter when you\'ve moved the .pem file...');
        
        // Verify
        const pemFiles = await findPemFiles(path.join(__dirname, '..', 'shared'));
        if (pemFiles.length > 0) {
          console.log(colors.green('✅ GitHub App private key found!'));
          // Set secure permissions
          await execAsync(`chmod 600 "${pemFiles[0]}"`);
          console.log('   Set secure permissions (600)');
        } else {
          console.log(colors.red('❌ No .pem file found in shared directory.'));
          console.log('   You can complete this step later by running initialization again.');
        }
      }
      console.log('');
    }
    
    console.log(colors.yellow('=== GitHub App Setup Complete ==='));
    console.log('GitHub App provides repository access for habitats.');
    console.log('Private repositories will be accessible using the configured app.');
    console.log('');
    
    // Final status check
    const finalStatus = await checkInitializationStatus();
    
    if (finalStatus.completedSteps === finalStatus.totalSteps) {
      console.log(colors.green('🎉 Initialization complete! Claude Habitat is ready to use.'));
      console.log('\nYou can now:');
      console.log('• Start habitats with full repository access');
      console.log('• Create pull requests from within habitats');
      console.log('• Use all GitHub integration features');
    } else {
      console.log(colors.yellow('⚠️  Some steps remain incomplete.'));
      console.log('You can run initialization again anytime with: ./claude-habitat --init');
    }
    
  } catch (err) {
    console.error(colors.red(`Error during initialization: ${err.message}`));
  } finally {
    rl.close();
  }
}

// Setup GitHub App (part of initialization)
async function setupGitHubApp() {
  // This would contain GitHub App specific setup logic
  // For now, it's part of runInitialization
  console.log('Setting up GitHub App...');
  // Implementation would go here
}

// Setup GitHub token (alternative to App)
async function setupGitHubToken() {
  // This would contain token-based setup
  console.log('Setting up GitHub token...');
  // Implementation would go here
}

module.exports = {
  checkInitializationStatus,
  hasGitHubAppAuth,
  checkHabitatRepositories,
  runInitialization,
  setupGitHubApp,
  setupGitHubToken
};