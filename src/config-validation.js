/**
 * @module config-validation
 * @description Configuration validation and help system for Claude Habitat
 * 
 * Provides comprehensive validation of habitat YAML configurations, including
 * required fields checking, type validation, and helpful error messages.
 * Ensures configurations meet the expected schema before container operations.
 * 
 * @requires module:types - Domain model definitions
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/config-validation.test.js`
 * - Run all tests: `npm test`
 */

// USER and WORKDIR are now required as environment variables, not container fields
const REQUIRED_CONTAINER_FIELDS = [];

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
  
  // Validate required environment variables
  if (!config.env || !Array.isArray(config.env)) {
    throw new Error(`Missing required section: env (must be array) in ${config.name}`);
  }
  
  // Parse environment variables and check for required ones
  const envVars = {};
  config.env.forEach(envStr => {
    if (typeof envStr === 'string') {
      const match = envStr.match(/^([A-Z_]+)=(.*)$/);
      if (match) {
        envVars[match[1]] = match[2];
      }
    }
  });
  
  // Check for required USER environment variable
  if (envVars.USER === undefined) {
    throw new Error(`Missing required environment variable: USER in ${config.name}`);
  }
  
  // Validate USER is non-empty
  if (!envVars.USER || !envVars.USER.trim()) {
    throw new Error(`USER environment variable must be non-empty in ${config.name}`);
  }
  
  // Check for required WORKDIR environment variable  
  if (!envVars.WORKDIR) {
    throw new Error(`Missing required environment variable: WORKDIR in ${config.name}`);
  }
  
  // Validate WORKDIR is absolute path
  const workdir = envVars.WORKDIR.replace(/\$\{[^}]+\}/g, '/workspace'); // Handle variable refs for validation
  if (!workdir.startsWith('/')) {
    throw new Error(`WORKDIR environment variable must be absolute path in ${config.name}, got: ${envVars.WORKDIR}`);
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
  
  if (message.includes('WORKDIR environment variable must be absolute')) {
    return `${message}\n\nSuggestion: Use absolute paths like '/workspace' or '/src', not relative paths like 'workspace'`;
  }
  
  if (message.includes('Missing required environment variable: USER')) {
    return `${message}\n\nSuggestion: Add USER to your env section:\nenv:\n  - USER=node\n  - WORKDIR=/workspace`;
  }
  
  if (message.includes('Missing required environment variable: WORKDIR')) {
    return `${message}\n\nSuggestion: Add WORKDIR to your env section:\nenv:\n  - WORKDIR=/workspace\n  - USER=node`;
  }
  
  if (message.includes('Missing required section: env')) {
    return `${message}\n\nSuggestion: Add an env section to your config.yaml:\nenv:\n  - USER=node\n  - WORKDIR=/workspace`;
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