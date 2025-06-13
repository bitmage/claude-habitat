/**
 * @module habitat
 * @description Core habitat session management for Claude Habitat
 * 
 * Manages habitat container sessions, including starting, stopping, and
 * maintaining active development environments. Handles cache management,
 * repository setup, and session lifecycle operations.
 * 
 * ## Runtime Commands for Active Sessions
 * 
 * When a habitat is running, you can interact with the container:
 * 
 * ### Get Container Name
 * ```bash
 * docker ps | grep claude-habitat
 * ```
 * 
 * ### Execute Commands in Running Container
 * ```bash
 * # Get container name, then:
 * CONTAINER_NAME="claude-habitat_123456789_987654"  # Replace with actual
 * 
 * # Interactive bash session
 * docker exec -it $CONTAINER_NAME bash
 * 
 * # Run commands as the node user
 * docker exec -it -u node $CONTAINER_NAME bash
 * docker exec -u node $CONTAINER_NAME ls -la /workspace
 * docker exec -u node $CONTAINER_NAME git status
 * ```
 * 
 * ### Monitor Activity
 * ```bash
 * # Watch container logs
 * docker logs -f $CONTAINER_NAME
 * 
 * # Check system processes
 * docker exec -u node $CONTAINER_NAME ps aux
 * 
 * # Monitor git activity
 * docker exec -u node $CONTAINER_NAME git log --oneline -5
 * docker exec -u node $CONTAINER_NAME git status
 * ```
 * 
 * @requires module:types - Domain model definitions
 * @requires module:config - Configuration loading
 * @requires module:container-operations - Docker container operations
 * @requires module:image-lifecycle - Docker image build and management
 * @requires module:github - Repository access operations
 * @requires module:standards/path-resolution - Path handling conventions
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/claude-habitat.test.js`
 * - Run all tests: `npm test`
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
// @see {@link module:standards/path-resolution} for project-root relative path conventions using rel()
const { colors, calculateCacheHash, fileExists, sleep, rel } = require('./utils');
const { loadConfig } = require('./config');
const { buildBaseImage, prepareWorkspace } = require('./image-lifecycle');
const { dockerImageExists, dockerRun, dockerExec, dockerIsRunning } = require('./container-operations');
const { testRepositoryAccess } = require('./github');

// Start a new session with the specified habitat
async function startSession(configPath, extraRepos = [], overrideCommand = null, options = {}) {
  const { rebuild = false } = options;
  const config = await loadConfig(configPath);
  const hash = calculateCacheHash(config, extraRepos);
  const preparedTag = `claude-habitat-${config.name}:${hash}`;

  console.log(`Cache hash: ${hash}`);
  console.log(`Prepared image tag: ${preparedTag}`);

  // Check if prepared image exists or if rebuild is requested
  const imageExists = await dockerImageExists(preparedTag);
  if (!imageExists || rebuild) {
    if (rebuild) {
      console.log(colors.yellow('🔄 Rebuild requested - building fresh environment...'));
    } else {
      console.log('No cached image found, building prepared environment...');
    }
    console.log('This will take several minutes but subsequent runs will be instant.');
    
    // Build or get base image (with rebuild option)
    const baseTag = await buildBaseImage(config, { rebuild });
    
    // Build prepared image with all setup (with rebuild option)
    await prepareWorkspace(config, preparedTag, extraRepos, { rebuild });
  } else {
    console.log('Using cached prepared image');
  }

  // Run the container using shared logic
  const { createHabitatContainer } = require('./container-lifecycle');
  return await runContainerWithSharedLogic(preparedTag, config, overrideCommand, options.tty);
}

// Build habitat image (base + prepared)
async function buildHabitatImage(configPath, extraRepos = []) {
  const config = await loadConfig(configPath);
  const hash = calculateCacheHash(config, extraRepos);
  const preparedTag = `claude-habitat-${config.name}:${hash}`;

  // Build base image
  const baseTag = await buildBaseImage(config);
  
  // Build prepared image
  await prepareWorkspace(config, preparedTag, extraRepos);
  
  return { baseTag, preparedTag };
}

// Get last used configuration
async function getLastUsedConfig() {
  const lastUsedPath = path.join(__dirname, '..', '.last-used-config');
  try {
    const configPath = await fs.readFile(lastUsedPath, 'utf8');
    if (await fileExists(configPath.trim())) {
      return configPath.trim();
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Save last used configuration
async function saveLastUsedConfig(configPath) {
  const lastUsedPath = path.join(__dirname, '..', '.last-used-config');
  try {
    await fs.writeFile(lastUsedPath, configPath);
  } catch {
    // Ignore errors
  }
}

// Check habitat repositories for access
async function checkHabitatRepositories(habitatsDir) {
  const results = new Map();
  
  try {
    const dirs = await fs.readdir(habitatsDir);
    
    for (const dir of dirs) {
      const configPath = path.join(habitatsDir, dir, 'config.yaml');
      
      try {
        if (await fileExists(configPath)) {
          const config = await loadConfig(configPath);
          
          if (config.repositories && Array.isArray(config.repositories)) {
            for (const repo of config.repositories) {
              if (repo.url) {
                try {
                  console.log(`Testing repository access: ${repo.url}`);
                  const canAccess = await testRepositoryAccess(repo.url);
                  results.set(repo.url, canAccess);
                } catch (err) {
                  console.warn(`Failed to test repository ${repo.url}: ${err.message}`);
                  results.set(repo.url, false);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to process config ${configPath}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not check habitat repositories: ${err.message}`);
  }
  
  return results;
}

// Setup habitat environment after creation
async function setupHabitatEnvironment(habitatName, config) {
  console.log(`Setting up environment for ${habitatName}...`);
  
  // This would include any post-creation setup
  // For now, just validation
  
  if (!config.container) {
    throw new Error(`Invalid habitat config: missing container section`);
  }
  
  // Validate WORKDIR environment variable is set
  const { createHabitatPathHelpers } = require('./habitat-path-helpers');
  const pathHelpers = await createHabitatPathHelpers(config);
  const compiledEnv = pathHelpers.getEnvironment();
  
  if (!compiledEnv.WORKDIR) {
    throw new Error(`Invalid habitat config: missing WORKDIR environment variable`);
  }
  
  console.log(`✅ Environment setup complete for ${habitatName}`);
  return true;
}

// Helper function to interpret exit codes
function interpretExitCode(exitCode) {
  const exitCodes = {
    0: 'Success',
    1: 'General error',
    2: 'Misuse of shell command',
    126: 'Command not executable',
    127: 'Command not found',
    130: 'Terminated by user (ctrl-c)',
    137: 'Killed (SIGKILL)',
    143: 'Terminated (SIGTERM)'
  };
  
  return exitCodes[exitCode] || `Unknown exit code ${exitCode}`;
}

// Run container with shared creation logic
async function runContainerWithSharedLogic(tag, config, overrideCommand = null, ttyOverride = null) {
  const { createHabitatContainer } = require('./container-lifecycle');
  const containerName = `${config.name}_${Date.now()}_${process.pid}`;
  // Get resolved environment variables
  const { createHabitatPathHelpers } = require('./habitat-path-helpers');
  const pathHelpers = await createHabitatPathHelpers(config);
  const compiledEnv = pathHelpers.getEnvironment();
  
  const workDir = compiledEnv.WORKDIR;
  const containerUser = compiledEnv.USER;
  const claudeCommand = overrideCommand || config.claude?.command || 'claude';
  let startupCompleted = false;

  let container = null;
  try {
    // Create container using shared logic
    container = await createHabitatContainer(config, {
      name: containerName,
      temporary: false,
      preparedTag: tag
    });

    console.log('');
    console.log(colors.green('Container ready!'));
    console.log(`Launching: ${claudeCommand}`);
    console.log('');

    // Mark startup as completed
    startupCompleted = true;

    // Launch Claude Code with TTY allocation
    let enableTTY;
    if (ttyOverride !== null) {
      enableTTY = ttyOverride;
    } else {
      enableTTY = config.claude?.tty !== false;
    }
    const dockerFlags = enableTTY ? ['-it'] : ['-i'];
    
    // Environment is already set via container creation with -e flags
    const fullCommand = claudeCommand;
    
    const dockerArgs = [
      'exec', ...dockerFlags,
      '-u', containerUser,
      '-w', workDir,
      containerName,
      '/bin/bash', '-c', fullCommand
    ];
    
    const claudeProcess = spawn('docker', dockerArgs, {
      stdio: 'inherit'
    });
    
    // Handle process completion
    await new Promise((resolve, reject) => {
      claudeProcess.on('close', (code) => {
        if (code === 0) {
          console.log(colors.green('✅ Habitat completed successfully'));
          resolve();
        } else if (code === 130) {
          console.log(colors.cyan('ℹ️  Habitat interrupted by user (ctrl-c)'));
          resolve();
        } else {
          const exitMeaning = interpretExitCode(code);
          console.log(colors.yellow(`ℹ️  Habitat exited with code ${code} (${exitMeaning})`));
          resolve();
        }
      });
      
      claudeProcess.on('error', (error) => {
        reject(new Error(`Process error: ${error.message}`));
      });
    });
  } catch (error) {
    if (!startupCompleted) {
      console.error(colors.red(`❌ Habitat startup failed: ${error.message}`));
      
      if (error.message.includes('Container exited unexpectedly')) {
        console.error(colors.yellow('💡 This usually indicates a problem with the container configuration or base image.'));
        console.error(colors.yellow('   Try running with --rebuild to rebuild the environment from scratch.'));
      } else if (error.message.includes('Work directory') && error.message.includes('not found')) {
        console.error(colors.yellow('💡 The workspace directory is missing from the prepared image.'));
        console.error(colors.yellow('   This may indicate a configuration or build issue.'));
      }
      
      throw error;
    } else {
      console.log(colors.yellow(`ℹ️  Runtime error: ${error.message}`));
    }
  } finally {
    if (container) {
      await container.cleanup();
    }
  }
}

module.exports = {
  startSession,
  runHabitat: startSession, // Backward compatibility alias
  buildHabitatImage,
  getLastUsedConfig,
  saveLastUsedConfig,
  checkHabitatRepositories,
  setupHabitatEnvironment
};