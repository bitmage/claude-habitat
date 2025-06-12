const yaml = require('js-yaml');
const fs = require('fs').promises;
const { fileExists, rel } = require('./utils');
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
  
  // Note: Template expansion is now handled in loadConfigWithEnvironmentChain
  // for proper coalesced environment support. Individual configs only get
  // basic environment variable processing.
  
  // Note: Container settings auto-population removed as part of work_dir elimination
  
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

/**
 * Load habitat environment from config with proper variable coalescing
 * This loads system → shared → local configs and coalesces their environment variables,
 * then performs template expansion on the final result with the coalesced environment.
 * @param {string} habitatConfigPath - Path to the habitat config file
 * @returns {object} Configuration with coalesced environment and expanded templates
 */
async function loadHabitatEnvironmentFromConfig(habitatConfigPath) {
  if (!habitatConfigPath) throw new Error('Missing required parameter: habitatConfigPath');
  if (!await fileExists(habitatConfigPath)) throw new Error('Habitat configuration file not found');

  let coalescedEnv = {};
  
  // Load system config and merge its environment variables
  const systemConfigPath = rel('system', 'config.yaml');
  if (await fileExists(systemConfigPath)) {
    try {
      const systemConfig = await loadConfig(systemConfigPath, {}, false);
      coalescedEnv = { ...coalescedEnv, ...systemConfig._environment };
    } catch (err) {
      console.warn(`Warning: Could not load system config: ${err.message}`);
    }
  }
  
  // Load shared config and merge its environment variables
  const sharedConfigPath = rel('shared', 'config.yaml');
  if (await fileExists(sharedConfigPath)) {
    try {
      const sharedConfig = await loadConfig(sharedConfigPath, coalescedEnv, false);
      coalescedEnv = { ...coalescedEnv, ...sharedConfig._environment };
    } catch (err) {
      console.warn(`Warning: Could not load shared config: ${err.message}`);
    }
  }
  
  // Load habitat config with coalesced environment
  const habitatConfig = await loadConfig(habitatConfigPath, coalescedEnv, true);
  
  // Now perform template expansion on the final config with fully coalesced environment
  const finalConfig = expandTemplateObject(habitatConfig, habitatConfig);
  
  return finalConfig;
}

module.exports = {
  loadConfig,
  loadHabitatEnvironmentFromConfig
};