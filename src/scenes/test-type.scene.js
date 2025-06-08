const { runTestMode } = require('../testing');

/**
 * Test type scene - shows test options for a specific habitat
 */
async function testTypeScene(context, habitatName = 'base', rebuild = false) {
  try {
    const rebuildText = rebuild ? ' (with rebuild)' : '';
    context.log(`\n=== Testing ${habitatName}${rebuildText} ===\n`);
    
    // Load habitat config to check for bypass_habitat_construction
    let habitatConfig = null;
    let isBypassHabitat = false;
    if (habitatName !== 'all') {
      try {
        const { loadConfig } = require('../config');
        const { rel, fileExists } = require('../utils');
        const habitatConfigPath = rel('habitats', habitatName, 'config.yaml');
        if (await fileExists(habitatConfigPath)) {
          habitatConfig = await loadConfig(habitatConfigPath);
          isBypassHabitat = habitatConfig.claude?.bypass_habitat_construction || false;
        }
      } catch (err) {
        // Continue without config if it can't be loaded
      }
    }
    
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
      await context.getInput('', false);
      
      const { mainMenuScene } = require('./main-menu.scene');
      return mainMenuScene;
    }
    
    context.log('Select test type:\n');
    if (isBypassHabitat) {
      context.log('  [s]ystem   - System infrastructure tests (unavailable - bypass habitat)');
      context.log('  s[h]ared   - Shared configuration tests (unavailable - bypass habitat)');
    } else {
      context.log('  [s]ystem   - System infrastructure tests');
      context.log('  s[h]ared   - Shared configuration tests');
    }
    context.log('  [h]abitat  - Habitat-specific tests');
    context.log('  [f]ilesystem - Filesystem verification');
    context.log('  [a]ll      - Run all test types');
    context.log('  [q]uit     - Back to test menu\n');
    
    if (isBypassHabitat) {
      context.log('ℹ️  This habitat uses bypass_habitat_construction and manages its own infrastructure.\n');
    }
    
    const choice = await context.getInput('Enter your choice: ');
    
    let testType;
    switch (choice.toLowerCase()) {
      case 'q':
        const { testMenuScene } = require('./test-menu.scene');
        return testMenuScene;
        
      case 's':
        if (isBypassHabitat) {
          context.log('\n❌ System tests are not available for bypass habitats');
          context.log('This habitat manages its own infrastructure.\n');
          return testTypeScene(context, habitatName);
        }
        testType = 'system';
        break;
        
      case 'h':
        // Check if they meant 'shared' or 'habitat'
        context.log('\nDid you mean:');
        context.log('  [1] s[h]ared tests');
        context.log('  [2] [h]abitat tests');
        const clarification = await context.getInput('Choice: ');
        if (clarification === '1') {
          if (isBypassHabitat) {
            context.log('\n❌ Shared tests are not available for bypass habitats');
            context.log('This habitat manages its own infrastructure.\n');
            return testTypeScene(context, habitatName);
          }
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
    const rebuildText = rebuild ? ' (with rebuild)' : '';
    context.log(`\nRunning ${testType} tests for ${habitatName}${rebuildText}...`);
    context.log('');
    
    try {
      await runTestMode(testType, habitatName, rebuild);
      context.log(`\n✅ ${testType} tests completed successfully`);
    } catch (error) {
      context.error(`Test execution failed: ${error.message}`);
    }
    
    context.log('\nPress Enter to return to main menu...');
    await context.getInput('', false);
    
    const { mainMenuScene } = require('./main-menu.scene');
    return mainMenuScene;
    
  } catch (error) {
    context.error(`Error in test type selection: ${error.message}`);
    const { mainMenuScene } = require('./main-menu.scene');
    return mainMenuScene;
  }
}

module.exports = { testTypeScene };