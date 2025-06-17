/**
 * @module cli-parser
 * @description CLI argument parser for Claude Habitat using Commander.js
 * 
 * Handles all command-line option parsing and validation using Commander.js.
 * Transforms raw argv into structured options objects that drive the application's
 * routing logic. Supports --foo=bar syntax for all parameterized arguments.
 * 
 * @requires module:types - Domain model definitions
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/cli-commands.test.js`
 * - Run all tests: `npm test`
 */

const { Command } = require('commander');

/**
 * Parse command line arguments into options object
 * @param {string[]} argv - Process arguments (typically process.argv.slice(2))
 * @returns {object} Parsed options with all flags and values
 */
function parseCliArguments(argv) {
  const program = new Command();
  
  // Configure the program
  program
    .name('claude-habitat')
    .version('0.1.2')
    .description('Create completely isolated development environments for Claude Code')
    .allowUnknownOption(true) // Allow standalone global options
    .exitOverride() // Don't exit on parse errors, throw instead
    .helpOption(false) // Disable automatic help handling
    .configureOutput({
      // Capture help output instead of printing it
      writeOut: (str) => {},
      writeErr: (str) => {}
    });

  // Global options
  program
    .option('-c, --config <file>', 'Path to configuration YAML file')
    .option('-r, --repo <repo>', 'Additional repository (URL:PATH[:BRANCH])', collectRepos, [])
    .option('--cmd <command>', 'Override claude command')
    .option('--tty', 'Force TTY allocation')
    .option('--no-tty', 'Disable TTY allocation')
    .option('--no-cleanup', 'Disable automatic container cleanup')
    .option('--clean', 'Remove all containers and images')
    .option('--clean-images [target]', 'Clean Docker images (all|orphans|HABITAT_NAME)')
    .option('--list-configs', 'List available configurations')
    .option('--test-sequence <seq>', 'Run UI test sequence')
    .option('--preserve-colors', 'Preserve ANSI color codes')
    .option('--show-phases', 'Show build phases')
    .option('-h, --help', 'Display help message');

  // Single-letter shortcuts (handle manually since Commander doesn't support them well)
  const processedArgv = [...argv];
  if (processedArgv.length > 0) {
    if (processedArgv[0] === 's') {
      processedArgv[0] = 'start';
    } else if (processedArgv[0] === 'a') {
      processedArgv[0] = 'add';
    } else if (processedArgv[0] === 'm') {
      processedArgv[0] = 'maintain';
    }
  }

  // Result object to populate
  const result = {
    configPath: null,
    extraRepos: [],
    clean: false,
    listConfigs: false,
    help: false,
    start: false,
    add: false,
    maintain: false,
    test: false,
    testTarget: null,
    testType: 'all',
    testSequence: null,
    preserveColors: false,
    overrideCommand: null,
    habitatName: null,
    rebuild: false,
    rebuildFrom: null,
    showPhases: false,
    cleanImages: false,
    cleanImagesTarget: 'all',
    noCleanup: false,
    tty: null  // null = use config default, true = force TTY, false = disable TTY
  };

  // Start command
  program
    .command('start [habitat]')
    .description('Start habitat (last used if no name given)')
    .option('--rebuild [phase]', 'Force rebuild from phase')
    .option('--show-phases', 'Show build phases')
    .action((habitat, options, command) => {
      result.start = true;
      result.habitatName = habitat || null;
      if (options.rebuild !== undefined) {
        result.rebuild = true;
        if (typeof options.rebuild === 'string') {
          result.rebuildFrom = options.rebuild;
        }
      }
      if (options.showPhases) {
        result.showPhases = true;
      }
    });

  // Test command
  program
    .command('test [habitat]')
    .description('Run tests (show menu if no args)')
    .option('--system', 'Run system tests')
    .option('--shared', 'Run shared tests')
    .option('--habitat', 'Run habitat tests')
    .option('--verify-fs [scope]', 'Filesystem verification', 'all')
    .option('--all', 'Run all tests')
    .option('--rebuild', 'Force rebuild')
    .action((habitat, options, command) => {
      result.test = true;
      if (habitat) {
        if (habitat === 'all') {
          result.testType = 'all';
        } else {
          result.testTarget = habitat;
        }
      } else {
        result.testType = 'menu';
      }

      // Handle test type options
      if (options.system) {
        result.testType = 'system';
      } else if (options.shared) {
        result.testType = 'shared';
      } else if (options.habitat) {
        result.testType = 'habitat';
      } else if (options.verifyFs !== undefined) {
        if (typeof options.verifyFs === 'string' && options.verifyFs !== 'all') {
          result.testType = `verify-fs:${options.verifyFs}`;
        } else {
          result.testType = 'verify-fs';
        }
      } else if (options.all) {
        result.testType = 'all';
      }

      if (options.rebuild) {
        result.rebuild = true;
      }
    });

  // Add command
  program
    .command('add')
    .description('Create new configuration with AI assistance')
    .action(() => {
      result.add = true;
    });

  // Maintain command
  program
    .command('maintain')
    .description('Update/troubleshoot Claude Habitat itself')
    .action(() => {
      result.maintain = true;
    });

  try {
    program.parse(processedArgv, { from: 'user' });
  } catch (error) {
    // Convert Commander.js errors to our expected format
    const message = error.message || '';
    if (message.includes('unknown option')) {
      throw new Error(`Unknown option: ${message.split("'")[1] || message}`);
    }
    if (message === '(outputHelp)' || message.includes('help')) {
      // Help output occurred - parse options anyway
      const globalOptions = program.opts();
      result.configPath = globalOptions.config || null;
      result.extraRepos = globalOptions.repo || [];
      result.clean = globalOptions.clean || false;
      result.listConfigs = globalOptions.listConfigs || false;
      result.testSequence = globalOptions.testSequence || null;
      result.preserveColors = globalOptions.preserveColors || false;
      result.overrideCommand = globalOptions.cmd || null;
      result.showPhases = globalOptions.showPhases || false;
      result.cleanImages = globalOptions.cleanImages !== undefined && globalOptions.cleanImages !== false;
      result.cleanImagesTarget = typeof globalOptions.cleanImages === 'string' ? globalOptions.cleanImages : 'all';
      result.noCleanup = globalOptions.noCleanup || false;
      result.tty = globalOptions.tty === true ? true : (globalOptions.tty === false ? false : null);
      
      // Only set help=true if user explicitly requested it
      result.help = globalOptions.help || false;
      
      // If this was an explicit help request, return with help=true
      // If this was just Commander.js showing help for unknown command structure, suppress it
      if (!result.help && !result.clean && !result.listConfigs && !result.cleanImages && !result.showPhases && !result.testSequence) {
        // No valid command found, this is a real help request
        result.help = true;
      }
      
      return result;
    }
    throw new Error(`Unknown option: ${message}`);
  }

  // Get global options
  const globalOptions = program.opts();
  
  // Apply global options to result
  result.configPath = globalOptions.config || null;
  result.extraRepos = globalOptions.repo || [];
  result.clean = globalOptions.clean || false;
  result.listConfigs = globalOptions.listConfigs || false;
  result.help = globalOptions.help || false;
  result.testSequence = globalOptions.testSequence || null;
  result.preserveColors = globalOptions.preserveColors || false;
  result.overrideCommand = globalOptions.cmd || null;
  result.showPhases = result.showPhases || globalOptions.showPhases || false;
  result.cleanImages = globalOptions.cleanImages !== undefined && globalOptions.cleanImages !== false;
  result.cleanImagesTarget = typeof globalOptions.cleanImages === 'string' ? globalOptions.cleanImages : 'all';
  result.noCleanup = globalOptions.noCleanup || false;
  result.tty = globalOptions.tty === true ? true : (globalOptions.tty === false ? false : null);
  
  // If no command was parsed but we have a test sequence, it's valid
  if (result.testSequence && !result.start && !result.add && !result.maintain && !result.test) {
    // Allow test sequence to run standalone
  }

  // Handle positional config argument (for backwards compatibility)
  if (!result.start && !result.add && !result.maintain && !result.test && 
      !result.clean && !result.listConfigs && !result.help && !result.cleanImages &&
      !result.showPhases && processedArgv.length > 0 && !processedArgv[0].startsWith('-')) {
    result.configPath = processedArgv[0];
  }

  return result;
}

/**
 * Helper function to collect multiple repo options
 */
function collectRepos(value, previous) {
  return previous.concat([value]);
}

/**
 * Validate CLI options for consistency
 * @param {object} options - Parsed options object
 * @throws {Error} If options are invalid or conflicting
 */
function validateCliOptions(options) {
  // Can't use multiple primary commands at once
  const primaryCommands = ['start', 'add', 'maintain', 'test', 'clean', 'listConfigs', 'help', 'cleanImages'];
  const activePrimary = primaryCommands.filter(cmd => options[cmd]);
  
  if (activePrimary.length > 1) {
    throw new Error(`Cannot use multiple commands at once: ${activePrimary.join(', ')}`);
  }

  // Test sequence implies we're in test mode
  if (options.testSequence && !options.test && activePrimary.length === 0) {
    // Test sequence can run standalone
    return;
  }

  // Validate test options
  if (options.test && options.testTarget && options.testType === 'all') {
    // This is valid - run all tests for a specific habitat
  }

  // Extra repos only make sense with config or start
  if (options.extraRepos.length > 0 && !options.configPath && !options.start) {
    throw new Error('--repo requires a configuration or start command');
  }

  // Rebuild only makes sense with config, start, or test
  if (options.rebuild && !options.configPath && !options.start && !options.test) {
    throw new Error('--rebuild requires a configuration, start, or test command');
  }
}

module.exports = { parseCliArguments, validateCliOptions };