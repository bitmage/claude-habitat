/**
 * @module timeout-utils
 * @description Utilities for parsing timeout durations and managing phase timeouts
 * 
 * Provides duration parsing for timeout configurations in the format:
 * - 30s (seconds)
 * - 2m (minutes) 
 * - 1h (hours)
 * - 1d (days)
 * 
 * @see {@link src/config.js} for configuration loading and processing
 * @see {@link src/container-operations.js} for timeout application in docker commands
 */

/**
 * Parse duration string into milliseconds
 * 
 * Supports the following formats:
 * - 30s -> 30 seconds
 * - 2m -> 2 minutes
 * - 1h -> 1 hour
 * - 1d -> 1 day
 * - 500ms -> 500 milliseconds
 * - 1000 -> 1000 milliseconds (plain number)
 * 
 * @param {string|number} duration - Duration string or number in milliseconds
 * @returns {number} Duration in milliseconds
 * @throws {Error} If duration format is invalid
 * 
 * @example
 * parseDuration('30s')  // 30000
 * parseDuration('2m')   // 120000
 * parseDuration('1h')   // 3600000
 * parseDuration(5000)   // 5000
 */
function parseDuration(duration) {
  if (typeof duration === 'number') {
    if (duration < 0) {
      throw new Error('Duration cannot be negative');
    }
    return duration;
  }

  if (typeof duration !== 'string') {
    throw new Error('Duration must be a string or number');
  }

  duration = duration.trim();
  
  if (duration === '') {
    throw new Error('Duration cannot be empty');
  }

  // Handle plain numbers (assumed to be milliseconds)
  if (/^\d+$/.test(duration)) {
    const ms = parseInt(duration, 10);
    if (ms < 0) {
      throw new Error('Duration cannot be negative');
    }
    return ms;
  }

  // Parse duration with unit
  const match = duration.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Expected format like "30s", "2m", "1h", "1d", or "500ms"`);
  }

  const [, value, unit] = match;
  const numValue = parseFloat(value);
  
  if (numValue < 0) {
    throw new Error('Duration cannot be negative');
  }

  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  const multiplier = multipliers[unit];
  if (!multiplier) {
    throw new Error(`Unsupported duration unit: ${unit}`);
  }

  const result = Math.floor(numValue * multiplier);
  if (result === 0 && numValue > 0) {
    throw new Error(`Duration too small: ${duration} (results in 0ms)`);
  }

  return result;
}

/**
 * Get timeout value for a specific phase
 * 
 * Priority order:
 * 1. Phase-specific timeout (timeout.PHASE_NAME)
 * 2. Per-phase default (timeout["per-phase"])
 * 3. System default (120000ms = 2 minutes)
 * 
 * @param {object} timeoutConfig - Timeout configuration from config
 * @param {string} phaseName - Name of the phase (e.g., 'repos', 'env')
 * @returns {number} Timeout in milliseconds
 * 
 * @example
 * const config = { "per-phase": "2m", "repos": "10m" };
 * getPhaseTimeout(config, 'repos')  // 600000 (10 minutes)
 * getPhaseTimeout(config, 'env')    // 120000 (2 minutes from per-phase)
 * getPhaseTimeout({}, 'scripts')    // 120000 (system default)
 */
function getPhaseTimeout(timeoutConfig = {}, phaseName) {
  const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes

  // 1. Check for phase-specific timeout
  if (timeoutConfig[phaseName]) {
    return parseDuration(timeoutConfig[phaseName]);
  }

  // 2. Check for per-phase default
  if (timeoutConfig['per-phase']) {
    return parseDuration(timeoutConfig['per-phase']);
  }

  // 3. Use system default
  return DEFAULT_TIMEOUT_MS;
}

/**
 * Format milliseconds into human-readable duration string
 * 
 * @param {number} ms - Milliseconds
 * @returns {string} Human-readable duration
 * 
 * @example
 * formatDuration(30000)   // "30s"
 * formatDuration(120000)  // "2m"
 * formatDuration(3661000) // "1h 1m 1s"
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours % 24 > 0) parts.push(`${hours % 24}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  if (seconds % 60 > 0) parts.push(`${seconds % 60}s`);

  return parts.join(' ');
}

/**
 * Validate timeout configuration object
 * 
 * @param {object} timeoutConfig - Timeout configuration to validate
 * @returns {string[]} Array of validation errors (empty if valid)
 * 
 * @example
 * validateTimeoutConfig({ "per-phase": "2m", "repos": "10m" }) // []
 * validateTimeoutConfig({ "per-phase": "invalid" })            // ["Invalid duration format..."]
 */
function validateTimeoutConfig(timeoutConfig) {
  const errors = [];
  
  if (!timeoutConfig || typeof timeoutConfig !== 'object') {
    return errors; // Empty config is valid (uses defaults)
  }

  for (const [key, value] of Object.entries(timeoutConfig)) {
    try {
      parseDuration(value);
    } catch (error) {
      errors.push(`timeout.${key}: ${error.message}`);
    }
  }

  return errors;
}

module.exports = {
  parseDuration,
  getPhaseTimeout,
  formatDuration,
  validateTimeoutConfig
};