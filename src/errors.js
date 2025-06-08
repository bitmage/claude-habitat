/**
 * Centralized error classes for Claude Habitat
 * Provides consistent error handling across the application
 */

/**
 * Base error class for all Claude Habitat errors
 */
class HabitatError extends Error {
  constructor(message, code = 'HABITAT_ERROR', details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Configuration-related errors
 */
class ConfigurationError extends HabitatError {
  constructor(message, details = {}) {
    super(message, 'CONFIG_ERROR', details);
  }
}

/**
 * Docker container operation errors
 */
class ContainerError extends HabitatError {
  constructor(message, details = {}) {
    super(message, 'CONTAINER_ERROR', details);
  }
}

/**
 * Repository access or cloning errors
 */
class RepositoryError extends HabitatError {
  constructor(message, details = {}) {
    super(message, 'REPOSITORY_ERROR', details);
  }
}

/**
 * File system operation errors
 */
class FilesystemError extends HabitatError {
  constructor(message, details = {}) {
    super(message, 'FILESYSTEM_ERROR', details);
  }
}

/**
 * GitHub authentication or API errors
 */
class GitHubError extends HabitatError {
  constructor(message, details = {}) {
    super(message, 'GITHUB_ERROR', details);
  }
}

/**
 * CLI argument parsing errors
 */
class CliError extends HabitatError {
  constructor(message, details = {}) {
    super(message, 'CLI_ERROR', details);
  }
}

/**
 * Test execution errors
 */
class TestError extends HabitatError {
  constructor(message, details = {}) {
    super(message, 'TEST_ERROR', details);
  }
}

/**
 * Helper function to create error with suggestions
 */
function createErrorWithSuggestion(ErrorClass, message, suggestion, details = {}) {
  const error = new ErrorClass(message, { ...details, suggestion });
  return error;
}

/**
 * Helper function to wrap errors with context
 */
function wrapError(originalError, context, ErrorClass = HabitatError) {
  const message = `${context}: ${originalError.message}`;
  const details = {
    originalError: originalError.message,
    stack: originalError.stack
  };
  
  return new ErrorClass(message, details);
}

module.exports = {
  HabitatError,
  ConfigurationError,
  ContainerError,
  RepositoryError,
  FilesystemError,
  GitHubError,
  CliError,
  TestError,
  createErrorWithSuggestion,
  wrapError
};