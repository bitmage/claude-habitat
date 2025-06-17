/**
 * @module image-lifecycle
 * @description Docker image lifecycle management for Claude Habitat
 * 
 * Handles building base images, preparing images with setup commands, and
 * managing image caching strategies. Provides the core image operations
 * that support habitat container environments.
 * 
 * @requires module:types - Domain model definitions
 * @requires module:config - Configuration loading
 * @requires module:container-operations - Docker execution operations
 * @requires module:filesystem - File copying operations
 * @requires module:standards/path-resolution - Path handling conventions
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - E2E tests: `npm run test:e2e -- test/e2e/rebuild-functionality.test.js`
 * - Run all tests: `npm test`
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { colors, fileExists, isDirectory, sleep, rel, createWorkDirPath } = require('./utils');
const { loadConfig } = require('./config');
// Path helpers not currently used in this module
const { dockerRun, dockerExec, dockerImageExists, startTempContainer } = require('./container-operations');
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
    // Use explicit dockerfile path from config - always relative to project root
    dockerfilePath = rel(config.image.dockerfile);
  } else {
    // Default to dockerfiles/[name]/Dockerfile
    dockerfilePath = rel('dockerfiles/' + config.name + '/Dockerfile');
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
async function copyConfigFiles(container, config, resolvedUser = 'root', resolvedWorkDir = '/workspace') {
  if (!config.files || !Array.isArray(config.files)) return;
  
  console.log('Copying configuration files...');
  
  for (const fileSpec of config.files) {
    if (!fileSpec.src || !fileSpec.dest) {
      console.log(`Skipping invalid file spec: ${JSON.stringify(fileSpec)}`);
      continue;
    }
    
    // Expand tilde in source path and resolve relative paths
    let srcPath = fileSpec.src;
    if (srcPath.startsWith('~/')) {
      const os = require('os');
      srcPath = path.join(os.homedir(), srcPath.slice(2));
    } else if (srcPath.startsWith('./')) {
      // Resolve relative paths from project root
      const { rel } = require('./utils');
      srcPath = rel(srcPath.slice(2));
    }
    
    // Check if source exists
    if (!await fileExists(srcPath)) {
      console.log(`⚠️  Source not found: ${srcPath} - skipping ${fileSpec.description || fileSpec.dest}`);
      continue;
    }
    
    // Check if it's a directory
    const isDir = await isDirectory(srcPath);
    
    // Replace variables in destination path using resolved environment
    let destPath = fileSpec.dest;
    
    // Replace {env.USER} with resolved user
    destPath = destPath.replace(/\{env\.USER\}/g, resolvedUser);
    
    // Replace ${HOME} and other environment variables by executing in container
    if (destPath.includes('${')) {
      try {
        const expandedPath = await dockerExec(container, `echo "${destPath}"`, resolvedUser);
        destPath = expandedPath.trim();
      } catch (err) {
        console.warn(`Warning: Could not expand environment variables in ${destPath}: ${err.message}`);
      }
    }
    
    // Expand tilde in destination path (container context)
    if (destPath.startsWith('~/')) {
      // Get container user's home directory by executing getent passwd in container
      try {
        const homeResult = await dockerExec(container, `getent passwd ${resolvedUser} | cut -d: -f6`, 'root');
        const containerHome = homeResult.trim();
        if (containerHome) {
          destPath = path.posix.join(containerHome, destPath.slice(2));
        } else {
          // Fallback to standard home directory structure
          destPath = path.posix.join('/home', resolvedUser, destPath.slice(2));
        }
      } catch (err) {
        // Fallback to standard home directory structure
        destPath = path.posix.join('/home', resolvedUser, destPath.slice(2));
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
        let owner = fileSpec.owner;
        // Replace {env.USER} with resolved user
        owner = owner.replace(/\{env\.USER\}/g, resolvedUser);
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
      
      // Create destination directory with proper ownership
      const destDir = path.dirname(destPath);
      await dockerExec(container, `mkdir -p ${destDir}`, 'root');
      
      // Set ownership on parent directories if specified
      if (fileSpec.owner) {
        let owner = fileSpec.owner;
        // Replace {env.USER} with resolved user
        owner = owner.replace(/\{env\.USER\}/g, resolvedUser);
        
        // Set ownership on all parent directories that were created
        await dockerExec(container, `chown -R ${owner}:${owner} ${destDir}`, 'root');
        
        // Set directory permissions to ensure execute bit for directories
        await dockerExec(container, `find ${destDir} -type d -exec chmod 755 {} \\;`, 'root');
      }
      
      // Copy the file
      await copyFileToContainer(container, srcPath, destPath);
      
      // Set ownership if specified (this will set it on the file itself)
      if (fileSpec.owner) {
        let owner = fileSpec.owner;
        // Replace {env.USER} with resolved user
        owner = owner.replace(/\{env\.USER\}/g, resolvedUser);
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

// prepareWorkspace function removed - replaced by progressive build pipeline in build-lifecycle.js


module.exports = {
  buildBaseImage,
  copyConfigFiles,
  cloneRepository,
  copyDirectoryToContainer
};