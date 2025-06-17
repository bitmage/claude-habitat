/**
 * @fileoverview Unit tests for color utility functions
 * @description Tests terminal color formatting and styling utilities
 * 
 * Validates color function behavior, ANSI escape code generation,
 * and color utility helper functions used throughout the application.
 * 
 * @tests
 * - Run these tests: `npm test -- test/unit/colors.test.js`
 * - Run all unit tests: `npm test`
 * - Test module: {@link module:utils} - Color utilities
 */

const test = require('node:test');
const assert = require('node:assert');
const { colors } = require('../../src/utils');

test('colors object has all required color functions', () => {
  console.log('Testing color function availability...');
  
  // Check all color functions exist
  assert.strictEqual(typeof colors.red, 'function', 'colors.red should be a function');
  assert.strictEqual(typeof colors.green, 'function', 'colors.green should be a function'); 
  assert.strictEqual(typeof colors.yellow, 'function', 'colors.yellow should be a function');
  assert.strictEqual(typeof colors.cyan, 'function', 'colors.cyan should be a function');
  
  console.log('✅ All color functions available');
});

test('color functions produce ANSI escape codes', () => {
  console.log('Testing ANSI escape code generation...');
  
  // Test each color function produces correct ANSI codes
  const redText = colors.red('test');
  assert.ok(redText.includes('\x1b[31m'), 'Red should include red ANSI code');
  assert.ok(redText.includes('\x1b[0m'), 'Red should include reset ANSI code');
  assert.ok(redText.includes('test'), 'Red should include original text');
  
  const greenText = colors.green('test');
  assert.ok(greenText.includes('\x1b[32m'), 'Green should include green ANSI code');
  assert.ok(greenText.includes('\x1b[0m'), 'Green should include reset ANSI code');
  
  const yellowText = colors.yellow('test');
  assert.ok(yellowText.includes('\x1b[33m'), 'Yellow should include yellow ANSI code');
  assert.ok(yellowText.includes('\x1b[0m'), 'Yellow should include reset ANSI code');
  
  const cyanText = colors.cyan('test');
  assert.ok(cyanText.includes('\x1b[36m'), 'Cyan should include cyan ANSI code');
  assert.ok(cyanText.includes('\x1b[0m'), 'Cyan should include reset ANSI code');
  
  console.log('✅ ANSI escape codes test passed');
});

test('color functions handle empty and special strings', () => {
  console.log('Testing color functions with edge cases...');
  
  // Test empty string
  assert.strictEqual(colors.red(''), '\x1b[31m\x1b[0m', 'Should handle empty string');
  
  // Test strings with existing ANSI codes
  const alreadyColored = '\x1b[32mgreen\x1b[0m';
  const redWrapped = colors.red(alreadyColored);
  assert.ok(redWrapped.includes('\x1b[31m'), 'Should add red code');
  assert.ok(redWrapped.includes(alreadyColored), 'Should preserve existing string');
  
  // Test strings with special characters
  const specialChars = '!@#$%^&*()[]{}';
  const coloredSpecial = colors.yellow(specialChars);
  assert.ok(coloredSpecial.includes(specialChars), 'Should handle special characters');
  
  console.log('✅ Edge cases test passed');
});

test('color output is visible in UI sequences', async () => {
  console.log('Testing colors in UI sequences...');
  
  const { runSequence } = require('../../src/scenes/scene-runner');
  const { mainMenuScene } = require('../../src/scenes/main-menu.scene');
  
  // Test without color preservation (should strip colors)
  const contextNoColors = await runSequence(mainMenuScene, 'q');
  const outputNoColors = contextNoColors.getOutput();
  assert.ok(!outputNoColors.includes('\x1b['), 'Should strip ANSI codes by default');
  assert.ok(outputNoColors.includes('Claude Habitat'), 'Should contain menu text');
  
  // Test with color preservation (should keep colors)
  const contextWithColors = await runSequence(mainMenuScene, 'q', { preserveColors: true });
  const outputWithColors = contextWithColors.getOutput();
  assert.ok(outputWithColors.includes('\x1b['), 'Should preserve ANSI codes when requested');
  assert.ok(outputWithColors.includes('Claude Habitat'), 'Should contain menu text');
  
  console.log('✅ UI sequence color test passed');
});

test('CLI color preservation option works', async () => {
  console.log('Testing CLI --preserve-colors option...');
  
  const { spawn } = require('child_process');
  const path = require('path');
  
  // Test CLI with preserve colors
  const result = await new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../claude-habitat.js');
    const child = spawn('node', [scriptPath, '--test-sequence=q', '--preserve-colors'], {
      stdio: 'pipe',
      timeout: 10000
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
  
  // Should have ANSI codes when preserve-colors is used
  // Debug: log the output to see what we're getting
  if (!result.stdout.includes('\x1b[')) {
    console.log('Debug: No ANSI codes found in output');
    console.log('Output length:', result.stdout.length);
    console.log('First 200 chars:', result.stdout.substring(0, 200));
  }
  
  // Check for common ANSI color codes (green, yellow, cyan)
  const hasColorCodes = result.stdout.includes('\x1b[32m') || // green
                       result.stdout.includes('\x1b[33m') || // yellow
                       result.stdout.includes('\x1b[36m') || // cyan
                       result.stdout.includes('\x1b[31m') || // red
                       result.stdout.includes('\x1b[0m');    // reset
  
  assert.ok(hasColorCodes, 'CLI should preserve colors when --preserve-colors is used');
  assert.ok(result.stdout.includes('Claude Habitat'), 'CLI should show menu content');
  
  console.log('✅ CLI preserve colors test passed');
});