const fs = require('fs').promises;
const path = require('path');
const { runAllSequences, formatSnapshots } = require('../../src/scenes/scene-runner');
const { mainMenuScene } = require('../../src/scenes/main-menu.scene');
const { TEST_SEQUENCES } = require('./ui-test-sequences');

/**
 * Generate UI snapshots for all test sequences
 */
async function generateSnapshots() {
  console.log('Generating UI snapshots...');
  console.log(`Running ${TEST_SEQUENCES.length} test sequences...\n`);
  
  try {
    const results = await runAllSequences(mainMenuScene, TEST_SEQUENCES);
    
    // Format results
    const snapshotText = formatSnapshots(results);
    
    // Write to snapshots file
    const snapshotPath = path.join(__dirname, '..', 'ui-snapshots.txt');
    await fs.writeFile(snapshotPath, snapshotText);
    
    console.log(`\n✅ Snapshots generated: ${snapshotPath}`);
    console.log(`Total sequences: ${results.length}`);
    
    // Summary of results
    const successful = results.filter(r => r.metadata.exitCode === 0).length;
    const failed = results.length - successful;
    
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\nFailed sequences:');
      results.filter(r => r.metadata.exitCode !== 0).forEach(r => {
        console.log(`  ${r.sequence} - ${r.description}`);
      });
    }
    
    return results;
    
  } catch (error) {
    console.error(`Error generating snapshots: ${error.message}`);
    throw error;
  }
}

// If run directly, generate snapshots
if (require.main === module) {
  generateSnapshots().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { generateSnapshots };