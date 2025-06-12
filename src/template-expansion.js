/**
 * Unified template expansion utility for Claude Habitat
 * 
 * Provides consistent template expansion across all contexts:
 * - File operations (src/dest paths, owner fields)
 * - Setup commands
 * - Volume mounts
 * - Any string value in configuration
 * 
 * Template Syntax:
 * - {env.VAR} or ${VAR} - Environment variables (uses path-helpers for resolution)
 * - {config.path.to.value} - Dot-notation access to any config field
 * - {name} - Shorthand for {config.name}
 * - {image.tag} - Shorthand for {config.image.tag}
 * 
 * Examples:
 * - "/home/{env.USER}/.ssh/config"
 * - "{config.repositories.0.path}/src"
 * - "{image.tag}-{config.container.startup_delay}"
 */

const { HabitatPathHelpers } = require('./path-helpers');

/**
 * Template expansion engine for configuration values
 */
class TemplateExpander {
  constructor(config, pathHelpers = null) {
    if (!config) {
      throw new Error('Config object is required for template expansion');
    }
    
    this.config = config;
    this.pathHelpers = pathHelpers || this._createPathHelpers(config);
  }
  
  /**
   * Create path helpers instance if not provided
   */
  _createPathHelpers(config) {
    try {
      return new HabitatPathHelpers(config);
    } catch (error) {
      // If path helpers can't be created (e.g., missing environment),
      // we'll handle environment variable resolution manually
      return null;
    }
  }
  
  /**
   * Expand all templates in a string value
   * @param {string} template - String containing template placeholders
   * @returns {string} Expanded string with all placeholders resolved
   */
  expand(template) {
    if (typeof template !== 'string') {
      return template;
    }
    
    let result = template;
    
    // Expand {env.VAR} and ${VAR} patterns using path helpers
    result = this._expandEnvironmentVariables(result);
    
    // Expand {config.path.to.value} patterns using dot notation
    result = this._expandConfigReferences(result);
    
    // Expand shorthand patterns ({name}, {image.tag}, etc.)
    result = this._expandShorthandPatterns(result);
    
    return result;
  }
  
  /**
   * Recursively expand templates in any object structure
   * @param {any} obj - Object, array, or primitive value to expand
   * @returns {any} Object with all template strings expanded
   */
  expandObject(obj) {
    if (typeof obj === 'string') {
      return this.expand(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.expandObject(item));
    }
    
    if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.expandObject(value);
      }
      return result;
    }
    
    return obj;
  }
  
  /**
   * Expand environment variable references: {env.VAR} and ${VAR}
   */
  _expandEnvironmentVariables(str) {
    // Use path helpers if available for proper environment resolution
    if (this.pathHelpers && this.pathHelpers.getEnvironment) {
      const env = this.pathHelpers.getEnvironment();
      
      // Expand ${VAR} syntax (bash-style)
      str = str.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (match, varName) => {
        return env[varName] || '';
      });
      
      // Expand {env.VAR} syntax
      str = str.replace(/\{env\.([A-Z_][A-Z0-9_]*)\}/g, (match, varName) => {
        return env[varName] || '';
      });
    } else {
      // Fallback: use config._environment if path helpers not available
      const env = this.config._environment || {};
      
      // Expand ${VAR} syntax (bash-style)
      str = str.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (match, varName) => {
        return env[varName] || '';
      });
      
      // Expand {env.VAR} syntax
      str = str.replace(/\{env\.([A-Z_][A-Z0-9_]*)\}/g, (match, varName) => {
        return env[varName] || '';
      });
    }
    
    return str;
  }
  
  /**
   * Expand config references using dot notation: {config.path.to.value}
   */
  _expandConfigReferences(str) {
    return str.replace(/\{config\.([^}]+)\}/g, (match, path) => {
      const value = this._getNestedValue(this.config, path);
      return value !== undefined ? String(value) : match;
    });
  }
  
  /**
   * Expand shorthand patterns for common config paths
   */
  _expandShorthandPatterns(str) {
    // {name} -> {config.name}
    str = str.replace(/\{name\}/g, (match) => {
      return this.config.name || match;
    });
    
    // {image.tag} -> {config.image.tag}
    str = str.replace(/\{image\.([^}]+)\}/g, (match, imagePath) => {
      const value = this._getNestedValue(this.config.image, imagePath);
      return value !== undefined ? String(value) : match;
    });
    
    // {container.startup_delay} -> {config.container.startup_delay}
    str = str.replace(/\{container\.([^}]+)\}/g, (match, containerPath) => {
      const value = this._getNestedValue(this.config.container, containerPath);
      return value !== undefined ? String(value) : match;
    });
    
    // {repositories.N.field} -> {config.repositories.N.field}
    str = str.replace(/\{repositories\.([^}]+)\}/g, (match, repoPath) => {
      const value = this._getNestedValue(this.config.repositories, repoPath);
      return value !== undefined ? String(value) : match;
    });
    
    return str;
  }
  
  /**
   * Get nested value from object using dot notation
   * @param {object} obj - Object to traverse
   * @param {string} path - Dot-separated path (e.g., "repositories.0.url")
   * @returns {any} Value at path, or undefined if not found
   */
  _getNestedValue(obj, path) {
    if (!obj || typeof obj !== 'object') return undefined;
    
    const segments = path.split('.');
    let current = obj;
    
    for (const segment of segments) {
      if (current === null || current === undefined) return undefined;
      
      // Handle array indices
      if (/^\d+$/.test(segment)) {
        const index = parseInt(segment, 10);
        if (Array.isArray(current) && index < current.length) {
          current = current[index];
        } else {
          return undefined;
        }
      } else {
        // Handle object properties
        if (typeof current === 'object' && segment in current) {
          current = current[segment];
        } else {
          return undefined;
        }
      }
    }
    
    return current;
  }
}

/**
 * Create a template expander for a given config
 * @param {object} config - Configuration object with _environment populated
 * @param {HabitatPathHelpers} pathHelpers - Optional path helpers instance
 * @returns {TemplateExpander} Template expander instance
 */
function createTemplateExpander(config, pathHelpers = null) {
  return new TemplateExpander(config, pathHelpers);
}

/**
 * Expand templates in a string using a config object
 * @param {string} template - Template string to expand
 * @param {object} config - Configuration object
 * @param {HabitatPathHelpers} pathHelpers - Optional path helpers instance
 * @returns {string} Expanded string
 */
function expandTemplate(template, config, pathHelpers = null) {
  const expander = createTemplateExpander(config, pathHelpers);
  return expander.expand(template);
}

/**
 * Expand templates in any object structure
 * @param {any} obj - Object to expand templates in
 * @param {object} config - Configuration object
 * @param {HabitatPathHelpers} pathHelpers - Optional path helpers instance
 * @returns {any} Object with expanded templates
 */
function expandTemplateObject(obj, config, pathHelpers = null) {
  const expander = createTemplateExpander(config, pathHelpers);
  return expander.expandObject(obj);
}

module.exports = {
  TemplateExpander,
  createTemplateExpander,
  expandTemplate,
  expandTemplateObject
};