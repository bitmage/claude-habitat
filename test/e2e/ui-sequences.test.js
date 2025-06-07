const test = require('node:test');
const assert = require('node:assert');
const { generateSnapshots } = require('./ui-snapshot-generator');

test('UI sequences run without crashing', async () => {
  console.log('Running UI sequence tests...');
  
  try {
    const results = await generateSnapshots();
    
    // All sequences should complete (may fail, but shouldn't crash)
    assert.ok(results.length > 0, 'Should have results from test sequences');
    
    // Check for completely broken sequences (no output at all)
    const emptyResults = results.filter(r => !r.output || r.output.trim().length === 0);
    assert.strictEqual(emptyResults.length, 0, 
      `${emptyResults.length} sequences produced no output: ${emptyResults.map(r => r.sequence).join(', ')}`);
    
    // Check for basic menu presence in most sequences
    const menuResults = results.filter(r => r.output.includes('Claude Habitat'));
    assert.ok(menuResults.length > results.length * 0.8, 
      'Most sequences should show the main menu');
    
    console.log(`✅ UI sequence tests passed (${results.length} sequences tested)`);
    
  } catch (error) {
    console.error('UI sequence test error:', error);
    throw error;
  }
});

test('UI sequences handle errors gracefully', async () => {
  console.log('Testing error handling in UI sequences...');
  
  const results = await generateSnapshots();
  
  // Even failed sequences should have meaningful output
  const failedResults = results.filter(r => r.metadata.exitCode !== 0);
  
  for (const result of failedResults) {
    // Failed sequences should still have some output
    assert.ok(result.output.length > 0, 
      `Failed sequence ${result.sequence} should have output`);
    
    // Should not have uncaught exceptions
    assert.ok(!result.output.includes('Uncaught'), 
      `Sequence ${result.sequence} should not have uncaught exceptions`);
  }
  
  console.log(`✅ Error handling test passed (${failedResults.length} failed sequences checked)`);
});

test('critical UI elements are present', async () => {
  console.log('Testing critical UI elements...');
  
  const results = await generateSnapshots();
  
  // Find the main menu sequence (should be 'q')
  const mainMenuResult = results.find(r => r.sequence === 'q');
  assert.ok(mainMenuResult, 'Should have main menu test result');
  
  const mainMenuOutput = mainMenuResult.output;
  
  // Critical elements that should be in main menu
  assert.ok(mainMenuOutput.includes('Claude Habitat'), 'Should show title');
  assert.ok(mainMenuOutput.includes('Habitats:'), 'Should list habitats');
  assert.ok(mainMenuOutput.includes('Actions:'), 'Should show actions');
  assert.ok(mainMenuOutput.includes('[q]uit'), 'Should have quit option');
  assert.ok(mainMenuOutput.includes('[t]est'), 'Should have test option');
  
  console.log('✅ Critical UI elements test passed');
});