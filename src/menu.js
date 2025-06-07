const fs = require('fs').promises;
const path = require('path');
const { colors, fileExists } = require('./utils');
const { loadConfig } = require('./config');

// Generate menu key for tilde system
function generateMenuKey(text, existingKeys = []) {
  const words = text.toLowerCase().split(/\s+/);
  
  // Try each word's first letter
  for (const word of words) {
    const key = word[0];
    if (key && !existingKeys.includes(key)) {
      return key;
    }
  }
  
  // Try second letters if first letters are taken
  for (const word of words) {
    for (let i = 1; i < word.length; i++) {
      const key = word[i];
      if (key && !existingKeys.includes(key)) {
        return key;
      }
    }
  }
  
  // Fallback to numbers
  for (let i = 1; i <= 9; i++) {
    if (!existingKeys.includes(i.toString())) {
      return i.toString();
    }
  }
  
  return null; // Should rarely happen
}

// Parse menu choice to index
function parseMenuChoice(choice, options) {
  const normalizedChoice = choice.toLowerCase().trim();
  
  // Handle special cases
  if (normalizedChoice === 'q' || normalizedChoice === 'quit') return -1;
  if (normalizedChoice === 'b' || normalizedChoice === 'back') return -2;
  
  // Try to find by key
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (option.key === normalizedChoice) {
      return i;
    }
  }
  
  // Try direct number
  const num = parseInt(normalizedChoice);
  if (!isNaN(num) && num >= 1 && num <= options.length) {
    return num - 1;
  }
  
  return null; // Invalid choice
}

// Show main habitat selection menu
async function showMainMenu() {
  // Check for habitats
  const habitatsDir = path.join(__dirname, '..', 'habitats');
  let habitats = [];
  
  try {
    const dirs = await fs.readdir(habitatsDir);
    for (const dir of dirs) {
      const configPath = path.join(habitatsDir, dir, 'config.yaml');
      if (await fileExists(configPath)) {
        const config = await loadConfig(configPath);
        habitats.push({ 
          name: dir, 
          path: configPath,
          description: config.description || 'No description'
        });
      }
    }
    habitats.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    return { action: 'no-habitats', error: err.message };
  }
  
  if (habitats.length === 0) {
    return { action: 'no-habitats', habitats: [] };
  }
  
  // Show welcome screen
  console.log(colors.green('\n=== Claude Habitat ===\n'));
  console.log('Habitats:\n');
  
  // Generate menu options
  const menuOptions = [];
  const usedKeys = [];
  
  habitats.forEach((habitat, index) => {
    const key = generateMenuKey(habitat.name, usedKeys);
    usedKeys.push(key);
    
    console.log(`  ${colors.yellow(`[${key}]`)} ${habitat.name} - ${habitat.description}`);
    menuOptions.push({ key, name: habitat.name, path: habitat.path, index });
  });
  
  console.log('');
  console.log(`  ${colors.yellow('[a]')}dd - Create new habitat with AI assistance`);
  console.log(`  ${colors.yellow('[t]')}est - Run tests for habitats`);
  console.log(`  ${colors.yellow('[o]')}ptions - Tools and maintenance`);
  console.log(`  ${colors.yellow('[i]')}nit - Initialize or reconfigure Claude Habitat`);
  console.log(`  ${colors.yellow('[q]')}uit - Exit\n`);
  
  return {
    action: 'show-menu',
    habitats,
    menuOptions,
    additionalOptions: ['a', 't', 'o', 'i', 'q']
  };
}

// Get user choice via single keypress
async function getUserChoice() {
  return new Promise(resolve => {
    if (!process.stdin.isTTY) {
      // Fallback for non-TTY mode
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('Select option: ', answer => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onKeypress = (key) => {
      // Handle Ctrl+C
      if (key === '\\u0003') {
        console.log('\n');
        process.exit(0);
      }

      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onKeypress);
      resolve(key.toLowerCase());
    };

    process.stdin.on('data', onKeypress);
  });
}

// Handle menu choice and return action
async function handleMenuChoice(choice, menuData) {
  if (!menuData || menuData.action !== 'show-menu') {
    return { action: 'error', message: 'Invalid menu data' };
  }
  
  const { menuOptions, additionalOptions } = menuData;
  
  // Check habitat options
  const habitatOption = menuOptions.find(opt => opt.key === choice);
  if (habitatOption) {
    return { 
      action: 'run-habitat', 
      configPath: habitatOption.path,
      habitatName: habitatOption.name
    };
  }
  
  // Check additional options
  switch (choice) {
    case 'a':
      return { action: 'add-habitat' };
    case 't':
      return { action: 'test-menu' };
    case 'o':
      return { action: 'tools-menu' };
    case 'i':
      return { action: 'init' };
    case 'q':
      return { action: 'quit' };
    default:
      return { action: 'invalid-choice', choice };
  }
}

// Show error for invalid choice
function showInvalidChoice(choice) {
  console.log(colors.red(`\n❌ Invalid choice: "${choice}"`));
  console.log('Please select a valid option.\n');
}

// Show no habitats available message
async function showNoHabitatsMenu() {
  console.log(colors.red('No habitats directory found or no habitats available'));
  console.log('This appears to be a fresh installation.');
  console.log('The habitats directory will be created when you add your first habitat.');
  console.log('');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question('Would you like to:\n[a] Create your first habitat with AI assistance\n[q] Quit\nChoice: ', answer => {
      rl.close();
      const choice = answer.trim().toLowerCase();
      
      if (choice === 'a') {
        resolve({ action: 'add-habitat' });
      } else {
        resolve({ action: 'quit' });
      }
    });
  });
}

module.exports = {
  generateMenuKey,
  parseMenuChoice,
  showMainMenu,
  getUserChoice,
  handleMenuChoice,
  showInvalidChoice,
  showNoHabitatsMenu
};