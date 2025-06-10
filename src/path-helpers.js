const path = require('path');

/**
 * Get habitat infrastructure path based on habitat configuration
 * @param {string} component - The infrastructure component ('system', 'shared', 'local')
 * @param {object} habitatConfig - The habitat configuration object
 * @returns {string} Absolute path to infrastructure component in container
 */
function getHabitatInfrastructurePath(component, habitatConfig) {
  if (!component) {
    throw new Error('component parameter is required');
  }
  if (!habitatConfig) {
    throw new Error('habitatConfig parameter is required');
  }
  
  const validComponents = ['system', 'shared', 'local'];
  if (!validComponents.includes(component)) {
    throw new Error(`Invalid component: ${component}. Must be one of: ${validComponents.join(', ')}`);
  }
  
  // Get the work directory from habitat config
  const workDir = habitatConfig.container?.work_dir;
  if (!workDir) {
    throw new Error('Habitat configuration missing required container.work_dir');
  }
  
  // Check if this is a bypass habitat (like claude-habitat)
  const isBypassHabitat = habitatConfig.claude?.bypass_habitat_construction || false;
  
  if (isBypassHabitat) {
    // For bypass habitats, infrastructure is directly under workdir
    switch (component) {
      case 'system':
        return path.posix.join(workDir, 'system');
      case 'shared':
        return path.posix.join(workDir, 'shared');
      case 'local':
        // For bypass habitats like claude-habitat, local path points to the habitat-specific directory
        return path.posix.join(workDir, 'habitats', habitatConfig.name);
      default:
        throw new Error(`Invalid component: ${component}`);
    }
  } else {
    // For normal habitats, infrastructure is under habitat subdirectory
    switch (component) {
      case 'system':
        return path.posix.join(workDir, 'habitat', 'system');
      case 'shared':
        return path.posix.join(workDir, 'habitat', 'shared');
      case 'local':
        return path.posix.join(workDir, 'habitat', 'local');
      default:
        throw new Error(`Invalid component: ${component}`);
    }
  }
}

/**
 * Get all habitat infrastructure paths based on habitat configuration
 * @param {object} habitatConfig - The habitat configuration object
 * @returns {Object} Object with system, shared, local, and habitat paths
 */
function getAllHabitatPaths(habitatConfig) {
  if (!habitatConfig) {
    throw new Error('habitatConfig parameter is required');
  }
  
  const workDir = habitatConfig.container?.work_dir;
  if (!workDir) {
    throw new Error('Habitat configuration missing required container.work_dir');
  }
  
  const isBypassHabitat = habitatConfig.claude?.bypass_habitat_construction || false;
  const habitatPath = isBypassHabitat ? workDir : path.posix.join(workDir, 'habitat');
  
  return {
    system: getHabitatInfrastructurePath('system', habitatConfig),
    shared: getHabitatInfrastructurePath('shared', habitatConfig),
    local: getHabitatInfrastructurePath('local', habitatConfig),
    habitat: habitatPath,
    workdir: workDir
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
 * Get the container work directory from habitat configuration
 * @param {object} habitatConfig - The habitat configuration object
 * @returns {string} Work directory path
 */
function getWorkDir(habitatConfig) {
  if (!habitatConfig) {
    throw new Error('habitatConfig parameter is required');
  }
  
  const workDir = habitatConfig.container?.work_dir;
  if (!workDir) {
    throw new Error('Habitat configuration missing required container.work_dir');
  }
  
  return workDir;
}

/**
 * Get the habitat path from habitat configuration
 * @param {object} habitatConfig - The habitat configuration object
 * @returns {string} Habitat path
 */
function getHabitatPath(habitatConfig) {
  if (!habitatConfig) {
    throw new Error('habitatConfig parameter is required');
  }
  
  const workDir = getWorkDir(habitatConfig);
  const isBypassHabitat = habitatConfig.claude?.bypass_habitat_construction || false;
  
  return isBypassHabitat ? workDir : path.posix.join(workDir, 'habitat');
}

module.exports = {
  getHabitatInfrastructurePath,
  getAllHabitatPaths,
  normalizeContainerPath,
  joinContainerPath,
  getWorkDir,
  getHabitatPath
};