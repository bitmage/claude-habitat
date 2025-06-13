/**
 * @module habitat-path-helpers
 * @description Advanced path resolution utilities for Claude Habitat
 * 
 * Provides habitat-aware path resolution with environment state compilation.
 * Implements the path resolution standards for complex container workspace
 * scenarios with multiple path contexts.
 * 
 * @requires module:types - Domain model definitions
 * @requires module:standards/path-resolution - Path handling conventions
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/path-helpers.test.js`
 * - Run all tests: `npm test`
 */

const path = require('path');
const fs = require('fs').promises;
const yaml = require('js-yaml');
// @see {@link module:standards/path-resolution} for project-root relative path conventions using rel()
const { rel } = require('./utils');

/**
 * Habitat path helper class that compiles environment state and resolves paths
 * 
 * PHILOSOPHY: No Default Values
 * 
 * This class intentionally does NOT provide default values for environment variables.
 * Why? Because defaults hide configuration errors and create false confidence.
 * 
 * If a required environment variable like WORKDIR or PATH is not defined in the
 * configuration files, we want to know about it immediately with a clear error,
 * not discover it later when something mysteriously fails because our assumed
 * default doesn't match the actual container structure.
 * 
 * Configuration should be explicit. What you see in the config files is what you get.
 * No magic, no assumptions, no lies about the environment state.
 * 
 * Usage: 
 *   const habitat_rel = new HabitatPathHelpers(habitatConfig);
 *   habitat_rel('WORKDIR', 'CLAUDE.md');
 *   habitat_rel('SYSTEM_PATH', 'tools/bin/rg');
 */
class HabitatPathHelpers {
  constructor(habitatConfig) {
    if (!habitatConfig) {
      throw new Error('habitatConfig parameter is required');
    }
    
    this.habitatConfig = habitatConfig;
    this.isBypassHabitat = habitatConfig.claude?.bypass_habitat_construction || false;
    this.environment = {};
    
    // Compile environment state synchronously in constructor
    this._compileEnvironmentSync();
    
    // Make the instance callable by returning a function with instance methods
    const resolvePath = this.resolvePath.bind(this);
    Object.setPrototypeOf(resolvePath, HabitatPathHelpers.prototype);
    Object.assign(resolvePath, this);
    resolvePath.getEnvironment = this.getEnvironment.bind(this);
    
    return resolvePath;
  }
  
  /**
   * Synchronously compile environment state from config files
   * This is a simplified sync version for constructor use
   * 
   * IMPORTANT: This method does NOT provide any default values.
   * Environment variables must be explicitly defined in configuration files.
   * Missing required variables will cause errors when accessed, which is
   * intentional - fail fast with clear errors rather than mysterious issues later.
   */
  _compileEnvironmentSync() {
    // Start with empty environment - no defaults!
    this.environment = {};
    
    if (this.isBypassHabitat) {
      // For bypass habitats, use environment from habitat config only
      if (this.habitatConfig.env) {
        this._mergeEnvironment(this.habitatConfig.env);
      }
      // No fallback defaults - if env is not defined, environment stays empty
    } else {
      // For normal habitats, if env is provided in the habitat config (e.g., for testing),
      // use it. Otherwise, the async createHabitatPathHelpers will load system and shared configs.
      if (this.habitatConfig.env) {
        this._mergeEnvironment(this.habitatConfig.env);
      }
      // If no env provided, environment remains empty until configs are loaded asynchronously
    }
  }
  
  /**
   * Merge environment variables into the current environment state
   * @param {Array} envArray - Array of environment variable strings (KEY=value format)
   */
  _mergeEnvironment(envArray) {
    if (!Array.isArray(envArray)) return;
    
    for (const envStr of envArray) {
      if (typeof envStr !== 'string') continue;
      
      const match = envStr.match(/^([A-Z_]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        this.environment[key] = this._resolveVariableReferences(value, key);
      }
    }
  }
  
  /**
   * Resolve variable references in a value (e.g., ${WORKDIR}/habitat)
   * @param {string} value - Value that may contain ${VAR} references
   * @param {string} currentKey - The key being resolved (to detect self-references)
   * @returns {string} Resolved value
   */
  _resolveVariableReferences(value, currentKey = null) {
    if (typeof value !== 'string') return value;
    
    return value.replace(/\$\{([A-Z_]+)\}/g, (match, varName) => {
      // Always try to resolve from current environment first
      if (this.environment[varName]) {
        return this.environment[varName];
      }
      
      // Handle self-references only when the variable doesn't exist yet
      if (currentKey && varName === currentKey) {
        return '';
      }
      
      return match; // Return unresolved for other variables
    });
  }
  
  /**
   * Resolve a path based on environment variable and path segments
   * @param {string} envVar - Environment variable name (e.g., 'WORKDIR', 'SYSTEM_PATH')
   * @param {...string} pathSegments - Path segments to join
   * @returns {string} Resolved absolute path
   * @throws {Error} If the environment variable is not defined
   * 
   * NOTE: This method intentionally throws errors for undefined variables.
   * This forces configuration to be explicit and complete, preventing
   * mysterious failures from incorrect default assumptions.
   */
  resolvePath(envVar, ...pathSegments) {
    if (!envVar) {
      throw new Error('Environment variable name is required');
    }
    
    const basePath = this.environment[envVar];
    if (!basePath) {
      throw new Error(
        `Environment variable '${envVar}' is not defined in configuration. ` +
        `Please ensure it is defined in your habitat's config.yaml, ` +
        `shared/config.yaml, or system/config.yaml files.`
      );
    }
    
    if (pathSegments.length === 0) {
      return basePath;
    }
    
    return path.posix.join(basePath, ...pathSegments);
  }
  
  /**
   * Get the entire compiled environment state
   * @returns {Object} Environment variables
   */
  getEnvironment() {
    return { ...this.environment };
  }
  
  /**
   * Validate that required environment variables are defined
   * @param {string[]} requiredVars - List of required variable names
   * @throws {Error} If any required variables are missing
   * 
   * This method supports the fail-fast philosophy by validating configuration
   * early in the process rather than waiting for runtime failures.
   */
  validateRequired(requiredVars) {
    const missing = [];
    for (const varName of requiredVars) {
      if (!this.environment[varName]) {
        missing.push(varName);
      }
    }
    
    if (missing.length > 0) {
      throw new Error(
        `Required environment variables are not defined: ${missing.join(', ')}. ` +
        `Please check your configuration files.`
      );
    }
  }
}

/**
 * Create an async version of HabitatPathHelpers that loads all configs
 * @param {object} habitatConfig - The habitat configuration object
 * @returns {Promise<HabitatPathHelpers>} Path helper instance
 */
async function createHabitatPathHelpers(habitatConfig) {
  if (!habitatConfig) {
    throw new Error('habitatConfig parameter is required');
  }
  
  const helper = new HabitatPathHelpers(habitatConfig);
  
  // For normal habitats, load and merge system and shared configs
  if (!helper.isBypassHabitat) {
    try {
      // Load system config
      const systemConfigPath = rel('system/config.yaml');
      const systemConfigData = await fs.readFile(systemConfigPath, 'utf8');
      const systemConfig = yaml.load(systemConfigData);
      if (systemConfig.env) {
        helper._mergeEnvironment(systemConfig.env);
      }
      
      // Load shared config
      const sharedConfigPath = rel('shared/config.yaml');
      const sharedConfigData = await fs.readFile(sharedConfigPath, 'utf8');
      const sharedConfig = yaml.load(sharedConfigData);
      if (sharedConfig.env) {
        helper._mergeEnvironment(sharedConfig.env);
      }
    } catch (err) {
      // If configs don't exist, continue with defaults
      console.warn('Warning: Could not load system/shared configs:', err.message);
    }
    
    // Merge local habitat config env last
    if (habitatConfig.env) {
      helper._mergeEnvironment(habitatConfig.env);
    }
  }
  
  return helper;
}

// Legacy function exports for backward compatibility
function normalizeContainerPath(containerPath) {
  if (!containerPath) {
    return containerPath;
  }
  return containerPath.replace(/\\/g, '/');
}

function joinContainerPath(...segments) {
  return path.posix.join(...segments);
}

// These legacy functions now create a temporary helper instance
function getHabitatInfrastructurePath(component, habitatConfig) {
  if (!component) {
    throw new Error('component parameter is required');
  }
  if (!habitatConfig) {
    throw new Error('habitatConfig parameter is required');
  }
  
  const helper = new HabitatPathHelpers(habitatConfig);
  const envVarMap = {
    'system': 'SYSTEM_PATH',
    'shared': 'SHARED_PATH',
    'local': 'LOCAL_PATH'
  };
  const envVar = envVarMap[component];
  if (!envVar) {
    throw new Error(`Invalid component: ${component}`);
  }
  return helper(envVar);
}

function getAllHabitatPaths(habitatConfig) {
  const helper = new HabitatPathHelpers(habitatConfig);
  return {
    system: helper('SYSTEM_PATH'),
    shared: helper('SHARED_PATH'),
    local: helper('LOCAL_PATH'),
    habitat: helper('HABITAT_PATH'),
    workdir: helper('WORKDIR')
  };
}

function getWorkDir(habitatConfig) {
  const helper = new HabitatPathHelpers(habitatConfig);
  return helper('WORKDIR');
}

function getHabitatPath(habitatConfig) {
  const helper = new HabitatPathHelpers(habitatConfig);
  return helper('HABITAT_PATH');
}

module.exports = {
  HabitatPathHelpers,
  createHabitatPathHelpers,
  // Legacy exports for backward compatibility
  getHabitatInfrastructurePath,
  getAllHabitatPaths,
  normalizeContainerPath,
  joinContainerPath,
  getWorkDir,
  getHabitatPath
};