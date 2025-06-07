const test = require('node:test');
const assert = require('node:assert');
const { runSequence } = require('../../src/scenes/scene-runner');
const { mainMenuScene } = require('../../src/scenes/main-menu.scene');

test('main menu displays colors correctly', async () => {
  console.log('Testing main menu color display...');
  
  const context = await runSequence(mainMenuScene, 'q', { preserveColors: true });
  const output = context.getOutput();
  
  // Check for specific color codes in the main menu
  assert.ok(output.includes('\x1b[32m'), 'Should have green color (title)');
  assert.ok(output.includes('\x1b[33m'), 'Should have yellow color (options)');
  assert.ok(output.includes('\x1b[0m'), 'Should have reset codes');
  
  // Check that specific UI elements are colored
  assert.ok(output.includes('\x1b[32m\n=== Claude Habitat ===\n\x1b[0m'), 
            'Title should be green');
  assert.ok(output.includes('\x1b[33m[1]\x1b[0m'), 
            'Option numbers should be yellow');
  assert.ok(output.includes('\x1b[33m[q]\x1b[0m'), 
            'Quit option should be yellow');
  
  console.log('✅ Main menu color test passed');
});

test('error messages display in red', async () => {
  console.log('Testing error message colors...');
  
  // Test invalid input to trigger error message
  const context = await runSequence(mainMenuScene, 'xyz', { preserveColors: true });
  const output = context.getOutput();
  
  // Should have red color for error message
  assert.ok(output.includes('\x1b[31m'), 'Should have red color for errors');
  assert.ok(output.includes('\x1b[31m\n❌ Invalid choice\x1b[0m'), 
            'Error message should be red');
  
  console.log('✅ Error message color test passed');
});

test('test menu displays colors correctly', async () => {
  console.log('Testing test menu color display...');
  
  const context = await runSequence(mainMenuScene, 'tq', { preserveColors: true });
  const output = context.getOutput();
  
  // Should have colors in test menu too
  assert.ok(output.includes('\x1b[33m'), 'Test menu should have yellow options');
  assert.ok(output.includes('=== Test Menu ==='), 'Should show test menu');
  
  console.log('✅ Test menu color test passed');
});

test('colors are properly stripped in default snapshot mode', async () => {
  console.log('Testing color stripping in snapshots...');
  
  const context = await runSequence(mainMenuScene, 'q'); // No preserveColors
  const output = context.getOutput();
  
  // Should NOT have ANSI codes
  assert.ok(!output.includes('\x1b['), 'Should strip all ANSI codes in snapshot mode');
  assert.ok(output.includes('=== Claude Habitat ==='), 'Should still have content');
  assert.ok(output.includes('[1] base'), 'Should have option text');
  
  console.log('✅ Color stripping test passed');
});

test('color preservation can be toggled', async () => {
  console.log('Testing color preservation toggle...');
  
  // Test with colors preserved
  const withColors = await runSequence(mainMenuScene, 'q', { preserveColors: true });
  const colorOutput = withColors.getOutput();
  
  // Test without colors preserved
  const withoutColors = await runSequence(mainMenuScene, 'q', { preserveColors: false });
  const plainOutput = withoutColors.getOutput();
  
  // Compare outputs
  assert.ok(colorOutput.includes('\x1b['), 'Preserved version should have colors');
  assert.ok(!plainOutput.includes('\x1b['), 'Plain version should not have colors');
  
  // Both should have the same content when colors are stripped
  const strippedColorOutput = colorOutput.replace(/\x1b\[[0-9;]*m/g, '');
  assert.strictEqual(strippedColorOutput, plainOutput, 
                    'Content should be identical when colors are stripped');
  
  console.log('✅ Color preservation toggle test passed');
});