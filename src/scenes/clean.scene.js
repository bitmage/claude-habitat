/**
 * Clean scene - remove all Docker images
 */
async function cleanScene(context) {
  context.log('\n=== Clean Docker Images ===\n');
  context.log('Docker image cleaning is not yet implemented in scene mode.');
  context.log('This would run docker image cleanup commands.');
  
  await context.getInput('Press Enter to return to main menu...');
  
  const { mainMenuScene } = require('./main-menu.scene');
  return mainMenuScene;
}

module.exports = { cleanScene };