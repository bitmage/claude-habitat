/**
 * Docker image lifecycle management
 * Handles building base images, preparing images with setup, and caching
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { colors, fileExists, sleep } = require('./utils');
const { getHabitatInfrastructurePath } = require('./path-helpers');
const { dockerRun, dockerExec, dockerImageExists } = require('./container-operations');
const { copyFileToContainer, findFilesToCopy } = require('./filesystem');

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
    // Use explicit dockerfile path from config
    dockerfilePath = path.resolve(config.image.dockerfile);
  } else {
    // Default to dockerfiles/[name]/Dockerfile
    dockerfilePath = path.join(process.cwd(), 'dockerfiles', config.name, 'Dockerfile');
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
 * Run setup commands inside a container
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
    const runAsUser = config.setup.user.run_as || config.container.user;
    console.log(`Running user setup commands as ${runAsUser}...`);
    for (const cmd of config.setup.user.commands) {
      if (cmd && cmd.trim()) {
        console.log(`  ${cmd}`);
        await dockerExec(container, cmd, runAsUser);
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
async function cloneRepository(container, repoInfo, workDir) {
  console.log(`Cloning ${repoInfo.url} to ${repoInfo.path}...`);
  
  const parentDir = path.dirname(repoInfo.path);
  await dockerExec(container, `mkdir -p ${parentDir}`, 'root');
  
  // Check if directory already exists and remove it if so
  const repoName = path.basename(repoInfo.path);
  await dockerExec(container, `cd ${parentDir} && rm -rf ${repoName}`, 'root');
  
  // Clone the repository
  let cloneCmd = `cd ${parentDir} && git clone ${repoInfo.url} ${repoName}`;
  if (repoInfo.branch && repoInfo.branch !== 'main' && repoInfo.branch !== 'master') {
    cloneCmd += ` -b ${repoInfo.branch}`;
  }
  
  await dockerExec(container, cloneCmd, 'root');
  
  // If branch wasn't specified during clone, checkout now
  if (repoInfo.branch && (repoInfo.branch === 'main' || repoInfo.branch === 'master')) {
    await dockerExec(container, `cd ${repoInfo.path} && git checkout ${repoInfo.branch}`, 'root');
  }
  
  // Change ownership to the container user if specified
  if (workDir.startsWith(repoInfo.path) || repoInfo.path.startsWith(workDir)) {
    console.log(`Changing ownership of ${repoInfo.path} to container user...`);
    await dockerExec(container, `chown -R $(id -u):$(id -g) ${repoInfo.path}`, 'root');
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
    
    // Copy system files first
    const systemPath = path.join(process.cwd(), 'system');
    if (await fileExists(systemPath)) {
      console.log('Copying system files to container...');
      const containerSystemPath = getHabitatInfrastructurePath(config.container.work_dir, 'system');
      await dockerExec(tempContainer, `mkdir -p ${containerSystemPath}`, 'root');
      await copyDirectoryToContainer(tempContainer, systemPath, containerSystemPath);
    }
    
    // Copy shared files
    const sharedPath = path.join(process.cwd(), 'shared');
    if (await fileExists(sharedPath)) {
      console.log('Copying shared files to container...');
      const containerSharedPath = getHabitatInfrastructurePath(config.container.work_dir, 'shared');
      await dockerExec(tempContainer, `mkdir -p ${containerSharedPath}`, 'root');
      await copyDirectoryToContainer(tempContainer, sharedPath, containerSharedPath);
    }
    
    // Copy local habitat files
    const habitatPath = path.dirname(config._configPath);
    if (await fileExists(habitatPath)) {
      console.log('Copying habitat files to container...');
      const containerLocalPath = getHabitatInfrastructurePath(config.container.work_dir, 'local');
      await dockerExec(tempContainer, `mkdir -p ${containerLocalPath}`, 'root');
      await copyDirectoryToContainer(tempContainer, habitatPath, containerLocalPath);
    }
    
    // Clone repositories
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
      await cloneRepository(tempContainer, repo, config.container.work_dir);
    }
    
    // Run setup commands
    await runSetupCommands(tempContainer, config);
    
    // Fix permissions for work directory
    console.log('Setting up work directory permissions...');
    await dockerExec(tempContainer, `chown -R $(id -u):$(id -g) ${config.container.work_dir} || true`, 'root');
    
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
  cloneRepository
};