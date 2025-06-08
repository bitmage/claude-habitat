#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const yaml = require('js-yaml');


// Import modules
const { colors, sleep, fileExists, findPemFiles, calculateCacheHash, parseRepoSpec, parseCommands } = require('./src/utils');
const { dockerRun, dockerExec, dockerImageExists, dockerIsRunning } = require('./src/docker');
const { loadConfig } = require('./src/config');
const { askToContinue, askQuestion } = require('./src/cli');
const { testRepositoryAccess } = require('./src/github');
const { runTestMode } = require('./src/testing');
const { 
  loadIgnorePatterns, 
  shouldIgnoreItem, 
  findFilesToCopy, 
  copyFilesDirectory, 
  processFileOperations, 
  copyFileToContainer, 
  verifyFilesystem, 
  runFilesystemVerification 
} = require('./src/filesystem');
const { 
  buildBaseImage, 
  buildPreparedImage, 
  runSetupCommands, 
  cloneRepository 
} = require('./src/docker');
const { showMainMenu, getUserChoice, handleMenuChoice, showInvalidChoice, showNoHabitatsMenu } = require('./src/menu');
const { startSession, runHabitat, getLastUsedConfig, saveLastUsedConfig, checkHabitatRepositories } = require('./src/habitat');
const { runInitialization, checkInitializationStatus, hasGitHubAppAuth } = require('./src/init');
const { parseCliArguments, validateCliOptions } = require('./src/cli-parser');
const { executeCliCommand } = require('./src/command-executor');

const returnToMainMenu = async () => {
  console.log('\nReturning to main menu...\n');
  await main();
};


// runHabitat moved to src/habitat.js

// runContainer moved to src/habitat.js

// getLastUsedConfig and saveLastUsedConfig moved to src/habitat.js

// Add new configuration with AI assistance
async function addNewConfiguration() {
  console.log(colors.green('\n=== Create New Configuration ===\n'));
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const ask = (question) => new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
  
  // Gather minimal information
  const projectUrl = await ask('Project URL (GitHub/GitLab/etc): ');
  if (!projectUrl) {
    console.log(colors.red('Project URL is required'));
    rl.close();
    return;
  }
  
  const additionalUrls = await ask('Additional plugins/modules URLs (comma-separated, or empty): ');
  const purpose = await ask('Purpose of this habitat: ');
  const habitatName = await ask('Habitat name (e.g., my-project): ');
  const specialInstructions = await ask('Any special instructions for Claude (or empty): ');
  
  rl.close();
  
  // Create workspace
  const os = require('os');
  const workspace = path.join(os.tmpdir(), `claude-habitat-new-${Date.now()}`);
  await fs.mkdir(workspace, { recursive: true });
  await fs.mkdir(path.join(workspace, 'dockerfiles'), { recursive: true });
  await fs.mkdir(path.join(workspace, 'configs'), { recursive: true });
  
  // Create context file
  const context = `# New Claude Habitat Configuration

## User Inputs
- **Project URL**: ${projectUrl}
- **Additional URLs**: ${additionalUrls || 'None'}
- **Purpose**: ${purpose || 'Development environment'}
- **Habitat Name**: ${habitatName}
- **Special Instructions**: ${specialInstructions || 'None'}

## Your Task

Please analyze the project(s) and create:

1. A Dockerfile in \`dockerfiles/${habitatName}/Dockerfile\`
2. A configuration file in \`configs/${habitatName}.yaml\`
3. A test plan in \`TEST_PLAN.md\`

The configuration should be complete and ready to use.
`;
  
  await fs.writeFile(path.join(workspace, 'PROJECT_CONTEXT.md'), context);
  
  // Copy example for reference
  try {
    await fs.copyFile(
      path.join(__dirname, 'configs', 'discourse.yaml'),
      path.join(workspace, 'example-discourse.yaml')
    );
  } catch {
    // It's ok if example doesn't exist
  }
  
  // Copy "Meta" Claude instructions for add mode
  await fs.copyFile(
    path.join(__dirname, 'claude/INSTRUCTIONS.md'),
    path.join(workspace, 'CLAUDE.md')
  );
  
  console.log(`\nWorkspace created at: ${workspace}`);
  console.log('Launching Claude to create your configuration...\n');
  
  // Launch Claude in the workspace
  const claudeCmd = spawn('claude', [], {
    cwd: workspace,
    stdio: 'inherit'
  });
  
  await new Promise((resolve, reject) => {
    claudeCmd.on('close', resolve);
    claudeCmd.on('error', reject);
  });
  
  // After Claude finishes, copy created files back
  console.log('\nChecking for created files...');
  
  try {
    // Check for created files
    const dockerfileDir = path.join(workspace, 'dockerfiles', habitatName);
    const configFile = path.join(workspace, 'configs', `${habitatName}.yaml`);
    
    if (await fileExists(path.join(dockerfileDir, 'Dockerfile'))) {
      // Copy Dockerfile
      const targetDockerDir = path.join(__dirname, 'dockerfiles', habitatName);
      await fs.mkdir(targetDockerDir, { recursive: true });
      await fs.copyFile(
        path.join(dockerfileDir, 'Dockerfile'),
        path.join(targetDockerDir, 'Dockerfile')
      );
      console.log(colors.green(`✓ Dockerfile created`));
    }
    
    if (await fileExists(configFile)) {
      // Copy config
      await fs.copyFile(
        configFile,
        path.join(__dirname, 'configs', `${habitatName}.yaml`)
      );
      console.log(colors.green(`✓ Configuration created`));
    }
    
    console.log(colors.green('\nConfiguration created successfully!'));
    console.log(`You can now run: ./claude-habitat --config ${habitatName}.yaml`);
  } catch (err) {
    console.error(colors.red(`Error processing created files: ${err.message}`));
  }
}

// Tools management mode
async function runToolsManagement() {
  console.log(colors.green('\n=== Claude Habitat Tools Management ===\n'));
  console.log('Manage development tools available in all containers.\n');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (question) => new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim().toLowerCase()));
  });

  try {
    while (true) {
      console.log('Tools Management Options:\n');
      console.log(`  ${colors.yellow('[1]')} Clean & reinstall all tools`);
      console.log(`  ${colors.yellow('[2]')} List tool status`);
      console.log(`  ${colors.yellow('[3]')} Reinstall specific tool`);
      console.log(`  ${colors.yellow('[q]')} Back to main menu\n`);

      const choice = await ask('Enter your choice: ');

      if (choice === 'q') {
        break;
      } else if (choice === '1') {
        await cleanAndReinstallAllTools();
      } else if (choice === '2') {
        await listToolStatus();
      } else if (choice === '3') {
        await reinstallSpecificTool();
      } else {
        console.log(colors.red('Invalid choice. Please try again.\n'));
      }
    }
  } finally {
    rl.close();
  }
}

// Clean and reinstall all tools
async function cleanAndReinstallAllTools() {
  console.log('\n' + colors.yellow('=== Clean & Reinstall All Tools ===\n'));
  
  const toolsDir = path.join(__dirname, 'system/tools');
  
  try {
    console.log('Cleaning existing tools...');
    await execAsync('cd "' + toolsDir + '" && ./install-tools.sh clean');
    
    console.log('Installing all tools...');
    await execAsync('cd "' + toolsDir + '" && ./install-tools.sh install');
    
    console.log(colors.green('✅ All tools reinstalled successfully!\n'));
  } catch (err) {
    console.error(colors.red(`❌ Error reinstalling tools: ${err.message}\n`));
  }
}

// List tool status
async function listToolStatus() {
  console.log('\n' + colors.yellow('=== Tool Status ===\n'));
  
  const toolsDir = path.join(__dirname, 'system/tools');
  
  try {
    const { stdout } = await execAsync('cd "' + toolsDir + '" && ./install-tools.sh list');
    console.log(stdout);
  } catch (err) {
    console.error(colors.red(`❌ Error listing tools: ${err.message}\n`));
  }
}

// Reinstall specific tool
async function reinstallSpecificTool() {
  console.log('\n' + colors.yellow('=== Reinstall Specific Tool ===\n'));
  
  const toolsDir = path.join(__dirname, 'system/tools');
  
  try {
    // First show available tools
    const { stdout } = await execAsync('cd "' + toolsDir + '" && ./install-tools.sh list');
    console.log('Available tools:\n');
    console.log(stdout);
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const toolChoice = await new Promise(resolve => {
      rl.question('Enter tool name to reinstall (or "q" to cancel): ', answer => {
        rl.close();
        resolve(answer.trim());
      });
    });

    if (toolChoice === 'q' || toolChoice === '') {
      console.log('Cancelled.\n');
      return;
    }

    console.log(`Installing ${toolChoice}...`);
    await execAsync(`cd "${toolsDir}" && ./install-tools.sh install ${toolChoice}`);
    
    console.log(colors.green(`✅ ${toolChoice} reinstalled successfully!\n`));
  } catch (err) {
    console.error(colors.red(`❌ Error reinstalling tool: ${err.message}\n`));
  }
}

// Maintenance mode
async function runMaintenanceMode() {
  console.log(colors.green('\n=== Claude Habitat Maintenance Mode ===\n'));
  console.log('This will launch Claude in the claude-habitat directory.');
  console.log('Claude will show you a menu of maintenance options.\n');
  console.log(colors.yellow('💡 Tip: Say "menu" at any time to see the options again\n'));
  
  // Create a session instruction file for Claude
  const sessionInstructions = `# Maintenance Mode Session

You are now in Claude Habitat maintenance mode. 

IMPORTANT: First, read and present the options from claude/MAINTENANCE.md to the user.

When the user says "menu", "options", "help", or similar, show the maintenance menu again.

Current directory: ${__dirname}
Session started: ${new Date().toISOString()}
`;

  const instructionFile = path.join(__dirname, '.maintenance-session.md');
  await fs.writeFile(instructionFile, sessionInstructions);
  
  // Launch Claude in the claude-habitat directory
  const claudeCmd = spawn('claude', [], {
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  await new Promise((resolve, reject) => {
    claudeCmd.on('close', resolve);
    claudeCmd.on('error', reject);
  });
  
  // Clean up session file
  try {
    await fs.unlink(instructionFile);
  } catch {
    // Ignore if already deleted
  }
  
  console.log('\nMaintenance session completed.');
}

// CLI handling
async function main() {
  try {
    // Parse CLI arguments
    const args = process.argv.slice(2);
    const options = parseCliArguments(args);
    validateCliOptions(options);

    // Handle CLI commands (help, list-configs, clean)
    const commandExecuted = await executeCliCommand(options);
    if (commandExecuted) {
      return;
    }

    // Handle test sequence mode  
    if (options.testSequence) {
      const { runSequence } = require('./src/scenes/scene-runner');
      const { mainMenuScene } = require('./src/scenes/main-menu.scene');
      
      try {
        const context = await runSequence(mainMenuScene, options.testSequence, {
          preserveColors: options.preserveColors
        });
        console.log(context.getOutput());
        process.exit(context.exitCode);
      } catch (error) {
        console.error(`Test sequence failed: ${error.message}`);
        process.exit(1);
      }
    }

  // Handle shortcut commands
  if (options.start) {
    const habitatsDir = path.join(__dirname, 'habitats');
    
    // If habitat name is provided, use it
    if (options.habitatName) {
      const configPath = path.join(habitatsDir, options.habitatName, 'config.yaml');
      if (await fileExists(configPath)) {
        options.configPath = configPath;
        console.log(`Starting: ${options.habitatName}\n`);
      } else {
        console.error(colors.red(`Habitat '${options.habitatName}' not found`));
        process.exit(1);
      }
    } else {
      // Use last config or first available
      const lastConfig = await getLastUsedConfig();
      
      if (lastConfig) {
        options.configPath = lastConfig;
        console.log(`Starting: ${path.basename(path.dirname(lastConfig))}\n`);
      } else {
        // Use first available habitat
        try {
          const dirs = await fs.readdir(habitatsDir);
          for (const dir of dirs) {
            const configPath = path.join(habitatsDir, dir, 'config.yaml');
            if (await fileExists(configPath)) {
              options.configPath = configPath;
              console.log(`Starting: ${dir}\n`);
              break;
            }
          }
          if (!options.configPath) {
            console.error(colors.red('No habitats available'));
            process.exit(1);
          }
        } catch {
          console.error(colors.red('No configurations available'));
          process.exit(1);
        }
      }
    }
  } else if (options.add) {
    await addNewConfiguration();
    
    console.log('\nConfiguration creation completed!');
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const nextChoice = await new Promise(resolve => {
      rl.question('\nWould you like to:\n[r] Run the new habitat now\n[m] Go back to main menu\nChoice: ', answer => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
    });
    
    if (nextChoice === 'r') {
      // Try to find the newly created habitat and run it
      console.log('Looking for the newly created habitat...');
      await askToContinue('Press Enter to return to main menu to select your new habitat...');
    }
    
    await returnToMainMenu();
    return;
  } else if (options.maintain) {
    await runMaintenanceMode();
    await returnToMainMenu();
    return;
  } else if (options.test) {
    await runTestMode(options.testType, options.testTarget);
    return;
  }

  // Normal operation - require config
  if (!options.configPath) {
    // Use scene-based interactive mode
    const { runInteractive } = require('./src/scenes/scene-runner');
    const { mainMenuScene } = require('./src/scenes/main-menu.scene');
    
    try {
      await runInteractive(mainMenuScene);
      return;
    } catch (error) {
      console.error(colors.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  }

  // Legacy code path - config specified directly
  if (!options.configPath) {
    // This shouldn't happen now, but keep for safety
    const habitatsDir = path.join(__dirname, 'habitats');
    let habitats = [];
    
    try {
      const dirs = await fs.readdir(habitatsDir);
      for (const dir of dirs) {
        const configPath = path.join(habitatsDir, dir, 'config.yaml');
        if (await fileExists(configPath)) {
          habitats.push({ name: dir, path: configPath });
        }
      }
      habitats.sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      console.error(colors.red('No habitats directory found'));
      console.log('This appears to be a fresh installation.');
      console.log('The habitats directory will be created when you add your first habitat.');
      console.log('');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const choice = await new Promise(resolve => {
        rl.question('Would you like to:\n[a] Create your first habitat with AI assistance\n[q] Quit\nChoice: ', answer => {
          rl.close();
          resolve(answer.trim().toLowerCase());
        });
      });
      
      if (choice === 'a') {
        // Create habitats directory first
        await fs.mkdir(habitatsDir, { recursive: true });
        await addNewConfiguration();
        await returnToMainMenu();
        return;
      } else {
        console.log('Goodbye!');
        process.exit(0);
      }
    }
    
    // Check repository access for existing habitats
    const habitatRepoStatus = await checkHabitatRepositories(habitatsDir);
    
    if (habitats.length === 0) {
      console.error(colors.red('No habitats found'));
      console.log('You can create your first habitat with the [a]dd option.');
      console.log('');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const choice = await new Promise(resolve => {
        rl.question('Would you like to:\n[a] Create a new habitat with AI assistance\n[q] Quit\nChoice: ', answer => {
          rl.close();
          resolve(answer.trim().toLowerCase());
        });
      });
      
      if (choice === 'a') {
        await addNewConfiguration();
        await returnToMainMenu();
        return;
      } else {
        console.log('Goodbye!');
        process.exit(0);
      }
    }
    
    // Show welcome screen
    console.log(colors.green('\n=== Claude Habitat ===\n'));
    
    // Show initialization status if incomplete
    if (initStatus.completedSteps < initStatus.totalSteps) {
      if (initStatus.completedSteps === 0) {
        console.log(colors.red('⚠️  First time setup required'));
        console.log(`   ${colors.yellow('[i]')} Initialize Claude Habitat\n`);
      } else {
        console.log(colors.yellow(`⚠️  Setup incomplete (${initStatus.completedSteps}/${initStatus.totalSteps} steps done)`));
        console.log(`   ${colors.yellow('[i]')} Complete initialization\n`);
      }
    }
    
    if (habitats.length > 0) {
      console.log('Habitats:\n');
      
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
        const startOption = isLastUsed ? ` ${colors.yellow('[s]')}tart (most recent)` : '';
        
        try {
          const content = require('fs').readFileSync(habitat.path, 'utf8');
          const parsed = yaml.load(content);
          console.log(`  ${colors.yellow(`[${key}]`)} ${habitat.name}${statusWarning}${startOption}`);
          if (parsed.description) {
            console.log(`      ${parsed.description}`);
          }
          if (habitatStatus?.hasIssues) {
            console.log('      (may not be able to access remote repositories)');
          }
          console.log('');
        } catch (err) {
          console.log(`  ${colors.yellow(`[${key}]`)} ${habitat.name}${statusWarning}${startOption}`);
          console.log(`      (configuration error: ${err.message})`);
          console.log('');
        }
      });
    }
    
    // Add action options with clear categories
    console.log('Actions:\n');
    if (initStatus.completedSteps < initStatus.totalSteps) {
      console.log(`  ${colors.yellow('[i]')}nitialize - Set up authentication and verify system`);
    }
    console.log(`  ${colors.yellow('[a]')}dd     - Create new configuration with AI assistance`);
    console.log(`  ${colors.yellow('[t]')}est    - Run tests (system, shared, or habitat)`);
    console.log(`  t${colors.yellow('[o]')}ols   - Manage development tools`);
    console.log(`  ${colors.yellow('[m]')}aintain - Update/troubleshoot Claude Habitat itself`);
    console.log(`  ${colors.yellow('[c]')}lean   - Remove all Docker images`);
    console.log(`  ${colors.yellow('[h]')}elp    - Show usage information`);
    console.log(`  ${colors.yellow('[q]')}uit    - Exit\n`);
    
    // Get user choice with single keypress or tilde sequences
    const choice = await new Promise(resolve => {
      let tildeBuffer = '';
      
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      const onKeypress = (key) => {
        // Handle Ctrl+C
        if (key === '\u0003') {
          console.log('\n');
          process.exit(0);
        }
        
        // Handle tilde sequences
        if (key === '~') {
          tildeBuffer += '~';
          return; // Wait for more input
        }
        
        // If we have tildes, append the digit and resolve
        if (tildeBuffer.length > 0) {
          const finalChoice = tildeBuffer + key;
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onKeypress);
          resolve(finalChoice);
          return;
        }
        
        // Regular single keypress
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onKeypress);
        resolve(key.toLowerCase());
      };
      
      process.stdin.on('data', onKeypress);
    });
    
    // Handle choice
    if (choice === 'q') {
      process.exit(0);
    } else if (choice === 'i') {
      // Initialize/complete setup
      await runInitialization();
      process.exit(0);
    } else if (choice === 'h') {
      options.help = true;
    } else if (choice === 'c') {
      options.clean = true;
    } else if (choice === 's') {
      // Start - use last config or default
      const lastConfig = await getLastUsedConfig();
      if (lastConfig) {
        options.configPath = lastConfig;
        console.log(`\nStarting: ${path.basename(lastConfig)}\n`);
      } else if (configs.length > 0) {
        options.configPath = path.join(configDir, configs[0]);
        console.log(`\nStarting: ${configs[0]}\n`);
      } else {
        console.error(colors.red('\nNo configurations available'));
        process.exit(1);
      }
    } else if (choice === 'a') {
      // Add new configuration with AI
      await addNewConfiguration();
      process.exit(0);
    } else if (choice === 't') {
      // Test mode - show test menu
      await runTestMode(null, null);
      await returnToMainMenu();
      return;
    } else if (choice === 'o') {
      // Tools management
      await runToolsManagement();
      await returnToMainMenu();
      return;
    } else if (choice === 'm') {
      // Maintenance mode
      await runMaintenanceMode();
      process.exit(0);
    } else {
      // Check if it's a direct number (1-9)
      const directIndex = parseInt(choice) - 1;
      if (!isNaN(directIndex) && directIndex >= 0 && directIndex < 9 && directIndex < habitats.length) {
        options.configPath = habitats[directIndex].path;
        console.log(`\nSelected: ${habitats[directIndex].name}\n`);
      } else if (choice.startsWith('~')) {
        // Handle tilde prefix sequences (~1, ~~2, etc.)
        const tildeCount = choice.match(/^~+/)[0].length;
        const digit = choice.slice(tildeCount);
        const digitNum = parseInt(digit);
        
        if (!isNaN(digitNum) && digitNum >= 1 && digitNum <= 9) {
          // Calculate actual index: 9 + (tildeCount-1)*9 + (digitNum-1)
          const habitatIndex = 9 + (tildeCount - 1) * 9 + (digitNum - 1);
          
          if (habitatIndex < habitats.length) {
            options.configPath = habitats[habitatIndex].path;
            console.log(`\nSelected: ${habitats[habitatIndex].name}\n`);
          } else {
            console.error(colors.red('\n❌ Invalid habitat selection'));
            console.log('Returning to main menu...\n');
            await sleep(2000);
            await returnToMainMenu();
            return;
          }
        } else {
          console.error(colors.red('\n❌ Invalid tilde sequence - use ~1-9, ~~1-9, etc.'));
          console.log('Returning to main menu...\n');
          await sleep(2000);
          await returnToMainMenu();
          return;
        }
      } else {
        console.error(colors.red('\n❌ Invalid choice'));
        console.log('Use number keys 1-9, tilde sequences (~1, ~~2), or letter commands');
        console.log('Returning to main menu...\n');
        await sleep(2000);
        await returnToMainMenu();
        return;
      }
    }
  }

  // Make config path absolute (if we have one)
  if (options.configPath && !path.isAbsolute(options.configPath)) {
    // Check if it's a habitat name
    const habitatConfigPath = path.join(__dirname, 'habitats', options.configPath, 'config.yaml');
    if (await fileExists(habitatConfigPath)) {
      options.configPath = habitatConfigPath;
    } else {
      // Check if it's just a filename in old configs dir (backward compatibility)
      const configInDir = path.join(__dirname, 'configs', options.configPath);
      if (await fileExists(configInDir)) {
        options.configPath = configInDir;
      } else {
        options.configPath = path.resolve(options.configPath);
      }
    }
  }

  // Run the selected operation
  if (options.configPath) {
    try {
      // Pre-flight repository access check
      console.log('Pre-flight check...');
      const config = await loadConfig(options.configPath);
      const problemRepos = [];
      
      if (config.repositories && Array.isArray(config.repositories)) {
        for (const repo of config.repositories) {
          if (repo.url) {
            const accessMode = repo.access || 'write';
            const result = await testRepositoryAccess(repo.url, accessMode);
            if (!result.accessible) {
              problemRepos.push({ 
                url: repo.url, 
                reason: result.reason, 
                needsDeployKey: result.needsDeployKey,
                needsGitHubCli: result.needsGitHubCli,
                repoPath: result.repoPath,
                accessMode: result.accessMode,
                issues: result.issues 
              });
            }
          }
        }
      }
      
      if (problemRepos.length > 0) {
        // Separate by issue type and access mode
        const writeRepos = problemRepos.filter(repo => repo.accessMode === 'write');
        const readRepos = problemRepos.filter(repo => repo.accessMode === 'read');
        
        // Show repository access issues
        if (problemRepos.length > 0) {
          console.log(colors.yellow('⚠️ Repository access issues:'));
          
          problemRepos.forEach(repo => {
            console.log(colors.yellow(`\n   ${repo.url}: ${repo.reason}`));
          });
        }
        
        // Show GitHub App setup if repos need it
        const needsGitHubApp = problemRepos.some(repo => repo.needsGitHubApp);
        if (needsGitHubApp) {
          console.log('\n' + colors.green('GitHub App Configuration Required:'));
          console.log('1. Run: ./claude-habitat --init');
          console.log('2. Follow GitHub App setup instructions');
          console.log('3. Install the app on your repositories');
          console.log('4. Repository access will be provided by the GitHub App\n');
        }
        
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const writeRepoCount = writeRepos.length;
        const readOnlyPrompt = writeRepoCount > 0 ? `\n[s] Set failing write repositories to read-only` : '';
        
        const choice = await new Promise(resolve => {
          rl.question(`Would you like to:\n[c] Continue anyway (may fail during build)\n[f] Fix GitHub App setup\n[m] Go back to main menu\nChoice: `, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase());
          });
        });
        
        if (choice === 's' && writeRepoCount > 0) {
          // Update config to set failing write repos to read-only
          console.log('\nUpdating configuration to set failing repositories to read-only...');
          
          const configContent = await fs.readFile(options.configPath, 'utf8');
          let updatedConfig = configContent;
          
          // Update each failing write repo to have access: read
          writeRepos.forEach(repo => {
            // Find the repository in the config
            const repoUrlEscaped = repo.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const repoPattern = new RegExp(`(- url:\\s*${repoUrlEscaped}[\\s\\S]*?)(?=\\n\\s*(?:- url:|# |$))`, 'g');
            
            updatedConfig = updatedConfig.replace(repoPattern, (match) => {
              // Check if access field already exists
              if (match.includes('access:')) {
                // Update existing access field
                return match.replace(/access:\s*\w+/, 'access: read');
              } else {
                // Add access field after branch or at end
                if (match.includes('branch:')) {
                  return match.replace(/(branch:[^\n]*\n)/, '$1    access: read\n');
                } else {
                  // Add at end of repo block
                  return match.trimEnd() + '\n    access: read\n';
                }
              }
            });
          });
          
          // Write updated config back
          await fs.writeFile(options.configPath, updatedConfig);
          
          console.log(colors.green('✅ Configuration updated. Failing repositories set to read-only.'));
          console.log('Continuing with habitat startup...\n');
          // Continue with habitat launch
        } else if (choice === 'f') {
          await runInitialization();
          console.log('Returning to main menu after initialization...');
          await returnToMainMenu();
          return;
        } else if (choice === 'm') {
          console.log('Returning to main menu...');
          // Return to main menu by restarting
          const originalArgv = process.argv;
          process.argv = [process.argv[0], process.argv[1]]; // Reset to just script name
          await main();
          return;
        }
        // If 'c' or anything else, continue
        console.log('Continuing with habitat startup...\n');
      } else {
        console.log(colors.green('✅ Repository access verified'));
      }
      
      await saveLastUsedConfig(options.configPath);
      await startSession(options.configPath, options.extraRepos, options.overrideCommand);
    } catch (err) {
      console.error(colors.red(`\n❌ Error starting habitat: ${err.message}`));
      if (err.validationErrors) {
        err.validationErrors.forEach(e => console.error(colors.red(`  - ${e}`)));
      }
      
      console.log('\nThis could be due to:');
      console.log('• Configuration file errors');
      console.log('• Docker connectivity issues'); 
      console.log('• Repository access problems');
      console.log('• Missing dependencies');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const choice = await new Promise(resolve => {
        rl.question('\nWould you like to:\n[t] Try a different habitat\n[f] Fix authentication/setup\n[m] Go back to main menu\nChoice: ', answer => {
          rl.close();
          resolve(answer.trim().toLowerCase());
        });
      });
      
      if (choice === 't') {
        console.log('Returning to habitat selection...');
        await returnToMainMenu();
        return;
      } else if (choice === 'f') {
        await runInitialization();
        await returnToMainMenu();
        return;
      } else {
        await returnToMainMenu();
        return;
      }
    }
  }
  } catch (err) {
    console.error(colors.red(`Fatal error: ${err.message}`));
    process.exit(1);
  }
}

// checkInitializationStatus, hasGitHubAppAuth, checkHabitatRepositories, and runInitialization moved to src/init.js

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error(colors.red(`Fatal error: ${err.message}`));
    process.exit(1);
  });
}

module.exports = { loadConfig, calculateCacheHash, parseRepoSpec, startSession, runHabitat: startSession };
