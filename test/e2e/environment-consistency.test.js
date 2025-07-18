const test = require('node:test');
const assert = require('node:assert');
const { ProductTestBase } = require('./product-test-base');
const { HabitatPathHelpers } = require('../../src/habitat-path-helpers');
const { loadConfig } = require('../../src/config');
const { dockerExec } = require('../../src/container-operations');
const { createHabitatContainer } = require('../../src/container-lifecycle');

/**
 * @fileoverview E2E tests for environment variable consistency between host and container
 * @description Tests that synthetic environment calculations match actual container runtime environment
 * 
 * These tests ensure that the synthetic environment state computed by HabitatPathHelpers
 * on the host exactly matches what actually gets set in running containers. This is critical
 * for maintaining consistency between habitat configuration and runtime behavior.
 * 
 * @tests
 * - Run these tests: `npm run test:e2e -- test/e2e/environment-consistency.test.js`
 * - Run all E2E tests: `npm run test:e2e`
 * - Test module: HabitatPathHelpers and container environment synchronization
 */

test('environment variables match between host calculation and container runtime for claude-habitat', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing environment consistency for claude-habitat (bypass habitat)...');
    
    // Clean environment
    await testRunner.cleanupTestEnvironment('claude-habitat');
    
    // Load claude-habitat config
    const config = await loadConfig('habitats/claude-habitat/config.yaml');
    
    // Host side: Calculate synthetic environment using createHabitatPathHelpers (async version)
    console.log('Calculating host-side synthetic environment...');
    const { createHabitatPathHelpers } = require('../../src/habitat-path-helpers');
    const pathHelpers = await createHabitatPathHelpers(config);
    const hostEnv = pathHelpers.getEnvironment();
    console.log('Host environment variables:', Object.keys(hostEnv));
    
    // Build container if needed
    console.log('Ensuring claude-habitat container is available...');
    const buildResult = await testRunner.buildHabitatFromScratch('claude-habitat', {
      timeout: 300000, // 5 minutes
      verifyFs: false
    });
    
    assert.ok(buildResult.success, `Build failed: ${buildResult.error}`);
    
    // Container side: Get actual runtime environment  
    console.log('Getting container runtime environment...');
    let container = null;
    
    try {
      // Create a test container
      container = await createHabitatContainer(config, {
        name: `env-test-${Date.now()}`,
        temporary: true,
        rebuild: false
      });
      
      // Get environment variables from container
      const envCommand = 'env | grep -E "(WORKDIR|HABITAT_PATH|SYSTEM_PATH|SHARED_PATH|LOCAL_PATH|SYSTEM_TOOLS_PATH|SHARED_TOOLS_PATH|LOCAL_TOOLS_PATH|PATH)" | sort';
      const containerEnvRaw = await dockerExec(container.name, envCommand, config.container?.user || 'node');
      
      console.log('Container environment output:', containerEnvRaw);
      
      // Parse container environment into structured format
      const containerEnv = parseEnvOutput(containerEnvRaw);
      console.log('Parsed container environment:', containerEnv);
      
      // Compare environments
      console.log('Comparing host vs container environments...');
      assertEnvironmentConsistency(hostEnv, containerEnv, 'claude-habitat');
      
      console.log('✅ Environment consistency test passed for claude-habitat');
      
    } finally {
      if (container) {
        await container.cleanup();
      }
    }
    
  } finally {
    await testRunner.cleanup();
  }
});

test('environment variables match between host calculation and container runtime for base habitat', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing environment consistency for base habitat (normal habitat)...');
    
    // Clean environment
    await testRunner.cleanupTestEnvironment('base');
    
    // Load base habitat config
    const config = await loadConfig('habitats/base/config.yaml');
    
    // Host side: Calculate synthetic environment using createHabitatPathHelpers (async version)
    console.log('Calculating host-side synthetic environment...');
    const { createHabitatPathHelpers } = require('../../src/habitat-path-helpers');
    const pathHelpers = await createHabitatPathHelpers(config);
    const hostEnv = pathHelpers.getEnvironment();
    console.log('Host environment variables:', Object.keys(hostEnv));
    
    // Build container if needed
    console.log('Ensuring base habitat container is available...');
    const buildResult = await testRunner.buildHabitatFromScratch('base', {
      timeout: 300000, // 5 minutes
      verifyFs: false
    });
    
    assert.ok(buildResult.success, `Build failed: ${buildResult.error}`);
    
    // Container side: Get actual runtime environment  
    console.log('Getting container runtime environment...');
    let container = null;
    
    try {
      // Create a test container
      container = await createHabitatContainer(config, {
        name: `env-test-base-${Date.now()}`,
        temporary: true,
        rebuild: false
      });
      
      // Get environment variables from container
      const envCommand = 'env | grep -E "(WORKDIR|HABITAT_PATH|SYSTEM_PATH|SHARED_PATH|LOCAL_PATH|SYSTEM_TOOLS_PATH|SHARED_TOOLS_PATH|LOCAL_TOOLS_PATH|PATH)" | sort';
      const containerEnvRaw = await dockerExec(container.name, envCommand, config.container?.user || 'root');
      
      console.log('Container environment output:', containerEnvRaw);
      
      // Parse container environment into structured format
      const containerEnv = parseEnvOutput(containerEnvRaw);
      console.log('Parsed container environment:', containerEnv);
      
      // Compare environments
      console.log('Comparing host vs container environments...');
      assertEnvironmentConsistency(hostEnv, containerEnv, 'base');
      
      console.log('✅ Environment consistency test passed for base habitat');
      
    } finally {
      if (container) {
        await container.cleanup();
      }
    }
    
  } finally {
    await testRunner.cleanup();
  }
});

/**
 * Parse environment output into key-value object
 * @param {string} envOutput - Raw env command output 
 * @returns {Object} Parsed environment variables
 */
function parseEnvOutput(envOutput) {
  const env = {};
  
  if (!envOutput || !envOutput.trim()) {
    return env;
  }
  
  const lines = envOutput.trim().split('\n');
  for (const line of lines) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      env[key] = value;
    }
  }
  
  return env;
}

/**
 * Assert that host and container environments are consistent
 * @param {Object} hostEnv - Host-calculated environment
 * @param {Object} containerEnv - Container runtime environment
 * @param {string} habitatName - Name for error reporting
 */
function assertEnvironmentConsistency(hostEnv, containerEnv, habitatName) {
  const criticalVars = [
    'WORKDIR',
    'HABITAT_PATH', 
    'SYSTEM_PATH',
    'SHARED_PATH',
    'LOCAL_PATH',
    'SYSTEM_TOOLS_PATH',
    'SHARED_TOOLS_PATH',
    'LOCAL_TOOLS_PATH'
  ];
  
  // Check exact matches for critical path variables
  for (const varName of criticalVars) {
    const hostValue = hostEnv[varName];
    const containerValue = containerEnv[varName];
    
    // Handle expected differences between bypass and normal habitats
    if (!hostValue && !containerValue) {
      // Both undefined is OK for optional variables
      continue;
    }
    
    assert.ok(hostValue, `Host environment missing ${varName} for ${habitatName}`);
    assert.ok(containerValue, `Container environment missing ${varName} for ${habitatName}`);
    assert.strictEqual(
      containerValue, 
      hostValue, 
      `Environment variable ${varName} mismatch in ${habitatName}: host="${hostValue}" container="${containerValue}"`
    );
  }
  
  // Check PATH variable with substring matching (container PATH may have more entries than synthetic PATH)
  const hostPath = hostEnv['PATH'];
  const containerPath = containerEnv['PATH'];
  
  if (hostPath && containerPath) {
    // Split paths and check that all host path entries exist in container path
    const hostPathEntries = hostPath.split(':').filter(p => p.trim());
    const containerPathEntries = containerPath.split(':').filter(p => p.trim());
    
    console.log(`Host PATH entries: ${hostPathEntries.join(', ')}`);
    console.log(`Container PATH entries: ${containerPathEntries.join(', ')}`);
    
    for (const hostEntry of hostPathEntries) {
      assert.ok(
        containerPathEntries.includes(hostEntry),
        `PATH entry "${hostEntry}" from synthetic environment not found in container PATH for ${habitatName}. Container PATH: "${containerPath}"`
      );
    }
    
    console.log(`✓ All synthetic PATH entries found in container PATH for ${habitatName}`);
  } else if (hostPath) {
    // Host has PATH but container doesn't - this is an error
    assert.fail(`Host has PATH="${hostPath}" but container PATH is missing for ${habitatName}`);
  } else if (containerPath) {
    // Container has PATH but host doesn't - this is acceptable for containers that inherit system PATH
    console.log(`✓ Container has PATH but synthetic environment doesn't - this is acceptable for ${habitatName}`);
  }
  
  console.log(`✓ All critical environment variables match between host and container for ${habitatName}`);
}