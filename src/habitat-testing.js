/**
 * @module habitat-testing
 * @description Habitat-specific test execution and validation system
 * 
 * Provides test orchestration for habitat environments including system tests
 * (infrastructure), shared tests (user configuration), and habitat tests 
 * (environment-specific validation). Uses ephemeral containers (docker run --rm)
 * for fast, clean test execution.
 * 
 * ## Key Functions
 * - **runTestMode**: Main entry point for habitat test execution
 * - **runSystemTests**: Execute system infrastructure tests in ephemeral container
 * - **runSharedTests**: Execute shared configuration tests in ephemeral container  
 * - **runHabitatTests**: Execute habitat-specific tests in ephemeral container
 * 
 * See README.md for complete testing documentation including unit tests,
 * E2E tests, UI snapshots, and development workflows.
 * 
 * @requires module:types - Domain model definitions
 * @requires module:config - Configuration loading
 * @requires module:container-operations - Docker container operations
 * @requires module:standards/testing - Testing approach and conventions
 * @requires module:standards/path-resolution - Path handling conventions
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - All tests: `npm test`
 * - Testing infrastructure is verified through all test execution
 */

const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

// @see {@link module:standards/path-resolution} for project-root relative path conventions using rel()
const { colors, sleep, fileExists, executeCommand, processTestResults, rel } = require('./utils');
const { dockerRun, dockerImageExists } = require('./container-operations');
const { loadConfig } = require('./config');
const { askToContinue } = require('./cli');

// Test running functionality
async function runTestMode(testType, testTarget, rebuild = false) {
  console.log(colors.green('\n=== Claude Habitat Test Runner ===\n'));

  if (testType === 'all' && !testTarget) {
    // Run all tests for all habitats
    await runAllTests();
  } else if (testTarget) {
    // Run tests for specific habitat
    const habitatConfigPath = rel('habitats/' + testTarget + '/config.yaml');
    if (!await fileExists(habitatConfigPath)) {
      console.error(colors.red(`Habitat ${testTarget} not found`));
      process.exit(1);
    }

    const habitatConfig = await loadConfig(habitatConfigPath);

    if (testType === 'system') {
      // Check if habitat bypasses system/shared infrastructure
      if (habitatConfig.claude?.bypass_habitat_construction) {
        console.log(colors.yellow(`❌ System tests are not available for ${testTarget} habitat`));
        console.log(colors.yellow(`This habitat uses bypass_habitat_construction and manages its own infrastructure.`));
        return;
      }
      console.log(`Running system tests in ${testTarget} habitat...`);
      await runSystemTests(habitatConfig, false, rebuild, habitatConfigPath);
    } else if (testType === 'shared') {
      // Check if habitat bypasses system/shared infrastructure
      if (habitatConfig.claude?.bypass_habitat_construction) {
        console.log(colors.yellow(`❌ Shared tests are not available for ${testTarget} habitat`));
        console.log(colors.yellow(`This habitat uses bypass_habitat_construction and manages its own infrastructure.`));
        return;
      }
      console.log(`Running shared tests in ${testTarget} habitat...`);
      await runSharedTests(habitatConfig, false, rebuild, habitatConfigPath);
    } else {
      // Default: run all tests for the habitat
      await runHabitatTests(testTarget, false, rebuild);
    }
  } else {
    console.error(colors.red('Invalid test configuration'));
    process.exit(1);
  }
}

async function runAllTests() {
  console.log(colors.yellow('=== Running All Tests ===\n'));

  console.log('1. System Tests:');
  await runSystemTests();

  console.log('\n2. Shared Tests:');
  await runSharedTests();

  // Run tests for all habitats
  const habitatsDir = rel('habitats');
  try {
    const dirs = await fs.readdir(habitatsDir);
    for (const dir of dirs) {
      const configPath = path.join(habitatsDir, dir, 'config.yaml');
      if (await fileExists(configPath)) {
        console.log(`\n3. ${dir} Habitat Tests:`);
        await runHabitatTests(dir);
      }
    }
  } catch (err) {
    console.log('No habitats found to test');
  }
}

async function runSystemTests(habitatConfig = null, captureResults = false, rebuild = false, configPath = null) {
  console.log(colors.yellow('Running system infrastructure tests...\n'));

  // If no habitat provided, use the base habitat
  if (!habitatConfig) {
    const baseConfigPath = rel('habitats/base/config.yaml');
    habitatConfig = await loadConfig(baseConfigPath);
    configPath = configPath || baseConfigPath;
  }

  const systemConfig = await loadConfig(rel('system/config.yaml'));
  if (systemConfig.tests && systemConfig.tests.length > 0) {
    return await runTestsInHabitatContainer(systemConfig.tests, 'system', habitatConfig, captureResults, rebuild, configPath);
  } else {
    console.log('No system tests configured');
    return captureResults ? [{ type: 'info', message: 'No system tests configured' }] : undefined;
  }
}

async function runSharedTests(habitatConfig = null, captureResults = false, rebuild = false, configPath = null) {
  console.log(colors.yellow('Running shared configuration tests...\n'));

  // If no habitat provided, use the base habitat
  if (!habitatConfig) {
    const baseConfigPath = rel('habitats/base/config.yaml');
    habitatConfig = await loadConfig(baseConfigPath);
    configPath = configPath || baseConfigPath;
  }

  const sharedConfig = await loadConfig(rel('shared/config.yaml'));
  if (sharedConfig.tests && sharedConfig.tests.length > 0) {
    return await runTestsInHabitatContainer(sharedConfig.tests, 'shared', habitatConfig, captureResults, rebuild, configPath);
  } else {
    console.log('No shared tests configured');
    return captureResults ? [{ type: 'info', message: 'No shared tests configured' }] : undefined;
  }
}

async function runHabitatTests(habitatName, captureResults = false, rebuild = false) {
  console.log(colors.yellow(`Running tests for ${habitatName} habitat...\n`));

  const habitatConfigPath = rel('habitats/' + habitatName + '/config.yaml');
  if (!await fileExists(habitatConfigPath)) {
    console.error(colors.red(`Configuration file not found for ${habitatName}`));
    return captureResults ? [{ type: 'error', message: `Configuration file not found for ${habitatName}` }] : undefined;
  }

  const habitatConfig = await loadConfig(habitatConfigPath);
  const results = [];

  // Run system tests
  console.log('1. System tests:');
  const systemResults = await runSystemTests(habitatConfig, captureResults, rebuild, habitatConfigPath);
  if (captureResults && systemResults) results.push(...systemResults);

  // Run shared tests
  console.log('\n2. Shared tests:');
  const sharedResults = await runSharedTests(habitatConfig, captureResults, rebuild, habitatConfigPath);
  if (captureResults && sharedResults) results.push(...sharedResults);

  // Run habitat-specific tests
  if (habitatConfig.tests && habitatConfig.tests.length > 0) {
    console.log(`\n3. ${habitatName}-specific tests:`);
    const habitatResults = await runTestsInHabitatContainer(habitatConfig.tests, 'habitat', habitatConfig, captureResults, rebuild, habitatConfigPath);
    if (captureResults && habitatResults) results.push(...habitatResults);
  } else {
    console.log(`\n3. No ${habitatName}-specific tests configured`);
    if (captureResults) results.push({ type: 'info', message: `No ${habitatName}-specific tests configured` });
  }

  return captureResults ? results : undefined;
}

async function runTestsInHabitatContainer(tests, testType, habitatConfig = null, captureResults = false, rebuild = false, configPath = null) {
  if (!habitatConfig) {
    console.error('No habitat configuration provided for testing');
    return captureResults ? [{ type: 'error', message: 'No habitat configuration provided' }] : undefined;
  }

  const containerName = `${habitatConfig.name}_test_${testType}_${Date.now()}`;

  try {
    // Use same tagging system as the build pipeline
    const preparedTag = `habitat-${habitatConfig.name}:12-final`;
    let imageTag = preparedTag;

    if (!await dockerImageExists(preparedTag) || rebuild) {
      if (rebuild) {
        console.log(colors.yellow('🔄 Rebuild requested - building fresh habitat for testing...'));
      } else {
        console.log(colors.yellow('Prepared image not found. Building habitat for testing...'));
      }
    } else {
      // Show cached image message consistent with build pipeline
      console.log(`✅ Using cached snapshot: ${preparedTag} (12-final)`);
    }

    if (!await dockerImageExists(preparedTag) || rebuild) {
      
      // Use new progressive build pipeline instead of old build functions
      const { createBuildPipeline } = require('./build-lifecycle');
      const { ProgressReporter } = require('./progress-ui');
      
      // Create build pipeline for the habitat
      const pipeline = await createBuildPipeline(configPath || habitatConfig._configPath, { rebuild });
      
      // Attach progress reporter
      const progressReporter = new ProgressReporter();
      progressReporter.attach(pipeline);
      
      // Prepare initial context
      let initialContext = {
        config: habitatConfig,
        configPath: configPath || habitatConfig._configPath,
        extraRepos: [],
        rebuild
      };
      
      // If we have a cached snapshot to start from, create container from it
      if (pipeline._context && pipeline._context.baseImageTag && pipeline._context.startFromPhase > 0) {
        const { startTempContainer } = require('./container-operations');
        const containerId = await startTempContainer(pipeline._context.baseImageTag);
        initialContext.containerId = containerId;
        initialContext.baseImageTag = pipeline._context.baseImageTag;
      }
      
      // Run the pipeline to create the prepared image
      const context = await pipeline.run(initialContext);
      
      // Check if we actually built something or used fully cached image
      if (context.containerId) {
        // Clean up build container (final snapshot already created by pipeline)
        await dockerRun(['stop', context.containerId]);
        await dockerRun(['rm', context.containerId]);
      }
      
      // The final image should exist with our expected tag
      imageTag = preparedTag;
    }

    console.log(`Using habitat image: ${imageTag}`);

    // Get resolved environment variables for USER and WORKDIR
    let containerUser = 'root';
    let workDir = '/workspace';
    let compiledEnv = {};
    try {
      const { createHabitatPathHelpers } = require('./habitat-path-helpers');
      const pathHelpers = await createHabitatPathHelpers(habitatConfig);
      compiledEnv = pathHelpers.getEnvironment();
      containerUser = compiledEnv.USER || 'root';
      workDir = compiledEnv.WORKDIR || '/workspace';
    } catch (err) {
      console.warn(`Warning: Could not resolve environment variables: ${err.message}`);
    }

    // Environment variables will be handled later from compiled environment

    const { spawn } = require('child_process');
    
    console.log('Running tests in ephemeral container...\n');

    // Build test commands to run inside ephemeral container
    const testCommands = tests.map(testScript => {
      let testPath;
      if (testType === 'habitat') {
        // For bypass habitats (like claude-habitat), tests are in habitats/{name}/tests/
        // For normal habitats, tests are in /habitat/local/tests/
        const isBypassHabitat = habitatConfig?.claude?.bypass_habitat_construction || false;
        const localPath = compiledEnv.LOCAL_PATH || '/habitat/local';
        testPath = isBypassHabitat 
          ? `${workDir}/habitats/${habitatConfig.name}/${testScript}`
          : `${localPath}/${testScript}`;
      } else {
        // System/shared tests - check for bypass habitat to use correct path
        const isBypassHabitat = habitatConfig?.claude?.bypass_habitat_construction || false;
        if (isBypassHabitat) {
          // For bypass habitats, tests are not copied to /habitat structure
          testPath = `${workDir}/${testType}/${testScript}`;
        } else {
          // For normal habitats, tests are in /habitat structure
          const basePath = testType === 'system' 
            ? (compiledEnv.SYSTEM_PATH || '/habitat/system')
            : (compiledEnv.SHARED_PATH || '/habitat/shared');
          testPath = `${basePath}/${testScript}`;
        }
      }

      return `
        echo "Running ${testScript}..."
        if [ -f ${testPath} ]; then
          ${testPath}
        else
          echo "Test not found: ${testPath}"
          exit 1
        fi
      `;
    }).join('\n');

    // Use compiled environment variables 
    const systemPath = compiledEnv.SYSTEM_PATH || '/habitat/system';
    const sharedPath = compiledEnv.SHARED_PATH || '/habitat/shared';
    const systemToolsPath = compiledEnv.SYSTEM_TOOLS_PATH || `${systemPath}/tools/bin`;
    const envPath = compiledEnv.PATH || `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${systemToolsPath}`;

    // Execute tests using ephemeral container with docker run --rm
    // NOTE: We rely on the entrypoint script to set up the environment properly,
    // rather than manually duplicating environment setup or passing -e flags.
    // This ensures consistency with how the main habitat runner works.
    const testScript = `#!/bin/bash
set -e

${testCommands}
echo "All tests completed"
`;

    // NOTE: We do NOT pass environment variables via -e flags because:
    // 1. The entrypoint script (/entrypoint.sh) and habitat-env.sh handle all environment setup
    // 2. Passing -e variables can override the container's built-in environment setup
    // 3. This approach maintains consistency with the main habitat execution path

    // Load and resolve volumes from configuration
    const { loadAndResolveVolumes, buildVolumeArgs } = require('./volume-resolver');
    const resolvedVolumes = await loadAndResolveVolumes(habitatConfig, compiledEnv);
    const volumeArgs = buildVolumeArgs(resolvedVolumes);
    
    // Docker run arguments for ephemeral test execution
    // NOTE: We use the entrypoint script for consistency with main habitat execution.
    // No -e or -w flags needed as the entrypoint handles environment and working directory.
    const dockerArgs = [
      'run', '--rm',
      '-u', containerUser,
      ...volumeArgs,
      imageTag,
      '/entrypoint.sh', '/bin/bash', '-c', testScript
    ];

    let results = [];
    try {
      // Execute test container and capture output
      const output = await new Promise((resolve, reject) => {
        const dockerProcess = spawn('docker', dockerArgs);
        let stdout = '';
        let stderr = '';
        
        dockerProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        dockerProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        dockerProcess.on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`Test execution failed with exit code ${code}. stderr: ${stderr}`));
          }
        });
        
        dockerProcess.on('error', (error) => {
          reject(new Error(`Process error: ${error.message}`));
        });
      });
      
      console.log(output);
      results = parseTestOutput(output, testType);
    } catch (err) {
      results = [{
        type: 'error',
        message: `Test execution failed: ${err.message}`,
        scope: testType
      }];
    }
    // No cleanup needed - container is automatically removed with --rm

    return captureResults ? results : undefined;

  } catch (err) {
    console.error(colors.red(`Error running tests: ${err.message}`));
    return captureResults ? [{ type: 'error', message: err.message }] : undefined;
  }
}

function parseTestOutput(output, testType) {
  const results = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Parse TAP output
    if (line.match(/^ok \d+/)) {
      const match = line.match(/^ok \d+ - (.+)/);
      results.push({
        type: 'pass',
        test: match ? match[1] : line,
        details: line
      });
    } else if (line.match(/^not ok \d+/)) {
      const match = line.match(/^not ok \d+ - (.+)/);
      results.push({
        type: 'fail',
        test: match ? match[1] : line,
        details: line
      });
    } else if (line.match(/^# /)) {
      // TAP diagnostic message
      results.push({
        type: 'info',
        message: line.replace(/^# /, ''),
        details: line
      });
    } else if (line.includes('Error') || line.includes('Failed')) {
      results.push({
        type: 'error',
        message: line,
        details: line
      });
    }
  }

  // If no structured results found, treat the whole output as info
  if (results.length === 0) {
    results.push({
      type: 'info',
      message: `${testType} tests completed`,
      details: output
    });
  }

  return results;
}

function getTestTypeName(choice) {
  switch (choice) {
    case 'a': case '': return 'All Tests';
    case 'y': return 'System Tests';
    case 's': return 'Shared Tests';
    case 'h': return 'Habitat Tests';
    case 'f': return 'Filesystem Verification';
    default: return 'Unknown';
  }
}

async function saveTestResults(results, habitatName, testChoice, duration) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `test-results-${habitatName}-${getTestTypeName(testChoice).replace(/\s+/g, '-').toLowerCase()}-${timestamp}.json`;
  const filepath = rel('test-results/' + filename);

  // Ensure test-results directory exists
  await fs.mkdir(path.dirname(filepath), { recursive: true });

  const data = {
    habitatName,
    testType: getTestTypeName(testChoice),
    duration: parseFloat(duration),
    timestamp: new Date().toISOString(),
    results
  };

  try {
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    console.log(colors.green(`✅ Test results saved to: ${filename}`));
  } catch (err) {
    console.error(colors.red(`❌ Failed to save test results: ${err.message}`));
  }
}

module.exports = {
  runTestMode,
  runAllTests,
  runSystemTests,
  runSharedTests,
  runHabitatTests,
  runTestsInHabitatContainer,
  parseTestOutput,
  getTestTypeName,
  saveTestResults
};