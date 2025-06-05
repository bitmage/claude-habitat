#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const yaml = require('js-yaml');

// Import modules
const { colors, sleep, fileExists, findPemFiles, calculateCacheHash, parseRepoSpec, parseCommands, getSSHKeyForRepository } = require('./src/utils');
const { dockerRun, dockerExec, dockerImageExists, dockerIsRunning } = require('./src/docker');
const { loadConfig } = require('./src/config');
const { askToContinue, askQuestion } = require('./src/cli');
const { testRepositoryAccess } = require('./src/github');

const returnToMainMenu = async () => {
  console.log('\nReturning to main menu...\n');
  await main();
};


async function runHabitat(configPath, extraRepos = []) {
  const config = await loadConfig(configPath);
  const hash = calculateCacheHash(config, extraRepos);
  const preparedTag = `claude-habitat-${config.name}:${hash}`;

  console.log(`Cache hash: ${hash}`);
  console.log(`Prepared image tag: ${preparedTag}`);

  // Check if prepared image exists
  if (await dockerImageExists(preparedTag)) {
    console.log(colors.green(`Using cached prepared image: ${preparedTag}`));
    console.log('This should start quickly since everything is pre-installed!');
  } else {
    console.log('No cached image found, building prepared environment...');
    console.log('This will take several minutes but subsequent runs will be instant.');

    // Build base image if needed
    await buildBaseImage(config);

    // Build prepared image
    await buildPreparedImage(config, preparedTag, extraRepos);
  }

  // Parse environment variables (simplified)
  const envVars = [];
  if (config.environment && Array.isArray(config.environment)) {
    for (const env of config.environment) {
      if (env && typeof env === 'string') {
        const cleanEnv = env.replace(/^- /, '');
        envVars.push(cleanEnv);
      }
    }
  }

  // Run the container
  await runContainer(preparedTag, config, envVars);
}

// Internal functions (no validation needed)
async function buildBaseImage(config) {
  const { image } = config;
  const tag = image.tag || `claude-habitat-${config.name}:latest`;

  // Check if image already exists
  if (await dockerImageExists(tag)) {
    console.log(`Using existing base image: ${tag}`);
    return tag;
  }

  console.log(`Building base Docker image: ${tag}`);

  // Resolve dockerfile path
  let dockerfilePath = image.dockerfile;
  if (!path.isAbsolute(dockerfilePath)) {
    // Check if it's just "Dockerfile" - use from environment directory
    if (dockerfilePath === 'Dockerfile' || dockerfilePath === './Dockerfile') {
      dockerfilePath = path.join(path.dirname(config._configPath), 'Dockerfile');
    } else {
      dockerfilePath = path.join(path.dirname(config._configPath), dockerfilePath);
    }
  }

  // Build command
  const buildArgs = ['build', '-f', dockerfilePath, '-t', tag];

  // Add build args if any
  if (image.build_args && Array.isArray(image.build_args)) {
    image.build_args.forEach(arg => {
      if (arg && arg !== '---') {
        const cleanArg = arg.replace(/^- /, '');
        if (cleanArg.includes('=')) {
          buildArgs.push('--build-arg', cleanArg);
        }
      }
    });
  }

  buildArgs.push(path.dirname(dockerfilePath));

  // Run build
  console.log(`Build command: docker ${buildArgs.join(' ')}`);
  await dockerRun(buildArgs);

  return tag;
}

async function cloneRepository(container, repoInfo) {
  const { url, path: repoPath, branch = 'main' } = repoInfo;
  
  // Convert HTTPS URLs to SSH for authentication with repository-specific host
  let cloneUrl = url;
  if (url.startsWith('https://github.com/')) {
    // Map repositories to specific SSH hosts
    if (url.includes('bitmage/county-fence-plugin')) {
      cloneUrl = url.replace('https://github.com/', 'git@github-county-fence:');
    } else if (url.includes('bitmage/discourse-calendar')) {
      cloneUrl = url.replace('https://github.com/', 'git@github-discourse-calendar:');
    } else {
      cloneUrl = url.replace('https://github.com/', 'git@github.com:');
    }
    
    if (!cloneUrl.endsWith('.git')) {
      cloneUrl += '.git';
    }
    console.log(`Converting HTTPS to SSH: ${url} -> ${cloneUrl}`);
  }
  
  console.log(`Cloning ${cloneUrl} to ${repoPath} (branch: ${branch})`);

  const cloneScript = `
    # Ensure parent directory exists
    mkdir -p $(dirname ${repoPath})

    # Test SSH key setup in container
    echo "=== SSH Setup Verification ==="
    echo "SSH config exists: $(test -f ~/.ssh/config && echo 'YES' || echo 'NO')"
    echo "SSH keys available: $(ls ~/.ssh/github_deploy_key* 2>/dev/null | wc -l)"
    echo "Known hosts: $(test -f ~/.ssh/known_hosts && echo 'YES' || echo 'NO')"

    # Test SSH connection to GitHub
    echo "Testing SSH connection to GitHub..."
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -T git@github.com
    echo "SSH general test exit code: $?"

    # Test repository-specific access
    echo "Testing repository access..."
    GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no" git ls-remote --heads ${cloneUrl} 2>&1 | head -3
    echo "Repository access test exit code: $?"

    # Clone the repository using SSH
    echo "Starting clone operation..."
    GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no" git clone --depth 1 --branch ${branch} ${cloneUrl} ${repoPath}

    # Add safe directory
    git config --global --add safe.directory ${repoPath}

    # Set ownership to discourse user (1000:1000)
    chown -R 1000:1000 ${repoPath}
  `;

  try {
    // Run as root to ensure SSH key access
    await dockerExec(container, cloneScript, 'root');
    console.log(`Successfully cloned ${cloneUrl}`);
  } catch (err) {
    throw new Error(`Failed to clone repository ${cloneUrl}: ${err.message}`);
  }
}

async function findFilesToCopy(sourceDir, destBase = '/claude-habitat', isShared = false) {
  const filesToCopy = [];
  const excludePatterns = isShared ? [] : ['Dockerfile', 'config.yaml', 'config.yml', '*.md', '.git', '.gitignore'];
  
  try {
    const items = await fs.readdir(sourceDir);
    for (const item of items) {
      // Check if item should be excluded (only for habitat directories, not shared)
      const shouldExclude = excludePatterns.some(pattern => {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
          return regex.test(item);
        }
        return item === pattern;
      });
      
      if (!shouldExclude) {
        const itemPath = path.join(sourceDir, item);
        const stat = await fs.stat(itemPath);
        
        if (stat.isFile()) {
          filesToCopy.push({
            src: itemPath,
            dest: `${destBase}/${item}`
          });
        } else if (stat.isDirectory() && item === 'files') {
          // Special handling for 'files' directory - copy its contents
          await copyFilesDirectory(itemPath, destBase, filesToCopy);
        } else if (stat.isDirectory() && isShared) {
          // For shared directory, copy subdirectories recursively
          await copyFilesDirectory(itemPath, `${destBase}/${item}`, filesToCopy);
        }
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not read directory: ${err.message}`);
  }
  
  return filesToCopy;
}

async function copyFilesDirectory(srcDir, destBase, filesToCopy) {
  const items = await fs.readdir(srcDir);
  for (const item of items) {
    const srcPath = path.join(srcDir, item);
    const stat = await fs.stat(srcPath);
    
    if (stat.isFile()) {
      filesToCopy.push({
        src: srcPath,
        dest: path.join(destBase, item)
      });
    } else if (stat.isDirectory()) {
      // Recursively handle subdirectories
      await copyFilesDirectory(srcPath, path.join(destBase, item), filesToCopy);
    }
  }
}

async function copyFileToContainer(container, srcPath, destPath, containerUser = null) {
  console.log(`  Copying ${path.basename(srcPath)} to ${destPath}`);
  
  try {
    // Create destination directory
    const destDir = path.dirname(destPath);
    await dockerExec(container, `mkdir -p ${destDir}`);
    
    // Copy file using docker cp
    await execAsync(`docker cp "${srcPath}" ${container}:${destPath}`);
    
    // Get original file permissions
    const stat = await fs.stat(srcPath);
    const isExecutable = (stat.mode & parseInt('111', 8)) !== 0;
    
    // Set appropriate permissions based on file type
    if (isExecutable) {
      await dockerExec(container, `chmod 755 ${destPath} 2>/dev/null || true`);
    } else {
      // Keep original permissions for sensitive files like .pem
      const permissions = destPath.includes('.pem') || destPath.includes('_key') ? '600' : '644';
      await dockerExec(container, `chmod ${permissions} ${destPath} 2>/dev/null || true`);
    }
    
    // Set ownership to container user if specified
    if (containerUser && containerUser !== 'root') {
      await dockerExec(container, `chown ${containerUser}:${containerUser} ${destPath} 2>/dev/null || true`);
    }
  } catch (err) {
    console.warn(`Warning: Failed to copy ${srcPath}: ${err.message}`);
  }
}

async function runSetupCommands(container, config) {
  // Run root commands
  if (config.setup?.root) {
    console.log('Running root setup commands...');

    for (const command of parseCommands(config.setup.root)) {
      console.log('Executing root command:');
      console.log(command);
      try {
        await dockerExec(container, command);
      } catch (err) {
        console.error(colors.red(`Setup command failed: ${err.message}`));
        throw err;
      }
    }
  }

  // Run user commands
  if (config.setup?.user?.commands && config.setup.user.run_as) {
    const runAs = config.setup.user.run_as;
    console.log(`Running user setup commands as ${runAs}...`);

    for (const command of parseCommands(config.setup.user.commands)) {
      console.log(`Executing user command as ${runAs}:`);
      console.log(command);
      try {
        await dockerExec(container, command, runAs);
      } catch (err) {
        console.error(colors.red(`Setup command failed: ${err.message}`));
        throw err;
      }
    }
  }
}


async function buildPreparedImage(config, tag, extraRepos) {
  console.log(`Building prepared image: ${tag}`);
  console.log('This may take several minutes for the first build...');

  const baseTag = config.image.tag || `claude-habitat-${config.name}:latest`;
  const tempContainer = `${config.name}_prepare_${Date.now()}_${process.pid}`;

  // Parse environment variables
  const envArgs = [];
  if (config.environment && Array.isArray(config.environment)) {
    config.environment.forEach(env => {
      if (env && typeof env === 'string' && !env.startsWith('GITHUB_APP_PRIVATE_KEY_FILE=')) {
        envArgs.push('-e', env.replace(/^- /, ''));
      }
    });
  }

  // Create temporary container
  console.log('Creating temporary container for preparation...');
  const runArgs = [
    'run', '-d',
    '--name', tempContainer,
    ...envArgs,
    baseTag,
    config.container?.init_command || '/sbin/boot'
  ];

  const containerId = await dockerRun(runArgs);

  // Cleanup function
  const cleanup = async () => {
    console.log('Cleaning up temporary container...');
    try {
      await execAsync(`docker stop ${tempContainer}`);
      await execAsync(`docker rm ${tempContainer}`);
    } catch {
      // Ignore errors
    }
  };

  try {
    // Wait for services to initialize
    console.log('Waiting for services to initialize...');
    await sleep(10000);

    // Check if container is still running
    if (!await dockerIsRunning(tempContainer)) {
      const { stdout: logs } = await execAsync(`docker logs ${tempContainer} --tail 20`).catch(() => ({ stdout: 'No logs available' }));
      throw new Error(`Container exited unexpectedly:\n${logs}`);
    }

    // Setup SSH authentication BEFORE cloning repositories
    console.log('Setting up SSH authentication...');
    
    // Find all available SSH keys
    const sharedDir = path.join(__dirname, 'shared');
    const sshKeys = ['github_deploy_key', 'github_deploy_key_county_fence', 'github_deploy_key_discourse_calendar'];
    const availableKeys = [];
    
    for (const keyName of sshKeys) {
      const keyPath = path.join(sharedDir, keyName);
      if (await fileExists(keyPath)) {
        availableKeys.push(keyName);
        // Copy SSH key to container
        await copyFileToContainer(tempContainer, keyPath, `/tmp/${keyName}`, 'root');
        await copyFileToContainer(tempContainer, `${keyPath}.pub`, `/tmp/${keyName}.pub`, 'root');
      }
    }
    
    if (availableKeys.length > 0) {
      // Create SSH config mapping repositories to specific keys
      let sshConfig = 'Host github.com\n  HostName github.com\n  User git\n  StrictHostKeyChecking no\n\n';
      
      sshConfig += 'Host github-county-fence\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/github_deploy_key_county_fence\n  StrictHostKeyChecking no\n\n';
      
      sshConfig += 'Host github-discourse-calendar\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/github_deploy_key_discourse_calendar\n  StrictHostKeyChecking no\n\n';
      
      // Setup SSH for both root and container user
      const sshSetup = `
        echo "Setting up SSH for GitHub access..."
        
        # Setup SSH for root
        mkdir -p /root/.ssh
        
        # Copy all available SSH keys
        ${availableKeys.map(key => `cp /tmp/${key} /root/.ssh/${key} && chmod 600 /root/.ssh/${key}`).join('\n        ')}
        
        # Create SSH config
        cat > /root/.ssh/config << 'SSH_CONFIG_EOF'
${sshConfig}SSH_CONFIG_EOF
        chmod 600 /root/.ssh/config
        
        echo "Getting GitHub host keys..."
        ssh-keyscan -t rsa,ecdsa,ed25519 github.com > /root/.ssh/known_hosts 2>/dev/null || {
          echo "ssh-keyscan failed, using manual known_hosts entry"
          echo "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl" > /root/.ssh/known_hosts
        }
        
        # Configure git to prefer SSH
        git config --global url."git@github.com:".insteadOf "https://github.com/"
        
        # Setup for container user if different
        if [ "discourse" != "root" ]; then
          echo "Setting up SSH for discourse user..."
          mkdir -p /home/discourse/.ssh
          
          # Copy all SSH keys and config to user
          ${availableKeys.map(key => `cp /root/.ssh/${key} /home/discourse/.ssh/${key}`).join('\n          ')}
          cp /root/.ssh/config /home/discourse/.ssh/config
          cp /root/.ssh/known_hosts /home/discourse/.ssh/known_hosts
          chown -R discourse:discourse /home/discourse/.ssh
          ${availableKeys.map(key => `chmod 600 /home/discourse/.ssh/${key}`).join('\n          ')}
          chmod 600 /home/discourse/.ssh/config
        fi
        
        # Test SSH connections
        echo "Testing SSH connection to GitHub as root..."
        ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -T git@github.com 2>&1 || echo "Root SSH test exit code: $?"
        
        # Test as discourse user if different
        if [ "discourse" != "root" ]; then
          echo "Testing SSH connection to GitHub as discourse..."
          sudo -u discourse ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -T git@github.com 2>&1 || echo "Discourse SSH test exit code: $?"
        fi
        
        # Clean up temp files
        rm -f /tmp/github_deploy_key*
        
        echo "SSH setup completed successfully"
      `;
      
      try {
        const sshResult = await dockerExec(tempContainer, sshSetup);
        console.log('SSH setup completed:', sshResult);
      } catch (sshError) {
        console.error('SSH setup failed:', sshError.message);
        throw sshError;
      }
    } else {
      console.warn('No SSH keys found - repository access may fail');
    }

    // Clone repositories from config
    if (config.repositories && Array.isArray(config.repositories)) {
      console.log('Cloning repositories into prepared image...');
      for (let i = 0; i < config.repositories.length; i++) {
        const repo = config.repositories[i];
        if (repo && repo.url) {
          console.log(`Processing repository ${i}: ${repo.url}`);
          await cloneRepository(tempContainer, repo);
        }
      }
    }

    // Clone extra repositories
    if (extraRepos.length > 0) {
      console.log('Cloning additional repositories...');
      for (const repoSpec of extraRepos) {
        const repo = parseRepoSpec(repoSpec);
        await cloneRepository(tempContainer, repo);
      }
    }

    // Get working directory and user for file placement
    const workDir = config.container?.work_dir || '/src';
    const containerUser = config.container?.user || 'root';
    
    // Copy system files (infrastructure)
    const systemDir = path.join(__dirname, 'system');
    const systemFiles = await findFilesToCopy(systemDir, `${workDir}/claude-habitat/system`, true);
    if (systemFiles.length > 0) {
      console.log('Copying system files to container...');
      for (const file of systemFiles) {
        await copyFileToContainer(tempContainer, file.src, file.dest, containerUser);
      }
    }

    // Copy shared files (user preferences)
    const sharedFiles = await findFilesToCopy(sharedDir, `${workDir}/claude-habitat/shared`, true);
    if (sharedFiles.length > 0) {
      console.log('Copying shared files to container...');
      for (const file of sharedFiles) {
        await copyFileToContainer(tempContainer, file.src, file.dest, containerUser);
      }
    }

    // Copy additional files from habitat directory
    const habitatDir = path.dirname(config._configPath);
    const filesToCopy = await findFilesToCopy(habitatDir, `${workDir}/claude-habitat`);
    if (filesToCopy.length > 0) {
      console.log('Copying habitat files to container...');
      for (const file of filesToCopy) {
        await copyFileToContainer(tempContainer, file.src, file.dest, containerUser);
      }
    }

    // Install Claude Habitat tools
    const systemToolsScript = `${workDir}/claude-habitat/system/tools/install-tools.sh`;
    const sharedToolsScript = `${workDir}/claude-habitat/shared/tools/install-tools.sh`;
    
    // Install system tools (core infrastructure)
    if (systemFiles.some(file => file.dest.includes('tools/install-tools.sh'))) {
      console.log('Installing system tools...');
      try {
        await dockerExec(tempContainer, `chmod +x ${systemToolsScript}`);
        await dockerExec(tempContainer, `cd ${workDir}/claude-habitat/system/tools && ./install-tools.sh install`);
        console.log('✅ System tools installed successfully');
      } catch (err) {
        console.warn(`Warning: Failed to install system tools: ${err.message}`);
        console.warn('Container will still work, but some development tools may be missing');
      }
    }
    
    // Install shared tools (user's personal tools)
    if (sharedFiles.some(file => file.dest.includes('tools/install-tools.sh'))) {
      console.log('Installing user tools...');
      try {
        await dockerExec(tempContainer, `chmod +x ${sharedToolsScript}`);
        await dockerExec(tempContainer, `cd ${workDir}/claude-habitat/shared/tools && ./install-tools.sh install`);
        console.log('✅ User tools installed successfully');
      } catch (err) {
        console.warn(`Warning: Failed to install user tools: ${err.message}`);
        console.warn('User tools not available, but system tools should work');
      }
    }

    // Create concatenated CLAUDE.md instructions
    console.log('Setting up Claude instructions...');
    try {
      const systemClaudePath = path.join(__dirname, 'system/CLAUDE.md');
      const sharedClaudePath = path.join(__dirname, 'shared/claude.md');
      const habitatDir = path.dirname(config._configPath);
      const habitatClaudePath = path.join(habitatDir, 'claude.md');
      
      let claudeContent = '';
      
      // Add system base instructions (infrastructure)
      if (await fileExists(systemClaudePath)) {
        const systemContent = await fs.readFile(systemClaudePath, 'utf8');
        claudeContent += systemContent;
      }
      
      // Add shared user preferences
      if (await fileExists(sharedClaudePath)) {
        const sharedContent = await fs.readFile(sharedClaudePath, 'utf8');
        if (claudeContent.length > 0) {
          claudeContent += '\n\n---\n\n# User Preferences\n\n';
        }
        claudeContent += sharedContent;
      }
      
      // Add habitat-specific instructions
      if (await fileExists(habitatClaudePath)) {
        const habitatContent = await fs.readFile(habitatClaudePath, 'utf8');
        if (claudeContent.length > 0) {
          claudeContent += '\n\n---\n\n# Project-Specific Instructions\n\n';
        }
        claudeContent += habitatContent;
      }
      
      // Only create the file if we have content
      if (claudeContent.length > 0) {
        // Write to temporary file first
        const tempClaudePath = '/tmp/CLAUDE.md';
        await dockerExec(tempContainer, `cat > ${tempClaudePath} << 'CLAUDE_EOF'\n${claudeContent}\nCLAUDE_EOF`);
        
        // Move to working directory (not in claude-habitat subdirectory)
        await dockerExec(tempContainer, `mv ${tempClaudePath} ${workDir}/CLAUDE.md`);
        
        // Set ownership to container user
        if (containerUser && containerUser !== 'root') {
          await dockerExec(tempContainer, `chown ${containerUser}:${containerUser} ${workDir}/CLAUDE.md`);
        }
        
        console.log('✅ Claude instructions configured');
      } else {
        console.log('ℹ️  No Claude instructions found');
      }
    } catch (err) {
      console.warn(`Warning: Failed to setup Claude instructions: ${err.message}`);
    }

    // Configure git settings if specified in config
    if (config.git?.config_file) {
      const habitatDir = path.dirname(config._configPath);
      const gitConfigPath = path.join(habitatDir, config.git.config_file);
      
      if (await fileExists(gitConfigPath)) {
        console.log('Configuring git from config file...');
        
        // Copy git config file to container
        await copyFileToContainer(tempContainer, gitConfigPath, '/tmp/gitconfig', 'root');
        
        const gitSetup = `
          # Apply git configuration globally
          cp /tmp/gitconfig /etc/gitconfig
          chmod 644 /etc/gitconfig
          
          # Also copy to root user's home
          cp /tmp/gitconfig /root/.gitconfig
          chmod 644 /root/.gitconfig
          
          # Copy to container user's home if different
          if [ "${containerUser}" != "root" ]; then
            mkdir -p /home/${containerUser}
            cp /tmp/gitconfig /home/${containerUser}/.gitconfig
            chown ${containerUser}:${containerUser} /home/${containerUser}/.gitconfig
            chmod 644 /home/${containerUser}/.gitconfig
          fi
          
          # Clean up temp file
          rm -f /tmp/gitconfig
        `;
        
        await dockerExec(tempContainer, gitSetup);
      }
    } else if (config.git?.user?.name && config.git?.user?.email) {
      // Fallback to old method if no config file specified
      console.log('Configuring git user...');
      
      const gitSetup = `
        # Configure git user globally
        git config --global user.name "${config.git.user.name}"
        git config --global user.email "${config.git.user.email}"
      `;
      
      await dockerExec(tempContainer, gitSetup);
    }

    // Ensure the entire claude-habitat directory is accessible to the container user
    if (containerUser && containerUser !== 'root' && (sharedFiles.length > 0 || filesToCopy.length > 0)) {
      console.log(`Setting ownership of claude-habitat directory to ${containerUser}...`);
      await dockerExec(tempContainer, `chown -R ${containerUser}:${containerUser} ${workDir}/claude-habitat 2>/dev/null || true`);
    }

    // Run setup commands
    console.log('Running setup commands...');
    await runSetupCommands(tempContainer, config);

    // Check if container is still running
    if (!await dockerIsRunning(tempContainer)) {
      const { stdout: logs } = await execAsync(`docker logs ${tempContainer} --tail 30`).catch(() => ({ stdout: 'No logs available' }));
      throw new Error(`Container exited during setup:\n${logs}`);
    }

    // Commit the prepared container
    console.log(`Committing prepared container to image: ${tag}`);
    await dockerRun(['commit', tempContainer, tag]);

    console.log(colors.green(`Successfully built prepared image: ${tag}`));
  } catch (err) {
    await cleanup();
    throw err;
  }

  await cleanup();
  return tag;
}

async function runContainer(tag, config, envVars) {
  const containerName = `${config.name}_${Date.now()}_${process.pid}`;
  const workDir = config.container?.work_dir || '/src';
  const containerUser = config.container?.user || 'root';
  const claudeCommand = config.claude?.command || 'claude';

  console.log(`Creating container from prepared image: ${containerName}`);

  // Build docker run arguments
  const runArgs = [
    'run', '-d',
    '--name', containerName,
    ...envVars.flatMap(env => ['-e', env]),
    tag,
    config.container?.init_command || '/sbin/boot'
  ];

  await dockerRun(runArgs);

  // Setup cleanup
  const cleanup = async () => {
    console.log('\nCleaning up container...');
    try {
      await execAsync(`docker stop ${containerName}`);
      await execAsync(`docker rm ${containerName}`);
    } catch {
      // Ignore errors
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Wait for container to start
    console.log('Waiting for container to initialize...');
    await sleep(config.container?.startup_delay * 1000 || 5000);

    // Check if container is running
    if (!await dockerIsRunning(containerName)) {
      const { stdout: logs } = await execAsync(`docker logs ${containerName}`).catch(() => ({ stdout: 'No logs available' }));
      throw new Error(`Container exited unexpectedly:\n${logs}`);
    }

    // Verify environment
    console.log('Verifying prepared environment...');
    try {
      await dockerExec(containerName, `test -d ${workDir}`, containerUser);
    } catch {
      throw new Error(`Work directory ${workDir} not found in prepared image`);
    }

    console.log('');
    console.log(colors.green('Container ready!'));
    console.log('Launching Claude Code...');
    console.log('');

    // Launch Claude Code interactively
    const claudeProcess = spawn('docker', [
      'exec', '-it',
      '-u', containerUser,
      '-w', workDir,
      containerName,
      ...claudeCommand.split(' ')
    ], {
      stdio: 'inherit'
    });

    // Wait for Claude to exit
    await new Promise((resolve, reject) => {
      claudeProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Claude Code exited with code ${code}`));
      });
      claudeProcess.on('error', reject);
    });
  } finally {
    await cleanup();
  }
}

// Helper to track last used config
async function getLastUsedConfig() {
  try {
    const lastFile = path.join(__dirname, '.last-config');
    const content = await fs.readFile(lastFile, 'utf8');
    return content.trim();
  } catch {
    return null;
  }
}

async function saveLastUsedConfig(configPath) {
  try {
    const lastFile = path.join(__dirname, '.last-config');
    await fs.writeFile(lastFile, configPath);
  } catch {
    // Ignore errors
  }
}

// Add new configuration with AI assistance
async function addNewConfiguration() {
  console.log(colors.green('\n=== Create New Configuration ===\n'));
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const ask = (question) => new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
  
  // Gather minimal information
  const projectUrl = await ask('Project URL (GitHub/GitLab/etc): ');
  if (!projectUrl) {
    console.log(colors.red('Project URL is required'));
    rl.close();
    return;
  }
  
  const additionalUrls = await ask('Additional plugins/modules URLs (comma-separated, or empty): ');
  const purpose = await ask('Purpose of this habitat: ');
  const habitatName = await ask('Habitat name (e.g., my-project): ');
  const specialInstructions = await ask('Any special instructions for Claude (or empty): ');
  
  rl.close();
  
  // Create workspace
  const os = require('os');
  const workspace = path.join(os.tmpdir(), `claude-habitat-new-${Date.now()}`);
  await fs.mkdir(workspace, { recursive: true });
  await fs.mkdir(path.join(workspace, 'dockerfiles'), { recursive: true });
  await fs.mkdir(path.join(workspace, 'configs'), { recursive: true });
  
  // Create context file
  const context = `# New Claude Habitat Configuration

## User Inputs
- **Project URL**: ${projectUrl}
- **Additional URLs**: ${additionalUrls || 'None'}
- **Purpose**: ${purpose || 'Development environment'}
- **Habitat Name**: ${habitatName}
- **Special Instructions**: ${specialInstructions || 'None'}

## Your Task

Please analyze the project(s) and create:

1. A Dockerfile in \`dockerfiles/${habitatName}/Dockerfile\`
2. A configuration file in \`configs/${habitatName}.yaml\`
3. A test plan in \`TEST_PLAN.md\`

The configuration should be complete and ready to use.
`;
  
  await fs.writeFile(path.join(workspace, 'PROJECT_CONTEXT.md'), context);
  
  // Copy example for reference
  try {
    await fs.copyFile(
      path.join(__dirname, 'configs', 'discourse.yaml'),
      path.join(workspace, 'example-discourse.yaml')
    );
  } catch {
    // It's ok if example doesn't exist
  }
  
  // Copy "Meta" Claude instructions for add mode
  await fs.copyFile(
    path.join(__dirname, 'claude/INSTRUCTIONS.md'),
    path.join(workspace, 'CLAUDE.md')
  );
  
  console.log(`\nWorkspace created at: ${workspace}`);
  console.log('Launching Claude to create your configuration...\n');
  
  // Launch Claude in the workspace
  const claudeCmd = spawn('claude', [], {
    cwd: workspace,
    stdio: 'inherit'
  });
  
  await new Promise((resolve, reject) => {
    claudeCmd.on('close', resolve);
    claudeCmd.on('error', reject);
  });
  
  // After Claude finishes, copy created files back
  console.log('\nChecking for created files...');
  
  try {
    // Check for created files
    const dockerfileDir = path.join(workspace, 'dockerfiles', habitatName);
    const configFile = path.join(workspace, 'configs', `${habitatName}.yaml`);
    
    if (await fileExists(path.join(dockerfileDir, 'Dockerfile'))) {
      // Copy Dockerfile
      const targetDockerDir = path.join(__dirname, 'dockerfiles', habitatName);
      await fs.mkdir(targetDockerDir, { recursive: true });
      await fs.copyFile(
        path.join(dockerfileDir, 'Dockerfile'),
        path.join(targetDockerDir, 'Dockerfile')
      );
      console.log(colors.green(`✓ Dockerfile created`));
    }
    
    if (await fileExists(configFile)) {
      // Copy config
      await fs.copyFile(
        configFile,
        path.join(__dirname, 'configs', `${habitatName}.yaml`)
      );
      console.log(colors.green(`✓ Configuration created`));
    }
    
    console.log(colors.green('\nConfiguration created successfully!'));
    console.log(`You can now run: ./claude-habitat --config ${habitatName}.yaml`);
  } catch (err) {
    console.error(colors.red(`Error processing created files: ${err.message}`));
  }
}

// Tools management mode
async function runToolsManagement() {
  console.log(colors.green('\n=== Claude Habitat Tools Management ===\n'));
  console.log('Manage development tools available in all containers.\n');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (question) => new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim().toLowerCase()));
  });

  try {
    while (true) {
      console.log('Tools Management Options:\n');
      console.log(`  ${colors.yellow('[1]')} Clean & reinstall all tools`);
      console.log(`  ${colors.yellow('[2]')} List tool status`);
      console.log(`  ${colors.yellow('[3]')} Reinstall specific tool`);
      console.log(`  ${colors.yellow('[q]')} Back to main menu\n`);

      const choice = await ask('Enter your choice: ');

      if (choice === 'q') {
        break;
      } else if (choice === '1') {
        await cleanAndReinstallAllTools();
      } else if (choice === '2') {
        await listToolStatus();
      } else if (choice === '3') {
        await reinstallSpecificTool();
      } else {
        console.log(colors.red('Invalid choice. Please try again.\n'));
      }
    }
  } finally {
    rl.close();
  }
}

// Clean and reinstall all tools
async function cleanAndReinstallAllTools() {
  console.log('\n' + colors.yellow('=== Clean & Reinstall All Tools ===\n'));
  
  const toolsDir = path.join(__dirname, 'system/tools');
  
  try {
    console.log('Cleaning existing tools...');
    await execAsync('cd "' + toolsDir + '" && ./install-tools.sh clean');
    
    console.log('Installing all tools...');
    await execAsync('cd "' + toolsDir + '" && ./install-tools.sh install');
    
    console.log(colors.green('✅ All tools reinstalled successfully!\n'));
  } catch (err) {
    console.error(colors.red(`❌ Error reinstalling tools: ${err.message}\n`));
  }
}

// List tool status
async function listToolStatus() {
  console.log('\n' + colors.yellow('=== Tool Status ===\n'));
  
  const toolsDir = path.join(__dirname, 'system/tools');
  
  try {
    const { stdout } = await execAsync('cd "' + toolsDir + '" && ./install-tools.sh list');
    console.log(stdout);
  } catch (err) {
    console.error(colors.red(`❌ Error listing tools: ${err.message}\n`));
  }
}

// Reinstall specific tool
async function reinstallSpecificTool() {
  console.log('\n' + colors.yellow('=== Reinstall Specific Tool ===\n'));
  
  const toolsDir = path.join(__dirname, 'system/tools');
  
  try {
    // First show available tools
    const { stdout } = await execAsync('cd "' + toolsDir + '" && ./install-tools.sh list');
    console.log('Available tools:\n');
    console.log(stdout);
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const toolChoice = await new Promise(resolve => {
      rl.question('Enter tool name to reinstall (or "q" to cancel): ', answer => {
        rl.close();
        resolve(answer.trim());
      });
    });

    if (toolChoice === 'q' || toolChoice === '') {
      console.log('Cancelled.\n');
      return;
    }

    console.log(`Installing ${toolChoice}...`);
    await execAsync(`cd "${toolsDir}" && ./install-tools.sh install ${toolChoice}`);
    
    console.log(colors.green(`✅ ${toolChoice} reinstalled successfully!\n`));
  } catch (err) {
    console.error(colors.red(`❌ Error reinstalling tool: ${err.message}\n`));
  }
}

// Maintenance mode
async function runMaintenanceMode() {
  console.log(colors.green('\n=== Claude Habitat Maintenance Mode ===\n'));
  console.log('This will launch Claude in the claude-habitat directory.');
  console.log('Claude will show you a menu of maintenance options.\n');
  console.log(colors.yellow('💡 Tip: Say "menu" at any time to see the options again\n'));
  
  // Create a session instruction file for Claude
  const sessionInstructions = `# Maintenance Mode Session

You are now in Claude Habitat maintenance mode. 

IMPORTANT: First, read and present the options from claude/MAINTENANCE.md to the user.

When the user says "menu", "options", "help", or similar, show the maintenance menu again.

Current directory: ${__dirname}
Session started: ${new Date().toISOString()}
`;

  const instructionFile = path.join(__dirname, '.maintenance-session.md');
  await fs.writeFile(instructionFile, sessionInstructions);
  
  // Launch Claude in the claude-habitat directory
  const claudeCmd = spawn('claude', [], {
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  await new Promise((resolve, reject) => {
    claudeCmd.on('close', resolve);
    claudeCmd.on('error', reject);
  });
  
  // Clean up session file
  try {
    await fs.unlink(instructionFile);
  } catch {
    // Ignore if already deleted
  }
  
  console.log('\nMaintenance session completed.');
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  const options = {
    configPath: null,
    extraRepos: [],
    clean: false,
    listConfigs: false,
    help: false,
    start: false,
    add: false,
    maintain: false
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-c':
      case '--config':
        options.configPath = args[++i];
        break;
      case '-r':
      case '--repo':
        options.extraRepos.push(args[++i]);
        break;
      case '--clean':
        options.clean = true;
        break;
      case '--list-configs':
        options.listConfigs = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      case 's':
      case 'start':
        options.start = true;
        break;
      case 'a':
      case 'add':
        options.add = true;
        break;
      case 'm':
      case 'maintain':
        options.maintain = true;
        break;
      default:
        // If it doesn't start with -, treat it as a habitat name
        if (!args[i].startsWith('-')) {
          options.configPath = args[i];
        } else {
          console.error(colors.red(`Unknown option: ${args[i]}`));
          process.exit(1);
        }
    }
  }

  // Handle special modes
  if (options.help) {
    console.log(`Usage: ${path.basename(process.argv[1])} [OPTIONS|SHORTCUTS]

OPTIONS:
    -c, --config FILE       Path to configuration YAML file
    -r, --repo REPO_SPEC    Additional repository to clone (format: URL:PATH[:BRANCH])
                           Can be specified multiple times
    --clean                 Remove all Claude Habitat Docker images
    --list-configs          List available configuration files
    -h, --help             Display this help message

SHORTCUTS:
    s, start               Start last used configuration (or first available)
    a, add                 Create new configuration with AI assistance
    m, maintain            Update/troubleshoot Claude Habitat itself

EXAMPLES:
    # Start with shortcut
    ${path.basename(process.argv[1])} s

    # Use a configuration file
    ${path.basename(process.argv[1])} --config discourse.yaml

    # Override/add repositories
    ${path.basename(process.argv[1])} --config discourse.yaml --repo "https://github.com/myuser/my-plugin:/src/plugins/my-plugin"

    # List available configs
    ${path.basename(process.argv[1])} --list-configs`);
    
    await askToContinue();
    await returnToMainMenu();
    return;
  }

  if (options.listConfigs) {
    const habitatsDir = path.join(__dirname, 'habitats');
    console.log('Available habitats:\n');
    try {
      const dirs = await fs.readdir(habitatsDir);
      let found = false;
      for (const dir of dirs) {
        const configPath = path.join(habitatsDir, dir, 'config.yaml');
        if (await fileExists(configPath)) {
          try {
            const content = require('fs').readFileSync(configPath, 'utf8');
            const parsed = yaml.load(content);
            console.log(`  ${colors.yellow(dir)}`);
            if (parsed.description) {
              console.log(`    ${parsed.description}`);
            }
            console.log('');
            found = true;
          } catch {
            console.log(`  ${colors.yellow(dir)} (configuration error)`);
          }
        }
      }
      if (!found) {
        console.log('  No habitats found');
      }
    } catch (err) {
      console.log('  No habitats directory found');
    }
    
    await askToContinue();
    await returnToMainMenu();
    return;
  }

  if (options.clean) {
    console.log('Cleaning Claude Habitat Docker images...');
    try {
      const { stdout } = await execAsync('docker images --format "{{.Repository}}:{{.Tag}}" | grep "^claude-habitat-"');
      const images = stdout.trim().split('\n').filter(Boolean);
      
      if (images.length === 0) {
        console.log('No Claude Habitat images found.');
      } else {
        for (const image of images) {
          console.log(`Removing ${image}...`);
          try {
            await dockerRun(['rmi', image]);
          } catch (err) {
            console.log(colors.yellow(`  Warning: Could not remove ${image}: ${err.message}`));
          }
        }
        console.log(colors.green(`Clean complete. Removed ${images.length} image(s).`));
      }
    } catch {
      console.log('No Claude Habitat images found.');
    }
    
    await askToContinue();
    await returnToMainMenu();
    return;
  }

  // Handle shortcut commands
  if (options.start) {
    const lastConfig = await getLastUsedConfig();
    const habitatsDir = path.join(__dirname, 'habitats');
    
    if (lastConfig) {
      options.configPath = lastConfig;
      console.log(`Starting: ${path.basename(path.dirname(lastConfig))}\n`);
    } else {
      // Use first available habitat
      try {
        const dirs = await fs.readdir(habitatsDir);
        for (const dir of dirs) {
          const configPath = path.join(habitatsDir, dir, 'config.yaml');
          if (await fileExists(configPath)) {
            options.configPath = configPath;
            console.log(`Starting: ${dir}\n`);
            break;
          }
        }
        if (!options.configPath) {
          console.error(colors.red('No habitats available'));
          process.exit(1);
        }
      } catch {
        console.error(colors.red('No configurations available'));
        process.exit(1);
      }
    }
  } else if (options.add) {
    await addNewConfiguration();
    
    console.log('\nConfiguration creation completed!');
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const nextChoice = await new Promise(resolve => {
      rl.question('\nWould you like to:\n[r] Run the new habitat now\n[m] Go back to main menu\nChoice: ', answer => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
    });
    
    if (nextChoice === 'r') {
      // Try to find the newly created habitat and run it
      console.log('Looking for the newly created habitat...');
      await askToContinue('Press Enter to return to main menu to select your new habitat...');
    }
    
    await returnToMainMenu();
    return;
  } else if (options.maintain) {
    await runMaintenanceMode();
    await returnToMainMenu();
    return;
  }

  // Normal operation - require config
  if (!options.configPath) {
    // Check initialization status
    console.log('Checking system status...');
    const initStatus = await checkInitializationStatus();
    
    // No config specified - show interactive menu
    const habitatsDir = path.join(__dirname, 'habitats');
    let habitats = [];
    
    try {
      const dirs = await fs.readdir(habitatsDir);
      for (const dir of dirs) {
        const configPath = path.join(habitatsDir, dir, 'config.yaml');
        if (await fileExists(configPath)) {
          habitats.push({ name: dir, path: configPath });
        }
      }
      habitats.sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      console.error(colors.red('No habitats directory found'));
      console.log('This appears to be a fresh installation.');
      console.log('The habitats directory will be created when you add your first habitat.');
      console.log('');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const choice = await new Promise(resolve => {
        rl.question('Would you like to:\n[a] Create your first habitat with AI assistance\n[q] Quit\nChoice: ', answer => {
          rl.close();
          resolve(answer.trim().toLowerCase());
        });
      });
      
      if (choice === 'a') {
        // Create habitats directory first
        await fs.mkdir(habitatsDir, { recursive: true });
        await addNewConfiguration();
        await returnToMainMenu();
        return;
      } else {
        console.log('Goodbye!');
        process.exit(0);
      }
    }
    
    // Check repository access for existing habitats
    const habitatRepoStatus = await checkHabitatRepositories(habitatsDir);
    
    if (habitats.length === 0) {
      console.error(colors.red('No habitats found'));
      console.log('You can create your first habitat with the [a]dd option.');
      console.log('');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const choice = await new Promise(resolve => {
        rl.question('Would you like to:\n[a] Create a new habitat with AI assistance\n[q] Quit\nChoice: ', answer => {
          rl.close();
          resolve(answer.trim().toLowerCase());
        });
      });
      
      if (choice === 'a') {
        await addNewConfiguration();
        await returnToMainMenu();
        return;
      } else {
        console.log('Goodbye!');
        process.exit(0);
      }
    }
    
    // Show welcome screen
    console.log(colors.green('\n=== Claude Habitat ===\n'));
    
    // Show initialization status if incomplete
    if (initStatus.completedSteps < initStatus.totalSteps) {
      if (initStatus.completedSteps === 0) {
        console.log(colors.red('⚠️  First time setup required'));
        console.log(`   ${colors.yellow('[i]')} Initialize Claude Habitat\n`);
      } else {
        console.log(colors.yellow(`⚠️  Setup incomplete (${initStatus.completedSteps}/${initStatus.totalSteps} steps done)`));
        console.log(`   ${colors.yellow('[i]')} Complete initialization\n`);
      }
    }
    
    if (habitats.length > 0) {
      console.log('Habitats:\n');
      // Show all habitats with appropriate hotkeys
      habitats.forEach((habitat, index) => {
        let key;
        if (index < 9) {
          // Direct number keys for first 9
          key = (index + 1).toString();
        } else {
          // Tilde prefix system for 10+
          const adjusted = index - 9; // 0-based for items 10+
          const tildeCount = Math.floor(adjusted / 9) + 1;
          const digit = (adjusted % 9) + 1;
          key = '~'.repeat(tildeCount) + digit;
        }
        
        // Check if this habitat has repository issues
        const habitatStatus = habitatRepoStatus.find(h => h.name === habitat.name);
        const statusWarning = habitatStatus?.hasIssues ? ' ⚠️' : '';
        
        try {
          const content = require('fs').readFileSync(habitat.path, 'utf8');
          const parsed = yaml.load(content);
          console.log(`  ${colors.yellow(`[${key}]`)} ${habitat.name}${statusWarning}`);
          if (parsed.description) {
            console.log(`      ${parsed.description}`);
          }
          if (habitatStatus?.hasIssues) {
            console.log('      (may not be able to access remote repositories)');
          }
          console.log('');
        } catch (err) {
          console.log(`  ${colors.yellow(`[${key}]`)} ${habitat.name}${statusWarning}`);
          console.log(`      (configuration error: ${err.message})`);
          console.log('');
        }
      });
    }
    
    // Add action options with clear categories
    console.log('Actions:\n');
    if (initStatus.completedSteps < initStatus.totalSteps) {
      console.log(`  ${colors.yellow('[i]')}nitialize - Set up authentication and verify system`);
    }
    console.log(`  ${colors.yellow('[s]')}tart   - Start last used configuration`);
    console.log(`  ${colors.yellow('[a]')}dd     - Create new configuration with AI assistance`);
    console.log(`  ${colors.yellow('[t]')}ools   - Manage development tools`);
    console.log(`  ${colors.yellow('[m]')}aintain - Update/troubleshoot Claude Habitat itself`);
    console.log(`  ${colors.yellow('[c]')}lean   - Remove all Docker images`);
    console.log(`  ${colors.yellow('[h]')}elp    - Show usage information`);
    console.log(`  ${colors.yellow('[q]')}uit    - Exit\n`);
    
    // Get user choice with single keypress or tilde sequences
    const choice = await new Promise(resolve => {
      let tildeBuffer = '';
      
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      const onKeypress = (key) => {
        // Handle Ctrl+C
        if (key === '\u0003') {
          console.log('\n');
          process.exit(0);
        }
        
        // Handle tilde sequences
        if (key === '~') {
          tildeBuffer += '~';
          return; // Wait for more input
        }
        
        // If we have tildes, append the digit and resolve
        if (tildeBuffer.length > 0) {
          const finalChoice = tildeBuffer + key;
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onKeypress);
          resolve(finalChoice);
          return;
        }
        
        // Regular single keypress
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onKeypress);
        resolve(key.toLowerCase());
      };
      
      process.stdin.on('data', onKeypress);
    });
    
    // Handle choice
    if (choice === 'q') {
      process.exit(0);
    } else if (choice === 'i') {
      // Initialize/complete setup
      await runInitialization();
      process.exit(0);
    } else if (choice === 'h') {
      options.help = true;
    } else if (choice === 'c') {
      options.clean = true;
    } else if (choice === 's') {
      // Start - use last config or default
      const lastConfig = await getLastUsedConfig();
      if (lastConfig) {
        options.configPath = lastConfig;
        console.log(`\nStarting: ${path.basename(lastConfig)}\n`);
      } else if (configs.length > 0) {
        options.configPath = path.join(configDir, configs[0]);
        console.log(`\nStarting: ${configs[0]}\n`);
      } else {
        console.error(colors.red('\nNo configurations available'));
        process.exit(1);
      }
    } else if (choice === 'a') {
      // Add new configuration with AI
      await addNewConfiguration();
      process.exit(0);
    } else if (choice === 't') {
      // Tools management
      await runToolsManagement();
      await returnToMainMenu();
      return;
    } else if (choice === 'm') {
      // Maintenance mode
      await runMaintenanceMode();
      process.exit(0);
    } else {
      // Check if it's a direct number (1-9)
      const directIndex = parseInt(choice) - 1;
      if (!isNaN(directIndex) && directIndex >= 0 && directIndex < 9 && directIndex < habitats.length) {
        options.configPath = habitats[directIndex].path;
        console.log(`\nSelected: ${habitats[directIndex].name}\n`);
      } else if (choice.startsWith('~')) {
        // Handle tilde prefix sequences (~1, ~~2, etc.)
        const tildeCount = choice.match(/^~+/)[0].length;
        const digit = choice.slice(tildeCount);
        const digitNum = parseInt(digit);
        
        if (!isNaN(digitNum) && digitNum >= 1 && digitNum <= 9) {
          // Calculate actual index: 9 + (tildeCount-1)*9 + (digitNum-1)
          const habitatIndex = 9 + (tildeCount - 1) * 9 + (digitNum - 1);
          
          if (habitatIndex < habitats.length) {
            options.configPath = habitats[habitatIndex].path;
            console.log(`\nSelected: ${habitats[habitatIndex].name}\n`);
          } else {
            console.error(colors.red('\n❌ Invalid habitat selection'));
            console.log('Returning to main menu...\n');
            await sleep(2000);
            await returnToMainMenu();
            return;
          }
        } else {
          console.error(colors.red('\n❌ Invalid tilde sequence - use ~1-9, ~~1-9, etc.'));
          console.log('Returning to main menu...\n');
          await sleep(2000);
          await returnToMainMenu();
          return;
        }
      } else {
        console.error(colors.red('\n❌ Invalid choice'));
        console.log('Use number keys 1-9, tilde sequences (~1, ~~2), or letter commands');
        console.log('Returning to main menu...\n');
        await sleep(2000);
        await returnToMainMenu();
        return;
      }
    }
  }

  // Make config path absolute (if we have one)
  if (options.configPath && !path.isAbsolute(options.configPath)) {
    // Check if it's a habitat name
    const habitatConfigPath = path.join(__dirname, 'habitats', options.configPath, 'config.yaml');
    if (await fileExists(habitatConfigPath)) {
      options.configPath = habitatConfigPath;
    } else {
      // Check if it's just a filename in old configs dir (backward compatibility)
      const configInDir = path.join(__dirname, 'configs', options.configPath);
      if (await fileExists(configInDir)) {
        options.configPath = configInDir;
      } else {
        options.configPath = path.resolve(options.configPath);
      }
    }
  }

  // Run the selected operation
  if (options.configPath) {
    try {
      // Pre-flight repository access check
      console.log('Pre-flight check...');
      const config = await loadConfig(options.configPath);
      const problemRepos = [];
      
      if (config.repositories && Array.isArray(config.repositories)) {
        for (const repo of config.repositories) {
          if (repo.url) {
            const accessMode = repo.access || 'write';
            const result = await testRepositoryAccess(repo.url, accessMode);
            if (!result.accessible) {
              problemRepos.push({ 
                url: repo.url, 
                reason: result.reason, 
                needsDeployKey: result.needsDeployKey,
                needsGitHubCli: result.needsGitHubCli,
                repoPath: result.repoPath,
                accessMode: result.accessMode,
                issues: result.issues 
              });
            }
          }
        }
      }
      
      if (problemRepos.length > 0) {
        // Separate by issue type and access mode
        const writeRepos = problemRepos.filter(repo => repo.accessMode === 'write');
        const readRepos = problemRepos.filter(repo => repo.accessMode === 'read');
        
        // Show write repository issues (more important)
        if (writeRepos.length > 0) {
          console.log(colors.yellow('⚠️ Write access issues for development repositories:'));
          
          writeRepos.forEach(repo => {
            console.log(colors.yellow(`\n   ${repo.url}:`));
            if (repo.issues) {
              repo.issues.forEach(issue => {
                console.log(colors.red(`     - ${issue.type === 'git' ? 'Git' : 'GitHub API'}: ${issue.error}`));
                console.log(colors.green(`       → ${issue.resolution}`));
              });
            }
          });
        }
        
        // Show read repository issues
        if (readRepos.length > 0) {
          console.log(colors.yellow('\n⚠️ Read access issues for dependency repositories:'));
          readRepos.forEach(repo => {
            console.log(colors.yellow(`   - ${repo.url}: ${repo.reason}`));
          });
        }
        
        // Show deploy key if any repos need it
        const needsDeployKey = problemRepos.some(repo => repo.needsDeployKey);
        if (needsDeployKey) {
          console.log('\n' + colors.green('SSH Deploy Key (add to repositories that need it):'));
          console.log(colors.yellow('━'.repeat(80)));
          
          const sshPublicKey = await fs.readFile(path.join(__dirname, 'shared/github_deploy_key.pub'), 'utf8');
          console.log(sshPublicKey.trim());
          
          console.log(colors.yellow('━'.repeat(80)));
          console.log('\nTo add deploy key:');
          console.log('1. Go to GitHub repository → Settings → Deploy keys');
          console.log('2. Click "Add deploy key"');
          console.log('3. Title: "Claude Habitat Deploy Key"');
          console.log('4. Paste the key above');
          console.log('5. ☑️ Check "Allow write access" (for development repos)');
          console.log('6. Click "Add key"\n');
        }
        
        // Show GitHub CLI instructions if needed
        const needsGitHubCli = problemRepos.some(repo => repo.needsGitHubCli);
        if (needsGitHubCli) {
          console.log(colors.green('\nGitHub CLI Setup:'));
          console.log('1. Run: gh auth login');
          console.log('2. Follow the prompts to authenticate');
          console.log('3. GitHub CLI will handle API access for PR creation\n');
        }
        
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const writeRepoCount = writeRepos.length;
        const readOnlyPrompt = writeRepoCount > 0 ? `\n[s] Set failing write repositories to read-only` : '';
        
        const choice = await new Promise(resolve => {
          rl.question(`Would you like to:\n[c] Continue anyway (may fail during build)\n[f] Fix authentication setup${readOnlyPrompt}\n[m] Go back to main menu\nChoice: `, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase());
          });
        });
        
        if (choice === 's' && writeRepoCount > 0) {
          // Update config to set failing write repos to read-only
          console.log('\nUpdating configuration to set failing repositories to read-only...');
          
          const configContent = await fs.readFile(options.configPath, 'utf8');
          let updatedConfig = configContent;
          
          // Update each failing write repo to have access: read
          writeRepos.forEach(repo => {
            // Find the repository in the config
            const repoUrlEscaped = repo.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const repoPattern = new RegExp(`(- url:\\s*${repoUrlEscaped}[\\s\\S]*?)(?=\\n\\s*(?:- url:|# |$))`, 'g');
            
            updatedConfig = updatedConfig.replace(repoPattern, (match) => {
              // Check if access field already exists
              if (match.includes('access:')) {
                // Update existing access field
                return match.replace(/access:\s*\w+/, 'access: read');
              } else {
                // Add access field after branch or at end
                if (match.includes('branch:')) {
                  return match.replace(/(branch:[^\n]*\n)/, '$1    access: read\n');
                } else {
                  // Add at end of repo block
                  return match.trimEnd() + '\n    access: read\n';
                }
              }
            });
          });
          
          // Write updated config back
          await fs.writeFile(options.configPath, updatedConfig);
          
          console.log(colors.green('✅ Configuration updated. Failing repositories set to read-only.'));
          console.log('Continuing with habitat startup...\n');
          // Continue with habitat launch
        } else if (choice === 'f') {
          await runInitialization();
          
          // After initialization, offer next steps
          const readline2 = require('readline');
          const rl2 = readline2.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          const nextChoice = await new Promise(resolve => {
            rl2.question('\nWould you like to:\n[r] Run this habitat now\n[t] Try the repository check again\n[m] Go back to main menu\nChoice: ', answer => {
              rl2.close();
              resolve(answer.trim().toLowerCase());
            });
          });
          
          if (nextChoice === 'r') {
            console.log('Continuing with habitat startup...\n');
            // Continue with habitat launch
          } else if (nextChoice === 't') {
            console.log('Retrying repository access check...\n');
            // Re-run the pre-flight check
            const retryProblemRepos = [];
            if (config.repositories && Array.isArray(config.repositories)) {
              for (const repo of config.repositories) {
                if (repo.url) {
                  const accessMode = repo.access || 'write';
                  const result = await testRepositoryAccess(repo.url, accessMode);
                  if (!result.accessible) {
                    retryProblemRepos.push({ url: repo.url, reason: result.reason, accessMode: accessMode });
                  }
                }
              }
            }
            
            if (retryProblemRepos.length > 0) {
              console.log(colors.red('⚠️ Still having repository access issues:'));
              retryProblemRepos.forEach(repo => {
                console.log(colors.red(`   - ${repo.url} (${repo.reason})`));
              });
              console.log('\nContinuing anyway...\n');
            } else {
              console.log(colors.green('✅ All repositories now accessible!'));
              console.log('Continuing with habitat startup...\n');
            }
            // Continue with habitat launch
          } else {
            console.log('Returning to main menu...');
            // Return to main menu by restarting
            const originalArgv = process.argv;
            process.argv = [process.argv[0], process.argv[1]]; // Reset to just script name
            await main();
            return;
          }
        } else if (choice === 'm') {
          console.log('Returning to main menu...');
          // Return to main menu by restarting
          const originalArgv = process.argv;
          process.argv = [process.argv[0], process.argv[1]]; // Reset to just script name
          await main();
          return;
        }
        // If 'c' or anything else, continue
        console.log('Continuing with habitat startup...\n');
      } else {
        console.log(colors.green('✅ Repository access verified'));
      }
      
      await saveLastUsedConfig(options.configPath);
      await runHabitat(options.configPath, options.extraRepos);
    } catch (err) {
      console.error(colors.red(`\n❌ Error starting habitat: ${err.message}`));
      if (err.validationErrors) {
        err.validationErrors.forEach(e => console.error(colors.red(`  - ${e}`)));
      }
      
      console.log('\nThis could be due to:');
      console.log('• Configuration file errors');
      console.log('• Docker connectivity issues'); 
      console.log('• Repository access problems');
      console.log('• Missing dependencies');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const choice = await new Promise(resolve => {
        rl.question('\nWould you like to:\n[t] Try a different habitat\n[f] Fix authentication/setup\n[m] Go back to main menu\nChoice: ', answer => {
          rl.close();
          resolve(answer.trim().toLowerCase());
        });
      });
      
      if (choice === 't') {
        console.log('Returning to habitat selection...');
        await returnToMainMenu();
        return;
      } else if (choice === 'f') {
        await runInitialization();
        await returnToMainMenu();
        return;
      } else {
        await returnToMainMenu();
        return;
      }
    }
  }
}

// Initialization detection and testing
async function checkInitializationStatus() {
  const status = {
    githubApp: false,
    sshKey: false,
    docker: false,
    claude: false,
    completedSteps: 0,
    totalSteps: 4
  };

  try {
    // Check for GitHub App (.pem files)
    const pemFiles = await findPemFiles(path.join(__dirname, 'shared'));
    status.githubApp = pemFiles.length > 0;
    if (status.githubApp) status.completedSteps++;

    // Check for SSH keys
    const sshKeyPath = path.join(__dirname, 'shared/github_deploy_key');
    status.sshKey = await fileExists(sshKeyPath);
    if (status.sshKey) status.completedSteps++;

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

async function runInitialization() {
  console.log(colors.green('\n=== Claude Habitat Initialization ===\n'));
  
  const status = await checkInitializationStatus();
  
  console.log('Current Status:\n');
  console.log(`${status.docker ? '✅' : '❌'} Docker: ${status.docker ? 'Working' : 'Not accessible'}`);
  console.log(`${status.claude ? '✅' : '❌'} Claude Code: ${status.claude ? 'Installed' : 'Not found'}`);
  console.log(`${status.githubApp ? '✅' : '❌'} GitHub App: ${status.githubApp ? 'Configured' : 'Not configured'}`);
  console.log(`${status.sshKey ? '✅' : '❌'} SSH Keys: ${status.sshKey ? 'Found' : 'Not found'}`);
  console.log('');
  
  if (!status.docker || !status.claude) {
    console.log(colors.red('⚠️  Prerequisites missing. Please install:'));
    if (!status.docker) console.log('   - Docker (https://docs.docker.com/get-docker/)');
    if (!status.claude) console.log('   - Claude Code CLI (npm install -g @anthropic-ai/claude-code)');
    console.log('\nRun initialization again after installing prerequisites.');
    return;
  }
  
  if (status.githubApp && status.sshKey) {
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
        const { spawn } = require('child_process');
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
        console.log(`   mv ~/Downloads/your-app.*.pem ${path.join(__dirname, 'shared/')}`);
        console.log('');
        
        await ask('Press Enter when you\'ve moved the .pem file...');
        
        // Verify
        const pemFiles = await findPemFiles(path.join(__dirname, 'shared'));
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
    
    // SSH Key setup  
    if (!status.sshKey) {
      console.log(colors.yellow('=== Step 2: SSH Key Setup ==='));
      console.log('This enables Claude to clone and push to private repositories.\n');
      
      const proceed = await ask('Ready to set up SSH keys? [Y/n]: ');
      if (proceed.toLowerCase() !== 'n' && proceed.toLowerCase() !== 'no') {
        console.log('Generating SSH key...');
        
        const keyPath = path.join(__dirname, 'shared/github_deploy_key');
        try {
          await execAsync(`ssh-keygen -t ed25519 -f "${keyPath}" -N "" -C "claude-habitat"`);
          await execAsync(`chmod 600 "${keyPath}"`);
          await execAsync(`chmod 644 "${keyPath}.pub"`);
          
          console.log(colors.green('✅ SSH key generated successfully!'));
          console.log('\nPublic key to add to GitHub repositories:');
          console.log(colors.yellow('━'.repeat(60)));
          
          const publicKey = await fs.readFile(`${keyPath}.pub`, 'utf8');
          console.log(publicKey.trim());
          
          console.log(colors.yellow('━'.repeat(60)));
          console.log('\nFor each repository you want to access:');
          console.log('1. Go to Repository Settings → Deploy keys');
          console.log('2. Click "Add deploy key"');
          console.log('3. Paste the public key above');
          console.log('4. Check "Allow write access" if Claude needs to push');
          console.log('5. Click "Add key"');
          console.log('\nThis gives access to that specific repository.');
          
        } catch (err) {
          console.log(colors.red(`❌ Failed to generate SSH key: ${err.message}`));
        }
      }
      console.log('');
    }
    
    // Final status check
    const finalStatus = await checkInitializationStatus();
    console.log(colors.yellow('=== Setup Complete ==='));
    console.log(`Setup progress: ${finalStatus.completedSteps}/${finalStatus.totalSteps} steps done\n`);
    
    if (finalStatus.completedSteps === finalStatus.totalSteps) {
      console.log(colors.green('🎉 All setup complete! You\'re ready to use Claude Habitat.'));
      console.log('\nReturning to main menu...\n');
      
      // Return to main menu by calling main() without configPath
      const originalArgv = process.argv;
      process.argv = [process.argv[0], process.argv[1]]; // Reset to just script name
      
      // Small delay to let user read the completion message
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Clear the configPath option and restart the main flow
      await main();
    } else {
      console.log(colors.yellow('⚠️  Some steps still need completion.'));
      console.log('Run "./claude-habitat" and select [i]nitialize to continue setup.');
    }
    
  } finally {
    rl.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error(colors.red(`Fatal error: ${err.message}`));
    process.exit(1);
  });
}

module.exports = { loadConfig, calculateCacheHash, parseRepoSpec, runHabitat };
