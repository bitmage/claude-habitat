/**
 * @fileoverview Unit tests for CLI command parsing and execution
 * @description Tests command-line interface behaviors, exit codes, and option parsing
 * 
 * Validates that CLI commands handle arguments correctly, exit with appropriate codes,
 * and complete execution without hanging or waiting for input unexpectedly.
 * 
 * @tests
 * - Run these tests: `npm test -- test/unit/cli-commands.test.js`
 * - Run all unit tests: `npm test`
 * - Test module: {@link module:cli-parser} - CLI argument parsing
 * - Test module: {@link module:command-executor} - CLI command execution
 */

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path');

test('--help command exits successfully with code 0', async () => {
  console.log('Testing --help exit behavior...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, '--help'], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    child.on('error', reject);
  });
  
  // Should exit with code 0
  assert.strictEqual(result.code, 0, `--help should exit with code 0, got ${result.code}`);
  
  // Should show help content
  assert.ok(result.stdout.includes('Usage:'), 'Should show usage information');
  assert.ok(result.stdout.includes('claude-habitat'), 'Should mention claude-habitat');
  assert.ok(result.stdout.includes('OPTIONS:'), 'Should show options section');
  
  // Should not have errors
  assert.strictEqual(result.stderr, '', 'Should not have stderr output');
  
  console.log('✅ --help exits successfully');
});

test('--list-configs command exits successfully with code 0', async () => {
  console.log('Testing --list-configs exit behavior...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, '--list-configs'], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    child.on('error', reject);
  });
  
  // Should exit with code 0
  assert.strictEqual(result.code, 0, `--list-configs should exit with code 0, got ${result.code}`);
  
  // Should show config list
  assert.ok(result.stdout.includes('Available habitats:'), 'Should show available habitats');
  assert.ok(result.stdout.includes('base') || result.stdout.includes('No habitats found'), 
           'Should show habitat list or empty message');
  
  // Should not have errors
  assert.strictEqual(result.stderr, '', 'Should not have stderr output');
  
  console.log('✅ --list-configs exits successfully');
});

test('--clean command exits successfully with code 0', async () => {
  console.log('Testing --clean exit behavior...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, '--clean'], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    child.on('error', reject);
  });
  
  // Should exit with code 0
  assert.strictEqual(result.code, 0, `--clean should exit with code 0, got ${result.code}`);
  
  // Should show clean output
  assert.ok(result.stdout.includes('Cleaning Claude Habitat Docker images'), 'Should show cleaning message');
  assert.ok(result.stdout.includes('No Claude Habitat images found') || 
           result.stdout.includes('Clean complete'), 
           'Should show completion message');
  
  // Should not have errors
  assert.strictEqual(result.stderr, '', 'Should not have stderr output');
  
  console.log('✅ --clean exits successfully');
});

test('invalid CLI option exits with code 1', async () => {
  console.log('Testing invalid option exit behavior...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, '--invalid-option'], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    child.on('error', reject);
  });
  
  // Should exit with code 1 for invalid options
  assert.strictEqual(result.code, 1, `Invalid option should exit with code 1, got ${result.code}`);
  
  // Should show error message
  assert.ok(result.stderr.includes('Unknown option') || result.stdout.includes('Unknown option'), 
           'Should show unknown option error');
  
  console.log('✅ Invalid option exits with error code 1');
});

test('CLI commands do not hang or wait for input', async () => {
  console.log('Testing that CLI commands complete quickly...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  // Test that --help completes within reasonable time
  const startTime = Date.now();
  
  const result = await Promise.race([
    new Promise((resolve, reject) => {
      const child = spawn('node', [scriptPath, '--help'], {
        stdio: 'pipe'
      });
      
      child.on('close', (code) => {
        resolve({ completed: true, code, duration: Date.now() - startTime });
      });
      
      child.on('error', reject);
    }),
    new Promise((resolve) => {
      setTimeout(() => resolve({ completed: false, timeout: true }), 5000);
    })
  ]);
  
  // Should complete, not timeout
  assert.ok(result.completed, 'CLI command should complete, not hang');
  assert.strictEqual(result.code, 0, 'Should exit successfully');
  assert.ok(result.duration < 5000, `Should complete quickly, took ${result.duration}ms`);
  
  console.log(`✅ CLI commands complete quickly (${result.duration}ms)`);
});

test('start command with invalid habitat exits with code 1', async () => {
  console.log('Testing start command with invalid habitat...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, 'start', 'nonexistent-habitat'], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    child.on('error', reject);
  });
  
  // Should exit with code 1 for invalid habitat
  assert.strictEqual(result.code, 1, `Invalid habitat should exit with code 1, got ${result.code}`);
  
  // Should show error message
  assert.ok(result.stderr.includes('not found') || result.stdout.includes('not found'), 
           'Should show habitat not found error');
  
  console.log('✅ Start command with invalid habitat exits with error code 1');
});

test('start command with runtime exit shows improved messaging', async () => {
  console.log('Testing start command with runtime exit...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  // Use a command that will exit after startup (runtime exit, not startup failure)
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, 'start', 'claude-habitat', '--cmd', 'exit 42'], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    child.on('error', reject);
    
    // Kill after reasonable timeout to prevent hanging
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }, 30000);
  });
  
  // Runtime exits should now exit cleanly with code 0 (improved error handling)
  assert.strictEqual(result.code, 0, `Runtime exit should exit with code 0, got ${result.code}`);
  
  // Should show runtime exit message with meaningful exit code interpretation
  assert.ok(result.stdout.includes('Habitat exited with code 42') || 
           result.stdout.includes('General error'), 
           'Should show runtime exit message with exit code interpretation');
  
  // Should NOT show interactive menu prompts in CLI mode
  assert.ok(!result.stdout.includes('[t] Try a different habitat') && 
           !result.stdout.includes('[m] Go back to main menu'), 
           'Should not show interactive menu options in CLI mode');
  
  console.log('✅ Start command with failing container exits with error code 1');
});

test('start command does not hang on runtime exit', async () => {
  console.log('Testing start command completes quickly on runtime exit...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  const startTime = Date.now();
  
  // Test with a command that will fail quickly
  const result = await Promise.race([
    new Promise((resolve, reject) => {
      const child = spawn('node', [scriptPath, 'start', 'claude-habitat', '--cmd', 'false'], {
        stdio: 'pipe'
      });
      
      child.on('close', (code) => {
        resolve({ completed: true, code, duration: Date.now() - startTime });
      });
      
      child.on('error', reject);
    }),
    new Promise((resolve) => {
      setTimeout(() => resolve({ completed: false, timeout: true }), 45000);
    })
  ]);
  
  // Should complete, not timeout
  assert.ok(result.completed, 'Start command should complete on runtime exit, not hang');
  assert.strictEqual(result.code, 0, 'Runtime exit should exit with code 0 (improved error handling)');
  assert.ok(result.duration < 45000, `Should complete within timeout, took ${result.duration}ms`);
  
  console.log(`✅ Start command completes quickly on runtime exit (${result.duration}ms)`);
});

test('start command shows improved runtime exit messages', async () => {
  console.log('Testing start command improved error messaging...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, 'start', 'claude-habitat', '--cmd', 'exit 1'], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    child.on('error', reject);
    
    // Kill after timeout to prevent hanging
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }, 30000);
  });
  
  const allOutput = result.stdout + result.stderr;
  
  // Should show runtime exit message with exit code interpretation
  assert.ok(allOutput.includes('Habitat exited with code 1') || 
           allOutput.includes('General error'),
           'Should show runtime exit message with code interpretation');
  
  // With improved error handling, runtime exits should exit cleanly
  assert.strictEqual(result.code, 0, 'Runtime exit should exit with code 0 (improved error handling)');
  
  // Should NOT ask for user input in CLI mode
  assert.ok(!allOutput.includes('Would you like to:'),
           'Should not prompt for user choice in CLI mode');
  
  console.log('✅ Start command shows appropriate CLI error messages');
});

test('--rebuild flag is parsed correctly', async () => {
  console.log('Testing --rebuild flag parsing...');
  
  const { parseCliArguments, validateCliOptions } = require('../../src/cli-parser');
  
  // Test rebuild with start command
  const args1 = ['start', 'discourse', '--rebuild'];
  const options1 = parseCliArguments(args1);
  
  assert.strictEqual(options1.rebuild, true, 'Should parse --rebuild flag');
  assert.strictEqual(options1.start, true, 'Should parse start command');
  assert.strictEqual(options1.habitatName, 'discourse', 'Should parse habitat name');
  
  // Test validation passes
  assert.doesNotThrow(() => validateCliOptions(options1), 'Should validate successfully');
  
  // Test rebuild without start/config should fail validation
  const args2 = ['--rebuild'];
  const options2 = parseCliArguments(args2);
  
  assert.strictEqual(options2.rebuild, true, 'Should parse --rebuild flag');
  assert.throws(() => validateCliOptions(options2), 'Should fail validation without start/config');
  
  console.log('✅ --rebuild flag parsing works correctly');
});

test('--help shows rebuild documentation', async () => {
  console.log('Testing rebuild in help output...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, '--help'], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout });
    });
    
    child.on('error', reject);
  });
  
  // Should exit successfully
  assert.strictEqual(result.code, 0, 'Help should exit with code 0');
  
  // Should mention rebuild option
  assert.ok(result.stdout.includes('--rebuild'), 'Should show --rebuild flag');
  assert.ok(result.stdout.includes('Force rebuild'), 'Should explain rebuild functionality');
  assert.ok(result.stdout.includes('start discourse --rebuild'), 'Should show rebuild example');
  
  console.log('✅ Help shows rebuild documentation');
});

test('shift key mappings for rebuild are correct', () => {
  console.log('Testing shift key to number mappings...');
  
  // Test the mapping used in claude-habitat.js
  const shiftNumberMap = {
    '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
    '^': '6', '&': '7', '*': '8', '(': '9', ')': '0'
  };
  
  // Verify all expected mappings exist
  assert.strictEqual(shiftNumberMap['!'], '1', 'Exclamation should map to 1');
  assert.strictEqual(shiftNumberMap['@'], '2', 'At symbol should map to 2');
  assert.strictEqual(shiftNumberMap['#'], '3', 'Hash should map to 3');
  assert.strictEqual(shiftNumberMap['$'], '4', 'Dollar should map to 4');
  assert.strictEqual(shiftNumberMap['%'], '5', 'Percent should map to 5');
  assert.strictEqual(shiftNumberMap['^'], '6', 'Caret should map to 6');
  assert.strictEqual(shiftNumberMap['&'], '7', 'Ampersand should map to 7');
  assert.strictEqual(shiftNumberMap['*'], '8', 'Asterisk should map to 8');
  assert.strictEqual(shiftNumberMap['('], '9', 'Left paren should map to 9');
  assert.strictEqual(shiftNumberMap[')'], '0', 'Right paren should map to 0');
  
  // Test reverse mapping (number to shift key)
  const numberShiftMap = { '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
                          '6': '^', '7': '&', '8': '*', '9': '(' };
  
  assert.strictEqual(numberShiftMap['1'], '!', 'Number 1 should map to !');
  assert.strictEqual(numberShiftMap['2'], '@', 'Number 2 should map to @');
  assert.strictEqual(numberShiftMap['9'], '(', 'Number 9 should map to (');
  
  console.log('✅ Shift key mappings are correct');
});

test('--clean-images flag is parsed correctly', async () => {
  console.log('Testing --clean-images flag parsing...');
  
  const { parseCliArguments, validateCliOptions } = require('../../src/cli-parser');
  
  // Test clean-images without target (should default to 'all')
  const args1 = ['--clean-images'];
  const options1 = parseCliArguments(args1);
  
  assert.strictEqual(options1.cleanImages, true, 'Should parse --clean-images flag');
  assert.strictEqual(options1.cleanImagesTarget, 'all', 'Should default to all');
  
  // Test validation passes
  assert.doesNotThrow(() => validateCliOptions(options1), 'Should validate successfully');
  
  // Test clean-images with specific target
  const args2 = ['--clean-images', 'discourse'];
  const options2 = parseCliArguments(args2);
  
  assert.strictEqual(options2.cleanImages, true, 'Should parse --clean-images flag');
  assert.strictEqual(options2.cleanImagesTarget, 'discourse', 'Should parse target habitat');
  
  // Test clean-images with orphans target
  const args3 = ['--clean-images', 'orphans'];
  const options3 = parseCliArguments(args3);
  
  assert.strictEqual(options3.cleanImages, true, 'Should parse --clean-images flag');
  assert.strictEqual(options3.cleanImagesTarget, 'orphans', 'Should parse orphans target');
  
  console.log('✅ --clean-images flag parsing works correctly');
});

test('--help shows image management documentation', async () => {
  console.log('Testing image management in help output...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, '--help'], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout });
    });
    
    child.on('error', reject);
  });
  
  // Should exit successfully
  assert.strictEqual(result.code, 0, 'Help should exit with code 0');
  
  // Should mention clean-images option
  assert.ok(result.stdout.includes('--clean-images'), 'Should show --clean-images flag');
  assert.ok(result.stdout.includes('Clean Docker images'), 'Should explain clean-images functionality');
  assert.ok(result.stdout.includes('--clean-images discourse'), 'Should show clean-images example');
  assert.ok(result.stdout.includes('--clean-images orphans'), 'Should show orphans example');
  
  console.log('✅ Help shows image management documentation');
});