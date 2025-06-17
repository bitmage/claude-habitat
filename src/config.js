/**
 * @module config
 * @description Configuration loading and processing for Claude Habitat
 * 
 * Handles loading habitat configurations from YAML files, processing environment
 * variables, and managing the configuration chain. Supports environment variable
 * expansion and validation integration.
 * 
 * ## Configuration System
 * 
 * Uses a three-layer configuration system with environment variables as the
 * coordination mechanism between system, shared, and habitat configurations.
 * 
 * ### Loading Order
 * 1. **System** (`system/config.yaml`) - Infrastructure variables
 * 2. **Shared** (`shared/config.yaml`) - User preferences and paths  
 * 3. **Habitat** (`habitats/PROJECT/config.yaml`) - Project-specific configuration
 * 
 * ### Environment Variable Syntax
 * Two syntaxes supported for referencing environment variables:
 * - **Bash-Style**: `${VAR}` - `WORKSPACE_PATH=${WORKDIR}/projects`
 * - **Claude Habitat**: `{env.VAR}` - `dest: "{env.WORKSPACE_PATH}/config.json"`
 * 
 * ### Required Environment Variables
 * *These values are required and control automatic configurations of the habitat.*
 * - **WORKDIR**: `/workspace` - Main working directory
 * - **HABITAT_PATH**: `${WORKDIR}/claude-habitat` - Infrastructure location
 * - **SYSTEM_PATH**: `${HABITAT_PATH}/system` - System tools directory
 * - **SHARED_PATH**: `${HABITAT_PATH}/shared` - User configuration directory
 * - **LOCAL_PATH**: `${HABITAT_PATH}/local` - Habitat-specific directory
 * - **USER**: User account for container operations
 * 
 * @requires module:types - Domain model definitions
 * @requires module:config-validation - Configuration validation logic
 * @requires module:standards/path-resolution - Path handling conventions
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/config-validation.test.js`
 * - Run all tests: `npm test`
 */

const yaml = require('js-yaml');
const fs = require('fs').promises;
// @see {@link module:standards/path-resolution} for project-root relative path conventions using rel()
const { fileExists, rel } = require('./utils');
const { validateHabitatConfig, getConfigValidationHelp } = require('./config-validation');

/**
 * Get file timestamp for debugging
 */
async function getFileTimestamp(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime.toISOString();
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

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
    return env.hasOwnProperty(varName) ? env[varName] : match;
  });
  
  // Expand {env.VAR} syntax
  result = result.replace(/\{env\.([^}]+)\}/g, (match, varName) => {
    return env.hasOwnProperty(varName) ? env[varName] : match;
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
    
    // Note: {container.user} and {container.work_dir} template patterns have been removed
    // Use {env.USER} and {env.WORKDIR} instead
    
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
  
  // Note: Auto-population of container.work_dir removed - use WORKDIR environment variable directly
  
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
 * Load config with environment variable chain: system → shared → habitat
 */
async function loadHabitatEnvironmentFromConfig(habitatConfigPath) {
  // DEBUG: Log config loading
  console.log(`🔍 [DEBUG] loadHabitatEnvironmentFromConfig called for ${habitatConfigPath}`);
  
  // Start with empty environment
  let accumulatedEnv = {};
  
  // 1. Load system config first (sets foundational variables like WORKDIR)
  const systemConfigPath = rel('system/config.yaml');
  if (await fileExists(systemConfigPath)) {
    const systemConfig = await loadConfig(systemConfigPath, accumulatedEnv, false); // Don't validate as habitat
    accumulatedEnv = { ...accumulatedEnv, ...systemConfig._environment };
  }
  
  // 2. Load shared config second (can reference system variables and add user-specific ones)
  const sharedConfigPath = rel('shared/config.yaml');
  if (await fileExists(sharedConfigPath)) {
    const sharedConfig = await loadConfig(sharedConfigPath, accumulatedEnv, false); // Don't validate as habitat
    accumulatedEnv = { ...accumulatedEnv, ...sharedConfig._environment };
  }
  
  // 3. Load habitat config last (can reference system and shared variables)
  const habitatConfig = await loadConfig(habitatConfigPath, accumulatedEnv, true); // Validate as habitat
  
  // DEBUG: Log final config details
  console.log(`🔍 [DEBUG] Final habitat config loaded:`);
  console.log(`  - Name: ${habitatConfig.name}`);
  console.log(`  - Tests section exists: ${!!habitatConfig.tests}`);
  if (habitatConfig.tests) {
    console.log(`  - Tests content: ${JSON.stringify(habitatConfig.tests, null, 2)}`);
  }
  console.log(`  - Config file timestamp: ${await getFileTimestamp(habitatConfigPath)}`);
  
  return habitatConfig;
}

module.exports = {
  loadConfig,
  loadHabitatEnvironmentFromConfig
};