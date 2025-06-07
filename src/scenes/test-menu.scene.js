const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
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
        // Check if it's a number (habitat selection)
        const habitatIndex = parseInt(choice) - 1;
        if (!isNaN(habitatIndex) && habitatIndex >= 0 && habitatIndex < habitats.length) {
          const { testTypeScene } = require('./test-type.scene');
          return (context) => testTypeScene(context, habitats[habitatIndex].name);
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