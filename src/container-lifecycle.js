/**
 * @module container-lifecycle
 * @description Container lifecycle management for Claude Habitat
 * 
 * Handles creation, startup, and teardown of habitat containers with
 * unified setup logic. Manages container state, temporary containers,
 * and provides consistent container lifecycle patterns.
 * 
 * @requires module:types - Domain model definitions
 * @requires module:container-operations - Docker execution operations
 * @requires module:standards/path-resolution - Path handling conventions
 * 
 * @tests
 * - E2E tests: Container lifecycle is tested across all E2E scenarios
 * - Run all tests: `npm test`
 */

const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
// @see {@link module:standards/path-resolution} for project-root relative path conventions using rel()
const { colors, sleep, fileExists, rel } = require('./utils');
const { dockerRun, dockerExec, dockerIsRunning, dockerImageExists } = require('./container-operations');

/**
 * Create and start a habitat container with unified setup logic
 * @param {object} config - Habitat configuration
 * @param {object} options - Container options
 * @param {string} options.name - Container name (required)
 * @param {boolean} options.temporary - Whether this is a temporary container (default: false)
 * @param {string} options.command - Override command to run (optional)
 * @param {boolean} options.rebuild - Whether to rebuild the image (default: false)
 * @param {string} options.workDir - Override work directory (optional)
 * @param {string} options.preparedTag - Use specific prepared image tag (optional)
 * @returns {object} Container info and cleanup function
 */
async function createHabitatContainer(config, options = {}) {
  const {
    name,
    temporary = false,
    command = null,
    rebuild = false,
    workDir = null, // Will be resolved from WORKDIR env var
    preparedTag = null
  } = options;

  if (!name) {
    throw new Error('Container name is required');
  }

  // Ensure we have a prepared image
  let imageTag = preparedTag;
  if (!imageTag) {
    const { calculateCacheHash } = require('./utils');
    const hash = calculateCacheHash(config, []);
    imageTag = `claude-habitat-${config.name}:${hash}`;
  }

  // Build image if it doesn't exist or if rebuild is requested
  if (!await dockerImageExists(imageTag) || rebuild) {
    if (rebuild) {
      console.log(`Rebuilding habitat for container...`);
    } else {
      console.log(`Prepared image not found. Building habitat...`);
    }
    
    // Use new progressive build pipeline 
    const { buildHabitatImage } = require('./habitat');
    const configPath = config._configPath || `habitats/${config.name}/config.yaml`;
    const result = await buildHabitatImage(configPath, [], { rebuild });
    
    // Tag the prepared image with our expected hash-based name
    if (result.preparedTag !== imageTag) {
      await dockerRun(['tag', result.preparedTag, imageTag]);
    }
  }

  // Get resolved environment variables for USER and WORKDIR
  let containerUser, resolvedWorkDir;
  
  if (workDir) {
    // Use provided workDir override
    resolvedWorkDir = workDir;
    // Try to get USER from environment, fallback to 'root'
    try {
      const { createHabitatPathHelpers } = require('./habitat-path-helpers');
      const pathHelpers = await createHabitatPathHelpers(config);
      const compiledEnv = pathHelpers.getEnvironment();
      containerUser = compiledEnv.USER || 'root';
    } catch (err) {
      console.warn(`Warning: Could not resolve USER environment variable: ${err.message}`);
      containerUser = 'root';
    }
  } else {
    // Resolve both USER and WORKDIR from environment
    try {
      const { createHabitatPathHelpers } = require('./habitat-path-helpers');
      const pathHelpers = await createHabitatPathHelpers(config);
      const compiledEnv = pathHelpers.getEnvironment();
      containerUser = compiledEnv.USER || 'root';
      resolvedWorkDir = compiledEnv.WORKDIR || '/workspace';
    } catch (err) {
      console.warn(`Warning: Could not resolve environment variables: ${err.message}`);
      containerUser = 'root';
      resolvedWorkDir = '/workspace';
    }
  }
  const containerName = name;

  console.log(`Creating container from prepared image: ${containerName}`);

  // Build docker run arguments
  const runArgs = [
    'run', '-d',
    '--name', containerName
  ];

  // Add environment variables from configs - use traditional shell expansion, not synthetic replacement
  const isBypassHabitat = config.claude?.bypass_habitat_construction || false;
  
  if (isBypassHabitat) {
    // For bypass habitats, only use local config.env
    if (config.env && Array.isArray(config.env)) {
      config.env.forEach(envVar => {
        if (typeof envVar === 'string') {
          runArgs.push('-e', envVar);
        }
      });
    }
  } else {
    // For normal habitats, pass environment variables from system + shared + local configs
    // This allows traditional shell expansion like PATH=${PATH}:${SYSTEM_TOOLS_PATH}
    
    // Load and add system config environment variables
    try {
      const { loadConfig } = require('./config');
      const systemConfigPath = rel('system/config.yaml');
      if (await fileExists(systemConfigPath)) {
        const systemConfig = await loadConfig(systemConfigPath);
        if (systemConfig.env && Array.isArray(systemConfig.env)) {
          systemConfig.env.forEach(envVar => {
            if (typeof envVar === 'string') {
              runArgs.push('-e', envVar);
            }
          });
        }
      }
      
      // Load and add shared config environment variables
      const sharedConfigPath = rel('shared/config.yaml');
      if (await fileExists(sharedConfigPath)) {
        const sharedConfig = await loadConfig(sharedConfigPath);
        if (sharedConfig.env && Array.isArray(sharedConfig.env)) {
          sharedConfig.env.forEach(envVar => {
            if (typeof envVar === 'string') {
              runArgs.push('-e', envVar);
            }
          });
        }
      }
    } catch (err) {
      console.warn(`Warning: Could not load system/shared configs: ${err.message}`);
    }
    
    // Add local habitat config environment variables last
    if (config.env && Array.isArray(config.env)) {
      config.env.forEach(envVar => {
        if (typeof envVar === 'string') {
          runArgs.push('-e', envVar);
        }
      });
    }
  }

  // Add volume mounts from system config and habitat config
  const systemConfigPath = rel('system/config.yaml');
  let systemVolumes = [];
  
  // Load system volumes if system config exists
  if (await fileExists(systemConfigPath)) {
    try {
      const { loadConfig } = require('./config');
      const systemConfig = await loadConfig(systemConfigPath);
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
    const placeholderRegex = /\\{([^}]+)\\}/g;
    resolved = resolved.replace(placeholderRegex, (match, path) => {
      // Note: container.user removed - use env.USER instead
      // Handle other env.* patterns
      if (path.startsWith('env.')) {
        const envKey = path.substring(4);
        if (envKey === 'USER') return containerUser;
        if (envKey === 'WORKDIR') return resolvedWorkDir;
        // Try to get from compiled environment
        try {
          const { createHabitatPathHelpers } = require('./habitat-path-helpers');
          const pathHelpers = createHabitatPathHelpers(config);
          const compiledEnv = pathHelpers.getEnvironment();
          return compiledEnv[envKey] || match;
        } catch {
          return match;
        }
      }
      // Legacy: try config resolution for other patterns
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
      if (typeof volume === 'string') {
        runArgs.push('-v', volume);
      }
    });
  }

  // Add image and init command
  runArgs.push(imageTag);
  const initCommand = command || config.container?.init_command || '/sbin/init';
  
  // Handle commands with arguments
  if (initCommand.includes(' ')) {
    // Split command and arguments
    const parts = initCommand.split(' ');
    runArgs.push(...parts);
  } else {
    runArgs.push(initCommand);
  }

  await dockerRun(runArgs);

  // Create cleanup function
  const cleanup = async () => {
    if (temporary) {
      console.log('\\nCleaning up temporary container...');
    } else {
      console.log('\\nCleaning up container...');
    }
    try {
      await execAsync(`docker stop ${containerName}`);
      await execAsync(`docker rm ${containerName}`);
    } catch {
      // Ignore errors during cleanup
    }
  };

  // Setup cleanup for temporary containers or process exit
  if (temporary) {
    // For temporary containers, cleanup is manual
  } else {
    // For normal containers, cleanup on process exit
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  // Wait for container to start
  console.log('Waiting for container to initialize...');
  await sleep(config.container?.startup_delay * 1000 || 5000);

  // Check if container is running
  if (!await dockerIsRunning(containerName)) {
    const { stdout: logs, stderr: errorLogs } = await execAsync(`docker logs ${containerName} 2>&1`).catch(() => ({ stdout: 'No logs available', stderr: '' }));
    const allLogs = [logs, errorLogs].filter(Boolean).join('\n');
    throw new Error(`Container exited unexpectedly:\n${allLogs}`);
  }

  // Verify environment
  try {
    await dockerExec(containerName, `test -d ${resolvedWorkDir}`, containerUser);
  } catch {
    throw new Error(`Work directory ${resolvedWorkDir} not found in prepared image`);
  }

  return {
    name: containerName,
    tag: imageTag,
    config,
    workDir: resolvedWorkDir,
    user: containerUser,
    cleanup,
    temporary
  };
}

module.exports = {
  createHabitatContainer
};