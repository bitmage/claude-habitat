/**
 * @module phase-hash
 * @description Phase-based hashing for intelligent cache invalidation
 * 
 * Calculates content hashes for different configuration phases to enable
 * selective rebuilds. Each phase gets its own hash based on the relevant
 * subset of the coalesced configuration (system + shared + habitat).
 * 
 * @requires crypto - Node.js crypto module for hashing
 * @requires module:config - Configuration loading and processing
 * @requires module:phases - Build phase definitions and configuration sections
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/phase-hash.test.js`
 * - Run all tests: `npm test`
 */

const crypto = require('crypto');
const { loadHabitatEnvironmentFromConfig } = require('./config');
const { getPhaseConfigSections } = require('./phases');


/**
 * Calculate phase-specific hash from coalesced configuration
 * 
 * @param {string} habitatConfigPath - Path to habitat config.yaml
 * @param {string} phaseName - Name of the phase to hash
 * @returns {Promise<string>} - 12-character hash for the phase
 */
async function calculatePhaseHash(habitatConfigPath, phaseName) {
  if (!habitatConfigPath) {
    throw new Error('habitatConfigPath is required');
  }
  
  if (!phaseName) {
    throw new Error('phaseName is required');
  }

  // Load the complete coalesced configuration (system + shared + habitat)
  const coalescedConfig = await loadHabitatEnvironmentFromConfig(habitatConfigPath);
  
  // Get the configuration sections relevant to this phase
  const relevantSections = getPhaseConfigSections(phaseName);
  if (!relevantSections) {
    throw new Error(`Unknown phase: ${phaseName}`);
  }

  // Extract only the data relevant to this phase
  const phaseData = extractPhaseData(coalescedConfig, relevantSections);
  
  // Create compact JSON representation
  const compactJson = JSON.stringify(phaseData, null, 0);
  
  // Calculate hash
  const hash = crypto.createHash('sha256').update(compactJson).digest('hex');
  
  // Return first 12 characters for readability
  return hash.slice(0, 12);
}

/**
 * Calculate hashes for all phases
 * 
 * @param {string} habitatConfigPath - Path to habitat config.yaml
 * @param {Array} phaseNames - Array of phase names to hash
 * @returns {Promise<Object>} - Object mapping phase names to hashes
 */
async function calculateAllPhaseHashes(habitatConfigPath, phaseNames) {
  if (!habitatConfigPath) {
    throw new Error('habitatConfigPath is required');
  }
  
  if (!Array.isArray(phaseNames)) {
    throw new Error('phaseNames must be an array');
  }

  // DEBUG: Log hash calculation call
  console.log(`🔍 [DEBUG] calculateAllPhaseHashes called for ${habitatConfigPath}`);
  console.log(`🔍 [DEBUG] Stack trace:`, new Error().stack.split('\n').slice(1, 4).join('\n'));
  
  // Load config once and reuse for all phases
  const coalescedConfig = await loadHabitatEnvironmentFromConfig(habitatConfigPath);
  
  // DEBUG: Log config loading timestamp and key sections
  console.log(`🔍 [DEBUG] Config loaded at ${new Date().toISOString()}`);
  console.log(`🔍 [DEBUG] Config name: ${coalescedConfig.name}`);
  console.log(`🔍 [DEBUG] Config test section exists: ${!!coalescedConfig.tests}`);
  if (coalescedConfig.tests) {
    console.log(`🔍 [DEBUG] Config test content: ${JSON.stringify(coalescedConfig.tests, null, 2)}`);
  }
  
  const hashes = {};
  
  for (const phaseName of phaseNames) {
    const relevantSections = getPhaseConfigSections(phaseName);
    if (!relevantSections) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    const phaseData = extractPhaseData(coalescedConfig, relevantSections);
    const compactJson = JSON.stringify(phaseData, null, 0);
    const hash = crypto.createHash('sha256').update(compactJson).digest('hex');
    
    hashes[phaseName] = hash.slice(0, 12);
    
    // DEBUG: Log hash calculation for test phase specifically
    if (phaseName === 'test') {
      console.log(`🔍 [DEBUG] Test phase hash calculation:`);
      console.log(`  - Relevant sections: ${JSON.stringify(relevantSections)}`);
      console.log(`  - Phase data: ${compactJson}`);
      console.log(`  - Hash: ${hash.slice(0, 12)}`);
    }
  }
  
  console.log(`🔍 [DEBUG] Final hashes: ${JSON.stringify(hashes, null, 2)}`);
  
  return hashes;
}

/**
 * Extract phase-specific data from coalesced configuration
 * 
 * @private
 * @param {Object} config - Complete coalesced configuration
 * @param {Array} sections - Array of configuration section paths
 * @returns {Object} - Data relevant to the phase
 */
function extractPhaseData(config, sections) {
  const data = {};
  
  for (const sectionPath of sections) {
    const value = getNestedValue(config, sectionPath);
    if (value !== undefined) {
      setNestedValue(data, sectionPath, value);
    }
  }
  
  return data;
}

/**
 * Get nested value from object using dot notation
 * 
 * @private
 * @param {Object} obj - Object to traverse
 * @param {string} path - Dot-separated path (e.g., 'env.USER')
 * @returns {*} - Value at path, or undefined if not found
 */
function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  
  return current;
}

/**
 * Set nested value in object using dot notation
 * 
 * @private
 * @param {Object} obj - Object to modify
 * @param {string} path - Dot-separated path (e.g., 'env.USER')
 * @param {*} value - Value to set
 */
function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  const lastPart = parts.pop();
  let current = obj;
  
  for (const part of parts) {
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  
  current[lastPart] = value;
}

/**
 * Validate phase hashes against stored image labels
 * 
 * @param {Object} imageLabels - Docker image labels
 * @param {Object} currentHashes - Current phase hashes
 * @param {Array} phasesToCheck - Phases to validate (defaults to all in currentHashes)
 * @returns {boolean} - True if all specified phases match
 */
function validatePhaseHashes(imageLabels, currentHashes, phasesToCheck = null) {
  if (!imageLabels || !currentHashes) {
    return false;
  }

  const phases = phasesToCheck || Object.keys(currentHashes);
  
  for (const phase of phases) {
    const labelKey = `${phase}.hash`;
    const currentHash = currentHashes[phase];
    const storedHash = imageLabels[labelKey];
    
    if (!storedHash || storedHash !== currentHash) {
      return false;
    }
  }
  
  return true;
}

/**
 * Create Docker labels object from phase hashes
 * 
 * @param {Object} phaseHashes - Object mapping phase names to hashes
 * @param {string} result - Build result ('pass' or 'fail')
 * @returns {Object} - Docker labels object
 */
function createPhaseLabels(phaseHashes, result = 'pass') {
  const labels = {
    'habitat.result': result,
    'habitat.timestamp': new Date().toISOString()
  };
  
  for (const [phase, hash] of Object.entries(phaseHashes)) {
    labels[`${phase}.hash`] = hash;
  }
  
  return labels;
}

module.exports = {
  calculatePhaseHash,
  calculateAllPhaseHashes,
  validatePhaseHashes,
  createPhaseLabels
};