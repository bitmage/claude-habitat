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
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
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
  const phaseData = await extractPhaseData(coalescedConfig, relevantSections, phaseName, habitatConfigPath);
  
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

  // Load config once and reuse for all phases
  const coalescedConfig = await loadHabitatEnvironmentFromConfig(habitatConfigPath);
  
  const hashes = {};
  
  for (const phaseName of phaseNames) {
    const relevantSections = getPhaseConfigSections(phaseName);
    if (!relevantSections) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    const phaseData = await extractPhaseData(coalescedConfig, relevantSections, phaseName, habitatConfigPath);
    const compactJson = JSON.stringify(phaseData, null, 0);
    const hash = crypto.createHash('sha256').update(compactJson).digest('hex');
    
    hashes[phaseName] = hash.slice(0, 12);
  }
  
  return hashes;
}

/**
 * Extract phase-specific data from coalesced configuration
 * 
 * @private
 * @param {Object} config - Complete coalesced configuration
 * @param {Array} sections - Array of configuration section paths
 * @param {string} phaseName - Name of the phase being hashed
 * @param {string} habitatConfigPath - Path to habitat config for resolving relative paths
 * @returns {Promise<Object>} - Data relevant to the phase
 */
async function extractPhaseData(config, sections, phaseName, habitatConfigPath) {
  const data = {};
  const habitatDir = path.dirname(habitatConfigPath);
  
  for (const sectionPath of sections) {
    const value = getNestedValue(config, sectionPath);
    if (value !== undefined) {
      // Special handling for files phase - hash file contents
      if (phaseName === 'files' && sectionPath === 'files' && Array.isArray(value)) {
        const filesWithHashes = await Promise.all(value.map(async (fileEntry) => {
          if (fileEntry.src) {
            try {
              // Resolve file path relative to appropriate directory
              let resolvedPath = fileEntry.src;
              
              // Handle different path types
              if (fileEntry.src.startsWith('~/')) {
                // Home directory reference - skip hashing for now
                return { ...fileEntry, contentHash: 'home-dir-reference' };
              } else if (fileEntry.src.startsWith('./')) {
                // Relative to config directory (system/shared/habitat)
                const configDir = path.dirname(config._configPath || habitatConfigPath);
                resolvedPath = path.resolve(configDir, fileEntry.src);
              } else if (!path.isAbsolute(fileEntry.src)) {
                // Relative path without ./ - relative to habitat dir
                resolvedPath = path.resolve(habitatDir, fileEntry.src);
              }
              
              // Read and hash file content
              const content = await fs.readFile(resolvedPath, 'utf8');
              const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
              
              return { ...fileEntry, contentHash: hash };
            } catch (err) {
              // File doesn't exist or can't be read - use path as fallback
              return { ...fileEntry, contentHash: `error:${err.code}` };
            }
          }
          return fileEntry;
        }));
        setNestedValue(data, sectionPath, filesWithHashes);
      } 
      // Special handling for repos phase - include current commit/branch info
      else if (phaseName === 'repos' && sectionPath === 'repos' && Array.isArray(value)) {
        const reposWithCommits = await Promise.all(value.map(async (repo) => {
          if (repo.path) {
            try {
              // Check if repo already exists at target path
              const repoPath = repo.path.replace('${WORKDIR}', config._environment?.WORKDIR || '/workspace');
              const gitConfigPath = path.join(repoPath, '.git', 'config');
              
              // If repo exists, get current commit hash
              try {
                await fs.access(gitConfigPath);
                const currentCommit = execSync(`git -C "${repoPath}" rev-parse HEAD 2>/dev/null || echo "not-cloned"`, 
                  { encoding: 'utf8' }).trim();
                const currentBranch = execSync(`git -C "${repoPath}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "not-cloned"`, 
                  { encoding: 'utf8' }).trim();
                
                return { 
                  ...repo, 
                  currentCommit: currentCommit.slice(0, 12),
                  currentBranch 
                };
              } catch (gitErr) {
                // Repo not cloned yet
                return { ...repo, currentCommit: 'not-cloned', currentBranch: 'not-cloned' };
              }
            } catch (err) {
              // Can't check repo status
              return { ...repo, currentCommit: 'error', currentBranch: 'error' };
            }
          }
          return repo;
        }));
        setNestedValue(data, sectionPath, reposWithCommits);
      } else {
        setNestedValue(data, sectionPath, value);
      }
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