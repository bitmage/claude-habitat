const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const yaml = require('js-yaml');
const { colors, fileExists } = require('./utils');
const { askToContinue } = require('./cli');
const { dockerRun } = require('./docker');
const { cleanAllImages, cleanHabitatImages, cleanOrphanImages, showImageSummary } = require('./image-management');

/**
 * Execute CLI commands that have direct output
 * These commands show output and exit (not return to menu)
 */
async function executeCliCommand(options) {
  // Handle help
  if (options.help) {
    await showHelp();
    process.exit(0);
  }

  // Handle list configs
  if (options.listConfigs) {
    await listConfigs();
    process.exit(0);
  }

  // Handle clean
  if (options.clean) {
    await cleanDockerImages();
    process.exit(0);
  }

  // Handle clean images
  if (options.cleanImages) {
    await handleCleanImages(options.cleanImagesTarget);
    process.exit(0);
  }

  return false; // No command executed
}

/**
 * Show help information
 */
async function showHelp() {
  console.log(`Usage: ${path.basename(process.argv[1])} [OPTIONS|SHORTCUTS]

OPTIONS:
    -c, --config FILE       Path to configuration YAML file
    -r, --repo REPO_SPEC    Additional repository to clone (format: URL:PATH[:BRANCH])
                           Can be specified multiple times
    --cmd COMMAND          Override the claude command for this session
    --rebuild              Force rebuild of Docker images (ignore cache)
    --clean                Remove all Claude Habitat Docker images
    --clean-images [TARGET] Clean Docker images (all|orphans|HABITAT_NAME, default: all)
    --list-configs         List available configuration files
    --test-sequence=SEQ    Run UI test sequence (e.g., "t2f" for test>claude-habitat>filesystem)
    --preserve-colors      Preserve ANSI color codes in test sequence output
    -h, --help             Display this help message

SHORTCUTS:
    s, start [HABITAT]     Start habitat (last used if no name given)
    start HABITAT --rebuild    Force rebuild and start habitat
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
    ${path.basename(process.argv[1])} s

    # Start specific habitat
    ${path.basename(process.argv[1])} start discourse

    # Start with rebuild (ignores cache)
    ${path.basename(process.argv[1])} start discourse --rebuild

    # Clean all images
    ${path.basename(process.argv[1])} --clean-images

    # Clean specific habitat images
    ${path.basename(process.argv[1])} --clean-images discourse

    # Clean orphan images only
    ${path.basename(process.argv[1])} --clean-images orphans

    # Start with custom command
    ${path.basename(process.argv[1])} start claude-habitat --cmd "claude -p 'do some stuff'"

    # Use a configuration file
    ${path.basename(process.argv[1])} --config discourse.yaml

    # Override/add repositories
    ${path.basename(process.argv[1])} --config discourse.yaml --repo "https://github.com/myuser/my-plugin:/src/plugins/my-plugin"

    # List available configs
    ${path.basename(process.argv[1])} --list-configs`);
}

/**
 * List available configurations
 */
async function listConfigs() {
  const habitatsDir = path.join(process.cwd(), 'habitats');
  console.log('Available habitats:\n');
  try {
    const dirs = await fs.readdir(habitatsDir);
    let found = false;
    for (const dir of dirs) {
      const configPath = path.join(habitatsDir, dir, 'config.yaml');
      if (await fileExists(configPath)) {
        try {
          const content = require('fs').readFileSync(configPath, 'utf8');
          const parsed = yaml.load(content);
          console.log(`  ${colors.yellow(dir)}`);
          if (parsed.description) {
            console.log(`    ${parsed.description}`);
          }
          console.log('');
          found = true;
        } catch {
          console.log(`  ${colors.yellow(dir)} (configuration error)`);
        }
      }
    }
    if (!found) {
      console.log('  No habitats found');
    }
  } catch (err) {
    console.log('  No habitats directory found');
  }
}

/**
 * Clean Docker images
 */
async function cleanDockerImages() {
  console.log('Cleaning Claude Habitat Docker images...');
  try {
    const { stdout } = await execAsync('docker images --format "{{.Repository}}:{{.Tag}}" | grep "^claude-habitat-"');
    const images = stdout.trim().split('\n').filter(Boolean);
    
    if (images.length === 0) {
      console.log('No Claude Habitat images found.');
    } else {
      for (const image of images) {
        console.log(`Removing ${image}...`);
        try {
          await dockerRun(['rmi', image]);
        } catch (err) {
          console.log(colors.yellow(`  Warning: Could not remove ${image}: ${err.message}`));
        }
      }
      console.log(colors.green(`Clean complete. Removed ${images.length} image(s).`));
    }
  } catch {
    console.log('No Claude Habitat images found.');
  }
}

/**
 * Handle clean images command with different targets
 * @param {string} target - all, orphans, or habitat name
 */
async function handleCleanImages(target = 'all') {
  console.log(colors.green('\n=== Claude Habitat Image Management ===\n'));
  
  // Show summary first
  await showImageSummary();
  
  switch (target.toLowerCase()) {
    case 'all':
      await cleanAllImages();
      break;
    case 'orphans':
      await cleanOrphanImages();
      break;
    default:
      // Assume it's a habitat name
      await cleanHabitatImages(target);
      break;
  }
}

module.exports = { executeCliCommand, showHelp, listConfigs, cleanDockerImages, handleCleanImages };