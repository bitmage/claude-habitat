const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const { colors, calculateCacheHash, fileExists, sleep } = require('./utils');
const { loadConfig } = require('./config');
const { buildBaseImage, buildPreparedImage, dockerImageExists, dockerRun, dockerExec, dockerIsRunning } = require('./docker');
const { testRepositoryAccess } = require('./github');
const { verifyFilesystem } = require('./filesystem');

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
  if (config.environment && Array.isArray(config.environment)) {
    for (const env of config.environment) {
      if (env && typeof env === 'string') {
        const cleanEnv = env.replace(/^- /, '');
        envVars.push(cleanEnv);
      }
    }
  }

  // Run the container
  return await runContainer(preparedTag, config, envVars, overrideCommand);
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

// Run container (internal function)
async function runContainer(tag, config, envVars, overrideCommand = null) {
  const containerName = `${config.name}_${Date.now()}_${process.pid}`;
  const workDir = config.container.work_dir; // Config validation ensures this exists
  const containerUser = config.container.user; // Config validation ensures this exists
  const claudeCommand = overrideCommand || config.claude?.command || 'claude';

  console.log(`Creating container from prepared image: ${containerName}`);

  // Build docker run arguments
  const runArgs = [
    'run', '-d',
    '--name', containerName,
    ...envVars.flatMap(env => ['-e', env])
  ];

  // Add volume mounts from system config and habitat config
  const systemConfigPath = path.join(__dirname, '..', 'system', 'config.yaml');
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

    // Run filesystem verification if configured
    const verifyResult = await verifyFilesystem(config, containerName);
    if (!verifyResult.passed) {
      console.warn(colors.yellow(`⚠️  Filesystem verification: ${verifyResult.message}`));
      if (verifyResult.missingFiles) {
        console.warn(colors.yellow(`Missing files:`));
        verifyResult.missingFiles.forEach(file => {
          console.warn(colors.yellow(`  - ${file}`));
        });
      }
    } else {
      console.log(colors.green(`✅ ${verifyResult.message}`));
    }

    console.log('');
    console.log(colors.green('Container ready!'));
    console.log('Launching Claude Code...');
    console.log('');

    // Launch Claude Code - use -i only if not running with -p flag
    const isNonInteractive = claudeCommand.includes('-p') || claudeCommand.includes('--prompt');
    const dockerFlags = isNonInteractive ? ['-i'] : ['-it'];
    
    const claudeProcess = spawn('docker', [
      'exec', ...dockerFlags,
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

module.exports = {
  startSession,
  runHabitat: startSession, // Backward compatibility alias
  buildHabitatImage,
  getLastUsedConfig,
  saveLastUsedConfig,
  checkHabitatRepositories,
  setupHabitatEnvironment
};