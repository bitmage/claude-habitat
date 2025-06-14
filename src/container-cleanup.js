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
      console.warn(`⚠️ Some containers failed to stop: ${error.message}`);
    }
    
    // Remove all containers
    await execAsync(`docker rm ${containerIds.join(' ')}`);
    
  } catch (error) {
    // Log warning but don't fail the process
    console.warn(`⚠️ Cleanup warning: ${error.message}`);
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
    } catch (error) {
      // Silently ignore cleanup errors during shutdown
    }
  };
  
  // Register for various exit conditions
  process.on('SIGINT', cleanupHandler);   // Ctrl-C
  process.on('SIGTERM', cleanupHandler);  // Termination signal
  process.on('exit', cleanupHandler);     // Normal exit
}

module.exports = {
  isLastClaudeHabitatProcess,
  getClaudeHabitatContainers,
  cleanupContainers,
  setupAutomaticCleanup
};