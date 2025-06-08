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
    
    // Generate host information
    await generateHostInfo();
    
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

// Generate host system information file
async function generateHostInfo() {
  const { promisify } = require('util');
  const { exec } = require('child_process');
  const execAsync = promisify(exec);
  const path = require('path');
  const { fileExists } = require('./utils');
  
  try {
    console.log(colors.yellow('=== Generating Host Information ==='));
    console.log('This creates a safe system profile to help Claude understand your environment.');
    console.log('Only non-identifying system information will be collected.');
    console.log('');
    
    // Ask for consent
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const ask = (question) => new Promise(resolve => {
      rl.question(question, answer => resolve(answer.trim().toLowerCase()));
    });
    
    const consent = await ask('Generate host system information? [y/N]: ');
    rl.close();
    
    if (consent !== 'y' && consent !== 'yes') {
      console.log('Host information generation skipped.');
      return false;
    }
    
    console.log('Collecting system information...');
    
    // Collect safe system information
    const systemInfo = {};
    
    try {
      const { stdout: unameOutput } = await execAsync('uname -a');
      const unameParts = unameOutput.trim().split(' ');
      systemInfo.system = {
        os: unameParts[0] || 'Unknown',
        architecture: unameParts[4] || 'Unknown',
        kernel: unameParts[2] || 'Unknown'
      };
    } catch {
      systemInfo.system = { os: 'Unknown', architecture: 'Unknown', kernel: 'Unknown' };
    }
    
    try {
      const { stdout: osInfo } = await execAsync('lsb_release -a 2>/dev/null || cat /etc/os-release 2>/dev/null || echo "Unknown"');
      if (osInfo.includes('Distributor ID:')) {
        const lines = osInfo.split('\n');
        const distLine = lines.find(line => line.startsWith('Distributor ID:'));
        const releaseLine = lines.find(line => line.startsWith('Release:'));
        const codeLine = lines.find(line => line.startsWith('Codename:'));
        
        let distribution = 'Unknown';
        if (distLine && releaseLine) {
          const dist = distLine.split(':')[1]?.trim();
          const release = releaseLine.split(':')[1]?.trim();
          const codename = codeLine?.split(':')[1]?.trim();
          distribution = `${dist} ${release}${codename ? ' (' + codename + ')' : ''}`;
        }
        systemInfo.system.distribution = distribution;
      } else if (osInfo.includes('NAME=')) {
        const nameLine = osInfo.split('\n').find(line => line.startsWith('NAME='));
        const versionLine = osInfo.split('\n').find(line => line.startsWith('VERSION='));
        if (nameLine) {
          let name = nameLine.split('=')[1]?.replace(/"/g, '').trim();
          if (versionLine) {
            const version = versionLine.split('=')[1]?.replace(/"/g, '').trim();
            name += ` ${version}`;
          }
          systemInfo.system.distribution = name;
        }
      }
    } catch {
      systemInfo.system.distribution = 'Unknown';
    }
    
    // Tool versions
    systemInfo.tools = {};
    
    const tools = [
      { name: 'docker', cmd: 'docker --version' },
      { name: 'nodejs', cmd: 'node --version' },
      { name: 'git', cmd: 'git --version' }
    ];
    
    for (const tool of tools) {
      try {
        const { stdout } = await execAsync(tool.cmd);
        systemInfo.tools[tool.name] = stdout.trim().replace(/^[a-z]+ version /i, '');
      } catch {
        systemInfo.tools[tool.name] = 'Not available';
      }
    }
    
    // Platform info
    systemInfo.platform = {
      type: systemInfo.system.os === 'Linux' ? 'GNU/Linux' : systemInfo.system.os,
      shell_environment: 'bash'
    };
    
    // Infer package manager for Linux distributions
    if (systemInfo.system.os === 'Linux') {
      const distro = systemInfo.system.distribution?.toLowerCase() || '';
      if (distro.includes('ubuntu') || distro.includes('debian')) {
        systemInfo.platform.package_manager = 'apt';
      } else if (distro.includes('fedora') || distro.includes('rhel') || distro.includes('centos')) {
        systemInfo.platform.package_manager = 'dnf/yum';
      } else if (distro.includes('arch') || distro.includes('manjaro')) {
        systemInfo.platform.package_manager = 'pacman';
      } else {
        systemInfo.platform.package_manager = 'unknown';
      }
    }
    
    // Generate YAML content
    const yamlContent = `# Host System Information
# This file contains non-identifying system information to help Claude understand
# the development environment. Generated automatically during initialization.

system:
  os: "${systemInfo.system.os}"
  architecture: "${systemInfo.system.architecture}" 
  kernel: "${systemInfo.system.kernel}"
  distribution: "${systemInfo.system.distribution || 'Unknown'}"
  
tools:
  docker: "${systemInfo.tools.docker}"
  nodejs: "${systemInfo.tools.nodejs}"
  git: "${systemInfo.tools.git}"

platform:
  type: "${systemInfo.platform.type}"
  package_manager: "${systemInfo.platform.package_manager}"
  shell_environment: "${systemInfo.platform.shell_environment}"

# Notes for Claude:
# - This is a ${systemInfo.system.os} development environment with modern tool versions
# - ${systemInfo.system.distribution || 'System'} distribution${systemInfo.platform.package_manager !== 'unknown' ? ' using ' + systemInfo.platform.package_manager + ' package manager' : ''}
# - Docker and development tools are ${systemInfo.tools.docker !== 'Not available' ? 'available' : 'may need installation'}
# - Standard ${systemInfo.platform.type} command-line tools should be available`;
    
    // Write to shared directory
    const sharedDir = path.join(__dirname, '..', 'shared');
    const hostInfoPath = path.join(sharedDir, 'host-info.yaml');
    
    // Ensure shared directory exists
    await fs.mkdir(sharedDir, { recursive: true });
    
    await fs.writeFile(hostInfoPath, yamlContent);
    
    console.log(colors.green('✅ Host information generated successfully'));
    console.log(`   Saved to: ${path.relative(process.cwd(), hostInfoPath)}`);
    console.log('');
    
    return true;
    
  } catch (err) {
    console.error(colors.red(`Error generating host information: ${err.message}`));
    return false;
  }
}

module.exports = {
  checkInitializationStatus,
  hasGitHubAppAuth,
  generateHostInfo,
  checkHabitatRepositories,
  runInitialization,
  setupGitHubApp,
  setupGitHubToken
};