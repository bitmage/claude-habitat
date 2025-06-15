/**
 * @module volume-resolver
 * @description Volume resolution and mounting utilities for Claude Habitat
 * 
 * Provides unified volume resolution logic for both build and runtime containers.
 * Handles ~ expansion (always to ${USER} home directory), environment variable
 * substitution, and volume mounting configuration.
 * 
 * @requires module:config - Configuration loading utilities
 * @requires module:utils - File system utilities
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/volume-resolver.test.js`
 * - E2E tests: Volume mounting tested in habitat build and runtime tests
 */

const path = require('path');
const os = require('os');
const { fileExists, rel } = require('./utils');

/**
 * Resolve volume mount strings with environment variable and ~ expansion
 * 
 * @param {Array<string>} volumes - Array of volume mount strings
 * @param {Object} environment - Environment variables object
 * @returns {Array<string>} - Resolved volume mount strings
 */
function resolveVolumeMounts(volumes, environment = {}) {
  if (!Array.isArray(volumes)) {
    return [];
  }
  
  return volumes.map(volume => {
    let resolved = volume;
    
    // Handle environment variable expansion (${VAR} and {env.VAR} patterns)
    const placeholderRegex = /{([^}]+)}/g;
    resolved = resolved.replace(placeholderRegex, (match, path) => {
      if (path.startsWith('env.')) {
        const envKey = path.substring(4);
        return environment[envKey] || match;
      }
      // Legacy support for other patterns
      const value = path.split('.').reduce((obj, key) => obj?.[key], { env: environment });
      return value || match;
    });
    
    // Handle ${VAR} bash-style expansion
    resolved = resolved.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return environment[varName] || match;
    });
    
    // Handle ~ expansion - ALWAYS use ${USER} home directory, never root
    // This is critical for verify-fs where process runs as root but ~ should expand to ${USER}
    if (resolved.includes('~')) {
      const userHome = getUserHomeDirectory(environment);
      resolved = resolved.replace(/~/g, userHome);
    }
    
    return resolved;
  });
}

/**
 * Get user home directory based on ${USER} environment variable
 * Always returns the ${USER}'s home directory, never root's
 * 
 * @param {Object} environment - Environment variables object
 * @returns {string} - User home directory path
 */
function getUserHomeDirectory(environment = {}) {
  const user = environment.USER || 'root';
  
  if (user === 'root') {
    return '/root';
  } else {
    return `/home/${user}`;
  }
}

/**
 * Load and resolve volumes from configuration files
 * Combines system volumes and habitat-specific volumes
 * 
 * @param {Object} config - Habitat configuration object
 * @param {Object} environment - Environment variables object
 * @returns {Promise<Array<string>>} - Resolved volume mount strings
 */
async function loadAndResolveVolumes(config, environment = {}) {
  const volumes = [];
  
  // Load system volumes from system/config.yaml
  const systemConfigPath = rel('system/config.yaml');
  if (await fileExists(systemConfigPath)) {
    try {
      const { loadConfig } = require('./config');
      const systemConfig = await loadConfig(systemConfigPath);
      if (systemConfig.volumes && Array.isArray(systemConfig.volumes)) {
        volumes.push(...systemConfig.volumes);
      }
    } catch (err) {
      console.warn(`Warning: Could not load system volumes: ${err.message}`);
    }
  }
  
  // Add habitat-specific volumes
  if (config.volumes && Array.isArray(config.volumes)) {
    volumes.push(...config.volumes);
  }
  
  // Resolve all volumes
  return resolveVolumeMounts(volumes, environment);
}

/**
 * Build Docker volume arguments for container creation
 * 
 * @param {Array<string>} resolvedVolumes - Resolved volume mount strings
 * @returns {Array<string>} - Docker arguments array ['-v', 'volume1', '-v', 'volume2']
 */
function buildVolumeArgs(resolvedVolumes) {
  const args = [];
  
  resolvedVolumes.forEach(volume => {
    args.push('-v', volume);
  });
  
  return args;
}

module.exports = {
  resolveVolumeMounts,
  getUserHomeDirectory,
  loadAndResolveVolumes,
  buildVolumeArgs
};