const yaml = require('js-yaml');
const fs = require('fs').promises;
const { fileExists } = require('./utils');
const { pipe, transform } = require('./functional');
const { validateConfig } = require('./validation');

/**
 * Process environment variables from config and expand variable references
 */
function processEnvironmentVariables(config, existingEnv = {}) {
  // Start with existing environment variables
  const env = { ...existingEnv };
  
  // Process environment variables from config in order
  if (config.environment && Array.isArray(config.environment)) {
    for (const envVar of config.environment) {
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
    const validationResult = validateConfig(config, 'habitat');
    
    if (!validationResult.valid) {
      const error = new Error(`Configuration validation failed for ${configPath}:\n${validationResult.formattedErrors}`);
      error.configPath = configPath;
      error.validationErrors = validationResult.errors;
      error.suggestions = validationResult.suggestions;
      throw error;
    }
    
    // Use the validated config (may have defaults applied)
    config = validationResult.data;
  }
  
  return { ...config, _configPath: configPath, _environment: env };
}

/**
 * Functional composition for config loading chain
 * Load configs in sequence: system → shared → habitat
 */
const loadConfigChain = pipe(
  // Transform single habitat path into config loading plan
  async (habitatConfigPath) => {
    const { rel } = require('./utils');
    
    return [
      { path: rel('system', 'config.yaml'), type: 'system', optional: true },
      { path: rel('shared', 'config.yaml'), type: 'shared', optional: true },
      { path: habitatConfigPath, type: 'habitat', optional: false }
    ];
  },
  
  // Load configs in sequence, accumulating environment
  async (configPlan) => {
    const configs = [];
    let accumulatedEnv = {};
    
    for (const { path, type, optional } of configPlan) {
      if (optional && !await fileExists(path)) {
        continue;
      }
      
      const validateAsHabitat = (type === 'habitat');
      const config = await loadConfig(path, accumulatedEnv, validateAsHabitat);
      
      configs.push({ ...config, _type: type });
      accumulatedEnv = { ...accumulatedEnv, ...config._environment };
    }
    
    return configs;
  },
  
  // Return the final habitat config
  async (configs) => {
    const habitatConfig = configs.find(c => c._type === 'habitat');
    if (!habitatConfig) {
      throw new Error('No habitat configuration loaded');
    }
    return habitatConfig;
  }
);

/**
 * Load config with environment variable chain: system → shared → habitat
 * This is the main entry point for loading habitat configurations
 * 
 * @param {string} habitatConfigPath - Path to habitat config file
 * @returns {Object} - Loaded and validated habitat configuration
 */
async function loadConfigWithEnvironmentChain(habitatConfigPath) {
  return loadConfigChain(habitatConfigPath);
}

module.exports = {
  loadConfig,
  loadConfigWithEnvironmentChain,
  processEnvironmentVariables,
  expandEnvironmentVariables,
  expandConfigVariables
};