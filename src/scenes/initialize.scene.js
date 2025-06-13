/**
 * @module scenes/initialize.scene
 * @description Initialize scene for system setup and verification
 * 
 * Guides users through the initialization process including GitHub
 * authentication setup, Docker verification, and system prerequisite
 * checking. Provides setup guidance and error recovery.
 * 
 * @requires module:init - Initialization operations
 * @requires module:standards/ui-architecture - Scene-based UI patterns
 * 
 * @tests
 * - E2E tests: `npm run test:e2e`
 * - Initialization is tested across all E2E scenarios
 */

const { runInitialization } = require('../init');

/**
 * Initialize scene - set up authentication and verify system
 */
async function initializeScene(context) {
  context.log('\n=== Claude Habitat Initialization ===\n');
  
  try {
    await runInitialization();
    context.log('\n✅ Initialization completed successfully');
  } catch (error) {
    context.error(`Initialization failed: ${error.message}`);
  }
  
  await context.getInput('Press Enter to return to main menu...', false);
  
  const { mainMenuScene } = require('./main-menu.scene');
  return mainMenuScene;
}

module.exports = { initializeScene };