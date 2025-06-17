/**
 * @module container-cleanup
 * @description Container cleanup management for Claude Habitat
 * 
 * Provides comprehensive cleanup of orphaned claude-habitat containers when
 * no other claude-habitat processes are running. Uses "last process wins"
 * strategy for safe multi-process cleanup coordination.
 * 
 * ## Node.js Process Exit Event Understanding
 * 
 * This module handles process termination through various Node.js events:
 * 
 * ### Normal Completion
 * ```
 * beforeExit → exit
 * ```
 * - beforeExit: Allows async operations, can extend process lifetime
 * - exit: Synchronous only, immediate termination
 * 
 * ### Explicit process.exit()
 * ```
 * exit (immediate)
 * ```
 * - No beforeExit event
 * - Only exit event fires
 * - We don't handle this - let it exit immediately
 * 
 * ### SIGINT (Ctrl-C)
 * ```
 * SIGINT → [custom handler] → exit
 * ```
 * - Multiple handlers execute in registration order
 * - Can prevent default termination
 * - We handle gracefully with progressive messaging
 * 
 * ### SIGTERM (kill PID)
 * ```
 * SIGTERM → [custom handler] → exit
 * ```
 * - External graceful shutdown signal
 * - Similar handling to SIGINT
 * 
 * ### SIGKILL (kill -9)
 * ```
 * [immediate termination - no events]
 * ```
 * - Cannot be caught - no cleanup possible
 * 
 * ### Our Strategy
 * - Single async cleanup implementation
 * - Progressive Ctrl-C handling (5 attempts before force exit)
 * - No sync fallback - if user wants to force exit, let them
 * - Cleanup will run next time anyway
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

// Module-level state for handler registration and cleanup coordination
let handlersRegistered = false;
let cleanupState = 'idle'; // 'idle' | 'starting' | 'inProgress' | 'complete'
let ctrlCCount = 0;

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
 * Perform graceful cleanup with progress messaging
 * 
 * Uses state machine to prevent concurrent cleanup and provides
 * user feedback about cleanup progress.
 */
async function performGracefulCleanup() {
  if (cleanupState !== 'idle') {
    return; // Already in progress
  }
  
  cleanupState = 'starting';
  
  try {
    // Check if we're the last process
    if (!(await isLastClaudeHabitatProcess())) {
      console.log('🔄 Other claude-habitat processes detected, skipping cleanup');
      cleanupState = 'complete';
      return;
    }
    
    cleanupState = 'inProgress';
    console.log('🧹 Starting graceful cleanup...');
    
    // Clean containers with progress
    const containerIds = await getClaudeHabitatContainers();
    if (containerIds.length > 0) {
      console.log(`🧹 Cleaning up ${containerIds.length} containers...`);
      await cleanupContainers();
    }
    
    // Clean dangling images
    try {
      const { stdout } = await execAsync('docker images -f "dangling=true" -q');
      const imageIds = stdout.trim().split('\n').filter(id => id.trim());
      if (imageIds.length > 0) {
        console.log(`🧹 Cleaning up ${imageIds.length} dangling images...`);
        await cleanupDanglingImages();
      }
    } catch (error) {
      console.log(`⚠️ Dangling image cleanup warning: ${error.message}`);
    }
    
    console.log('✅ Cleanup complete!');
    cleanupState = 'complete';
    
    // Exit the process after successful cleanup
    process.exit(0);
    
  } catch (error) {
    console.log(`⚠️ Cleanup warning: ${error.message}`);
    cleanupState = 'complete'; // Don't block exit on cleanup errors
  }
}

/**
 * Handle SIGINT (Ctrl-C) with progressive messaging
 * 
 * Implements 5-step progression:
 * 1. Start graceful cleanup
 * 2-4. Show "please wait" message  
 * 5. Force exit
 */
async function handleSigint() {
  ctrlCCount++;
  
  if (ctrlCCount === 1) {
    console.log('\\n🛑 Shutting down gracefully...');
    await performGracefulCleanup();
    // performGracefulCleanup handles the exit
  } else if (ctrlCCount <= 4) {
    console.log(`🛑 Shutdown in progress, please wait... (Ctrl-C ${5-ctrlCCount} more times to force exit)`);
  } else {
    console.log('\\n💥 Force exit requested!');
    process.exit(1);
  }
}

/**
 * Setup automatic cleanup on process exit
 * 
 * Registers signal handlers for clean shutdown using async-only approach.
 * Progressive Ctrl-C handling allows graceful shutdown with option to force exit.
 * 
 * @param {Object} options - Setup options  
 * @param {boolean} options.disabled - Disable automatic cleanup
 */
function setupAutomaticCleanup(options = {}) {
  const { disabled = false } = options;
  
  if (disabled || handlersRegistered) {
    return;
  }
  
  handlersRegistered = true;
  
  // Handle normal completion
  process.on('beforeExit', async () => {
    await performGracefulCleanup();
    // performGracefulCleanup handles the exit
  });
  
  // Handle graceful shutdown signals
  process.on('SIGTERM', async () => {
    await performGracefulCleanup();
    // performGracefulCleanup handles the exit
  });
  
  // Handle Ctrl-C with progressive messaging
  process.on('SIGINT', handleSigint);
}

module.exports = {
  isLastClaudeHabitatProcess,
  getClaudeHabitatContainers,
  cleanupContainers,
  cleanupDanglingImages,
  setupAutomaticCleanup
};