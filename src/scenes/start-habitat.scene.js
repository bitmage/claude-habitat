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