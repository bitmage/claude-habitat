const REQUIRED_CONTAINER_FIELDS = [
  'work_dir',
  'user'
];

const OPTIONAL_CONTAINER_FIELDS = [
  'init_command',
  'startup_delay'
];

/**
 * Validate habitat configuration structure and required fields
 * @param {Object} config - The loaded habitat configuration
 * @throws {Error} If configuration is invalid
 * @returns {boolean} True if valid
 */
function validateHabitatConfig(config) {
  if (!config) {
    throw new Error('Configuration object is required');
  }

  if (!config.name) {
    throw new Error('Missing required config: name');
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

  // Validate user field
  if (typeof config.container.user !== 'string' || config.container.user.length === 0) {
    throw new Error(`container.user must be a non-empty string in ${config.name}`);
  }

  // Validate optional fields if present
  if (config.container.startup_delay !== undefined) {
    if (typeof config.container.startup_delay !== 'number' || config.container.startup_delay < 0) {
      throw new Error(`container.startup_delay must be a non-negative number in ${config.name}`);
    }
  }

  // Validate repositories section if present
  if (config.repositories) {
    if (!Array.isArray(config.repositories)) {
      throw new Error(`repositories must be an array in ${config.name}`);
    }

    for (let i = 0; i < config.repositories.length; i++) {
      const repo = config.repositories[i];
      if (!repo.url) {
        throw new Error(`repositories[${i}].url is required in ${config.name}`);
      }
      if (!repo.path) {
        throw new Error(`repositories[${i}].path is required in ${config.name}`);
      }
      if (!repo.path.startsWith('/')) {
        throw new Error(`repositories[${i}].path must be absolute path in ${config.name}, got: ${repo.path}`);
      }
    }
  }

  // Validate image section if present
  if (config.image) {
    if (!config.image.dockerfile && !config.image.base) {
      throw new Error(`image section must specify either dockerfile or base in ${config.name}`);
    }
  }
  
  return true;
}

/**
 * Validate that all required paths are specified in configuration
 * @param {Object} config - The habitat configuration
 * @throws {Error} If paths are missing or invalid
 */
function validatePathConfiguration(config) {
  validateHabitatConfig(config);
  
  // Additional path-specific validation can go here
  // For now, the main validation is in validateHabitatConfig
}

/**
 * Get helpful error message for common configuration mistakes
 * @param {Error} error - The validation error
 * @returns {string} User-friendly error message with suggestions
 */
function getConfigValidationHelp(error) {
  const message = error.message;
  
  if (message.includes('work_dir must be absolute')) {
    return `${message}\n\nSuggestion: Use absolute paths like '/workspace' or '/src', not relative paths like 'workspace'`;
  }
  
  if (message.includes('Missing required config: container.work_dir')) {
    return `${message}\n\nSuggestion: Add this to your config.yaml:\ncontainer:\n  work_dir: /workspace\n  user: root`;
  }
  
  if (message.includes('Missing required section: container')) {
    return `${message}\n\nSuggestion: Add a container section to your config.yaml:\ncontainer:\n  work_dir: /workspace\n  user: root`;
  }
  
  return message;
}

module.exports = {
  validateHabitatConfig,
  validatePathConfiguration,
  getConfigValidationHelp,
  REQUIRED_CONTAINER_FIELDS,
  OPTIONAL_CONTAINER_FIELDS
};