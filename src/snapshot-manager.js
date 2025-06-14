/**
 * @module snapshot-manager
 * @description Container snapshot creation and management for progressive builds
 * 
 * Manages Docker container snapshots for build caching. Creates intermediate
 * snapshots after each build phase, stores phase hashes in image labels,
 * and provides cache detection and validation logic.
 * 
 * @requires module:container-operations - Docker container operations
 * @requires module:phase-hash - Phase-based hash calculation
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/snapshot-manager.test.js`
 * - Run all tests: `npm test`
 */

const { execDockerCommand } = require('./container-operations');
const { createPhaseLabels, validatePhaseHashes } = require('./phase-hash');

/**
 * Create a snapshot from a running container
 * 
 * @param {string} containerId - Container ID to snapshot
 * @param {string} snapshotTag - Tag for the new snapshot image
 * @param {Object} options - Snapshot options
 * @param {Object} options.labels - Labels to add to the image
 * @param {string} options.result - Build result ('pass' or 'fail')
 * @returns {Promise<string>} - The created snapshot tag
 */
async function createSnapshot(containerId, snapshotTag, options = {}) {
  if (!containerId) {
    throw new Error('containerId is required');
  }
  
  if (!snapshotTag) {
    throw new Error('snapshotTag is required');
  }

  const { labels = {}, result = 'pass', dockerChange = null } = options;
  
  // Build docker commit command with labels using --change LABEL
  const changeArgs = [];
  const allLabels = {
    ...labels,
    'habitat.result': result,
    'habitat.timestamp': new Date().toISOString()
  };
  
  for (const [key, value] of Object.entries(allLabels)) {
    changeArgs.push('--change', `LABEL ${key}="${value}"`);
  }
  
  // Add dockerChange if provided (e.g., ENTRYPOINT)
  if (dockerChange) {
    changeArgs.push('--change', dockerChange);
  }

  const commitArgs = ['commit', ...changeArgs, containerId, snapshotTag];
  
  try {
    await execDockerCommand(commitArgs);
    return snapshotTag;
  } catch (error) {
    throw new Error(`Failed to create snapshot ${snapshotTag}: ${error.message}`);
  }
}

/**
 * Get Docker image with its labels
 * 
 * @param {string} imageTag - Image tag to inspect
 * @returns {Promise<Object|null>} - Image info with labels, or null if not found
 */
async function getImageWithLabels(imageTag) {
  if (!imageTag) {
    throw new Error('imageTag is required');
  }

  try {
    const inspectArgs = ['inspect', '--format', '{{json .Config.Labels}}', imageTag];
    const stdout = await execDockerCommand(inspectArgs);
    
    const labels = JSON.parse(stdout.trim() || '{}');
    
    return {
      tag: imageTag,
      labels: labels || {},
      exists: true
    };
  } catch (error) {
    // Image doesn't exist
    if (error.message.includes('No such image') || 
        error.message.includes('no such image') ||
        error.message.includes('No such object')) {
      return null;
    }
    throw error;
  }
}

/**
 * Check if an image exists
 * 
 * @param {string} imageTag - Image tag to check
 * @returns {Promise<boolean>} - True if image exists
 */
async function imageExists(imageTag) {
  const image = await getImageWithLabels(imageTag);
  return image !== null;
}

/**
 * Find the most recent valid snapshot for a habitat
 * 
 * @param {string} habitatName - Name of the habitat
 * @param {Object} currentHashes - Current phase hashes from config
 * @param {Array} phases - Array of phase definitions (with id and name)
 * @returns {Promise<Object|null>} - Valid snapshot info or null if none found
 */
async function findValidSnapshot(habitatName, currentHashes, phases) {
  if (!habitatName) {
    throw new Error('habitatName is required');
  }
  
  if (!currentHashes) {
    throw new Error('currentHashes is required');
  }
  
  if (!Array.isArray(phases)) {
    throw new Error('phases must be an array');
  }

  // Check phases in reverse order (latest to earliest)
  for (let i = phases.length - 1; i >= 0; i--) {
    const phase = phases[i];
    const snapshotTag = `habitat-${habitatName}:${phase.id}-${phase.name}`;
    
    const image = await getImageWithLabels(snapshotTag);
    if (!image) {
      continue; // No snapshot for this phase
    }

    // Check if this snapshot's hashes match current config
    const phasesToCheck = phases.slice(0, i + 1).map(p => p.name);
    const isValid = validatePhaseHashes(image.labels, currentHashes, phasesToCheck);
    
    if (isValid) {
      return {
        image,
        snapshotTag,
        phase,
        phaseIndex: i,
        startFromPhase: i + 1 // Next phase to execute
      };
    }
  }

  return null;
}

/**
 * List all snapshots for a habitat
 * 
 * @param {string} habitatName - Name of the habitat
 * @returns {Promise<Array>} - Array of snapshot info objects
 */
async function listSnapshots(habitatName) {
  if (!habitatName) {
    throw new Error('habitatName is required');
  }

  try {
    const listArgs = ['images', '--format', 'table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}', `habitat-${habitatName}`];
    const stdout = await execDockerCommand(listArgs);
    
    const lines = stdout.trim().split('\n');
    const snapshots = [];
    
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const [tag, createdAt] = line.split('\t');
        snapshots.push({
          tag: tag.trim(),
          createdAt: createdAt.trim()
        });
      }
    }
    
    return snapshots;
  } catch (error) {
    // No images found
    if (error.message.includes('No such image')) {
      return [];
    }
    throw error;
  }
}

/**
 * Remove snapshots for a habitat
 * 
 * @param {string} habitatName - Name of the habitat
 * @param {Object} options - Removal options
 * @param {boolean} options.all - Remove all snapshots (default: false)
 * @param {Array} options.phases - Specific phases to remove
 * @param {boolean} options.failed - Remove only failed snapshots
 * @returns {Promise<Array>} - Array of removed snapshot tags
 */
async function removeSnapshots(habitatName, options = {}) {
  if (!habitatName) {
    throw new Error('habitatName is required');
  }

  const { all = false, phases = [], failed = false } = options;
  const removedTags = [];

  if (all) {
    // Remove all snapshots for this habitat
    try {
      const removeArgs = ['rmi', '-f', `habitat-${habitatName}`];
      await execDockerCommand(removeArgs);
      removedTags.push(`habitat-${habitatName}:*`);
    } catch (error) {
      // Ignore errors if no images exist
      if (!error.message.includes('No such image')) {
        throw error;
      }
    }
  } else if (phases.length > 0) {
    // Remove specific phases
    for (const phase of phases) {
      const snapshotTag = `habitat-${habitatName}:${phase}`;
      try {
        await execDockerCommand(['rmi', '-f', snapshotTag]);
        removedTags.push(snapshotTag);
      } catch (error) {
        // Ignore errors if image doesn't exist
        if (!error.message.includes('No such image')) {
          throw error;
        }
      }
    }
  } else if (failed) {
    // Remove only failed snapshots
    const snapshots = await listSnapshots(habitatName);
    
    for (const snapshot of snapshots) {
      const image = await getImageWithLabels(snapshot.tag);
      if (image && image.labels['habitat.result'] === 'fail') {
        try {
          await execDockerCommand(['rmi', '-f', snapshot.tag]);
          removedTags.push(snapshot.tag);
        } catch (error) {
          // Ignore removal errors
        }
      }
    }
  }

  return removedTags;
}

/**
 * Get snapshot statistics for a habitat
 * 
 * @param {string} habitatName - Name of the habitat
 * @returns {Promise<Object>} - Snapshot statistics
 */
async function getSnapshotStats(habitatName) {
  if (!habitatName) {
    throw new Error('habitatName is required');
  }

  const snapshots = await listSnapshots(habitatName);
  const stats = {
    total: snapshots.length,
    passed: 0,
    failed: 0,
    unknown: 0,
    totalSize: 0
  };

  for (const snapshot of snapshots) {
    const image = await getImageWithLabels(snapshot.tag);
    if (image) {
      const result = image.labels['habitat.result'];
      if (result === 'pass') {
        stats.passed++;
      } else if (result === 'fail') {
        stats.failed++;
      } else {
        stats.unknown++;
      }
    }
  }

  return stats;
}

module.exports = {
  createSnapshot,
  getImageWithLabels,
  imageExists,
  findValidSnapshot,
  listSnapshots,
  removeSnapshots,
  getSnapshotStats
};