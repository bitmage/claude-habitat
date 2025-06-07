const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

const { colors, sleep, fileExists, calculateCacheHash, executeCommand, processTestResults, manageContainer, rel } = require('./utils');
const { dockerRun, dockerImageExists } = require('./docker');
const { loadConfig } = require('./config');
const { askToContinue } = require('./cli');

// Test running functionality
async function runTestMode(testType, testTarget) {
  console.log(colors.green('\n=== Claude Habitat Test Runner ===\n'));

  if (testType === 'all' && !testTarget) {
    // Run all tests for all habitats
    await runAllTests();
  } else if (testType === 'menu' || (!testType && !testTarget)) {
    // Show test menu
    await showTestMenu();
  } else if (testTarget) {
    // Run tests for specific habitat
    const habitatConfigPath = rel('habitats', testTarget, 'config.yaml');
    if (!await fileExists(habitatConfigPath)) {
      console.error(colors.red(`Habitat ${testTarget} not found`));
      process.exit(1);
    }

    const habitatConfig = await loadConfig(habitatConfigPath);

    if (testType === 'system') {
      console.log(`Running system tests in ${testTarget} habitat...`);
      await runSystemTests(habitatConfig);
    } else if (testType === 'shared') {
      console.log(`Running shared tests in ${testTarget} habitat...`);
      await runSharedTests(habitatConfig);
    } else if (testType === 'verify-fs') {
      console.log(`Running filesystem verification for ${testTarget} habitat...`);
      const { runFilesystemVerification } = require('./filesystem');
      await runFilesystemVerification(habitatConfig);
    } else if (testType === 'habitat') {
      console.log(`Running ${testTarget}-specific tests...`);
      if (habitatConfig.tests && habitatConfig.tests.length > 0) {
        await runTestsInHabitatContainer(habitatConfig.tests, 'habitat', habitatConfig);
      } else {
        console.log(`No ${testTarget}-specific tests configured`);
      }
    } else {
      // Default: run all tests for the habitat
      await runHabitatTests(testTarget);
    }
  } else {
    console.error(colors.red('Invalid test configuration'));
    process.exit(1);
  }
}

async function showTestMenu() {
  const habitatsDir = rel('habitats');
  let habitats = [];

  try {
    const dirs = await fs.readdir(habitatsDir);
    for (const dir of dirs) {
      const configPath = path.join(habitatsDir, dir, 'config.yaml');
      if (await fileExists(configPath)) {
        habitats.push({ name: dir, path: configPath });
      }
    }
    habitats.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.log('No habitats directory found');
    return;
  }

  if (habitats.length === 0) {
    console.log('No habitats found to test');
    return;
  }

  console.log('Select Habitat to Test:\n');

  habitats.forEach((habitat, index) => {
    const key = (index + 1).toString();
    console.log(`  ${colors.yellow(`[${key}]`)} ${habitat.name}`);
  });
  console.log('');
  console.log(`  ${colors.yellow('[b]')}ack - Return to main menu\n`);

  // Use single keypress for habitat selection
  const choice = await new Promise(resolve => {
    if (!process.stdin.isTTY) {
      // Fallback for non-TTY mode
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('Select habitat: ', answer => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onKeypress = (key) => {
      // Handle Ctrl+C
      if (key === '\u0003') {
        console.log('\n');
        process.exit(0);
      }

      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onKeypress);
      resolve(key.toLowerCase());
    };

    process.stdin.on('data', onKeypress);
  });

  if (choice === 'b') {
    // Return to main menu
    await returnToMainMenu();
    return;
  }

  // Check if it's a habitat number
  const habitatIndex = parseInt(choice) - 1;
  if (!isNaN(habitatIndex) && habitatIndex >= 0 && habitatIndex < habitats.length) {
    await showHabitatTestMenu(habitats[habitatIndex].name);
  } else {
    console.error(colors.red('\n❌ Invalid choice'));
    await sleep(1500);
    await showTestMenu();
  }
}

async function showHabitatTestMenu(habitatName) {
  console.log(`\n${colors.green(`=== Testing ${habitatName} ===`)}\n`);
  console.log('Which tests to run?\n');
  console.log(`  ${colors.yellow('[a]')}ll     - Run all tests (default)`);
  console.log(`  s${colors.yellow('[y]')}stem  - System infrastructure only`);
  console.log(`  ${colors.yellow('[s]')}hared   - Shared configuration only`);
  console.log(`  ${colors.yellow('[h]')}abitat - ${habitatName}-specific tests only`);
  console.log(`  ${colors.yellow('[f]')}ile system - File system operations`);
  console.log(`  ${colors.yellow('[b]')}ack    - Back to habitat selection\n`);

  // Use single keypress with support for multi-char options
  const choice = await new Promise(resolve => {
    if (!process.stdin.isTTY) {
      // Fallback for non-TTY mode
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('Select test type (a/y/s/h/f/b): ', answer => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onKeypress = (key) => {
      // Handle Ctrl+C
      if (key === '\u0003') {
        console.log('\n');
        process.exit(0);
      }

      // For single key presses, resolve immediately
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onKeypress);
      resolve(key.toLowerCase());
    };

    process.stdin.on('data', onKeypress);
  });

  console.log(''); // Add newline after selection

  if (choice === 'b') {
    await showTestMenu();
    return;
  }

  // Capture test results for interactive display
  let testResults = [];
  const startTime = new Date();

  if (choice === 'a' || choice === '') {
    // Default to all tests
    testResults = await runHabitatTests(habitatName, true);
  } else if (choice === 'y') {
    testResults = await runSystemTests(null, true);
  } else if (choice === 's') {
    testResults = await runSharedTests(null, true);
  } else if (choice === 'h') {
    // Run only habitat-specific tests
    const habitatConfigPath = rel('habitats', habitatName, 'config.yaml');
    const habitatConfig = await loadConfig(habitatConfigPath);

    if (habitatConfig.tests && habitatConfig.tests.length > 0) {
      console.log(`Running ${habitatName}-specific tests...\n`);
      testResults = await runTestsInHabitatContainer(habitatConfig.tests, 'habitat', habitatConfig, true);
    } else {
      console.log(`No ${habitatName}-specific tests configured`);
      testResults = [{ type: 'info', message: `No ${habitatName}-specific tests configured` }];
    }
  } else if (choice === 'f') {
    // Run filesystem verification for this habitat
    const habitatConfigPath = rel('habitats', habitatName, 'config.yaml');
    const habitatConfig = await loadConfig(habitatConfigPath);

    console.log(`Running filesystem verification for ${habitatName}...\n`);
    const { runFilesystemVerification } = require('./filesystem');
    await runFilesystemVerification(habitatConfig);
    testResults = [{ type: 'info', message: 'Filesystem verification completed' }];
  } else {
    console.error(colors.red('\n❌ Invalid choice'));
    await sleep(1500);
    await showHabitatTestMenu(habitatName);
    return;
  }

  const endTime = new Date();
  const duration = ((endTime - startTime) / 1000).toFixed(1);

  // Show results screen for interactive mode
  await showTestResults(testResults, habitatName, choice, duration);
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

async function runSystemTests(habitatConfig = null, captureResults = false) {
  console.log(colors.yellow('Running system infrastructure tests...\n'));

  // If no habitat provided, use the base habitat
  if (!habitatConfig) {
    const baseConfigPath = rel('habitats', 'base', 'config.yaml');
    habitatConfig = await loadConfig(baseConfigPath);
  }

  const systemConfig = await loadConfig(rel('system', 'config.yaml'));
  if (systemConfig.tests && systemConfig.tests.length > 0) {
    return await runTestsInHabitatContainer(systemConfig.tests, 'system', habitatConfig, captureResults);
  } else {
    console.log('No system tests configured');
    return captureResults ? [{ type: 'info', message: 'No system tests configured' }] : undefined;
  }
}

async function runSharedTests(habitatConfig = null, captureResults = false) {
  console.log(colors.yellow('Running shared configuration tests...\n'));

  // If no habitat provided, use the base habitat
  if (!habitatConfig) {
    const baseConfigPath = rel('habitats', 'base', 'config.yaml');
    habitatConfig = await loadConfig(baseConfigPath);
  }

  const sharedConfig = await loadConfig(rel('shared', 'config.yaml'));
  if (sharedConfig.tests && sharedConfig.tests.length > 0) {
    return await runTestsInHabitatContainer(sharedConfig.tests, 'shared', habitatConfig, captureResults);
  } else {
    console.log('No shared tests configured');
    return captureResults ? [{ type: 'info', message: 'No shared tests configured' }] : undefined;
  }
}

async function runHabitatTests(habitatName, captureResults = false) {
  console.log(colors.yellow(`Running tests for ${habitatName} habitat...\n`));

  const habitatConfigPath = path.join(__dirname, '../habitats', habitatName, 'config.yaml');
  if (!await fileExists(habitatConfigPath)) {
    console.error(colors.red(`Configuration file not found for ${habitatName}`));
    return captureResults ? [{ type: 'error', message: `Configuration file not found for ${habitatName}` }] : undefined;
  }

  const habitatConfig = await loadConfig(habitatConfigPath);
  const results = [];

  // Run system tests
  console.log('1. System tests:');
  const systemResults = await runSystemTests(habitatConfig, captureResults);
  if (captureResults && systemResults) results.push(...systemResults);

  // Run shared tests
  console.log('\n2. Shared tests:');
  const sharedResults = await runSharedTests(habitatConfig, captureResults);
  if (captureResults && sharedResults) results.push(...sharedResults);

  // Run habitat-specific tests
  if (habitatConfig.tests && habitatConfig.tests.length > 0) {
    console.log(`\n3. ${habitatName}-specific tests:`);
    const habitatResults = await runTestsInHabitatContainer(habitatConfig.tests, 'habitat', habitatConfig, captureResults);
    if (captureResults && habitatResults) results.push(...habitatResults);
  } else {
    console.log(`\n3. No ${habitatName}-specific tests configured`);
    if (captureResults) results.push({ type: 'info', message: `No ${habitatName}-specific tests configured` });
  }

  return captureResults ? results : undefined;
}

async function runTestsInHabitatContainer(tests, testType, habitatConfig = null, captureResults = false) {
  if (!habitatConfig) {
    console.error('No habitat configuration provided for testing');
    return captureResults ? [{ type: 'error', message: 'No habitat configuration provided' }] : undefined;
  }

  const containerName = `${habitatConfig.name}_test_${testType}_${Date.now()}`;

  try {
    // Get or build the prepared image for testing
    const hash = calculateCacheHash(habitatConfig, []);
    const preparedTag = `claude-habitat-${habitatConfig.name}:${hash}`;
    let imageTag = preparedTag;

    if (!await dockerImageExists(preparedTag)) {
      console.log(colors.yellow('Prepared image not found. Building habitat for testing...'));
      const { buildBaseImage, buildPreparedImage } = require('../claude-habitat');
      await buildBaseImage(habitatConfig);
      await buildPreparedImage(habitatConfig, preparedTag, []);
      imageTag = preparedTag;
    }

    console.log(`Using habitat image: ${imageTag}`);

    // Start test container with same configuration as normal habitat
    const workDir = habitatConfig.container?.work_dir || '/src';
    const containerUser = habitatConfig.container?.user || 'root';

    // Parse environment variables from config
    const envArgs = [];
    if (habitatConfig.environment && Array.isArray(habitatConfig.environment)) {
      habitatConfig.environment.forEach(env => {
        if (env && typeof env === 'string' && !env.startsWith('GITHUB_APP_PRIVATE_KEY_FILE=')) {
          envArgs.push('-e', env.replace(/^- /, ''));
        }
      });
    }

    // Build test command to run instead of normal init
    const testCommands = tests.map(testScript => {
      const testPath = testType === 'habitat'
        ? `${workDir}/habitat/local/${testScript}`
        : `${workDir}/habitat/${testType}/${testScript}`;

      return `
        echo "Running ${testScript}..."
        if [ -f ${testPath} ]; then
          chmod +x ${testPath}
          ${testPath}
        else
          echo "Test not found: ${testPath}"
          exit 1
        fi
      `;
    }).join('\n');

    // Create the full test script
    const testEntrypoint = `
      #!/bin/bash
      set -e

      # Source environment
      set -a; source /etc/environment 2>/dev/null || true; set +a

      # Run all tests
      ${testCommands}

      echo "All tests completed"
    `;

    // Run container with test script as entrypoint
    const runArgs = [
      'run', '--rm',
      '--name', containerName,
      '-w', workDir,
      ...envArgs
    ];

    // Add volume mounts if specified
    if (habitatConfig.volumes && Array.isArray(habitatConfig.volumes)) {
      habitatConfig.volumes.forEach(volume => {
        runArgs.push('-v', volume);
      });
    }

    runArgs.push(imageTag, '/bin/bash', '-c', testEntrypoint);

    console.log('Running tests in container...\n');

    let results = [];
    if (captureResults) {
      try {
        const output = await execAsync(`docker ${runArgs.join(' ')}`);
        results = parseTestOutput(output, testType);
      } catch (err) {
        results = [{
          type: 'error',
          message: `Test execution failed: ${err.message}`,
          details: err.stdout || err.stderr || ''
        }];
      }
    } else {
      await dockerRun(runArgs);
    }

    return captureResults ? results : undefined;

  } catch (err) {
    console.error(colors.red(`Error running tests: ${err.message}`));
    // Container already removed with --rm flag
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

async function showTestResults(results, habitatName, testChoice, duration) {
  console.log(`\n${colors.green('=')}${colors.green('='.repeat(50))}${colors.green('=')}`);
  console.log(`${colors.green('Test Results Summary')}`);
  console.log(`${colors.green('=')}${colors.green('='.repeat(50))}${colors.green('=')}`);

  console.log(`\nHabitat: ${colors.cyan(habitatName)}`);
  console.log(`Test Type: ${colors.cyan(getTestTypeName(testChoice))}`);
  console.log(`Duration: ${colors.cyan(duration + 's')}`);
  console.log(`Timestamp: ${colors.cyan(new Date().toLocaleString())}\n`);

  // Count results by type
  const counts = {
    pass: results.filter(r => r.type === 'pass').length,
    fail: results.filter(r => r.type === 'fail').length,
    error: results.filter(r => r.type === 'error').length,
    info: results.filter(r => r.type === 'info').length
  };

  console.log(`${colors.green('✓ Passed:')} ${counts.pass}`);
  console.log(`${colors.red('✗ Failed:')} ${counts.fail}`);
  console.log(`${colors.red('⚠ Errors:')} ${counts.error}`);
  console.log(`${colors.yellow('ℹ Info:')} ${counts.info}\n`);

  // Show failed tests first
  const failedTests = results.filter(r => r.type === 'fail' || r.type === 'error');
  if (failedTests.length > 0) {
    console.log(`${colors.red('Failed Tests:')}`);
    failedTests.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.test || result.message}`);
      if (result.details && result.details !== result.message) {
        console.log(`     ${colors.gray(result.details)}`);
      }
    });
    console.log('');
  }

  // Show passed tests
  const passedTests = results.filter(r => r.type === 'pass');
  if (passedTests.length > 0) {
    console.log(`${colors.green('Passed Tests:')}`);
    passedTests.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.test || result.message}`);
    });
    console.log('');
  }

  console.log(`${colors.green('=')}${colors.green('='.repeat(50))}${colors.green('=')}\n`);

  // Interactive options
  console.log('Options:');
  console.log(`  ${colors.yellow('[r]')}erun  - Run tests again`);
  console.log(`  ${colors.yellow('[s]')}ave   - Save results to file`);
  console.log(`  ${colors.yellow('[b]')}ack   - Return to test menu`);
  console.log(`  ${colors.yellow('[m]')}ain   - Return to main menu\n`);

  const choice = await new Promise(resolve => {
    if (!process.stdin.isTTY) {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('Choose option (r/s/b/m): ', answer => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onKeypress = (key) => {
      if (key === '\u0003') {
        console.log('\n');
        process.exit(0);
      }

      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onKeypress);
      resolve(key.toLowerCase());
    };

    process.stdin.on('data', onKeypress);
  });

  console.log('');

  switch (choice) {
    case 'r':
      await showHabitatTestMenu(habitatName);
      break;
    case 's':
      await saveTestResults(results, habitatName, testChoice, duration);
      await askToContinue();
      await showTestResults(results, habitatName, testChoice, duration);
      break;
    case 'b':
      await showTestMenu();
      break;
    case 'm':
    default:
      const { returnToMainMenu } = require('../claude-habitat');
      await returnToMainMenu();
      break;
  }
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
  const filepath = rel('test-results', filename);

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
  showTestMenu,
  showHabitatTestMenu,
  runAllTests,
  runSystemTests,
  runSharedTests,
  runHabitatTests,
  runTestsInHabitatContainer,
  parseTestOutput,
  showTestResults,
  getTestTypeName,
  saveTestResults
};
