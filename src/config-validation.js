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

  // Entry section is optional, validate if present
  if (config.entry) {
    validateEntrySection(config.entry, config.name);
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

  // Entry validation is handled separately if section exists

  // Validate repos section if present
  if (config.repos) {
    if (!Array.isArray(config.repos)) {
      throw new Error(`repos must be an array in ${config.name}`);
    }

    for (let i = 0; i < config.repos.length; i++) {
      const repo = config.repos[i];
      if (!repo.url) {
        throw new Error(`repos[${i}].url is required in ${config.name}`);
      }
      if (!repo.path) {
        throw new Error(`repos[${i}].path is required in ${config.name}`);
      }
      if (!repo.path.startsWith('/')) {
        throw new Error(`repos[${i}].path must be absolute path in ${config.name}, got: ${repo.path}`);
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
 * Validate entry section structure
 * @param {Object} entry - Entry configuration section
 * @param {string} configName - Name of config for error messages
 */
function validateEntrySection(entry, configName) {
  if (typeof entry !== 'object') {
    throw new Error(`entry section must be an object in ${configName}`);
  }
  
  // Validate startup_delay if present
  if (entry.startup_delay !== undefined) {
    const delay = entry.startup_delay;
    if (typeof delay !== 'number' || delay < 0) {
      throw new Error(`entry.startup_delay must be a non-negative number in ${configName}`);
    }
  }
  
  // Validate tty if present
  if (entry.tty !== undefined && typeof entry.tty !== 'boolean') {
    throw new Error(`entry.tty must be a boolean in ${configName}`);
  }
  
  // Validate bypass_habitat_construction if present
  if (entry.bypass_habitat_construction !== undefined && typeof entry.bypass_habitat_construction !== 'boolean') {
    throw new Error(`entry.bypass_habitat_construction must be a boolean in ${configName}`);
  }
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