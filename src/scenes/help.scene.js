/**
 * @module scenes/help.scene
 * @description Help scene displaying usage information and command reference
 * 
 * Shows comprehensive usage information, CLI options, shortcuts, and
 * workflow guidance. Implements the help system within the interactive
 * scene architecture.
 * 
 * @requires module:standards/ui-architecture - Scene-based UI patterns
 * 
 * @tests
 * - E2E tests: `npm run test:e2e -- test/e2e/ui-verification.test.js`
 * - UI tests: `npm run test:ui`
 */
async function helpScene(context) {
  context.log(`
Usage: claude-habitat.js [OPTIONS|SHORTCUTS]

OPTIONS:
    -c, --config FILE       Path to configuration YAML file
    -r, --repo REPO_SPEC    Additional repository to clone (format: URL:PATH[:BRANCH])
                           Can be specified multiple times
    --cmd COMMAND          Override the claude command for this session
    --target PHASE         Build up to target phase and stop (e.g. --target verify)
    --clean                 Remove all Claude Habitat Docker images
    --list-configs          List available configuration files
    -h, --help             Display this help message

SHORTCUTS:
    s, start [HABITAT]     Start habitat (last used if no name given)
    a, add                 Create new configuration with AI assistance
    m, maintain            Update/troubleshoot Claude Habitat itself
    test [HABITAT] [TYPE]  Run tests (show menu if no args)

TEST OPTIONS:
    test                   Show interactive test menu
    test all               Run all tests for all habitats
    test discourse         Run all tests for discourse habitat  
    test discourse --system    Run system tests in discourse habitat
    test discourse --shared    Run shared tests in discourse habitat
    test discourse --verify-fs    Run filesystem verification for discourse habitat
    test discourse --verify-fs=system   Run system filesystem verification
    test discourse --verify-fs=shared   Run shared filesystem verification  
    test discourse --verify-fs=habitat  Run habitat filesystem verification
    test discourse --verify-fs=all      Run all filesystem verification scopes
    test discourse --habitat   Run discourse-specific tests only
    test discourse --all       Run all tests for discourse habitat

EXAMPLES:
    # Start with shortcut
    claude-habitat.js s

    # Start specific habitat
    claude-habitat.js start discourse

    # Start with custom command
    claude-habitat.js start claude-habitat --cmd "claude -p 'do some stuff'"

    # Use a configuration file
    claude-habitat.js --config discourse.yaml

    # Override/add repositories
    claude-habitat.js --config discourse.yaml --repo "https://github.com/myuser/my-plugin:/src/plugins/my-plugin"

    # Build up to verify phase and stop
    claude-habitat.js start discourse --target verify

    # Build up to specific phase
    claude-habitat.js start claude-habitat --target scripts

    # List available configs
    claude-habitat.js --list-configs`);

  await context.getInput('Press Enter to return to main menu...', false);
  
  const { mainMenuScene } = require('./main-menu.scene');
  return mainMenuScene;
}

module.exports = { helpScene };