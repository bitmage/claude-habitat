/**
 * @module timeout-utils.test
 * @description Tests for timeout parsing and phase timeout functionality
 */

const test = require('node:test');
const assert = require('node:assert');
const { parseDuration, getPhaseTimeout, formatDuration, validateTimeoutConfig } = require('../../src/timeout-utils');

test('parseDuration should parse seconds correctly', () => {
  assert.strictEqual(parseDuration('30s'), 30000);
  assert.strictEqual(parseDuration('5s'), 5000);
});

test('parseDuration should parse minutes correctly', () => {
  assert.strictEqual(parseDuration('2m'), 120000);
  assert.strictEqual(parseDuration('1m'), 60000);
});

test('parseDuration should parse hours correctly', () => {
  assert.strictEqual(parseDuration('1h'), 3600000);
  assert.strictEqual(parseDuration('2h'), 7200000);
});

test('parseDuration should parse days correctly', () => {
  assert.strictEqual(parseDuration('1d'), 86400000);
});

test('parseDuration should parse milliseconds correctly', () => {
  assert.strictEqual(parseDuration('500ms'), 500);
  assert.strictEqual(parseDuration('1500ms'), 1500);
});

test('parseDuration should handle numbers as milliseconds', () => {
  assert.strictEqual(parseDuration(5000), 5000);
  assert.strictEqual(parseDuration('5000'), 5000);
});

test('parseDuration should handle decimal values', () => {
  assert.strictEqual(parseDuration('1.5m'), 90000);
  assert.strictEqual(parseDuration('0.5h'), 1800000);
});

test('parseDuration should throw error for invalid formats', () => {
  assert.throws(() => parseDuration('invalid'), /Invalid duration format/);
  assert.throws(() => parseDuration(''), /Duration cannot be empty/);
  assert.throws(() => parseDuration('30x'), /Invalid duration format/);
});

test('parseDuration should throw error for negative durations', () => {
  assert.throws(() => parseDuration('-30s'), /Invalid duration format/);
  assert.throws(() => parseDuration(-5000), /Duration cannot be negative/);
});

test('getPhaseTimeout should return phase-specific timeout when available', () => {
  const config = {
    'per-phase': '2m',
    'repos': '10m'
  };
  assert.strictEqual(getPhaseTimeout(config, 'repos'), 600000); // 10 minutes
});

test('getPhaseTimeout should return per-phase default when phase-specific not available', () => {
  const config = {
    'per-phase': '3m'
  };
  assert.strictEqual(getPhaseTimeout(config, 'env'), 180000); // 3 minutes
});

test('getPhaseTimeout should return system default when no timeout config', () => {
  assert.strictEqual(getPhaseTimeout({}, 'scripts'), 120000); // 2 minutes default
  assert.strictEqual(getPhaseTimeout(undefined, 'test'), 120000);
});

test('getPhaseTimeout should prioritize phase-specific over per-phase', () => {
  const config = {
    'per-phase': '2m',
    'repos': '15m',
    'env': '30s'
  };
  assert.strictEqual(getPhaseTimeout(config, 'repos'), 900000); // 15 minutes
  assert.strictEqual(getPhaseTimeout(config, 'env'), 30000); // 30 seconds
  assert.strictEqual(getPhaseTimeout(config, 'scripts'), 120000); // per-phase default
});

test('formatDuration should format milliseconds', () => {
  assert.strictEqual(formatDuration(500), '500ms');
  assert.strictEqual(formatDuration(999), '999ms');
});

test('formatDuration should format seconds', () => {
  assert.strictEqual(formatDuration(30000), '30s');
  assert.strictEqual(formatDuration(5000), '5s');
});

test('formatDuration should format minutes', () => {
  assert.strictEqual(formatDuration(120000), '2m');
  assert.strictEqual(formatDuration(60000), '1m');
});

test('formatDuration should format hours', () => {
  assert.strictEqual(formatDuration(3600000), '1h');
  assert.strictEqual(formatDuration(7200000), '2h');
});

test('formatDuration should format complex durations', () => {
  assert.strictEqual(formatDuration(3661000), '1h 1m 1s'); // 1 hour, 1 minute, 1 second
  assert.strictEqual(formatDuration(90000), '1m 30s'); // 1 minute, 30 seconds
});

test('validateTimeoutConfig should return no errors for valid config', () => {
  const config = {
    'per-phase': '2m',
    'repos': '10m',
    'env': '30s'
  };
  assert.deepStrictEqual(validateTimeoutConfig(config), []);
});

test('validateTimeoutConfig should return no errors for empty config', () => {
  assert.deepStrictEqual(validateTimeoutConfig({}), []);
  assert.deepStrictEqual(validateTimeoutConfig(null), []);
  assert.deepStrictEqual(validateTimeoutConfig(undefined), []);
});

test('validateTimeoutConfig should return errors for invalid durations', () => {
  const config = {
    'per-phase': 'invalid',
    'repos': '10x',
    'env': ''
  };
  const errors = validateTimeoutConfig(config);
  assert.strictEqual(errors.length, 3);
  assert.ok(errors[0].includes('timeout.per-phase'));
  assert.ok(errors[1].includes('timeout.repos'));
  assert.ok(errors[2].includes('timeout.env'));
});

test('validateTimeoutConfig should validate mixed valid and invalid entries', () => {
  const config = {
    'per-phase': '2m',  // valid
    'repos': 'bad',     // invalid
    'env': '30s'        // valid
  };
  const errors = validateTimeoutConfig(config);
  assert.strictEqual(errors.length, 1);
  assert.ok(errors[0].includes('timeout.repos'));
});

test('should handle typical habitat timeout configuration', () => {
  const timeoutConfig = {
    'per-phase': '2m',
    'repos': '10m',      // Git clone can take longer
    'scripts': '5m',     // Build scripts might take time
    'env': '30s'         // Environment setup should be quick
  };

  // Validate the configuration
  assert.deepStrictEqual(validateTimeoutConfig(timeoutConfig), []);

  // Test phase resolution
  assert.strictEqual(getPhaseTimeout(timeoutConfig, 'repos'), 600000);  // 10m
  assert.strictEqual(getPhaseTimeout(timeoutConfig, 'scripts'), 300000); // 5m
  assert.strictEqual(getPhaseTimeout(timeoutConfig, 'env'), 30000);     // 30s
  assert.strictEqual(getPhaseTimeout(timeoutConfig, 'users'), 120000);  // 2m default
  assert.strictEqual(getPhaseTimeout(timeoutConfig, 'workdir'), 120000); // 2m default
});

test('should work with system default timeout only', () => {
  const timeoutConfig = {
    'per-phase': '5m'
  };

  assert.deepStrictEqual(validateTimeoutConfig(timeoutConfig), []);
  assert.strictEqual(getPhaseTimeout(timeoutConfig, 'repos'), 300000);  // 5m
  assert.strictEqual(getPhaseTimeout(timeoutConfig, 'env'), 300000);    // 5m
  assert.strictEqual(getPhaseTimeout(timeoutConfig, 'scripts'), 300000); // 5m
});