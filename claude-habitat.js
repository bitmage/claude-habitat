#!/usr/bin/env node

/**
 * Claude Habitat - AI-Powered Isolated Development Environments
 * 
 * ## Project Purpose
 * 
 * Claude Habitat creates isolated Docker environments where Claude can work on your 
 * projects safely. Each habitat includes project code, required services, development 
 * tools, and no access to the host filesystem. Perfect for AI pair programming without risk!
 * 
 * ## Performance Characteristics
 * 
 * - **Fast Container Startup**: Prepared images with pre-installed tools and repositories
 * - **Efficient Caching**: Docker layer caching + prepared image caching based on content hashes
 * - **Minimal Resource Usage**: Lightweight containers with only necessary dependencies
 * - **Quick Context Switching**: Start any habitat in seconds, not minutes
 * 
 * ## Guarantees
 * 
 * - **Complete Isolation**: No access to host filesystem beyond workspace
 * - **Reproducible Environments**: Declarative YAML configurations ensure consistency
 * - **Predictable Behavior**: Configuration-driven infrastructure with clear contracts
 * - **Safe Experimentation**: Changes contained within disposable containers
 * 
 * ## High-Level Architecture
 * 
 * Claude Habitat implements a **layered composition architecture** with **dual Claude contexts**:
 * 
 * ### Dual Claude Architecture
 * - **"Meta" Claude** (this context): Manages the habitat system itself on the host
 * - **"Habitat" Claude**: Works on projects inside isolated containers
 * 
 * ### Three-Layer Composition System
 * 1. **Infrastructure Layer** (system/): Managed tools and base configurations
 * 2. **User Layer** (shared/): Personal preferences, keys, and customizations  
 * 3. **Project Layer** (habitats/): Project-specific environments and setup
 * 
 * ### Declarative Infrastructure
 * All behavior is predictable from YAML configurations:
 * - Dockerfiles define the runtime environment
 * - config.yaml files specify repositories, services, and setup
 * - Environment variables coordinate between layers
 * 
 * ## Router Architecture
 * 
 * This file serves as the **thin application router** that delegates to specialized subsystems:
 * 
 * ### Core Infrastructure Subsystems
 * @see {@link src/cli-parser.js} - Command-line argument parsing and validation
 * @see {@link src/command-executor.js} - Direct CLI command execution (--help, --clean, etc.)
 * @see {@link src/config.js} - Configuration loading with three-layer composition
 * @see {@link src/types.js} - Domain model and validation (Habitat, Session, Workspace, etc.)
 * 
 * ### Container & Image Management  
 * @see {@link src/habitat.js} - Session orchestration and lifecycle management
 * @see {@link src/container-operations.js} - Low-level Docker container operations
 * @see {@link src/phases.js} - 12-phase progressive build system with intelligent caching
 * @see {@link src/image-lifecycle.js} - Image building, caching, and preparation
 * @see {@link src/image-management.js} - Image cleanup and maintenance operations
 * 
 * ### Development Environment
 * @see {@link src/filesystem.js} - Workspace preparation and file operations
 * @see {@link src/github.js} - Repository access, authentication, and GitHub integration
 * @see {@link src/habitat-testing.js} - Unit, E2E, and habitat testing capabilities
 * @see {@link src/init.js} - System initialization and authentication setup
 * 
 * ### User Interface Systems
 * @see {@link src/scenes/scene-runner.js} - Scene-based interactive flow engine
 * @see {@link src/scenes/main-menu.scene.js} - Primary navigation and habitat selection
 * @see {@link src/scenes/maintenance.scene.js} - "Meta" Claude maintenance operations
 * @see {@link src/scenes/add-habitat.scene.js} - AI-assisted habitat creation workflows
 * 
 * ### Cross-Cutting Concerns
 * @see {@link src/errors.js} - Centralized error handling with recovery suggestions
 * @see {@link src/utils.js} - Core utilities including path resolution standards
 * @see {@link src/menu.js} - Menu generation and tilde-based navigation system
 * 
 * ## Subsystem Integration Patterns
 * 
 * ### Configuration Flow
 * CLI arguments → config.js → types.js validation → habitat.js execution
 * 
 * ### Container Lifecycle  
 * image-lifecycle.js builds → container-operations.js runs → habitat.js orchestrates
 * 
 * ### Interactive Workflows
 * scene-runner.js manages → individual scenes implement → back to router for completion
 * 
 * ### Error Recovery
 * All subsystems use errors.js patterns → provide actionable next steps → preserve user context
 * 
 * ## Testing Architecture
 * 
 * @see {@link src/habitat-testing.js} for complete testing documentation
 * - **Unit Tests**: `npm test` - Test individual subsystem functions
 * - **E2E Tests**: `npm run test:e2e` - Test complete user workflows  
 * - **Habitat Tests**: `./claude-habitat test <habitat>` - Test specific configurations
 * - **UI Tests**: `npm run test:ui` - Generate interaction snapshots
 * 
 * For architectural questions, start here then follow @see links to relevant subsystems.
 */

// ============================================================================
// SUBSYSTEM IMPORTS - All major architectural components
// ============================================================================

// CLI and Command Processing
const { parseCliArguments, validateCliOptions } = require('./src/cli-parser');
const { executeCliCommand } = require('./src/command-executor');

// Configuration and Validation
const { loadHabitatEnvironmentFromConfig } = require('./src/config');

// Core Domain Operations  
const { runHabitat, getLastUsedConfig, saveLastUsedConfig } = require('./src/habitat');
const { runTestMode } = require('./src/habitat-testing');
const { runInitialization } = require('./src/init');

// Interactive Scene System
const { runScene, runSequence } = require('./src/scenes/scene-runner');
const { mainMenuScene } = require('./src/scenes/main-menu.scene');
const { addHabitatScene } = require('./src/scenes/add-habitat.scene');
const { maintenanceScene } = require('./src/scenes/maintenance.scene');

// Utilities and Error Handling
const { colors, fileExists } = require('./src/utils');

// Container Cleanup
const { setupAutomaticCleanup } = require('./src/container-cleanup');

// ============================================================================
// MAIN ROUTER - Delegates to appropriate subsystems
// ============================================================================

/**
 * Main application router
 * 
 * Routes incoming requests to appropriate subsystems based on CLI arguments
 * and user intentions. Maintains the hybrid CLI + Interactive architecture.
 */
async function main() {
  try {
    // Parse and validate CLI arguments
    const args = process.argv.slice(2);
    const options = parseCliArguments(args);
    validateCliOptions(options);
    
    // Setup automatic container cleanup (unless disabled)
    setupAutomaticCleanup({ disabled: options.noCleanup });

    // Handle direct CLI commands (--help, --clean, --list-configs)
    const commandExecuted = await executeCliCommand(options);
    if (commandExecuted) {
      return; // CLI command completed, exit
    }

    // Handle test sequence mode (UI testing)
    if (options.testSequence) {
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
      await handleDirectStart(options);
      return;
    }

    if (options.add) {
      await runScene(addHabitatScene);
      return;
    }

    if (options.maintain) {
      await runScene(maintenanceScene);
      return;
    }

    if (options.test) {
      await handleTestMode(options);
      return;
    }

    // Handle direct habitat launch (config path provided)
    if (options.configPath) {
      await runHabitat(options.configPath, options.extraRepos, options.overrideCommand, { 
        rebuild: options.rebuild,
        rebuildFrom: options.rebuildFrom,
        target: options.target
      });
      return;
    }

    // Default: Enter interactive mode via scene system
    await runScene(mainMenuScene);

  } catch (err) {
    console.error('');
    console.error(colors.red(`❌ ${err.message}`));
    process.exit(1);
  }
}

/**
 * Handle direct habitat start commands
 * Resolves habitat names to config paths and launches
 */
async function handleTestMode(options) {
  const path = require('path');
  const habitatsDir = path.join(__dirname, 'habitats');
  
  // Map test types to target phases
  if (options.testType === 'verify-fs' || options.testType.startsWith('verify-fs:')) {
    // Run up to phase 10 (verify)
    if (!options.testTarget) {
      console.error(colors.red('Test target habitat required for verify-fs'));
      process.exit(1);
    }
    
    const configPath = path.join(habitatsDir, options.testTarget, 'config.yaml');
    if (!await fileExists(configPath)) {
      console.error(colors.red(`Habitat '${options.testTarget}' not found`));
      process.exit(1);
    }
    
    console.log(colors.green('\n=== Claude Habitat Test Runner ===\n'));
    console.log(`Running filesystem verification for ${options.testTarget}...`);
    await runHabitat(configPath, [], null, { 
      rebuild: options.rebuild || true,  // Always rebuild for tests
      rebuildFrom: 'scripts',  // Start from phase before verify (9-scripts)
      target: 'verify' 
    });
  } else if (options.testType === 'habitat') {
    // Run up to phase 11 (test)
    if (!options.testTarget) {
      console.error(colors.red('Test target habitat required for habitat tests'));
      process.exit(1);
    }
    
    const configPath = path.join(habitatsDir, options.testTarget, 'config.yaml');
    if (!await fileExists(configPath)) {
      console.error(colors.red(`Habitat '${options.testTarget}' not found`));
      process.exit(1);
    }
    
    console.log(colors.green('\n=== Claude Habitat Test Runner ===\n'));
    console.log(`Running habitat tests for ${options.testTarget}...`);
    await runHabitat(configPath, [], null, { 
      rebuild: options.rebuild || true,  // Always rebuild for tests
      rebuildFrom: 'verify',  // Start from phase before test (10-verify)
      target: 'test' 
    });
  } else if (options.testType === 'menu' || (!options.testType && !options.testTarget)) {
    // Route to interactive test menu scene
    const { runScene } = require('./src/scenes/scene-runner');
    const { testMenuScene } = require('./src/scenes/test-menu.scene');
    await runScene(testMenuScene);
  } else {
    // Direct test execution for specific test types
    await runTestMode(options.testType, options.testTarget, options.rebuild);
  }
}

async function handleDirectStart(options) {
  const path = require('path');
  const fs = require('fs').promises;
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
      const habitatName = path.basename(path.dirname(lastConfig));
      console.log(`Starting: ${habitatName}\n`);
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

  // Launch the habitat
  if (options.configPath) {
    await runHabitat(options.configPath, options.extraRepos, options.overrideCommand, { 
      rebuild: options.rebuild,
      rebuildFrom: options.rebuildFrom,
      target: options.target
    });
  }
}

// ============================================================================
// MODULE ENTRY POINT
// ============================================================================

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('');
    console.error(colors.red(`❌ ${err.message}`));
    process.exit(1);
  });
}

// Export key functions for programmatic use
module.exports = { 
  main,
  // Re-export core functions for backward compatibility
  loadConfig: loadHabitatEnvironmentFromConfig,
  runHabitat
};