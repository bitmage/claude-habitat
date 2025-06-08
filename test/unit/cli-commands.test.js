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

test('start command with failing container exits with code 1', async () => {
  console.log('Testing start command with failing container...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  // Use a command that will definitely fail
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
  
  // Should exit with code 1 when container fails
  assert.strictEqual(result.code, 1, `Failed container should exit with code 1, got ${result.code}`);
  
  // Should show habitat startup failed message (not interactive menu)
  assert.ok(result.stdout.includes('Habitat startup failed') || result.stderr.includes('Error starting habitat'), 
           'Should show habitat startup failed message');
  
  // Should NOT show interactive menu prompts
  assert.ok(!result.stdout.includes('[t] Try a different habitat') && 
           !result.stdout.includes('[m] Go back to main menu'), 
           'Should not show interactive menu options in CLI mode');
  
  console.log('✅ Start command with failing container exits with error code 1');
});

test('start command does not hang on container failure', async () => {
  console.log('Testing start command completes quickly on failure...');
  
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
  assert.ok(result.completed, 'Start command should complete on failure, not hang');
  assert.strictEqual(result.code, 1, 'Should exit with error code');
  assert.ok(result.duration < 45000, `Should complete within timeout, took ${result.duration}ms`);
  
  console.log(`✅ Start command completes quickly on failure (${result.duration}ms)`);
});

test('start command shows CLI-appropriate error messages', async () => {
  console.log('Testing start command error message format...');
  
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
  
  // Should show appropriate error context
  assert.ok(allOutput.includes('Configuration file errors') || 
           allOutput.includes('Docker connectivity issues') ||
           allOutput.includes('Repository access problems') ||
           allOutput.includes('Missing dependencies'),
           'Should show diagnostic information');
  
  // Should show failure message
  assert.ok(allOutput.includes('Habitat startup failed') || 
           allOutput.includes('Error starting habitat'),
           'Should show clear failure message');
  
  // Should NOT ask for user input in CLI mode
  assert.ok(!allOutput.includes('Would you like to:'),
           'Should not prompt for user choice in CLI mode');
  
  console.log('✅ Start command shows appropriate CLI error messages');
});