// Configuration validation for claude-habitat
const path = require('path');

const REQUIRED_CONTAINER_FIELDS = [
  'work_dir',
  'user',
  'init_command'
];

function validateHabitatConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }

  if (!config.name) {
    throw new Error('Missing required field: name');
  }

  // Validate container section exists
  if (!config.container) {
    throw new Error(`Missing required section: container in ${config.name}`);
  }
  
  // Validate required container fields
  for (const field of REQUIRED_CONTAINER_FIELDS) {
    if (!config.container[field]) {
      throw new Error(`Missing required config: container.${field} in ${config.name}`);
    }
  }
  
  // Validate work_dir is absolute path
  if (!config.container.work_dir.startsWith('/')) {
    throw new Error(`container.work_dir must be absolute path in ${config.name}, got: ${config.container.work_dir}`);
  }
  
  // Validate repositories section if present
  if (config.repositories) {
    if (!Array.isArray(config.repositories)) {
      throw new Error(`repositories must be an array in ${config.name}`);
    }
    
    config.repositories.forEach((repo, index) => {
      if (!repo.url) {
        throw new Error(`Repository ${index} missing required field: url in ${config.name}`);
      }
      if (!repo.path) {
        throw new Error(`Repository ${index} missing required field: path in ${config.name}`);
      }
      if (!repo.path.startsWith('/')) {
        throw new Error(`Repository ${index} path must be absolute in ${config.name}, got: ${repo.path}`);
      }
    });
  }
  
  return true;
}

module.exports = {
  validateHabitatConfig,
  REQUIRED_CONTAINER_FIELDS
};