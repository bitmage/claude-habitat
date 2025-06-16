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
// Old build functions replaced by new progressive build pipeline
const { dockerImageExists, dockerRun, dockerExec, dockerIsRunning, startTempContainer } = require('./container-operations');
const { testRepositoryAccess } = require('./github');
const { createSnapshot } = require('./snapshot-manager');

/**
 * Clean up a build container (stop and remove)
 * @private
 */
async function cleanupBuildContainer(containerId) {
  try {
    await dockerRun(['stop', containerId]);
  } catch (stopError) {
    console.log(`⚠️ Failed to stop container ${containerId}: ${stopError.message}`);
    // Try force stop
    try {
      await dockerRun(['kill', containerId]);
    } catch (killError) {
      console.log(`⚠️ Failed to kill container ${containerId}: ${killError.message}`);
    }
  }
  
  try {
    await dockerRun(['rm', containerId]);
  } catch (rmError) {
    // Try force remove
    try {
      await dockerRun(['rm', '-f', containerId]);
    } catch (forceRmError) {
      console.log(`⚠️ Failed to force remove container ${containerId}: ${forceRmError.message}`);
      throw forceRmError;
    }
  }
}

// Start a new session with the specified habitat
async function startSession(configPath, extraRepos = [], overrideCommand = null, options = {}) {
  const { rebuild = false, rebuildFrom = null } = options;
  
  // Use the new progressive build pipeline
  const { createBuildPipeline } = require('./build-lifecycle');
  const { ProgressReporter } = require('./progress-ui');
  
  console.log(`Starting habitat session from: ${configPath}`);
  
  // Create the build pipeline with snapshot support
  const pipeline = await createBuildPipeline(configPath, { 
    rebuild, 
    rebuildFrom, 
    extraRepos 
  });
  
  // Attach progress reporter for real-time feedback
  const progressReporter = new ProgressReporter();
  progressReporter.attach(pipeline);
  
  // Load config for context
  const { loadHabitatEnvironmentFromConfig } = require('./config');
  const config = await loadHabitatEnvironmentFromConfig(configPath);
  
  // Prepare initial context
  let initialContext = {
    config,
    configPath,
    extraRepos,
    rebuild,
    rebuildFrom
  };
  
  let buildContainerId = null;
  let context = null;
  
  try {
      // If we have a cached snapshot to start from, create container from it
      if (pipeline._context && pipeline._context.baseImageTag && pipeline._context.startFromPhase > 0) {
        buildContainerId = await startTempContainer(pipeline._context.baseImageTag);
        initialContext.containerId = buildContainerId;
        initialContext.baseImageTag = pipeline._context.baseImageTag;
      }
      
      // Run the pipeline
      context = await pipeline.run(initialContext);
      
      // Track the build container ID from context if we didn't have one already
      if (!buildContainerId && context.containerId) {
        buildContainerId = context.containerId;
      }
      
      // The final container should be in context.containerId
      const finalTag = `habitat-${config.name}:12-final`;
      
      // Commit the final container as the prepared image
      const snapshotOptions = { result: 'pass' };
      if (context.entrypointChange) {
        snapshotOptions.dockerChange = context.entrypointChange;
      }
      await createSnapshot(context.containerId, finalTag, snapshotOptions);
      
      console.log(`Prepared image created: ${finalTag}`);
      
      // Run the habitat container using the final image
      return await runEphemeralContainer(finalTag, config, overrideCommand, options.tty);
      
    } catch (error) {
      console.error(`Failed to start habitat session: ${error.message}`);
      throw error;
    } finally {
      // Always clean up the build container, regardless of success or failure
      if (buildContainerId) {
        try {
          await cleanupBuildContainer(buildContainerId);
        } catch (cleanupError) {
          console.log(`⚠️ Failed to cleanup build container ${buildContainerId}: ${cleanupError.message}`);
        }
      }
    }
}

// Build habitat image (base + prepared)
async function buildHabitatImage(configPath, extraRepos = [], options = {}) {
  const { rebuild = false } = options;
  
  // Use the new progressive build pipeline
  const { createBuildPipeline } = require('./build-lifecycle');
  const { ProgressReporter } = require('./progress-ui');
  
  // Create the build pipeline
  const pipeline = await createBuildPipeline(configPath, { extraRepos, rebuild });
  
  // Attach progress reporter
  const progressReporter = new ProgressReporter();
  progressReporter.attach(pipeline);
  
  // Load config for context
  const { loadHabitatEnvironmentFromConfig } = require('./config');
  const config = await loadHabitatEnvironmentFromConfig(configPath);
  
  // Prepare initial context
  let initialContext = {
    config,
    configPath,
    extraRepos
  };
  
  let buildContainerId = null;
  let context = null;
  
  try {
      // If we have a cached snapshot to start from, create container from it
      if (pipeline._context && pipeline._context.baseImageTag && pipeline._context.startFromPhase > 0) {
        buildContainerId = await startTempContainer(pipeline._context.baseImageTag);
        initialContext.containerId = buildContainerId;
        initialContext.baseImageTag = pipeline._context.baseImageTag;
      }
      
      // Run the pipeline
      context = await pipeline.run(initialContext);
      
      // Track the build container ID from context if we didn't have one already
      if (!buildContainerId && context.containerId) {
        buildContainerId = context.containerId;
      }
      
      // Create final snapshot
      const finalTag = `habitat-${config.name}:final`;
      
      // Check if we need to create a snapshot or if final image already exists
      if (context.containerId) {
        // We have a build container, create the final snapshot
        await createSnapshot(context.containerId, finalTag, { result: 'pass' });
      } else {
        // Fully cached - check if final image exists
        const expectedFinalTag = `habitat-${config.name}:12-final`;
        if (await dockerImageExists(expectedFinalTag)) {
          // The final image already exists from previous build
          console.log(`Using existing final image: ${expectedFinalTag}`);
          // Tag it with the expected name if different
          if (expectedFinalTag !== finalTag) {
            await dockerRun(['tag', expectedFinalTag, finalTag]);
          }
        } else {
          throw new Error(`No final image found for ${config.name}`);
        }
      }
      
      return { 
        baseTag: context.baseImageTag || pipeline._context?.baseImageTag, 
        preparedTag: finalTag 
      };
      
    } catch (error) {
      console.error(`Failed to build habitat image: ${error.message}`);
      throw error;
    } finally {
      // Always clean up the build container, regardless of success or failure
      if (buildContainerId) {
        try {
          await cleanupBuildContainer(buildContainerId);
        } catch (cleanupError) {
          console.log(`⚠️ Failed to cleanup build container ${buildContainerId}: ${cleanupError.message}`);
        }
      }
    }
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

// Run container with ephemeral execution pattern
async function runEphemeralContainer(tag, config, overrideCommand = null, ttyOverride = null) {
  const containerName = `${config.name}_${Date.now()}_${process.pid}`;
  // Get resolved environment variables
  const { createHabitatPathHelpers } = require('./habitat-path-helpers');
  const pathHelpers = await createHabitatPathHelpers(config);
  const compiledEnv = pathHelpers.getEnvironment();
  
  const workDir = compiledEnv.WORKDIR;
  const containerUser = compiledEnv.USER;
  const claudeCommand = overrideCommand || config.claude?.command || 'claude';
  let startupCompleted = false;

  try {
    console.log('');
    console.log(colors.green('Container ready!'));
    console.log(`Launching: ${claudeCommand}`);
    console.log('');

    // Mark startup as completed
    startupCompleted = true;

    // Launch command directly with docker run --rm
    let enableTTY;
    if (ttyOverride !== null) {
      enableTTY = ttyOverride;
    } else {
      enableTTY = config.claude?.tty !== false;
    }
    const dockerFlags = enableTTY ? ['-it'] : ['-i'];
    
    // NOTE: We do NOT pass environment variables via -e flags because:
    // 1. The entrypoint script (/entrypoint.sh) and habitat-env.sh already handle all environment setup
    // 2. Passing -e variables overrides the container's built-in environment, causing issues like
    //    PATH='${PATH}:...' being passed literally instead of being expanded properly
    // 3. The entrypoint ensures proper variable expansion at runtime within the container context
    // 4. This approach is cleaner and more reliable than trying to duplicate environment setup externally
    
    // Load and resolve volumes from configuration
    const { loadAndResolveVolumes, buildVolumeArgs } = require('./volume-resolver');
    const resolvedVolumes = await loadAndResolveVolumes(config, compiledEnv);
    const volumeArgs = buildVolumeArgs(resolvedVolumes);
    
    const fullCommand = claudeCommand;
    
    // CRITICAL: All container commands must use /entrypoint.sh to ensure proper environment
    // variable expansion. Environment variables like PATH are intentionally left unexpanded
    // (as ${PATH}) in configuration files to preserve system defaults across different
    // Linux distributions. The expansion happens at container runtime via the entrypoint
    // script, ensuring system PATH is preserved while adding habitat-specific paths.
    //
    // NOTE: We do NOT use -e or -w flags because:
    // - Environment variables are handled by the entrypoint script and habitat-env.sh
    // - Working directory is set by the entrypoint via 'cd "$WORKDIR"' 
    // - Using -e overrides the container's environment setup and causes variable expansion issues
    // - Using -w can conflict with the entrypoint's directory management
    const dockerArgs = [
      'run', '--rm', ...dockerFlags,
      '-u', containerUser,
      ...volumeArgs,
      tag,
      '/entrypoint.sh', '/bin/bash', '-c', fullCommand
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
    // Container cleanup is automatic with --rm flag
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