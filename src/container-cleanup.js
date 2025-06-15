/**
 * @module container-cleanup
 * @description Container cleanup management for Claude Habitat
 * 
 * Provides comprehensive cleanup of orphaned claude-habitat containers when
 * no other claude-habitat processes are running. Uses "last process wins"
 * strategy for safe multi-process cleanup coordination.
 * 
 * @requires module:container-operations - Docker container operations
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/container-cleanup.test.js`
 * - Run all tests: `npm test`
 */

const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

/**
 * Check if there are other claude-habitat processes running
 * 
 * @returns {Promise<boolean>} - True if this is the last claude-habitat process
 */
async function isLastClaudeHabitatProcess() {
  try {
    const { stdout } = await execAsync(`pgrep -f "claude-habitat"`);
    const processes = stdout.trim().split('\n').filter(line => line.trim());
    return processes.length <= 1; // Only this process running
  } catch (error) {
    // pgrep returns non-zero exit code when no processes found
    return true; // No other processes, we're the last one
  }
}

/**
 * Get all claude-habitat container IDs
 * 
 * @returns {Promise<string[]>} - Array of container IDs
 */
async function getClaudeHabitatContainers() {
  try {
    const { stdout } = await execAsync(`docker ps -a -q --filter "name=claude-habitat"`);
    return stdout.trim().split('\n').filter(id => id.trim());
  } catch (error) {
    return []; // No containers found or docker not available
  }
}

/**
 * Cleanup all claude-habitat containers if this is the last process
 * 
 * Uses "last process wins" strategy - only cleans up when no other
 * claude-habitat processes are running, ensuring safety.
 * 
 * @param {Object} options - Cleanup options
 * @param {boolean} options.force - Force cleanup even if other processes detected
 * @param {boolean} options.dryRun - Log what would be done without actually doing it
 * @returns {Promise<void>}
 */
async function cleanupContainers(options = {}) {
  const { force = false, dryRun = false } = options;
  
  // Check if we should cleanup
  if (!force && !await isLastClaudeHabitatProcess()) {
    return; // Other claude-habitat processes still running
  }
  
  try {
    const containerIds = await getClaudeHabitatContainers();
    
    if (containerIds.length === 0) {
      return; // No containers to cleanup
    }
    
    console.log('🧹 Cleaning up claude-habitat containers...');
    
    if (dryRun) {
      console.log(`Would clean up ${containerIds.length} containers: ${containerIds.slice(0, 3).join(', ')}${containerIds.length > 3 ? '...' : ''}`);
      return;
    }
    
    // Stop all containers (ignore failures - some might already be stopped)
    try {
      await execAsync(`docker stop ${containerIds.join(' ')}`, { timeout: 30000 });
    } catch (error) {
      // Continue with removal even if stop fails
      console.log(`⚠️ Some containers failed to stop: ${error.message}`);
    }
    
    // Remove all containers
    await execAsync(`docker rm ${containerIds.join(' ')}`);
    
  } catch (error) {
    // Log warning but don't fail the process
    console.log(`⚠️ Cleanup warning: ${error.message}`);
  }
}

/**
 * Clean up dangling Docker images
 * 
 * Removes images that are no longer referenced by any containers
 * or other images. These are typically leftover from failed builds
 * or orphaned during rebuild operations.
 * 
 * @param {Object} options - Cleanup options
 * @param {boolean} options.dryRun - If true, only show what would be cleaned
 */
async function cleanupDanglingImages(options = {}) {
  const { dryRun = false } = options;
  
  try {
    const { stdout } = await execAsync('docker images -f "dangling=true" -q');
    const imageIds = stdout.trim().split('\n').filter(id => id.trim());
    
    if (imageIds.length === 0) {
      return; // No dangling images
    }
    
    console.log(`🧹 Cleaning up ${imageIds.length} dangling Docker images...`);
    
    if (dryRun) {
      console.log(`Would clean up ${imageIds.length} dangling images`);
      return;
    }
    
    // Clean up any stopped containers first to free up image dependencies
    try {
      const { stdout: stoppedContainers } = await execAsync('docker ps -a -q --filter "status=exited"');
      const stoppedIds = stoppedContainers.trim().split('\n').filter(id => id.trim());
      if (stoppedIds.length > 0) {
        await execAsync(`docker rm ${stoppedIds.join(' ')}`);
      }
    } catch (error) {
      // Ignore container cleanup errors
    }
    
    // Remove dangling images
    await execAsync(`docker rmi ${imageIds.join(' ')}`);
    
  } catch (error) {
    // Log warning but don't fail the process - use stdout to avoid test failures
    console.log(`⚠️ Dangling image cleanup warning: ${error.message}`);
  }
}

/**
 * Setup automatic cleanup on process exit
 * 
 * Registers signal handlers for clean shutdown. Only performs cleanup
 * if this is the last claude-habitat process running.
 * 
 * @param {Object} options - Setup options  
 * @param {boolean} options.disabled - Disable automatic cleanup
 */
function setupAutomaticCleanup(options = {}) {
  const { disabled = false } = options;
  
  if (disabled) {
    return;
  }
  
  // Create cleanup handler that ignores errors
  const cleanupHandler = async () => {
    try {
      await cleanupContainers();
      await cleanupDanglingImages();
    } catch (error) {
      // Silently ignore cleanup errors during shutdown
    }
  };
  
  // Create synchronous handler for exit event (async doesn't work)
  const syncCleanupHandler = () => {
    // For normal exit, we need to use synchronous docker commands
    try {
      const { execSync } = require('child_process');
      
      // Quick check if we're the last process
      try {
        const processes = execSync(`pgrep -f "claude-habitat"`, { encoding: 'utf8' });
        const processCount = processes.trim().split('\n').filter(line => line.trim()).length;
        if (processCount > 1) {
          return; // Other processes running
        }
      } catch (error) {
        // pgrep returns non-zero if no processes found, we're the last one
      }
      
      // Get container IDs
      try {
        const containerIds = execSync(`docker ps -a -q --filter "name=claude-habitat"`, { encoding: 'utf8' });
        const ids = containerIds.trim().split('\n').filter(id => id.trim());
        
        if (ids.length > 0) {
          console.log('🧹 Cleaning up claude-habitat containers...');
          
          // Stop containers (ignore failures)
          try {
            execSync(`docker stop ${ids.join(' ')}`, { timeout: 30000 });
          } catch (error) {
            // Continue with removal
          }
          
          // Remove containers
          execSync(`docker rm ${ids.join(' ')}`);
        }
      } catch (error) {
        // Ignore cleanup errors during shutdown
      }
      
      // Clean up dangling images (orphaned by builds)
      try {
        const danglingIds = execSync(`docker images -f "dangling=true" -q`, { encoding: 'utf8' });
        const imageIds = danglingIds.trim().split('\n').filter(id => id.trim());
        
        if (imageIds.length > 0) {
          console.log(`🧹 Cleaning up ${imageIds.length} dangling Docker images...`);
          execSync(`docker rmi ${imageIds.join(' ')}`);
        }
      } catch (error) {
        // Ignore cleanup errors during shutdown
      }
    } catch (error) {
      // Ignore all errors during synchronous cleanup
    }
  };
  
  // Register for various exit conditions
  process.on('SIGINT', cleanupHandler);       // Ctrl-C (async)
  process.on('SIGTERM', cleanupHandler);      // Termination signal (async)
  process.on('beforeExit', cleanupHandler);   // Normal exit (async - better than 'exit')
  process.on('exit', syncCleanupHandler);     // Final fallback (sync only)
}

module.exports = {
  isLastClaudeHabitatProcess,
  getClaudeHabitatContainers,
  cleanupContainers,
  cleanupDanglingImages,
  setupAutomaticCleanup
};