/**
 * @module errors
 * @description Centralized error classes for Claude Habitat
 * 
 * Provides consistent error handling across the application with structured
 * error codes, details, and recovery suggestions. Implements the error
 * philosophy of always providing a path forward.
 * 
 * ## Common Troubleshooting Patterns
 * 
 * ### Repository Cloning Issues
 * - **Symptom**: Script exits during repository cloning without errors
 * - **Cause**: Bash arithmetic in loops triggering `set -e` on zero result
 * - **Solution**: Use explicit assignment `repo_idx=$((repo_idx + 1))` instead of `((repo_idx++))`
 * 
 * ### Setup Command Failures  
 * - **Symptom**: Multi-line setup commands fail unexpectedly
 * - **Cause**: Line-ending issues or improper YAML formatting
 * - **Solution**: Use proper YAML literal blocks and check line endings
 * 
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * ### Container Startup Issues
 * - **Symptom**: Container exits immediately or services don't start
 * - **Cause**: Missing dependencies or improper init commands
 * - **Solution**: Check logs with `docker logs <container>` and verify Dockerfile
 * 
 * ### Debug Methods
 * - Enable debug mode: `set -x` in scripts
 * - Check container logs: `docker logs <container>`
 * - Verify image build: `docker build --no-cache`
 * - Test commands manually: `docker exec -it <container> bash`
 * 
 * @requires module:standards/error-handling - Error recovery patterns
 * 
 * @tests
 * - All tests: `npm test`
 * - Error handling is tested across all module tests
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