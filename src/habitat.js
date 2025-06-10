const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const { colors, calculateCacheHash, fileExists, sleep, rel } = require('./utils');
const { loadConfig } = require('./config');
const { buildBaseImage, buildPreparedImage, dockerImageExists, dockerRun, dockerExec, dockerIsRunning } = require('./docker');
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
    await buildPreparedImage(config, preparedTag, extraRepos, { rebuild });
  } else {
    console.log('Using cached prepared image');
  }

  // Parse environment variables
  const envVars = [];
  if (config.env && Array.isArray(config.env)) {
    for (const env of config.env) {
      if (env && typeof env === 'string') {
        const cleanEnv = env.replace(/^- /, '');
        envVars.push(cleanEnv);
      }
    }
  }

  // Run the container
  return await runContainer(preparedTag, config, envVars, overrideCommand, options.tty);
}

// Build habitat image (base + prepared)
async function buildHabitatImage(configPath, extraRepos = []) {
  const config = await loadConfig(configPath);
  const hash = calculateCacheHash(config, extraRepos);
  const preparedTag = `claude-habitat-${config.name}:${hash}`;
  
  console.log(`Building habitat: ${config.name}`);
  console.log(`Target tag: ${preparedTag}`);
  
  // Build base image
  const baseTag = await buildBaseImage(config);
  console.log(`Base image ready: ${baseTag}`);
  
  // Build prepared image
  await buildPreparedImage(config, preparedTag, extraRepos);
  console.log(`Prepared image ready: ${preparedTag}`);
  
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
      
      if (await fileExists(configPath)) {
        try {
          const config = await loadConfig(configPath);
          
          if (config.repositories && Array.isArray(config.repositories)) {
            const repoResults = [];
            
            for (const repo of config.repositories) {
              if (repo.url) {
                const accessMode = repo.access || 'write';
                const result = await testRepositoryAccess(repo.url, accessMode);
                repoResults.push({
                  url: repo.url,
                  accessible: result.accessible,
                  reason: result.reason
                });
              }
            }
            
            results.set(dir, {
              config,
              repositories: repoResults,
              hasIssues: repoResults.some(r => !r.accessible)
            });
          } else {
            results.set(dir, {
              config,
              repositories: [],
              hasIssues: false
            });
          }
        } catch (err) {
          results.set(dir, {
            error: `Failed to load config: ${err.message}`,
            hasIssues: true
          });
        }
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
  
  if (!config.container.work_dir) {
    throw new Error(`Invalid habitat config: missing work_dir`);
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

// Run container (internal function)
async function runContainer(tag, config, envVars, overrideCommand = null, ttyOverride = null) {
  const containerName = `${config.name}_${Date.now()}_${process.pid}`;
  const workDir = config.container.work_dir; // Config validation ensures this exists
  const containerUser = config.container.user; // Config validation ensures this exists
  const claudeCommand = overrideCommand || config.claude?.command || 'claude';
  let startupCompleted = false; // Track whether startup completed successfully

  console.log(`Creating container from prepared image: ${containerName}`);

  // Build docker run arguments
  const runArgs = [
    'run', '-d',
    '--name', containerName,
    ...envVars.flatMap(env => ['-e', env])
  ];

  // Add volume mounts from system config and habitat config
  const systemConfigPath = rel('system', 'config.yaml');
  let systemVolumes = [];
  
  // Load system volumes if system config exists
  let systemConfig = null;
  if (await fileExists(systemConfigPath)) {
    try {
      const { loadConfig } = require('./config');
      systemConfig = await loadConfig(systemConfigPath);
      if (systemConfig.volumes && Array.isArray(systemConfig.volumes)) {
        systemVolumes = systemConfig.volumes;
      }
    } catch (err) {
      console.warn(`Warning: Could not load system config: ${err.message}`);
    }
  }
  
  // Resolve placeholder values in system volumes using dot notation
  const resolvedSystemVolumes = systemVolumes.map(volume => {
    let resolved = volume;
    
    // Find all {path.to.value} placeholders and resolve them
    const placeholderRegex = /\{([^}]+)\}/g;
    resolved = resolved.replace(placeholderRegex, (match, path) => {
      // Resolve path like "container.user" to actual config value
      const value = path.split('.').reduce((obj, key) => obj?.[key], config);
      return value || match; // Return original if value not found
    });
    
    // Expand ~ to actual home directory
    if (resolved.startsWith('~/')) {
      const os = require('os');
      resolved = resolved.replace('~', os.homedir());
    }
    return resolved;
  });
  
  // Add system volumes first
  resolvedSystemVolumes.forEach(volume => {
    runArgs.push('-v', volume);
  });
  
  // Add habitat-specific volumes
  if (config.volumes && Array.isArray(config.volumes)) {
    config.volumes.forEach(volume => {
      runArgs.push('-v', volume);
    });
  }

  runArgs.push(tag, config.container?.init_command || '/sbin/boot');

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

    // Mark startup as completed - container is ready and command is starting
    startupCompleted = true;

    // Launch Claude Code with TTY allocation based on explicit configuration
    // Default to TTY enabled since Claude is an interactive tool that needs proper output display
    let enableTTY;
    if (ttyOverride !== null) {
      // CLI override takes precedence
      enableTTY = ttyOverride;
    } else {
      // Use config setting, default to true
      enableTTY = config.claude?.tty !== false;
    }
    const dockerFlags = enableTTY ? ['-it'] : ['-i'];
    
    // Ensure proper environment is loaded including PATH
    const envSetup = 'export PATH=/usr/local/bin:/usr/bin:/bin:$PATH';
    const fullCommand = `${envSetup} && ${claudeCommand}`;
    
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

    // Wait for Claude to exit with improved error handling
    await new Promise((resolve, reject) => {
      claudeProcess.on('close', (code) => {
        // Since startup completed, this is a runtime exit
        if (code === 0) {
          console.log(colors.green('✅ Habitat completed successfully'));
          resolve();
        } else if (code === 130) {
          console.log(colors.cyan('ℹ️  Habitat interrupted by user (ctrl-c)'));
          resolve();
        } else {
          const exitMeaning = interpretExitCode(code);
          console.log(colors.yellow(`ℹ️  Habitat exited with code ${code} (${exitMeaning})`));
          resolve(); // Don't reject runtime exits, they're normal
        }
      });
      
      claudeProcess.on('error', (error) => {
        // This is a process error during execution, not an exit code
        reject(new Error(`Process error: ${error.message}`));
      });
    });
  } catch (error) {
    // Handle startup vs runtime errors appropriately
    if (!startupCompleted) {
      // True startup failure - container/environment setup failed
      console.error(colors.red(`❌ Habitat startup failed: ${error.message}`));
      
      // Provide additional context for common startup issues
      if (error.message.includes('Container exited unexpectedly')) {
        console.error(colors.yellow('💡 This usually indicates a problem with the container configuration or base image.'));
        console.error(colors.yellow('   Try running with --rebuild to rebuild the environment from scratch.'));
      } else if (error.message.includes('Work directory') && error.message.includes('not found')) {
        console.error(colors.yellow('💡 The workspace directory is missing from the prepared image.'));
        console.error(colors.yellow('   This may indicate a configuration or build issue.'));
      }
      
      throw error; // Re-throw startup errors
    } else {
      // Runtime error after successful startup
      console.log(colors.yellow(`ℹ️  Runtime error: ${error.message}`));
      // Don't throw runtime errors - they're expected in some cases
    }
  } finally {
    await cleanup();
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