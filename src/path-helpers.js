const path = require('path');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const { rel } = require('./utils');

/**
 * Habitat path helper class that compiles environment state and resolves paths
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
   */
  _compileEnvironmentSync() {
    // Always start with base WORKDIR
    this.environment = {
      WORKDIR: '/workspace'
    };
    
    if (this.isBypassHabitat) {
      // For bypass habitats, use environment from habitat config only
      if (this.habitatConfig.env) {
        this._mergeEnvironment(this.habitatConfig.env);
      } else {
        // Fallback for bypass habitats without env
        this.environment = {
          WORKDIR: '/workspace',
          HABITAT_PATH: '/workspace',
          SYSTEM_PATH: '/workspace/system',
          SHARED_PATH: '/workspace/shared',
          LOCAL_PATH: `/workspace/habitats/${this.habitatConfig.name}`
        };
      }
    } else {
      // For normal habitats, we'll use the standard environment structure
      // The async createHabitatPathHelpers will load system and shared configs
      this.environment = {
        WORKDIR: '/workspace',
        HABITAT_PATH: '/workspace/habitat',
        SYSTEM_PATH: '/workspace/habitat/system',
        SHARED_PATH: '/workspace/habitat/shared',
        LOCAL_PATH: '/workspace/habitat/local'
      };
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
        this.environment[key] = this._resolveVariableReferences(value);
      }
    }
  }
  
  /**
   * Resolve variable references in a value (e.g., ${WORKDIR}/habitat)
   * @param {string} value - Value that may contain ${VAR} references
   * @returns {string} Resolved value
   */
  _resolveVariableReferences(value) {
    if (typeof value !== 'string') return value;
    
    return value.replace(/\$\{([A-Z_]+)\}/g, (match, varName) => {
      return this.environment[varName] || match;
    });
  }
  
  /**
   * Resolve a path based on environment variable and path segments
   * @param {string} envVar - Environment variable name (e.g., 'WORKDIR', 'SYSTEM_PATH')
   * @param {...string} pathSegments - Path segments to join
   * @returns {string} Resolved absolute path
   */
  resolvePath(envVar, ...pathSegments) {
    if (!envVar) {
      throw new Error('Environment variable name is required');
    }
    
    const basePath = this.environment[envVar];
    if (!basePath) {
      throw new Error(`Environment variable '${envVar}' not found in compiled environment`);
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
      const systemConfigPath = rel('system', 'config.yaml');
      const systemConfigData = await fs.readFile(systemConfigPath, 'utf8');
      const systemConfig = yaml.load(systemConfigData);
      if (systemConfig.env) {
        helper._mergeEnvironment(systemConfig.env);
      }
      
      // Load shared config
      const sharedConfigPath = rel('shared', 'config.yaml');
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