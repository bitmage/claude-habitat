const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

const { colors, sleep, fileExists, calculateCacheHash, parseRepoSpec, parseCommands } = require('./utils');
const { dockerRun, dockerExec, dockerImageExists, dockerIsRunning } = require('./docker');
const { loadConfig } = require('./config');
const { 
  findFilesToCopy, 
  copyFileToContainer, 
  processFileOperations 
} = require('./filesystem');

// Build base Docker image from Dockerfile
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

// Run setup commands in container
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

// Clone repository into container
async function cloneRepository(container, repoInfo, workDir = '/src') {
  const { url, path: repoPath, branch = 'main' } = repoInfo;
  const cloneUrl = url;
  
  console.log(`Cloning ${cloneUrl} (branch: ${branch}) to ${repoPath}...`);
  
  try {
    // Create target directory
    await dockerExec(container, `mkdir -p ${repoPath}`);
    
    // Clone repository
    const cloneCommand = `cd ${workDir} && git clone --depth 1 --branch ${branch} ${cloneUrl} ${repoPath.replace(workDir + '/', '')}`;
    await dockerExec(container, cloneCommand);
    
    console.log(`✅ Successfully cloned ${cloneUrl}`);
  } catch (err) {
    console.error(colors.red(`❌ Failed to clone ${cloneUrl}: ${err.message}`));
    
    // Try to provide more context on common errors
    if (err.message.includes('Permission denied') || err.message.includes('publickey')) {
      console.error(colors.red('Hint: This might be a private repository requiring SSH authentication'));
    } else if (err.message.includes('not found') || err.message.includes('does not exist')) {
      console.error(colors.red('Hint: Check that the repository URL is correct'));
    } else if (err.message.includes('branch')) {
      console.error(colors.red(`Hint: Branch '${branch}' might not exist, try 'main' or 'master'`));
    }
    
    throw new Error(`Failed to clone repository ${cloneUrl}: ${err.message}`);
  }
}

// Build prepared image with all dependencies and setup
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
    ...envArgs
  ];

  // Add volume mounts if specified
  if (config.volumes && Array.isArray(config.volumes)) {
    config.volumes.forEach(volume => {
      runArgs.push('-v', volume);
    });
  }

  runArgs.push(baseTag, config.container?.init_command || '/sbin/boot');

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

    // Get working directory and user for file placement first
    const workDir = config.container?.work_dir || '/src';
    const containerUser = config.container?.user || 'root';
    
    // Copy shared files FIRST so they're available for authentication
    const sharedDir = path.join(__dirname, '../shared');
    const sharedConfigPath = path.join(sharedDir, 'config.yaml');
    
    if (await fileExists(sharedConfigPath)) {
      console.log('Processing shared configuration...');
      const sharedConfig = await loadConfig(sharedConfigPath);
      
      // Process shared file operations
      await processFileOperations(tempContainer, sharedConfig, sharedDir, containerUser);
      
      // Run shared setup commands (replace {container_user} placeholder)
      if (sharedConfig.setup) {
        // Replace placeholder with actual container user
        const processedConfig = JSON.parse(JSON.stringify(sharedConfig).replace(/\{container_user\}/g, containerUser));
        await runSetupCommands(tempContainer, processedConfig);
      }
    }
    
    // Skip infrastructure setup if bypass mode is enabled
    let sharedFiles = [];
    if (config.claude?.bypass_habitat_construction) {
      console.log('⏭️  Bypassing habitat infrastructure construction (self-contained mode)');
    } else {
      // Copy remaining shared files (user preferences)
      sharedFiles = await findFilesToCopy(sharedDir, `${workDir}/habitat/shared`, true);
      if (sharedFiles.length > 0) {
        console.log('Copying shared files to container...');
        for (const file of sharedFiles) {
          await copyFileToContainer(tempContainer, file.src, file.dest, containerUser);
        }
      }
    }

    // GitHub authentication is now handled by system/tools/bin/setup-github-auth
    console.log('GitHub authentication setup delegated to system tools');

    // Process system configuration and files BEFORE repository cloning
    const systemDir = path.join(__dirname, '../system');
    const systemConfigPath = path.join(systemDir, 'config.yaml');
    
    if (await fileExists(systemConfigPath)) {
      console.log('Processing system configuration...');
      const systemConfig = await loadConfig(systemConfigPath);
      
      // Copy system tools FIRST so they're available for setup commands
      const systemToolsFiles = await findFilesToCopy(systemDir, `${workDir}/habitat/system`, true);
      if (systemToolsFiles.length > 0) {
        console.log('Copying system tools for setup...');
        for (const file of systemToolsFiles) {
          await copyFileToContainer(tempContainer, file.src, file.dest, containerUser);
        }
      }
      
      // Process system file operations
      await processFileOperations(tempContainer, systemConfig, systemDir, containerUser);
      
      // Run system setup commands (replace {container_user} placeholder)
      if (systemConfig.setup) {
        // Replace placeholder with actual container user
        const processedConfig = JSON.parse(JSON.stringify(systemConfig).replace(/\{container_user\}/g, containerUser));
        await runSetupCommands(tempContainer, processedConfig);
      }
    }

    // Clone repositories from config
    if (config.repositories && Array.isArray(config.repositories)) {
      console.log('Cloning repositories into prepared image...');
      for (let i = 0; i < config.repositories.length; i++) {
        const repo = config.repositories[i];
        if (repo && repo.url) {
          console.log(`Processing repository ${i}: ${repo.url}`);
          await cloneRepository(tempContainer, repo, workDir);
        }
      }
    }

    // Clone extra repositories
    if (extraRepos.length > 0) {
      console.log('Cloning additional repositories...');
      for (const repoSpec of extraRepos) {
        const repo = parseRepoSpec(repoSpec);
        await cloneRepository(tempContainer, repo, workDir);
      }
    }

    // Working directory and user already defined above
    
    let systemFiles = [];
    let filesToCopy = [];
    if (!config.claude?.bypass_habitat_construction) {
      // Copy remaining system files (infrastructure)
      systemFiles = await findFilesToCopy(systemDir, `${workDir}/habitat/system`, true);
      if (systemFiles.length > 0) {
        console.log('Copying system files to container...');
        for (const file of systemFiles) {
          await copyFileToContainer(tempContainer, file.src, file.dest, containerUser);
        }
      }

      // Shared files were already processed before authentication setup

      // Copy additional files from habitat directory to local
      const habitatDir = path.dirname(config._configPath);
      filesToCopy = await findFilesToCopy(habitatDir, `${workDir}/habitat/local`);
      if (filesToCopy.length > 0) {
        console.log('Copying habitat files to container...');
        for (const file of filesToCopy) {
          await copyFileToContainer(tempContainer, file.src, file.dest, containerUser);
        }
      }

      // Install Claude Habitat tools
      const systemToolsScript = `${workDir}/habitat/system/tools/install-tools.sh`;
      const sharedToolsScript = `${workDir}/habitat/shared/tools/install-tools.sh`;
      
      // Install system tools (core infrastructure)
      if (systemFiles.some(file => file.dest.includes('tools/install-tools.sh'))) {
        console.log('Installing system tools...');
        try {
          await dockerExec(tempContainer, `chmod +x ${systemToolsScript}`);
          await dockerExec(tempContainer, `cd ${workDir}/habitat/system/tools && ./install-tools.sh install`);
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
          await dockerExec(tempContainer, `cd ${workDir}/habitat/shared/tools && ./install-tools.sh install`);
          console.log('✅ User tools installed successfully');
        } catch (err) {
          console.warn(`Warning: Failed to install user tools: ${err.message}`);
          console.warn('User tools not available, but system tools should work');
        }
      }
    }

    // Create concatenated CLAUDE.md instructions (unless disabled or bypassed)
    if (!config.claude?.disable_habitat_instructions && !config.claude?.bypass_habitat_construction) {
      console.log('Setting up Claude instructions...');
      try {
        const systemClaudePath = path.join(__dirname, '../system/CLAUDE.md');
        const sharedClaudePath = path.join(__dirname, '../shared/CLAUDE.md');
        const habitatDir = path.dirname(config._configPath);
        const habitatClaudePath = path.join(habitatDir, 'CLAUDE.md');
        
        let claudeContent = '';
        
        // Add system base instructions (infrastructure)
        if (await fileExists(systemClaudePath)) {
          let systemContent = await fs.readFile(systemClaudePath, 'utf8');
          // Update path references to use claude-habitat/ subdirectory
          systemContent = systemContent.replace(/\.\/claude-habitat\//g, './claude-habitat/');
          systemContent = systemContent.replace(/claude-habitat\/system\//g, 'claude-habitat/system/');
          systemContent = systemContent.replace(/claude-habitat\/shared\//g, 'claude-habitat/shared/');
          systemContent = systemContent.replace(/claude-habitat\/local\//g, 'claude-habitat/local/');
          claudeContent += systemContent;
        }
        
        // Add shared user preferences
        if (await fileExists(sharedClaudePath)) {
          let sharedContent = await fs.readFile(sharedClaudePath, 'utf8');
          // Update path references to use claude-habitat/ subdirectory
          sharedContent = sharedContent.replace(/\.\/claude-habitat\//g, './claude-habitat/');
          sharedContent = sharedContent.replace(/claude-habitat\/system\//g, 'claude-habitat/system/');
          sharedContent = sharedContent.replace(/claude-habitat\/shared\//g, 'claude-habitat/shared/');
          sharedContent = sharedContent.replace(/claude-habitat\/local\//g, 'claude-habitat/local/');
          if (claudeContent.length > 0) {
            claudeContent += '\n\n---\n\n# User Preferences\n\n';
          }
          claudeContent += sharedContent;
        }
        
        // Add habitat-specific instructions
        if (await fileExists(habitatClaudePath)) {
          let habitatContent = await fs.readFile(habitatClaudePath, 'utf8');
          // Update path references to use claude-habitat/ subdirectory
          habitatContent = habitatContent.replace(/\.\/claude-habitat\//g, './claude-habitat/');
          habitatContent = habitatContent.replace(/claude-habitat\/system\//g, 'claude-habitat/system/');
          habitatContent = habitatContent.replace(/claude-habitat\/shared\//g, 'claude-habitat/shared/');
          habitatContent = habitatContent.replace(/claude-habitat\/local\//g, 'claude-habitat/local/');
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
    } else {
      console.log('⏭️  Skipping Claude instruction setup (disabled in config)');
    }

    // Git configuration is now handled by shared/config.yaml file operations

    // Ensure the entire claude-habitat directory is accessible to the container user
    if (containerUser && containerUser !== 'root' && (sharedFiles.length > 0 || filesToCopy.length > 0)) {
      console.log(`Setting ownership of habitat directory to ${containerUser}...`);
      await dockerExec(tempContainer, `chown -R ${containerUser}:${containerUser} ${workDir}/habitat 2>/dev/null || true`);
    }

    // Run setup commands
    console.log('Running setup commands...');
    await runSetupCommands(tempContainer, config);

    // Check if container is still running
    if (!await dockerIsRunning(tempContainer)) {
      const { stdout: logs } = await execAsync(`docker logs ${tempContainer} --tail 30`).catch(() => ({ stdout: 'No logs available' }));
      throw new Error(`Container exited during setup:\n${logs}`);
    }

    // Commit changes to new image
    console.log('Committing prepared image...');
    await execAsync(`docker commit ${tempContainer} ${tag}`);
    
    console.log(`✅ Prepared image built successfully: ${tag}`);
    return tag;

  } catch (err) {
    console.error(colors.red(`Error during image preparation: ${err.message}`));
    throw err;
  } finally {
    await cleanup();
  }
}

module.exports = {
  buildBaseImage,
  buildPreparedImage,
  runSetupCommands,
  cloneRepository
};