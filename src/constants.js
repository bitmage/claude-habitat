/**
 * @module constants
 * @description Application constants for Claude Habitat
 * 
 * Centralized configuration values used throughout the application.
 * Includes timeouts, default paths, container settings, and other
 * cross-cutting configuration values.
 * 
 * @tests
 * - All unit tests: `npm test`
 * - Constants are tested implicitly through all module tests
 */

module.exports = {
  TIMEOUTS: {
    SEQUENCE_TIMEOUT: 30000,
    CONTAINER_START: 120000,
    DEFAULT_STARTUP_DELAY: 10
  },
  
  DOCKER: {
    TAG_PREFIX: 'claude-habitat-',
    BASE_TAG_SUFFIX: ':base'
  },
  
  FILESYSTEM: {
    REQUIRED_PERMISSIONS: '755',
    IGNORE_FILE: '.habignore'
  },
  
  CLI: {
    MAX_MENU_ITEMS: 9,
    TILDE_PREFIX_START: 10
  }
};