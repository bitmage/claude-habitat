const yaml = require('js-yaml');
const fs = require('fs').promises;
const { fileExists } = require('./utils');
const { validateHabitatConfig, getConfigValidationHelp } = require('./config-validation');

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
 * Expand ${VAR} and {env.VAR} references in a string
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

/**
 * Recursively expand variables in config object
 */
function expandConfigVariables(obj, env, containerConfig = {}) {
  if (typeof obj === 'string') {
    // Expand environment variables
    let result = expandEnvironmentVariables(obj, env);
    
    // Expand {container.user} and similar patterns
    if (containerConfig.user) {
      result = result.replace(/\{container\.user\}/g, containerConfig.user);
    }
    if (containerConfig.work_dir) {
      result = result.replace(/\{container\.work_dir\}/g, containerConfig.work_dir);
    }
    
    return result;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => expandConfigVariables(item, env, containerConfig));
  }
  
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandConfigVariables(value, env, containerConfig);
    }
    return result;
  }
  
  return obj;
}

// Public API functions with simple validation
async function loadConfig(configPath, existingEnv = {}, validateAsHabitat = true) {
  if (!configPath) throw new Error('Missing required parameter: configPath');
  if (!await fileExists(configPath)) throw new Error('Configuration file not found');

  const configContent = await fs.readFile(configPath, 'utf8');
  let config = yaml.load(configContent);
  
  // Process environment variables first
  const env = processEnvironmentVariables(config, existingEnv);
  
  // Expand all variable references in the config
  config = expandConfigVariables(config, env, config.container || {});
  
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