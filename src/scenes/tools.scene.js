/**
 * @module scenes/tools.scene
 * @description Tools scene for development tools management
 * 
 * Manages development tools available in all containers. Provides
 * interactive interface for tool installation, updates, and configuration.
 * Handles tools management workflows within the scene architecture.
 * 
 * ## System Tools Workflow
 * 
 * **Design Philosophy**: Tools are downloaded on-demand, not committed to git.
 * - ✅ Only configuration files (`tools.yaml`) are committed
 * - ✅ Binaries are downloaded during container builds  
 * - ✅ Clean repository without binary bloat
 * - ✅ Easy tool updates via configuration
 * 
 * ### Available Tools
 * All habitats include these development tools:
 * - **rg** (ripgrep) - Fast text search
 * - **fd** - Fast file finder
 * - **jq** - JSON processor
 * - **yq** - YAML processor  
 * - **gh** - GitHub CLI
 * - **bat** - Syntax-highlighted cat
 * - **eza** - Modern ls with tree functionality
 * - **delta** - Enhanced git diffs
 * - **fzf** - Fuzzy finder
 * 
 * ### Tool Installation
 * Tools are automatically installed during habitat creation and cached
 * in `system/tools/bin/` for reuse across habitats.
 * 
 * @requires module:standards/ui-architecture - Scene-based UI patterns
 * @requires module:standards/path-resolution - Path handling conventions
 * 
 * @tests
 * - UI tests: `npm run test:ui`
 * - Tools management testing through scene navigation
 */

const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
// @see {@link module:standards/path-resolution} for project-root relative path conventions using rel()
const { colors } = require('../utils');

/**
 * Tools scene - manage development tools available in all containers
 */
async function toolsScene(context) {
  context.log(colors.green('\n=== Claude Habitat Tools Management ===\n'));
  context.log('Manage development tools available in all containers.\n');

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
      context.log('Tools Management Options:\n');
      context.log(`  ${colors.yellow('[1]')} Clean & reinstall all tools`);
      context.log(`  ${colors.yellow('[2]')} List tool status`);
      context.log(`  ${colors.yellow('[3]')} Reinstall specific tool`);
      context.log(`  ${colors.yellow('[q]')} Back to main menu\n`);

      const choice = await ask('Enter your choice: ');

      if (choice === 'q') {
        break;
      } else if (choice === '1') {
        await cleanAndReinstallAllTools(context);
      } else if (choice === '2') {
        await listToolStatus(context);
      } else if (choice === '3') {
        await reinstallSpecificTool(context);
      } else {
        context.log(colors.red('Invalid choice. Please try again.\n'));
      }
    }
  } finally {
    rl.close();
  }

  const { mainMenuScene } = require('./main-menu.scene');
  return mainMenuScene;
}

// Clean and reinstall all tools
async function cleanAndReinstallAllTools(context) {
  context.log('\n' + colors.yellow('=== Clean & Reinstall All Tools ===\n'));
  
  const toolsDir = path.join(__dirname, '..', '..', 'system', 'tools');
  
  try {
    context.log('Cleaning existing tools...');
    await execAsync('cd "' + toolsDir + '" && ./install-tools.sh clean');
    
    context.log('Installing all tools...');
    await execAsync('cd "' + toolsDir + '" && ./install-tools.sh install');
    
    context.log(colors.green('✅ All tools reinstalled successfully!\n'));
  } catch (err) {
    context.log(colors.red(`❌ Error reinstalling tools: ${err.message}\n`));
  }
}

// List tool status
async function listToolStatus(context) {
  context.log('\n' + colors.yellow('=== Tool Status ===\n'));
  
  const toolsDir = path.join(__dirname, '..', '..', 'system', 'tools');
  
  try {
    const { stdout } = await execAsync('cd "' + toolsDir + '" && ./install-tools.sh list');
    context.log(stdout);
  } catch (err) {
    context.log(colors.red(`❌ Error listing tools: ${err.message}\n`));
  }
}

// Reinstall specific tool
async function reinstallSpecificTool(context) {
  context.log('\n' + colors.yellow('=== Reinstall Specific Tool ===\n'));
  
  const toolsDir = path.join(__dirname, '..', '..', 'system', 'tools');
  
  try {
    // First show available tools
    const { stdout } = await execAsync('cd "' + toolsDir + '" && ./install-tools.sh list');
    context.log('Available tools:\n');
    context.log(stdout);
    
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
      context.log('Cancelled.\n');
      return;
    }

    context.log(`Installing ${toolChoice}...`);
    await execAsync(`cd "${toolsDir}" && ./install-tools.sh install ${toolChoice}`);
    
    context.log(colors.green(`✅ ${toolChoice} reinstalled successfully!\n`));
  } catch (err) {
    context.log(colors.red(`❌ Error reinstalling tool: ${err.message}\n`));
  }
}

module.exports = { toolsScene };