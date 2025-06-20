/**
 * @module scenes/test-menu.scene
 * @description Test menu scene for habitat testing workflows
 * 
 * Displays available habitats for testing with options for different
 * test types. Provides navigation to test execution and result viewing.
 * Implements the testing philosophy of product-focused validation.
 * 
 * @requires module:standards/ui-architecture - Scene-based UI patterns
 * @requires module:standards/testing - Testing approach and conventions
 * @requires module:standards/path-resolution - Path handling conventions
 * 
 * @tests
 * - E2E tests: `npm run test:e2e -- test/e2e/ui-verification.test.js`
 * - UI tests: `npm run test:ui`
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
// @see {@link module:standards/path-resolution} for project-root relative path conventions using rel()
const { colors, fileExists } = require('../utils');

/**
 * Test menu scene - shows available habitats for testing
 */
async function testMenuScene(context) {
  try {
    // Find available habitats
    const habitatsDir = path.join(__dirname, '..', '..', 'habitats');
    let habitats = [];
    
    try {
      const dirs = await fs.readdir(habitatsDir);
      habitats = (await Promise.all(
        dirs.map(async (dir) => {
          const configPath = path.join(habitatsDir, dir, 'config.yaml');
          if (await fileExists(configPath)) {
            return { name: dir, path: configPath };
          }
          return null;
        })
      )).filter(Boolean);
    } catch (err) {
      context.error('Error reading habitats directory');
      const { mainMenuScene } = require('./main-menu.scene');
      return mainMenuScene;
    }
    
    if (habitats.length === 0) {
      context.log('No habitats available for testing.');
      context.log('Create a habitat first with [a]dd option.\n');
      const { mainMenuScene } = require('./main-menu.scene');
      return mainMenuScene;
    }
    
    context.log('\n=== Test Menu ===\n');
    context.log('Select a habitat to test:\n');
    
    // Show available habitats
    habitats.forEach((habitat, index) => {
      try {
        const content = require('fs').readFileSync(habitat.path, 'utf8');
        const parsed = yaml.load(content);
        context.log(`  [${index + 1}] ${habitat.name}`);
        if (parsed.description) {
          context.log(`      ${parsed.description}`);
        }
        context.log('');
      } catch (err) {
        context.log(`  [${index + 1}] ${habitat.name}`);
        context.log(`      (configuration error: ${err.message})`);
        context.log('');
      }
    });
    
    context.log('Actions:\n');
    context.log('  [a]ll     - Run all tests for all habitats');
    context.log('  [q]uit    - Back to main menu\n');
    context.log('💡 Tip: Use capital letters (!@#$%^&*()) to force rebuild for habitats 1-9\n');
    
    const choice = await context.getInput('Enter your choice: ');
    
    switch (choice.toLowerCase()) {
      case 'q':
        const { mainMenuScene } = require('./main-menu.scene');
        return mainMenuScene;
        
      case 'a':
        // Run all tests for all habitats
        const { testTypeScene } = require('./test-type.scene');
        return (context) => testTypeScene(context, 'all');
        
      default:
        // Check for rebuild shift keys (! = shift+1, @ = shift+2, etc.)
        const shiftKeys = '!@#$%^&*()';
        const shiftIndex = shiftKeys.indexOf(choice);
        if (shiftIndex >= 0 && shiftIndex < habitats.length) {
          const { testTypeScene } = require('./test-type.scene');
          return (context) => testTypeScene(context, habitats[shiftIndex].name, true); // true = rebuild
        }
        
        // Check if it's a number (habitat selection)
        const habitatIndex = parseInt(choice) - 1;
        if (!isNaN(habitatIndex) && habitatIndex >= 0 && habitatIndex < habitats.length) {
          const { testTypeScene } = require('./test-type.scene');
          return (context) => testTypeScene(context, habitats[habitatIndex].name, false); // false = no rebuild
        }
        
        context.log('\n❌ Invalid choice');
        context.log('Please select a number or letter option.');
        return testMenuScene; // Loop back
    }
    
  } catch (error) {
    context.error(`Error in test menu: ${error.message}`);
    const { mainMenuScene } = require('./main-menu.scene');
    return mainMenuScene;
  }
}

module.exports = { testMenuScene };