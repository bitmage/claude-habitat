const yaml = require('js-yaml');
const fs = require('fs').promises;
const { fileExists } = require('./utils');
const { validateHabitatConfig, getConfigValidationHelp } = require('./config-validation');
const { expandTemplateObject } = require('./template-expansion');

/**
 * Process environment variables from config and expand variable references
 */
function processEnvironmentVariables(config, existingEnv = {}) {
  // Start with existing environment variables
  const env = { ...existingEnv };
  
  // Process environment variables from config in order
  if (config.env && Array.isArray(config.env)) {
    for (const envVar of config.env) {
      if (typeof envVar === 'string' && envVar.includes('=')) {
        const [key, ...valueParts] = envVar.split('=');
        let value = valueParts.join('=');
        
        // Expand ${VAR} references in the value using current environment
        value = expandEnvironmentVariables(value, env);
        
        env[key] = value;
      }
    }
  }
  
  return env;
}

/**
 * Expand ${VAR} and {env.VAR} references in a string using current environment
 * This is a simplified version for backward compatibility during environment processing
 */
function expandEnvironmentVariables(str, env) {
  if (typeof str !== 'string') return str;
  
  let result = str;
  
  // Expand ${VAR} syntax (bash-style)
  result = result.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    return env[varName] || '';
  });
  
  // Expand {env.VAR} syntax
  result = result.replace(/\{env\.([^}]+)\}/g, (match, varName) => {
    return env[varName] || '';
  });
  
  return result;
}

// Public API functions with simple validation
async function loadConfig(configPath, existingEnv = {}, validateAsHabitat = true) {
  if (!configPath) throw new Error('Missing required parameter: configPath');
  if (!await fileExists(configPath)) throw new Error('Configuration file not found');

  const configContent = await fs.readFile(configPath, 'utf8');
  let config = yaml.load(configContent);
  
  // Process environment variables first
  const env = processEnvironmentVariables(config, existingEnv);
  
  // Add environment to config for template expansion
  config._environment = env;
  
  // Expand all templates in the config using the unified template system
  config = expandTemplateObject(config, config);
  
  // Auto-populate container settings from environment variables if missing
  if (validateAsHabitat) {
    if (!config.container) {
      config.container = {};
    }
    // Set work_dir from WORKDIR environment variable if not explicitly set
    if (!config.container.work_dir && env.WORKDIR) {
      config.container.work_dir = env.WORKDIR;
    }
  }
  
  // Only validate as habitat config if requested (not for system/shared configs)
  if (validateAsHabitat) {
    try {
      validateHabitatConfig(config);
    } catch (error) {
      const helpfulError = new Error(getConfigValidationHelp(error));
      helpfulError.configPath = configPath;
      helpfulError.originalError = error;
      throw helpfulError;
    }
  }
  
  return { ...config, _configPath: configPath, _environment: env };
}

module.exports = {
  loadConfig
};