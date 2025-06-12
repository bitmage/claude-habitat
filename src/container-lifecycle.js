const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
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
    workDir = config._environment?.WORKDIR,
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
    const { prepareWorkspace } = require('./image-lifecycle');
    await prepareWorkspace(config, imageTag, [], { rebuild });
  }

  const containerUser = config._environment?.USER || 'root';
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
      const systemConfigPath = rel('system', 'config.yaml');
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
      const sharedConfigPath = rel('shared', 'config.yaml');
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
  const systemConfigPath = rel('system', 'config.yaml');
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
  
  // Resolve placeholder values in system volumes using environment variables
  const resolvedSystemVolumes = systemVolumes.map(volume => {
    let resolved = volume;
    
    // Find all {env.VAR} placeholders and resolve them
    const placeholderRegex = /\\{env\\.([^}]+)\\}/g;
    resolved = resolved.replace(placeholderRegex, (match, envVar) => {
      // Resolve environment variable from config._environment
      const value = config._environment?.[envVar];
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
  runArgs.push(initCommand);

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
    const { stdout: logs } = await execAsync(`docker logs ${containerName}`).catch(() => ({ stdout: 'No logs available' }));
    throw new Error(`Container exited unexpectedly:\\n${logs}`);
  }

  // Verify environment
  try {
    await dockerExec(containerName, `test -d ${workDir}`, containerUser);
  } catch {
    throw new Error(`Work directory ${workDir} not found in prepared image`);
  }

  return {
    name: containerName,
    tag: imageTag,
    config,
    workDir,
    user: containerUser,
    cleanup,
    temporary
  };
}

module.exports = {
  createHabitatContainer
};