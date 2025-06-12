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

  // Parse environment variables from config._environment (populated by loadConfig) or config.env
  let envVars = config._environment || {};
  
  // If _environment is not populated, parse from config.env
  if (Object.keys(envVars).length === 0 && config.env && Array.isArray(config.env)) {
    for (const envVar of config.env) {
      if (typeof envVar === 'string' && envVar.includes('=')) {
        const [key, ...valueParts] = envVar.split('=');
        const value = valueParts.join('='); // Handle values with = in them
        envVars[key] = value;
      }
    }
  }

  // Check for required USER environment variable
  if (envVars.USER === undefined) {
    throw new Error(`Missing required environment variable: USER in ${config.name}`);
  }

  // Validate USER is non-empty
  if (!envVars.USER || !envVars.USER.trim()) {
    throw new Error(`USER environment variable must be non-empty in ${config.name}`);
  }

  // Check for required WORKDIR environment variable
  if (envVars.WORKDIR === undefined) {
    throw new Error(`Missing required environment variable: WORKDIR in ${config.name}`);
  }

  // Validate WORKDIR is absolute path
  if (!envVars.WORKDIR || !envVars.WORKDIR.startsWith('/')) {
    throw new Error(`WORKDIR environment variable must be absolute path in ${config.name}, got: ${envVars.WORKDIR}`);
  }

  // Validate container section if present (for backward compatibility and other fields)
  if (config.container) {
    // Validate optional startup_delay field
    if (config.container.startup_delay !== undefined) {
      if (typeof config.container.startup_delay !== 'number' || config.container.startup_delay < 0) {
        throw new Error(`container.startup_delay must be a non-negative number in ${config.name}`);
      }
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
        throw new Error(`Repository ${i + 1} missing required field: url in ${config.name}`);
      }
      
      if (typeof repo.url !== 'string') {
        throw new Error(`Repository ${i + 1} url must be a string in ${config.name}`);
      }
    }
  }

  // Validate environment variables section if present  
  if (config.env) {
    if (!Array.isArray(config.env)) {
      throw new Error(`env must be an array in ${config.name}`);
    }

    for (let i = 0; i < config.env.length; i++) {
      const envVar = config.env[i];
      
      if (typeof envVar !== 'string') {
        throw new Error(`Environment variable ${i + 1} must be a string in ${config.name}`);
      }
      
      if (!envVar.includes('=')) {
        throw new Error(`Environment variable ${i + 1} must be in KEY=value format in ${config.name}`);
      }
    }
  }

  return true;
}

/**
 * Provide helpful suggestions based on validation errors
 * @param {Error} error - The validation error
 * @returns {string} Helpful error message with suggestions
 */
function getConfigValidationHelp(error) {
  const message = error.message;
  let help = '\n💡 Configuration Help:\n\n';

  if (message.includes('USER environment variable')) {
    help += 'Suggestion: Add USER environment variable to your habitat config:\n';
    help += 'env:\n';
    help += '  - USER=root\n';
    help += '  - WORKDIR=/workspace\n\n';
  } else if (message.includes('WORKDIR environment variable')) {
    help += 'Suggestion: Add WORKDIR environment variable to your habitat config:\n';
    help += 'env:\n';
    help += '  - USER=root\n';
    help += '  - WORKDIR=/workspace\n\n';
  } else if (message.includes('container section')) {
    help += 'Note: container.work_dir and container.user have been replaced with environment variables.\n';
    help += 'Use this format instead:\n';
    help += 'env:\n';
    help += '  - USER=root\n';
    help += '  - WORKDIR=/workspace\n\n';
  } else if (message.includes('repositories must be an array')) {
    help += 'Suggestion: Fix repositories section:\n';
    help += 'repositories:\n';
    help += '  - url: https://github.com/user/repo\n';
    help += '    path: /workspace/repo\n\n';
  } else if (message.includes('env must be an array')) {
    help += 'Suggestion: Fix environment variables section:\n';
    help += 'env:\n';
    help += '  - USER=root\n';
    help += '  - WORKDIR=/workspace\n';
    help += '  - NODE_ENV=development\n\n';
  }

  help += 'See docs/CONFIGURATION.md for complete examples.';
  
  return help;
}

module.exports = {
  validateHabitatConfig,
  getConfigValidationHelp
};