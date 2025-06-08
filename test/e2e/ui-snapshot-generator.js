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
    
    // Also update sample snapshots with a subset of key sequences
    const sampleSequences = ['q', 'h', 'tq', 't1s', 'xyz'];
    const sampleResults = results.filter(r => sampleSequences.includes(r.sequence));
    if (sampleResults.length > 0) {
      let sampleSnapshotText = formatSnapshots(sampleResults);
      // Update header for sample file
      sampleSnapshotText = sampleSnapshotText.replace(
        /Generated: .*/,
        'Generated: Manual test run'
      );
      sampleSnapshotText = sampleSnapshotText.replace(
        /Total sequences: .*/,
        'Total sequences: ' + sampleResults.length
      );
      
      const samplePath = path.join(__dirname, '..', 'ui-sample-snapshots.txt');
      await fs.writeFile(samplePath, sampleSnapshotText);
      console.log(`✅ Sample snapshots updated: ${samplePath}`);
    }
    
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