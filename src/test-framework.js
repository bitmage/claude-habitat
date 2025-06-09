/**
 * Declarative test framework for Claude Habitat
 * 
 * Provides automatic setup/teardown and timeout handling for tests
 */

const assert = require('assert');
const { test } = require('node:test');

/**
 * Create a test with automatic setup/teardown
 * 
 * @param {Object} options - Test configuration
 * @param {Array} options.setup - Array of setup function names or functions
 * @param {Array} options.teardown - Array of teardown function names or functions
 * @param {number} options.timeout - Test timeout in milliseconds (default: 30000)
 * @returns {Function} - Test function that accepts name and test implementation
 * 
 * @example
 * const habitatTest = createTest({
 *   setup: ['buildImage', 'createContainer', 'startContainer'],
 *   timeout: 60000
 * });
 * 
 * habitatTest('verify filesystem', async ({ container }) => {
 *   const result = await runFilesystemVerification(container);
 *   assert.ok(result.passed);
 * });
 */
function createTest(options = {}) {
  const { 
    setup = [], 
    teardown = [], 
    timeout = 30000 
  } = options;
  
  return (name, testFn) => {
    test(name, async (t) => {
      let context = {};
      const cleanupFns = [];
      
      // Setup phase - run setup functions in order
      for (const step of setup) {
        const setupFn = typeof step === 'string' ? setupFunctions[step] : step;
        
        if (!setupFn) {
          throw new Error(`Unknown setup function: ${step}`);
        }
        
        try {
          const cleanup = await setupFn(context);
          if (cleanup && typeof cleanup === 'function') {
            cleanupFns.unshift(cleanup); // LIFO order for cleanup
          }
        } catch (error) {
          // Cleanup any partial setup before re-throwing
          for (const cleanupFn of cleanupFns) {
            try {
              await cleanupFn(context);
            } catch (cleanupError) {
              console.error(`Setup cleanup error: ${cleanupError.message}`);
            }
          }
          throw new Error(`Setup failed at step '${step}': ${error.message}`);
        }
      }
      
      try {
        // Run test with timeout
        await Promise.race([
          testFn(context),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout)
          )
        ]);
        
      } finally {
        // Teardown phase - always runs, even on test failure
        for (const cleanupFn of cleanupFns) {
          try {
            await cleanupFn(context);
          } catch (err) {
            console.error(`Teardown error: ${err.message}`);
          }
        }
        
        // Run explicit teardown functions
        for (const step of teardown) {
          const teardownFn = typeof step === 'string' ? teardownFunctions[step] : step;
          
          if (teardownFn) {
            try {
              await teardownFn(context);
            } catch (err) {
              console.error(`Explicit teardown error for '${step}': ${err.message}`);
            }
          }
        }
      }
    });
  };
}

/**
 * Predefined setup functions for common test scenarios
 */
const setupFunctions = {
  buildImage: async (context) => {
    const { buildHabitatImage } = require('./habitat');
    const config = context.config || await loadTestConfig();
    
    console.log('Building test image...');
    const result = await buildHabitatImage(config.path, []);
    context.image = result.preparedTag;
    
    return async () => {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      try {
        await execAsync(`docker rmi ${context.image}`);
        console.log('Test image removed');
      } catch (error) {
        // Image might already be removed or in use
        console.warn(`Failed to remove test image: ${error.message}`);
      }
    };
  },
  
  createContainer: async (context) => {
    const { dockerRun } = require('./docker');
    
    if (!context.image) {
      throw new Error('createContainer requires image to be set (use buildImage setup first)');
    }
    
    console.log('Creating test container...');
    const containerName = `test-container-${Date.now()}-${process.pid}`;
    
    await dockerRun([
      'run', '-d',
      '--name', containerName,
      context.image,
      'sleep', '300' // Keep container alive for testing
    ]);
    
    context.container = containerName;
    
    return async () => {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      try {
        await execAsync(`docker stop ${context.container}`);
        await execAsync(`docker rm ${context.container}`);
        console.log('Test container removed');
      } catch (error) {
        console.warn(`Failed to remove test container: ${error.message}`);
      }
    };
  },
  
  startContainer: async (context) => {
    if (!context.container) {
      throw new Error('startContainer requires container to be set (use createContainer setup first)');
    }
    
    console.log('Starting test container...');
    // Container should already be running from createContainer, but verify
    const { dockerIsRunning } = require('./docker');
    const isRunning = await dockerIsRunning(context.container);
    
    if (!isRunning) {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      await execAsync(`docker start ${context.container}`);
    }
    
    // Wait a moment for container to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return async () => {
      // Stop happens in createContainer cleanup
    };
  },
  
  loadConfig: async (context) => {
    const config = await loadTestConfig();
    context.config = config;
    
    return null; // No cleanup needed
  },
  
  prepareWorkspace: async (context) => {
    const os = require('os');
    const path = require('path');
    const fs = require('fs').promises;
    
    const workspaceDir = path.join(os.tmpdir(), `test-workspace-${Date.now()}`);
    await fs.mkdir(workspaceDir, { recursive: true });
    
    context.workspace = workspaceDir;
    
    return async () => {
      try {
        await fs.rmdir(workspaceDir, { recursive: true });
        console.log('Test workspace cleaned up');
      } catch (error) {
        console.warn(`Failed to clean up test workspace: ${error.message}`);
      }
    };
  }
};

/**
 * Predefined teardown functions
 */
const teardownFunctions = {
  cleanupDocker: async (context) => {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      // Clean up any test containers and images
      await execAsync('docker container prune -f --filter label=test=true');
      await execAsync('docker image prune -f --filter label=test=true');
      console.log('Docker test resources cleaned up');
    } catch (error) {
      console.warn(`Docker cleanup failed: ${error.message}`);
    }
  }
};

/**
 * Helper function to load test configuration
 */
async function loadTestConfig() {
  const path = require('path');
  const { fileExists } = require('./utils');
  
  // Try to find a test config
  const testConfigPaths = [
    path.join(__dirname, '..', 'habitats', 'base', 'config.yaml'),
    path.join(__dirname, '..', 'test', 'fixtures', 'test-config.yaml')
  ];
  
  for (const configPath of testConfigPaths) {
    if (await fileExists(configPath)) {
      return {
        path: configPath,
        name: 'test-habitat'
      };
    }
  }
  
  throw new Error('No test configuration found');
}

/**
 * Assertion helpers for common test scenarios
 */
const assertions = {
  /**
   * Assert that a container is running
   */
  async containerIsRunning(containerName) {
    const { dockerIsRunning } = require('./docker');
    const isRunning = await dockerIsRunning(containerName);
    assert.ok(isRunning, `Container ${containerName} should be running`);
  },
  
  /**
   * Assert that a container has exited with expected code
   */
  async containerExitedWith(containerName, expectedCode) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync(`docker inspect ${containerName} --format='{{.State.ExitCode}}'`);
    const exitCode = parseInt(stdout.trim());
    
    assert.strictEqual(exitCode, expectedCode, 
      `Container ${containerName} should have exited with code ${expectedCode}, got ${exitCode}`);
  },
  
  /**
   * Assert that a file exists in container
   */
  async fileExistsInContainer(containerName, filePath) {
    const { dockerExec } = require('./docker');
    
    try {
      await dockerExec(containerName, `test -f ${filePath}`);
    } catch (error) {
      assert.fail(`File ${filePath} should exist in container ${containerName}`);
    }
  },
  
  /**
   * Assert that a command succeeds in container
   */
  async commandSucceedsInContainer(containerName, command) {
    const { dockerExec } = require('./docker');
    
    try {
      await dockerExec(containerName, command);
    } catch (error) {
      assert.fail(`Command '${command}' should succeed in container ${containerName}: ${error.message}`);
    }
  }
};

module.exports = {
  createTest,
  setupFunctions,
  teardownFunctions,
  assertions
};