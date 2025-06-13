/**
 * @module scenes/start-habitat.scene
 * @description Start habitat scene for launching specific habitats
 * 
 * Handles habitat startup with configuration selection, validation,
 * and session initiation. Manages the transition from menu selection
 * to active habitat session.
 * 
 * @requires module:habitat - Habitat session management
 * @requires module:standards/ui-architecture - Scene-based UI patterns
 * 
 * @tests
 * - E2E tests: `npm run test:e2e -- test/e2e/claude-in-habitat.test.js`
 * - UI tests: `npm run test:ui`
 */

const { runHabitat, saveLastUsedConfig } = require('../habitat');

/**
 * Start habitat scene - launches a specific habitat
 */
async function startHabitatScene(context, configPath) {
  try {
    context.log(`\nStarting habitat: ${configPath}\n`);
    
    // Save as last used config
    await saveLastUsedConfig(configPath);
    
    // Run the habitat
    await runHabitat(configPath, [], null);
    
    context.log('\nHabitat session ended.');
    
    const { mainMenuScene } = require('./main-menu.scene');
    return mainMenuScene;
    
  } catch (error) {
    context.error(`Failed to start habitat: ${error.message}`);
    
    await context.getInput('Press Enter to return to main menu...', false);
    
    const { mainMenuScene } = require('./main-menu.scene');
    return mainMenuScene;
  }
}

module.exports = { startHabitatScene };