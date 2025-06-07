const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { colors, fileExists } = require('../utils');
const { getLastUsedConfig, checkHabitatRepositories } = require('../habitat');
const { checkInitializationStatus } = require('../init');

/**
 * Main menu scene - displays available habitats and actions
 */
async function mainMenuScene(context) {
  try {
    // Check initialization status
    context.log('Checking system status...');
    const initStatus = await checkInitializationStatus();
    
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
      // habitats directory doesn't exist, continue with empty array
    }
    
    // If no habitats, show creation menu
    if (habitats.length === 0) {
      context.log('No habitats found');
      context.log('You can create your first habitat with the [a]dd option.');
      context.log('');
      
      const choice = await context.getInput('Would you like to:\n[a] Create a new habitat with AI assistance\n[q] Quit\nChoice: ');
      
      if (choice === 'a') {
        const { addHabitatScene } = require('./add-habitat.scene');
        return addHabitatScene;
      } else {
        context.log('Goodbye!');
        return null; // Exit
      }
    }
    
    // Check repository access for existing habitats
    const habitatRepoStatus = await checkHabitatRepositories(habitatsDir);
    
    // Show welcome screen
    context.log('\n=== Claude Habitat ===\n');
    
    // Show initialization status if incomplete
    if (initStatus.completedSteps < initStatus.totalSteps) {
      if (initStatus.completedSteps === 0) {
        context.log('⚠️  First time setup required');
        context.log('   [i] Initialize Claude Habitat\n');
      } else {
        context.log(`⚠️  Setup incomplete (${initStatus.completedSteps}/${initStatus.totalSteps} steps done)`);
        context.log('   [i] Complete initialization\n');
      }
    }
    
    if (habitats.length > 0) {
      context.log('Habitats:\n');
      
      // Get the most recently used config to mark it
      const lastConfig = await getLastUsedConfig();
      const lastUsedHabitat = lastConfig ? path.basename(path.dirname(lastConfig)) : null;
      
      // Show all habitats with appropriate hotkeys
      habitats.forEach((habitat, index) => {
        let key;
        if (index < 9) {
          // Direct number keys for first 9
          key = (index + 1).toString();
        } else {
          // Tilde prefix system for 10+
          const adjusted = index - 9; // 0-based for items 10+
          const tildeCount = Math.floor(adjusted / 9) + 1;
          const digit = (adjusted % 9) + 1;
          key = '~'.repeat(tildeCount) + digit;
        }
        
        // Check if this habitat has repository issues
        const habitatStatus = habitatRepoStatus.get(habitat.name);
        const statusWarning = habitatStatus?.hasIssues ? ' ⚠️' : '';
        
        // Check if this is the most recent habitat
        const isLastUsed = habitat.name === lastUsedHabitat;
        const startOption = isLastUsed ? ' [s]tart (most recent)' : '';
        
        try {
          const content = require('fs').readFileSync(habitat.path, 'utf8');
          const parsed = yaml.load(content);
          context.log(`  [${key}] ${habitat.name}${statusWarning}${startOption}`);
          if (parsed.description) {
            context.log(`      ${parsed.description}`);
          }
          if (habitatStatus?.hasIssues) {
            context.log('      (may not be able to access remote repositories)');
          }
          context.log('');
        } catch (err) {
          context.log(`  [${key}] ${habitat.name}${statusWarning}${startOption}`);
          context.log(`      (configuration error: ${err.message})`);
          context.log('');
        }
      });
    }
    
    // Add action options with clear categories
    context.log('Actions:\n');
    if (initStatus.completedSteps < initStatus.totalSteps) {
      context.log('  [i]nitialize - Set up authentication and verify system');
    }
    context.log('  [a]dd     - Create new configuration with AI assistance');
    context.log('  [t]est    - Run tests (system, shared, or habitat)');
    context.log('  t[o]ols   - Manage development tools');
    context.log('  [m]aintain - Update/troubleshoot Claude Habitat itself');
    context.log('  [c]lean   - Remove all Docker images');
    context.log('  [h]elp    - Show usage information');
    context.log('  [q]uit    - Exit\n');
    
    // Get user choice
    const choice = await context.getInput('Enter your choice: ');
    
    // Handle choice
    switch (choice.toLowerCase()) {
      case 'q':
        context.log('Goodbye!');
        return null; // Exit
        
      case 'h':
        const { helpScene } = require('./help.scene');
        return helpScene;
        
      case 't':
        const { testMenuScene } = require('./test-menu.scene');
        return testMenuScene;
        
      case 'i':
        if (initStatus.completedSteps < initStatus.totalSteps) {
          const { initializeScene } = require('./initialize.scene');
          return initializeScene;
        } else {
          context.log('Initialization already complete.');
          return mainMenuScene; // Loop back
        }
        
      case 'a':
        const { addHabitatScene } = require('./add-habitat.scene');
        return addHabitatScene;
        
      case 'm':
        const { maintenanceScene } = require('./maintenance.scene');
        return maintenanceScene;
        
      case 'c':
        const { cleanScene } = require('./clean.scene');
        return cleanScene;
        
      case 'o':
        const { toolsScene } = require('./tools.scene');
        return toolsScene;
        
      case 's':
        // Start most recent habitat
        const lastConfig = await getLastUsedConfig();
        if (lastConfig) {
          const { startHabitatScene } = require('./start-habitat.scene');
          return (context) => startHabitatScene(context, lastConfig);
        } else {
          context.log('No recent habitat found.');
          return mainMenuScene; // Loop back
        }
        
      default:
        // Check if it's a number (habitat selection)
        const habitatIndex = parseInt(choice) - 1;
        if (!isNaN(habitatIndex) && habitatIndex >= 0 && habitatIndex < habitats.length) {
          const { startHabitatScene } = require('./start-habitat.scene');
          return (context) => startHabitatScene(context, habitats[habitatIndex].path);
        }
        
        // Check if it's a tilde sequence
        if (choice.startsWith('~')) {
          // Handle tilde sequences for habitats 10+
          const tildeMatch = choice.match(/^(~+)(\d)$/);
          if (tildeMatch) {
            const tildeCount = tildeMatch[1].length;
            const digit = parseInt(tildeMatch[2]);
            const calculatedIndex = 9 + (tildeCount - 1) * 9 + (digit - 1);
            
            if (calculatedIndex < habitats.length) {
              const { startHabitatScene } = require('./start-habitat.scene');
              return (context) => startHabitatScene(context, habitats[calculatedIndex].path);
            }
          }
        }
        
        context.log('\n❌ Invalid choice');
        context.log('Use number keys 1-9, tilde sequences (~1, ~~2), or letter commands');
        context.log('Returning to main menu...\n');
        return mainMenuScene; // Loop back
    }
    
  } catch (error) {
    context.error(`Error in main menu: ${error.message}`);
    return null; // Exit on error
  }
}

module.exports = { mainMenuScene };