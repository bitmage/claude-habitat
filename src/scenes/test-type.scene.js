const { runTestMode } = require('../testing');

/**
 * Test type scene - shows test options for a specific habitat
 */
async function testTypeScene(context, habitatName = 'base') {
  try {
    context.log(`\n=== Testing ${habitatName} ===\n`);
    
    if (habitatName === 'all') {
      context.log('Running all tests for all habitats...\n');
      
      // Run all tests
      try {
        await runTestMode('all', 'all');
        context.log('\n✅ All tests completed successfully');
      } catch (error) {
        context.error(`Test execution failed: ${error.message}`);
      }
      
      context.log('\nPress Enter to return to main menu...');
      await context.getInput('');
      
      const { mainMenuScene } = require('./main-menu.scene');
      return mainMenuScene;
    }
    
    context.log('Select test type:\n');
    context.log('  [s]ystem   - System infrastructure tests');
    context.log('  s[h]ared   - Shared configuration tests');
    context.log('  [h]abitat  - Habitat-specific tests');
    context.log('  [f]ilesystem - Filesystem verification');
    context.log('  [a]ll      - Run all test types');
    context.log('  [q]uit     - Back to test menu\n');
    
    const choice = await context.getInput('Enter your choice: ');
    
    let testType;
    switch (choice.toLowerCase()) {
      case 'q':
        const { testMenuScene } = require('./test-menu.scene');
        return testMenuScene;
        
      case 's':
        testType = 'system';
        break;
        
      case 'h':
        // Check if they meant 'shared' or 'habitat'
        context.log('\nDid you mean:');
        context.log('  [1] s[h]ared tests');
        context.log('  [2] [h]abitat tests');
        const clarification = await context.getInput('Choice: ');
        if (clarification === '1') {
          testType = 'shared';
        } else if (clarification === '2') {
          testType = 'habitat';
        } else {
          context.log('Invalid choice, returning to test type menu...');
          return (context) => testTypeScene(context, habitatName);
        }
        break;
        
      case 'f':
        testType = 'verify-fs';
        break;
        
      case 'a':
        testType = 'all';
        break;
        
      default:
        context.log('\n❌ Invalid choice');
        context.log('Please select a letter option.');
        return (context) => testTypeScene(context, habitatName); // Loop back
    }
    
    // Run the selected test type
    context.log(`\nRunning ${testType} tests for ${habitatName}...`);
    context.log('');
    
    try {
      await runTestMode(testType, habitatName);
      context.log(`\n✅ ${testType} tests completed successfully`);
    } catch (error) {
      context.error(`Test execution failed: ${error.message}`);
    }
    
    context.log('\nPress Enter to return to main menu...');
    await context.getInput('');
    
    const { mainMenuScene } = require('./main-menu.scene');
    return mainMenuScene;
    
  } catch (error) {
    context.error(`Error in test type selection: ${error.message}`);
    const { mainMenuScene } = require('./main-menu.scene');
    return mainMenuScene;
  }
}

module.exports = { testTypeScene };