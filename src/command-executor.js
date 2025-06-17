/**
 * @module command-executor
 * @description Command execution engine for Claude Habitat CLI operations
 * 
 * Handles direct CLI command execution that produces output and exits.
 * These commands bypass the interactive menu system and provide immediate
 * results for automation and scripting scenarios.
 * 
 * @requires module:types - Domain model definitions
 * @requires module:container-operations - Docker container operations
 * @requires module:image-management - Image cleanup operations
 * @requires module:standards/path-resolution - Path handling conventions
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/command-builders.test.js`
 * - Run all tests: `npm test`
 */

const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const yaml = require('js-yaml');
// @see {@link module:standards/path-resolution} for project-root relative path conventions using rel()
const { colors, fileExists } = require('./utils');
const { askToContinue } = require('./cli');
const { dockerRun } = require('./container-operations');
const { cleanAllImages, cleanHabitatImages, cleanOrphanImages, showImageSummary } = require('./image-management');

/**
 * Execute CLI commands that have direct output
 * These commands show output and exit (not return to menu)
 */
async function executeCliCommand(options) {
  // Note: Help is now handled automatically by Commander.js

  // Handle list configs
  if (options.listConfigs) {
    await listConfigs();
    process.exit(0);
  }

  // Handle show phases
  if (options.showPhases) {
    await showPhases();
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
 * Clean Docker containers, images, and dangling images
 */
async function cleanDockerImages() {
  console.log(colors.green('🧹 Comprehensive Claude Habitat cleanup...'));
  
  // Import cleanup functions
  const { cleanupContainers, cleanupDanglingImages } = require('./container-cleanup');
  
  // Clean containers first
  console.log('\n1. Cleaning containers...');
  await cleanupContainers();
  
  // Clean claude-habitat images
  console.log('\n2. Cleaning Claude Habitat images...');
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
      console.log(colors.green(`Removed ${images.length} image(s).`));
    }
  } catch {
    console.log('No Claude Habitat images found.');
  }
  
  // Clean dangling images
  console.log('\n3. Cleaning dangling images...');
  await cleanupDanglingImages();
  
  console.log(colors.green('\n✅ Comprehensive cleanup complete!'));
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

/**
 * Show available build phases
 */
async function showPhases() {
  const { BUILD_PHASES } = require('./phases');
  
  console.log('Claude Habitat Build Phases:\n');
  
  for (const phase of BUILD_PHASES) {
    console.log(`${phase.id}: ${colors.cyan(phase.name)} - ${phase.description}`);
  }
  
  console.log(`\nUsage:`);
  console.log(`  ./claude-habitat start HABITAT --rebuild=<phase>`);
  console.log(`  ./claude-habitat start HABITAT --rebuild <phase>`);
  console.log(`\nExamples:`);
  console.log(`  ./claude-habitat start discourse --rebuild=repos`);
  console.log(`  ./claude-habitat start discourse --rebuild 8`);
}

module.exports = { executeCliCommand, listConfigs, cleanDockerImages, handleCleanImages, showPhases };