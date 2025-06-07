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