/**
 * Application constants
 * Centralized configuration values used throughout the application
 */

module.exports = {
  TIMEOUTS: {
    SEQUENCE_TIMEOUT: 30000,
    CONTAINER_START: 120000,
    DEFAULT_STARTUP_DELAY: 10
  },
  
  PATHS: {
    DEFAULT_WORKSPACE: '/workspace',
    CLAUDE_HABITAT_DIR: 'claude-habitat',
    SYSTEM_DIR: 'system',
    SHARED_DIR: 'shared',
    LOCAL_DIR: 'local'
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