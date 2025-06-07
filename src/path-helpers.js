const path = require('path');

/**
 * Get habitat infrastructure path relative to work directory
 * @param {string} workDir - The container work directory (e.g., '/workspace')
 * @param {string} component - The infrastructure component ('system', 'shared', 'local')
 * @returns {string} Absolute path to infrastructure component
 */
function getHabitatInfrastructurePath(workDir, component) {
  if (!workDir) {
    throw new Error('workDir parameter is required');
  }
  if (!component) {
    throw new Error('component parameter is required');
  }
  
  const validComponents = ['system', 'shared', 'local'];
  if (!validComponents.includes(component)) {
    throw new Error(`Invalid component: ${component}. Must be one of: ${validComponents.join(', ')}`);
  }
  
  return path.posix.join(workDir, 'claude-habitat', component);
}

/**
 * Get all habitat infrastructure paths for a given work directory
 * @param {string} workDir - The container work directory
 * @returns {Object} Object with system, shared, and local paths
 */
function getAllHabitatPaths(workDir) {
  return {
    system: getHabitatInfrastructurePath(workDir, 'system'),
    shared: getHabitatInfrastructurePath(workDir, 'shared'),
    local: getHabitatInfrastructurePath(workDir, 'local'),
    root: path.posix.join(workDir, 'claude-habitat')
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

module.exports = {
  getHabitatInfrastructurePath,
  getAllHabitatPaths,
  normalizeContainerPath,
  joinContainerPath
};