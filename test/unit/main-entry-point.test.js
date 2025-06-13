/**
 * @fileoverview Unit tests for main application entry point
 * @description Tests that the main claude-habitat.js entry point loads without crashing
 * and responds correctly to command line arguments like --help.
 * 
 * Validates the application startup process, help system functionality, and ensures
 * the main entry point can handle various invocation patterns without errors.
 * 
 * @tests
 * - Run these tests: `npm test -- test/unit/main-entry-point.test.js`
 * - Run all unit tests: `npm test`
 * - Test module: {@link module:claude-habitat} - Main application entry point and CLI interface
 */

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path');

test('main entry point loads without crashing', async () => {
  console.log('Testing main entry point...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  // Test that the script can load and show help
  // Since it waits for user input, we need to kill it after getting output
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, '--help'], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    let outputReceived = false;
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      // Once we see help content, kill the process
      if (stdout.includes('Usage:') && !outputReceived) {
        outputReceived = true;
        setTimeout(() => {
          child.kill('SIGTERM');
        }, 100);
      }
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr, outputReceived });
    });
    
    child.on('error', reject);
    
    // Timeout safety
    setTimeout(() => {
      if (!outputReceived) {
        child.kill('SIGTERM');
      }
    }, 5000);
  });
  
  // Should have received help output
  assert(result.outputReceived, 'Should have received help output');
  
  // Should show help content
  assert(result.stdout.includes('Usage:'), 'Should show usage information');
  assert(result.stdout.includes('claude-habitat'), 'Should mention claude-habitat');
  
  console.log('✅ Main entry point test passed');
});

test('main entry point handles list-configs without crashing', async () => {
  console.log('Testing list-configs command...');
  
  const scriptPath = path.join(__dirname, '../../claude-habitat.js');
  
  // Test that the script can list configs
  // Since it waits for user input, we need to kill it after getting output
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, '--list-configs'], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    let outputReceived = false;
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      // Once we see config list, kill the process
      if ((stdout.includes('Available habitats:') || stdout.includes('base')) && !outputReceived) {
        outputReceived = true;
        setTimeout(() => {
          child.kill('SIGTERM');
        }, 100);
      }
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr, outputReceived });
    });
    
    child.on('error', reject);
    
    // Timeout safety
    setTimeout(() => {
      if (!outputReceived) {
        child.kill('SIGTERM');
      }
    }, 5000);
  });
  
  // Should have received output
  assert(result.outputReceived, 'Should have received list-configs output');
  
  // Should show available configs
  assert(result.stdout.includes('base') || result.stdout.includes('Available'), 
         'Should show available configurations');
  
  console.log('✅ List-configs test passed');
});

test('main entry point repository status check works', async () => {
  console.log('Testing repository status check...');
  
  // This test verifies that the habitatRepoStatus.find fix works
  // by importing and calling the checkHabitatRepositories function directly
  const { checkHabitatRepositories } = require('../../src/habitat');
  const path = require('path');
  
  const habitatsDir = path.join(__dirname, '../../habitats');
  
  // This should return a Map, not throw an error
  const result = await checkHabitatRepositories(habitatsDir);
  
  // Should be a Map
  assert(result instanceof Map, 'checkHabitatRepositories should return a Map');
  
  // Should have some entries (base, claude-habitat, etc.)
  assert(result.size > 0, 'Should find some habitat configurations');
  
  // Map should have get method (not find method)
  assert.strictEqual(typeof result.get, 'function', 'Map should have get method');
  assert.strictEqual(typeof result.find, 'undefined', 'Map should not have find method');
  
  console.log(`✅ Repository status check test passed (${result.size} habitats found)`);
});