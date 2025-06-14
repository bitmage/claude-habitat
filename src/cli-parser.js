/**
 * @module cli-parser
 * @description CLI argument parser for Claude Habitat
 * 
 * Handles all command-line option parsing and validation. Transforms raw argv
 * into structured options objects that drive the application's routing logic.
 * 
 * @requires module:types - Domain model definitions
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/cli-commands.test.js`
 * - Run all tests: `npm test`
 */

/**
 * Parse command line arguments into options object
 * @param {string[]} argv - Process arguments (typically process.argv.slice(2))
 * @returns {object} Parsed options with all flags and values
 */
function parseCliArguments(argv) {
  const options = {
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
    tty: null  // null = use config default, true = force TTY, false = disable TTY
  };

  // Parse arguments
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    // Handle --option=value syntax
    if (arg.startsWith('--test-sequence=')) {
      options.testSequence = arg.substring('--test-sequence='.length);
    } else if (arg.startsWith('--rebuild=')) {
      const phase = arg.substring('--rebuild='.length);
      options.rebuild = true;
      options.rebuildFrom = phase || null;
      continue;
    }
    if (arg.startsWith('--preserve-colors')) {
      options.preserveColors = true;
      continue;
    }
    
    switch (arg) {
      case '-c':
      case '--config':
        options.configPath = argv[++i];
        break;
      case '-r':
      case '--repo':
        options.extraRepos.push(argv[++i]);
        break;
      case '--clean':
        options.clean = true;
        break;
      case '--list-configs':
        options.listConfigs = true;
        break;
      case '--rebuild':
        options.rebuild = true;
        // Next argument might be phase name/number (if not starting with -)
        if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          options.rebuildFrom = argv[++i];
        }
        break;
      case '--show-phases':
        options.showPhases = true;
        break;
      case '--clean-images':
        options.cleanImages = true;
        // Next argument might be target (all, orphans, or habitat name)
        if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          options.cleanImagesTarget = argv[++i];
        }
        break;
      case '--cmd':
        // Override claude command
        if (i + 1 < argv.length) {
          options.overrideCommand = argv[++i];
        }
        break;
      case '--tty':
        // Force TTY allocation
        options.tty = true;
        break;
      case '--no-tty':
        // Disable TTY allocation
        options.tty = false;
        break;
      case '--test-sequence':
        // Test sequence for UI testing
        if (i + 1 < argv.length) {
          options.testSequence = argv[++i];
        }
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      case 's':
      case 'start':
        options.start = true;
        // Next argument might be habitat name
        if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          options.habitatName = argv[++i];
        }
        break;
      case 'a':
      case 'add':
        options.add = true;
        break;
      case 'm':
      case 'maintain':
        options.maintain = true;
        break;
      case 'test':
        options.test = true;
        // Next argument should be habitat name (or "all" for all habitats)
        if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          const target = argv[++i];
          if (target === 'all') {
            options.testType = 'all';
          } else {
            options.testTarget = target;
            // Process remaining arguments after habitat name
            while (i + 1 < argv.length && argv[i + 1].startsWith('--')) {
              const flag = argv[++i];
              if (flag === '--system') {
                options.testType = 'system';
              } else if (flag === '--shared') {
                options.testType = 'shared';
              } else if (flag.startsWith('--verify-fs')) {
                // Support --verify-fs=scope syntax
                if (flag.includes('=')) {
                  const scope = flag.split('=')[1];
                  options.testType = `verify-fs:${scope}`;
                } else {
                  options.testType = 'verify-fs';
                }
              } else if (flag === '--habitat') {
                options.testType = 'habitat';
              } else if (flag === '--all') {
                options.testType = 'all';
              } else if (flag === '--rebuild') {
                options.rebuild = true;
              } else {
                throw new Error(`Unknown test option: ${flag}`);
              }
            }
            
            // Default to all tests if no specific type was set
            if (!options.testType || options.testType === 'menu') {
              options.testType = 'all';
            }
          }
        } else {
          // No habitat specified - show menu
          options.testType = 'menu';
        }
        break;
      default:
        // If it doesn't start with -, treat it as a habitat name
        if (!argv[i].startsWith('-')) {
          options.configPath = argv[i];
        } else {
          throw new Error(`Unknown option: ${argv[i]}`);
        }
    }
  }

  return options;
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