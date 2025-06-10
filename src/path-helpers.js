const path = require('path');

/**
 * Get habitat infrastructure path using environment variables
 * @param {string} component - The infrastructure component ('system', 'shared', 'local')
 * @returns {string} Absolute path to infrastructure component
 */
function getHabitatInfrastructurePath(component) {
  if (!component) {
    throw new Error('component parameter is required');
  }
  
  const validComponents = ['system', 'shared', 'local'];
  if (!validComponents.includes(component)) {
    throw new Error(`Invalid component: ${component}. Must be one of: ${validComponents.join(', ')}`);
  }
  
  // Use environment variables that are set correctly by habitat configurations
  switch (component) {
    case 'system':
      return process.env.SYSTEM_PATH || '/workspace/habitat/system';
    case 'shared':
      return process.env.SHARED_PATH || '/workspace/habitat/shared';
    case 'local':
      return process.env.LOCAL_PATH || '/workspace/habitat/local';
    default:
      throw new Error(`Invalid component: ${component}`);
  }
}

/**
 * Get all habitat infrastructure paths using environment variables
 * @returns {Object} Object with system, shared, local, and habitat paths
 */
function getAllHabitatPaths() {
  return {
    system: getHabitatInfrastructurePath('system'),
    shared: getHabitatInfrastructurePath('shared'),
    local: getHabitatInfrastructurePath('local'),
    habitat: process.env.HABITAT_PATH || '/workspace/habitat',
    workdir: process.env.WORKDIR || '/workspace'
  };
}

/**
 * Normalize path to use POSIX separators (for container paths)
 * @param {string} containerPath - Path inside container
 * @returns {string} Normalized path with forward slashes
 */
function normalizeContainerPath(containerPath) {
  if (!containerPath) {
    return containerPath;
  }
  return containerPath.replace(/\\/g, '/');
}

/**
 * Join paths using POSIX separators (for container environments)
 * @param {...string} segments - Path segments to join
 * @returns {string} Joined path with forward slashes
 */
function joinContainerPath(...segments) {
  return path.posix.join(...segments);
}

/**
 * Get the container work directory from environment
 * @returns {string} Work directory path
 */
function getWorkDir() {
  return process.env.WORKDIR || '/workspace';
}

/**
 * Get the habitat path from environment
 * @returns {string} Habitat path
 */
function getHabitatPath() {
  return process.env.HABITAT_PATH || '/workspace/habitat';
}

module.exports = {
  getHabitatInfrastructurePath,
  getAllHabitatPaths,
  normalizeContainerPath,
  joinContainerPath,
  getWorkDir,
  getHabitatPath
};