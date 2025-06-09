/**
 * Configuration validation using JSON Schema with terse helpers
 * 
 * Provides a concise way to define and validate configuration schemas
 * while maintaining the power and standard compliance of JSON Schema.
 */

// Note: ajv is a lightweight, fast JSON Schema validator
// Install with: npm install ajv ajv-formats
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Create AJV instance with useful defaults
const ajv = new Ajv({ 
  allErrors: true,      // Collect all errors, not just first
  useDefaults: true,    // Apply default values from schema
  removeAdditional: false, // Keep additional properties
  coerceTypes: true     // Convert types when possible (string "123" -> number 123)
});

// Add common formats (email, uri, date, etc.)
addFormats(ajv);

/**
 * Terse schema helper functions
 * These make schema definitions more readable and less verbose
 */
const types = {
  string: (opts = {}) => ({ type: 'string', ...opts }),
  number: (opts = {}) => ({ type: 'number', ...opts }),
  integer: (opts = {}) => ({ type: 'integer', ...opts }),
  boolean: (opts = {}) => ({ type: 'boolean', ...opts }),
  array: (items, opts = {}) => ({ type: 'array', items, ...opts }),
  object: (properties, opts = {}) => {
    const required = Object.keys(properties).filter(k => properties[k].required === true);
    
    // Remove the 'required' flag from properties since it's handled at object level
    const cleanProperties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => {
        const { required, ...cleanValue } = value;
        return [key, cleanValue];
      })
    );
    
    return { 
      type: 'object', 
      properties: cleanProperties,
      ...(required.length > 0 && { required }),
      additionalProperties: opts.strict === true ? false : true,
      ...opts 
    };
  },
  oneOf: (schemas, opts = {}) => ({ oneOf: schemas, ...opts }),
  anyOf: (schemas, opts = {}) => ({ anyOf: schemas, ...opts }),
  enum: (values, opts = {}) => ({ enum: values, ...opts })
};

// Common string patterns
const patterns = {
  dockerImage: '^[a-z0-9]+(([._]|__|[-]*)[a-z0-9]+)*(:[a-zA-Z0-9_][a-zA-Z0-9._-]*)?$',
  dockerTag: '^[a-zA-Z0-9_][a-zA-Z0-9._-]*$',
  absolutePath: '^/',
  environmentVar: '^[A-Z_][A-Z0-9_]*=.*$',
  githubUrl: '^https://github\\.com/[\\w.-]+/[\\w.-]+(\\.git)?$',
  habitatName: '^[a-z][a-z0-9-]*$'
};

const { string, number, integer, boolean, array, object, oneOf, anyOf, enum: enumSchema } = types;

/**
 * Claude Habitat configuration schema
 */
const habitatConfigSchema = object({
  name: string({ 
    required: true, 
    pattern: patterns.habitatName,
    description: 'Habitat name (lowercase, alphanumeric with hyphens)'
  }),
  
  description: string({ 
    required: true,
    minLength: 1,
    description: 'Human-readable description of the habitat'
  }),
  
  image: object({
    base: string({ 
      pattern: patterns.dockerImage,
      description: 'Base Docker image to extend from'
    }),
    dockerfile: string({
      description: 'Path to Dockerfile (relative to config)'
    }),
    tag: string({ 
      required: true,
      pattern: patterns.dockerTag,
      description: 'Tag for the built image'
    })
  }),
  
  repositories: array(object({
    url: string({ 
      required: true, 
      format: 'uri',
      description: 'Repository URL (HTTPS Git URL)'
    }),
    path: string({ 
      required: true,
      pattern: patterns.absolutePath,
      description: 'Container path where repository will be cloned'
    }),
    branch: string({ 
      default: 'main',
      description: 'Git branch to checkout'
    }),
    shallow: boolean({
      default: false,
      description: 'Use shallow clone (--depth 1)'
    }),
    access: enumSchema(['read', 'write'], {
      default: 'write',
      description: 'Required access level for repository'
    })
  }), {
    description: 'Git repositories to clone into the habitat'
  }),
  
  environment: array(string({
    pattern: patterns.environmentVar,
    description: 'Environment variable in KEY=value format'
  }), {
    description: 'Environment variables to set in the container'
  }),
  
  container: object({
    work_dir: string({ 
      pattern: patterns.absolutePath,
      description: 'Working directory in container'
    }),
    user: string({ 
      required: true,
      description: 'User to run as in container'
    }),
    init_command: string({
      description: 'Command to run as PID 1 in container'
    }),
    startup_delay: integer({
      minimum: 0,
      maximum: 300,
      default: 5,
      description: 'Seconds to wait after container start'
    })
  }),
  
  files: array(object({
    src: string({ 
      required: true,
      description: 'Source path (on host or relative to config)'
    }),
    dest: string({ 
      required: true,
      pattern: patterns.absolutePath,
      description: 'Destination path in container'
    }),
    mode: string({
      pattern: '^[0-7]{3,4}$',
      description: 'File permissions in octal (e.g., 644, 755)'
    }),
    owner: string({
      description: 'File owner in container'
    }),
    description: string({
      description: 'Human-readable description of file operation'
    })
  }), {
    description: 'Files to copy into the container'
  }),
  
  setup: object({
    root: array(string(), {
      description: 'Commands to run as root during setup'
    }),
    user: object({
      run_as: string({
        description: 'User to run user setup commands as'
      }),
      commands: array(string(), {
        description: 'Commands to run as specified user'
      })
    })
  }),
  
  volumes: array(string({
    description: 'Docker volume mount (host:container format)'
  })),
  
  tests: array(string({
    description: 'Test script paths (relative to habitat directory)'
  })),
  
  claude: object({
    command: string({
      default: 'claude',
      description: 'Claude command to run in container'
    }),
    tty: boolean({
      default: true,
      description: 'Allocate TTY for Claude session'
    })
  }),
  
  'verify-fs': object({
    required_files: array(string({
      description: 'File path that must exist (supports environment variable expansion)'
    }))
  }),
  
  // Allow bypass mode for special habitats like claude-habitat itself
  bypass_habitat_construction: boolean({
    default: false,
    description: 'Skip standard habitat construction (for self-contained habitats)'
  })
});

/**
 * System configuration schema (system/config.yaml)
 */
const systemConfigSchema = object({
  name: string({
    default: 'system-setup',
    description: 'System configuration name'
  }),
  
  description: string({
    default: 'Core infrastructure setup for all claude-habitat containers',
    description: 'System configuration description'
  }),
  
  environment: array(string({
    pattern: patterns.environmentVar
  })),
  
  container: object({
    work_dir: string({ pattern: patterns.absolutePath }),
    user: string()
  }),
  
  files: array(object({
    src: string({ required: true }),
    dest: string({ required: true }),
    mode: string(),
    owner: string(),
    description: string()
  })),
  
  setup: object({
    root: array(string()),
    user: object({
      run_as: string(),
      commands: array(string())
    })
  }),
  
  tests: array(string()),
  
  'verify-fs': object({
    required_files: array(string())
  })
});

/**
 * Shared configuration schema (shared/config.yaml)
 */
const sharedConfigSchema = object({
  name: string({
    default: 'shared-setup',
    description: 'Shared configuration name'
  }),
  
  description: string({
    default: 'User preferences and shared configuration for all habitats',
    description: 'Shared configuration description'
  }),
  
  environment: array(string({
    pattern: patterns.environmentVar
  })),
  
  files: array(object({
    src: string({ required: true }),
    dest: string({ required: true }),
    mode: string(),
    owner: string(),
    description: string()
  })),
  
  setup: object({
    user: object({
      run_as: string(),
      commands: array(string())
    })
  }),
  
  tests: array(string()),
  
  'verify-fs': object({
    required_files: array(string())
  })
});

/**
 * Create a validator function from a schema
 * 
 * @param {Object} schema - JSON Schema object
 * @returns {Function} - Validator function
 */
function createValidator(schema) {
  const validate = ajv.compile(schema);
  
  return (data) => {
    const isValid = validate(data);
    
    if (isValid) {
      return { 
        valid: true, 
        data: data // Data may have been modified (defaults applied, types coerced)
      };
    }
    
    // Format errors nicely
    const errors = validate.errors.map(err => ({
      path: err.instancePath || 'root',
      property: err.instancePath ? err.instancePath.split('/').pop() : 'root',
      message: err.message,
      value: err.data,
      allowedValues: err.params?.allowedValues,
      pattern: err.params?.pattern
    }));
    
    return { valid: false, errors };
  };
}

/**
 * Validate habitat configuration with helpful error messages
 */
const validateHabitatConfig = createValidator(habitatConfigSchema);

/**
 * Validate system configuration
 */
const validateSystemConfig = createValidator(systemConfigSchema);

/**
 * Validate shared configuration
 */
const validateSharedConfig = createValidator(sharedConfigSchema);

/**
 * Format validation errors for display
 * 
 * @param {Array} errors - Array of validation errors
 * @returns {string} - Formatted error message
 */
function formatValidationErrors(errors) {
  if (!errors || errors.length === 0) {
    return 'Configuration is valid';
  }
  
  const lines = ['Configuration validation errors:'];
  
  for (const error of errors) {
    let line = `  • ${error.path || 'root'}`;
    
    if (error.property && error.property !== 'root') {
      line += `.${error.property}`;
    }
    
    line += `: ${error.message}`;
    
    if (error.allowedValues) {
      line += ` (allowed: ${error.allowedValues.join(', ')})`;
    }
    
    if (error.pattern) {
      line += ` (pattern: ${error.pattern})`;
    }
    
    if (error.value !== undefined) {
      line += ` (got: ${JSON.stringify(error.value)})`;
    }
    
    lines.push(line);
  }
  
  return lines.join('\n');
}

/**
 * Comprehensive config validation with suggestions
 * 
 * @param {Object} config - Configuration to validate
 * @param {string} type - Configuration type ('habitat', 'system', 'shared')
 * @returns {Object} - Validation result with suggestions
 */
function validateConfig(config, type = 'habitat') {
  let validator;
  
  switch (type) {
    case 'habitat':
      validator = validateHabitatConfig;
      break;
    case 'system':
      validator = validateSystemConfig;
      break;
    case 'shared':
      validator = validateSharedConfig;
      break;
    default:
      throw new Error(`Unknown config type: ${type}`);
  }
  
  const result = validator(config);
  
  if (!result.valid) {
    result.formattedErrors = formatValidationErrors(result.errors);
    result.suggestions = generateSuggestions(result.errors, type);
  }
  
  return result;
}

/**
 * Generate helpful suggestions based on validation errors
 * 
 * @param {Array} errors - Validation errors
 * @param {string} type - Configuration type
 * @returns {Array} - Array of suggestion strings
 */
function generateSuggestions(errors, type) {
  const suggestions = [];
  
  for (const error of errors) {
    if (error.property === 'name' && error.message.includes('pattern')) {
      suggestions.push('Habitat names should be lowercase, start with a letter, and contain only letters, numbers, and hyphens');
    }
    
    if (error.property === 'url' && error.message.includes('format')) {
      suggestions.push('Repository URLs should be HTTPS Git URLs (e.g., https://github.com/user/repo.git)');
    }
    
    if (error.property === 'path' && error.message.includes('pattern')) {
      suggestions.push('Container paths should be absolute (start with /)');
    }
    
    if (error.path.includes('environment') && error.message.includes('pattern')) {
      suggestions.push('Environment variables should be in KEY=value format with uppercase keys');
    }
    
    if (error.property === 'mode' && error.message.includes('pattern')) {
      suggestions.push('File modes should be octal numbers (e.g., 644, 755, 600)');
    }
    
    if (error.message.includes('required property')) {
      const missing = error.message.match(/'([^']+)'/)?.[1];
      if (missing) {
        suggestions.push(`Add required property '${missing}' to your configuration`);
      }
    }
  }
  
  return suggestions;
}

module.exports = {
  types,
  patterns,
  createValidator,
  validateConfig,
  validateHabitatConfig,
  validateSystemConfig,
  validateSharedConfig,
  formatValidationErrors,
  generateSuggestions
};