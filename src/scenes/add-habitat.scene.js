/**
 * Add habitat scene - create new configuration with AI assistance
 */
async function addHabitatScene(context) {
  context.log('\n=== Create New Configuration ===\n');
  context.log('AI-assisted habitat creation is not yet implemented in scene mode.');
  context.log('This would launch the existing addNewConfiguration() function.');
  
  await context.getInput('Press Enter to return to main menu...');
  
  const { mainMenuScene } = require('./main-menu.scene');
  return mainMenuScene;
}

module.exports = { addHabitatScene };