/**
 * Docker image lifecycle management
 * Handles building base images, preparing images with setup, and caching
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { colors, fileExists, isDirectory, sleep, rel, createWorkDirPath } = require('./utils');
const { loadConfig } = require('./config');
// Path helpers not currently used in this module
const { dockerRun, dockerExec, dockerImageExists } = require('./container-operations');
const { copyFileToContainer, findFilesToCopy } = require('./filesystem');
const { expandTemplate } = require('./template-expansion');

/**
 * Build the base Docker image from Dockerfile
 * @param {object} config - Habitat configuration
 * @param {object} options - Build options
 * @param {boolean} options.rebuild - Force rebuild without cache
 */
async function buildBaseImage(config, options = {}) {
  const { rebuild = false } = options;
  const baseTag = `claude-habitat-${config.name}:base`;
  
  // Handle rebuild: remove existing image if rebuilding
  if (rebuild) {
    console.log(colors.yellow('🔄 Rebuild requested - removing existing base image...'));
    try {
      await dockerRun(['rmi', baseTag]);
      console.log(`Removed existing base image: ${baseTag}`);
    } catch (err) {
      // Image might not exist, continue
      console.log(`Base image ${baseTag} not found (this is normal for first build)`);
    }
  }
  
  // Build the base image
  if (rebuild) {
    console.log(colors.yellow('🔄 Building base Docker image with fresh cache...'));
  } else {
    console.log('Building base Docker image...');
  }
  console.log('This will take several minutes on first run.');
  
  let dockerfilePath;
  if (config.image && config.image.dockerfile) {
    // Use explicit dockerfile path from config - always relative to project root
    dockerfilePath = rel(config.image.dockerfile);
  } else {
    // Default to dockerfiles/[name]/Dockerfile
    dockerfilePath = rel('dockerfiles', config.name, 'Dockerfile');
  }
  
  // Check if dockerfile exists
  if (!await fileExists(dockerfilePath)) {
    throw new Error(`Dockerfile not found at ${dockerfilePath}`);
  }
  
  // Build Docker arguments
  const buildArgs = [
    'build',
    '-f', dockerfilePath,
    '-t', baseTag
  ];

  // Detect host docker group GID if docker socket is available
  const { execSync } = require('child_process');
  const dockerSocketPath = '/var/run/docker.sock';
  if (require('fs').existsSync(dockerSocketPath)) {
    const dockerGid = execSync(`stat -c '%g' ${dockerSocketPath}`, { encoding: 'utf8' }).trim();
    buildArgs.push('--build-arg', `DOCKER_GROUP_GID=${dockerGid}`);
  }
  
  // Add --no-cache if rebuilding
  if (rebuild) {
    buildArgs.splice(1, 0, '--no-cache');
  }
  
  buildArgs.push(path.dirname(dockerfilePath));
  
  const buildProcess = spawn('docker', buildArgs, { stdio: 'inherit' });
  
  await new Promise((resolve, reject) => {
    buildProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Docker build failed with code ${code}`));
      } else {
        resolve();
      }
    });
  });
  
  return baseTag;
}

/**
 * Copy files specified in the files section of config
 */
async function copyConfigFiles(container, config) {
  if (!config.files || !Array.isArray(config.files)) return;
  
  console.log('Copying configuration files...');
  
  for (const fileSpec of config.files) {
    if (!fileSpec.src || !fileSpec.dest) {
      console.log(`Skipping invalid file spec: ${JSON.stringify(fileSpec)}`);
      continue;
    }
    
    // Expand tilde in source path
    let srcPath = fileSpec.src;
    if (srcPath.startsWith('~/')) {
      const os = require('os');
      srcPath = path.join(os.homedir(), srcPath.slice(2));
    }
    
    // Check if source exists
    if (!await fileExists(srcPath)) {
      console.log(`⚠️  Source not found: ${srcPath} - skipping ${fileSpec.description || fileSpec.dest}`);
      continue;
    }
    
    // Check if it's a directory
    const isDir = await isDirectory(srcPath);
    
    // Expand all templates in destination path using unified template system
    let destPath = expandTemplate(fileSpec.dest, config);
    
    // Expand tilde in destination path (container context)
    if (destPath.startsWith('~/') && config._environment?.USER) {
      // Get container user's home directory by executing getent passwd in container
      try {
        const homeResult = await dockerExec(container, `getent passwd ${config._environment.USER} | cut -d: -f6`, 'root');
        const containerHome = homeResult.trim();
        if (containerHome) {
          destPath = path.posix.join(containerHome, destPath.slice(2));
        } else {
          // Fallback to standard home directory structure
          destPath = path.posix.join('/home', config._environment.USER, destPath.slice(2));
        }
      } catch (err) {
        // Fallback to standard home directory structure
        destPath = path.posix.join('/home', config._environment.USER, destPath.slice(2));
      }
    }
    
    if (isDir) {
      console.log(`Copying directory ${srcPath} → ${destPath}`);
      
      // Create destination directory
      await dockerExec(container, `mkdir -p ${destPath}`, 'root');
      
      // Copy directory recursively (respects .habignore)
      await copyDirectoryToContainer(container, srcPath, destPath);
      
      // Set ownership recursively if specified
      if (fileSpec.owner) {
        const owner = expandTemplate(fileSpec.owner, config);
        await dockerExec(container, `chown -R ${owner}:${owner} ${destPath}`, 'root');
      }
      
      // Set permissions recursively if specified
      if (fileSpec.mode) {
        // For directories, also set execute bit for directories
        await dockerExec(container, `find ${destPath} -type d -exec chmod ${fileSpec.mode} {} \\;`, 'root');
        await dockerExec(container, `find ${destPath} -type f -exec chmod ${fileSpec.mode} {} \\;`, 'root');
      }
      
      console.log(`✓ ${fileSpec.description || `Directory ${destPath}`}`);
    } else {
      console.log(`Copying ${srcPath} → ${destPath}`);
      
      // Create destination directory
      const destDir = path.dirname(destPath);
      await dockerExec(container, `mkdir -p ${destDir}`, 'root');
      
      // Copy the file
      await copyFileToContainer(container, srcPath, destPath);
      
      // Set ownership if specified
      if (fileSpec.owner) {
        const owner = expandTemplate(fileSpec.owner, config);
        await dockerExec(container, `chown ${owner}:${owner} ${destPath}`, 'root');
      }
      
      // Set permissions if specified
      if (fileSpec.mode) {
        await dockerExec(container, `chmod ${fileSpec.mode} ${destPath}`, 'root');
      }
      
      console.log(`✓ ${fileSpec.description || destPath}`);
    }
  }
}

/**
 * Run setup commands inside a container
 * Note: Config is already fully expanded with environment variables and container values
 */
async function runSetupCommands(container, config) {
  if (!config.setup) return;
  
  console.log('Running setup commands...');
  
  // Run root setup commands
  if (config.setup.root && config.setup.root.length > 0) {
    console.log('Running root setup commands...');
    for (const cmd of config.setup.root) {
      if (cmd && cmd.trim()) {
        console.log(`  ${cmd}`);
        await dockerExec(container, cmd, 'root');
      }
    }
  }
  
  // Run user setup commands
  if (config.setup.user && config.setup.user.commands && config.setup.user.commands.length > 0) {
    const runAsUser = expandTemplate(config.setup.user.run_as || '{env.USER}', config);
    console.log(`Running user setup commands as ${runAsUser}...`);
    for (const cmd of config.setup.user.commands) {
      if (cmd && cmd.trim()) {
        const expandedCmd = expandTemplate(cmd, config);
        console.log(`  ${expandedCmd}`);
        await dockerExec(container, expandedCmd, runAsUser);
      }
    }
  }
}

/**
 * Copy a directory and its contents to a container
 */
async function copyDirectoryToContainer(container, srcDir, destDir) {
  const filesToCopy = await findFilesToCopy(srcDir, destDir, true);
  
  for (const { src, dest } of filesToCopy) {
    await copyFileToContainer(container, src, dest);
  }
}

/**
 * Clone a repository inside the container
 */
async function cloneRepository(container, repoInfo, workDir, containerUser = null) {
  console.log(`Cloning ${repoInfo.url} to ${repoInfo.path}...`);
  
  const parentDir = path.dirname(repoInfo.path);
  await dockerExec(container, `mkdir -p ${parentDir}`, 'root');
  
  // Check if directory already exists and remove it if so
  const repoName = path.basename(repoInfo.path);
  // Remove and recreate to avoid Docker WORKDIR issues
  await dockerExec(container, `rm -rf ${repoInfo.path} && mkdir -p ${repoInfo.path}`, 'root');
  
  // Clone the repository (use . to clone into existing directory)
  let cloneCmd = `cd ${repoInfo.path} && git clone ${repoInfo.url} .`;
  if (repoInfo.branch && repoInfo.branch !== 'main' && repoInfo.branch !== 'master') {
    cloneCmd += ` -b ${repoInfo.branch}`;
  }
  
  console.log(`Executing clone command: ${cloneCmd}`);
  try {
    // Execute with explicit bash to avoid working directory issues
    const result = await dockerExec(container, `bash -c "${cloneCmd}"`, 'root');
    if (result) {
      console.log(`Clone output: ${result.substring(0, 200)}`);
    }
  } catch (err) {
    console.error(`Clone failed with error: ${err.message}`);
    throw err;
  }
  
  // Verify the clone worked
  try {
    await dockerExec(container, `test -d ${repoInfo.path}/.git`, 'root');
    console.log(`✓ Repository cloned successfully to ${repoInfo.path}`);
  } catch (err) {
    console.error(`❌ Repository clone verification failed for ${repoInfo.path}`);
    throw new Error(`Failed to clone repository to ${repoInfo.path}`);
  }
  
  // If branch wasn't specified during clone, checkout now
  if (repoInfo.branch && (repoInfo.branch === 'main' || repoInfo.branch === 'master')) {
    await dockerExec(container, `cd ${repoInfo.path} && git checkout ${repoInfo.branch}`, 'root');
  }
  
  // Change ownership to the container user if specified
  if (containerUser) {
    console.log(`Changing ownership of ${repoInfo.path} to container user...`);
    await dockerExec(container, `chown -R ${containerUser}:${containerUser} ${repoInfo.path}`, 'root');
  }
}

/**
 * Prepare workspace image with all repositories and setup complete
 */
async function prepareWorkspace(config, tag, extraRepos, options = {}) {
  const { rebuild = false } = options;
  
  // Handle rebuild: remove existing prepared image if rebuilding
  const preparedTag = `${config.image.tag}:${tag}`;
  if (rebuild) {
    console.log(colors.yellow('🔄 Rebuild requested - removing existing prepared image...'));
    try {
      await dockerRun(['rmi', preparedTag]);
      console.log(`Removed existing prepared image: ${preparedTag}`);
    } catch (err) {
      // Image might not exist, continue
      console.log(`Prepared image ${preparedTag} not found (this is normal for first build)`);
    }
  }
  
  const baseTag = await buildBaseImage(config, { rebuild });
  
  // Start a temporary container for preparation
  const tempContainer = `claude-habitat-prep-${Date.now()}`;
  console.log('Starting temporary container for preparation...');
  
  // Start container with init process
  await dockerRun(['run', '-d', '--name', tempContainer, baseTag, '/bin/sh', '-c', 'tail -f /dev/null']);
  
  try {
    // Wait for container to be ready
    await sleep(2000);
    
    // Skip infrastructure copying for bypass habitats
    const isBypassHabitat = config.claude?.bypass_habitat_construction || false;
    
    // Create workDirPath helper for this container
    const workDirPath = createWorkDirPath(config._environment?.WORKDIR);
    
    if (!isBypassHabitat) {
      // Copy system files first
      const systemPath = rel('system');
      if (await fileExists(systemPath)) {
        console.log('Copying system files to container...');
        const containerSystemPath = workDirPath('habitat', 'system');
        await dockerExec(tempContainer, `mkdir -p ${containerSystemPath}`, 'root');
        await copyDirectoryToContainer(tempContainer, systemPath, containerSystemPath);
      }
      
      // Copy shared files
      const sharedPath = rel('shared');
      if (await fileExists(sharedPath)) {
        console.log('Copying shared files to container...');
        const containerSharedPath = workDirPath('habitat', 'shared');
        await dockerExec(tempContainer, `mkdir -p ${containerSharedPath}`, 'root');
        await copyDirectoryToContainer(tempContainer, sharedPath, containerSharedPath);
      }
      
      // Copy local habitat files
      const habitatPath = path.dirname(config._configPath);
      if (await fileExists(habitatPath)) {
        console.log('Copying habitat files to container...');
        const containerLocalPath = workDirPath('habitat', 'local');
        await dockerExec(tempContainer, `mkdir -p ${containerLocalPath}`, 'root');
        await copyDirectoryToContainer(tempContainer, habitatPath, containerLocalPath);
      }
    }
    
    // Run system setup commands first if not in bypass mode
    if (!isBypassHabitat) {
      const systemConfigPath = rel('system', 'config.yaml');
      if (await fileExists(systemConfigPath)) {
        console.log('Loading system configuration...');
        const { loadConfig } = require('./config');
        
        // Load system config with environment variable processing
        const systemConfig = await loadConfig(systemConfigPath);
        
        // Ensure the system config has the correct environment variables
        if (!systemConfig._environment) {
          systemConfig._environment = {};
        }
        systemConfig._environment.WORKDIR = config._environment?.WORKDIR || systemConfig._environment?.WORKDIR || '/workspace';
        systemConfig._environment.USER = config._environment?.USER || 'root';
        
        // Copy system-level files first (before setup commands)
        await copyConfigFiles(tempContainer, systemConfig);
        
        console.log('Running system setup commands...');
        await runSetupCommands(tempContainer, systemConfig);
      }
    }
    
    // Process shared configuration files for normal habitats
    if (!isBypassHabitat) {
      const sharedConfigPath = rel('shared', 'config.yaml');
      if (await fileExists(sharedConfigPath)) {
        console.log('Loading shared configuration...');
        const sharedConfig = await loadConfig(sharedConfigPath);
        
        // Set environment variables for shared config processing
        if (!sharedConfig._environment) {
          sharedConfig._environment = {};
        }
        sharedConfig._environment.USER = config._environment?.USER || 'root';
        
        // Copy shared-level files
        await copyConfigFiles(tempContainer, sharedConfig);
        
        console.log('Running shared setup commands...');
        await runSetupCommands(tempContainer, sharedConfig);
      }
    }
    
    // Clone repositories after system setup (which includes GitHub authentication)
    console.log('Cloning repositories...');
    const allRepos = [...(config.repositories || [])];
    
    // Add extra repos if specified
    if (extraRepos && extraRepos.length > 0) {
      for (const repoSpec of extraRepos) {
        const { parseRepoSpec } = require('./utils');
        const repoInfo = parseRepoSpec(repoSpec);
        allRepos.push(repoInfo);
      }
    }
    
    for (const repo of allRepos) {
      await cloneRepository(tempContainer, repo, config._environment?.WORKDIR, config._environment?.USER);
    }
    
    // Copy habitat-level files first (before setup commands)
    await copyConfigFiles(tempContainer, config);
    
    // Run habitat setup commands
    await runSetupCommands(tempContainer, config);
    
    // Fix permissions for work directory
    console.log('Setting up work directory permissions...');
    await dockerExec(tempContainer, `chown -R $(id -u):$(id -g) ${config._environment?.WORKDIR} || true`, 'root');
    
    // Fix git safe directory ownership issues
    console.log('Configuring git safe directories...');
    await dockerExec(tempContainer, `git config --global --add safe.directory '*'`, config._environment?.USER);
    
    // Commit the container to create the prepared image
    console.log('Creating prepared image...');
    await dockerRun(['commit', tempContainer, tag]);
    
    console.log(colors.green('✓ Prepared image created successfully'));
  } finally {
    // Clean up temporary container
    console.log('Cleaning up temporary container...');
    await dockerRun(['stop', tempContainer]);
    await dockerRun(['rm', tempContainer]);
  }
}

module.exports = {
  buildBaseImage,
  prepareWorkspace,
  buildPreparedImage: prepareWorkspace, // Backward compatibility alias
  runSetupCommands,
  copyConfigFiles,
  cloneRepository
};