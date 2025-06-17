/**
 * @module cli-parser
 * @description CLI argument parser for Claude Habitat using Commander.js
 * 
 * Handles all command-line option parsing and validation using Commander.js
 * natural behavior. No custom help suppression or workarounds.
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
    target: null,
    cleanImages: false,
    cleanImagesTarget: 'all',
    noCleanup: false,
    tty: null  // null = use config default, true = force TTY, false = disable TTY
  };

  // Configure the program with natural Commander.js behavior
  program
    .name('claude-habitat')
    .version('0.1.2')
    .description('Create completely isolated development environments for Claude Code');

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
    .option('--show-phases', 'Show build phases');

  // Handle single-letter shortcuts manually (before Commander.js parsing)
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

  // Start command
  program
    .command('start [habitat]')
    .description('Start habitat (last used if no name given)')
    .option('--rebuild [phase]', 'Force rebuild from phase')
    .option('--show-phases', 'Show build phases')
    .option('--target <phase>', 'Build up to target phase and stop')
    .action((habitat, options) => {
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
      if (options.target) {
        result.target = options.target;
      }
    });

  // Test command
  program
    .command('test [habitat]')
    .description('Run tests (show menu if no args)')
    .option('--system', 'Run system tests')
    .option('--shared', 'Run shared tests')
    .option('--habitat', 'Run habitat tests')
    .option('--verify-fs [scope]', 'Filesystem verification')
    .option('--all', 'Run all tests')
    .option('--rebuild', 'Force rebuild')
    .action((habitat, options) => {
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
        if (typeof options.verifyFs === 'string') {
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

  // Global action handler for standalone options (like --test-sequence, --clean, etc.)
  program.action((options) => {
    // Apply global options to result
    result.configPath = options.config || null;
    result.extraRepos = options.repo || [];
    result.clean = options.clean || false;
    result.listConfigs = options.listConfigs || false;
    result.testSequence = options.testSequence || null;
    result.preserveColors = options.preserveColors || false;
    result.overrideCommand = options.cmd || null;
    result.showPhases = options.showPhases || false;
    result.cleanImages = options.cleanImages !== undefined && options.cleanImages !== false;
    result.cleanImagesTarget = typeof options.cleanImages === 'string' ? options.cleanImages : 'all';
    result.noCleanup = options.noCleanup || false;
    result.tty = options.tty === true ? true : (options.tty === false ? false : null);
  });

  // Parse with Commander.js natural behavior
  program.parse(processedArgv, { from: 'user' });
  
  // Get global options and apply them regardless of command
  const globalOptions = program.opts();
  result.configPath = result.configPath || globalOptions.config || null;
  result.extraRepos = result.extraRepos.length > 0 ? result.extraRepos : (globalOptions.repo || []);
  result.clean = result.clean || globalOptions.clean || false;
  result.listConfigs = result.listConfigs || globalOptions.listConfigs || false;
  result.testSequence = result.testSequence || globalOptions.testSequence || null;
  result.preserveColors = result.preserveColors || globalOptions.preserveColors || false;
  result.overrideCommand = result.overrideCommand || globalOptions.cmd || null;
  result.showPhases = result.showPhases || globalOptions.showPhases || false;
  result.cleanImages = result.cleanImages || (globalOptions.cleanImages !== undefined && globalOptions.cleanImages !== false);
  result.cleanImagesTarget = result.cleanImagesTarget !== 'all' ? result.cleanImagesTarget : (typeof globalOptions.cleanImages === 'string' ? globalOptions.cleanImages : 'all');
  result.noCleanup = result.noCleanup || globalOptions.noCleanup || false;
  result.tty = result.tty !== null ? result.tty : (globalOptions.tty === true ? true : (globalOptions.tty === false ? false : null));

  // Handle positional config argument (for backwards compatibility)
  if (!result.start && !result.add && !result.maintain && !result.test && 
      !result.clean && !result.listConfigs && !result.cleanImages &&
      !result.showPhases && !result.testSequence && processedArgv.length > 0 && !processedArgv[0].startsWith('-')) {
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
  const primaryCommands = ['start', 'add', 'maintain', 'test', 'clean', 'listConfigs', 'cleanImages'];
  const activePrimary = primaryCommands.filter(cmd => options[cmd]);
  
  if (activePrimary.length > 1) {
    throw new Error(`Cannot use multiple commands at once: ${activePrimary.join(', ')}`);
  }

  // Test sequence can run standalone
  if (options.testSequence && !options.test && activePrimary.length === 0) {
    return;
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