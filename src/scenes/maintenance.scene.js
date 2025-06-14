/**
 * @module scenes/maintenance.scene
 * @description Maintenance scene for Claude Habitat self-maintenance
 * 
 * Launches Claude in maintenance mode to update, troubleshoot, and enhance
 * Claude Habitat itself. Provides meta-development capabilities by running
 * Claude with access to the project's source code.
 * 
 * ## "Meta" Claude Role
 * 
 * You are "Meta" Claude - you help manage and maintain Claude Habitat itself.
 * You run locally on the host machine with access to the full installation.
 * 
 * ### Maintenance Tasks Available
 * 
 * **🐛 Fix Issues**
 * - Debug Docker build failures
 * - Resolve service startup problems  
 * - Fix configuration parsing errors
 * - Troubleshoot container networking
 * 
 * **✨ Add Features**
 * - Add support for new services (MongoDB, Elasticsearch, etc.)
 * - Implement new command-line options
 * - Enhance the interactive menu
 * - Add new configuration templates
 * 
 * **📝 Update Configurations**  
 * - Modify existing habitat configs
 * - Update Dockerfiles for better performance
 * - Add new example configurations
 * - Optimize build caching
 * 
 * **🧪 Testing & Validation**
 * - Test existing configurations
 * - Validate YAML syntax
 * - Check Docker build processes
 * - Verify service integrations
 * 
 * ## Standard Development Lifecycle
 * 
 * ### 1. Understand the Issue
 * - **Search codebase**: Use `rg` to search for related code and recent commits
 * - **Search the web**: Research best practices and similar implementations if needed
 * - **Create proposal**: Develop clear implementation approach
 * - **Verify understanding**: Do you have enough information? If not, ask questions until clear
 * 
 * ### 2. Implementation Workflow
 * - **Create feature branch**: `git checkout -b feature/description`
 * - **Verify tests**: Run current test suite to establish baseline
 * - **Write side-by-side**: Implement code and unit tests together
 * - **Test frequently**: Run unit tests to understand current state
 * - **Complete iteratively**: Continue until implementation complete and tests pass
 * - **Run full suite**: Include relevant E2E and habitat tests
 * 
 * ### 3. Delivery
 * - **Descriptive commit**: Clear message explaining the change
 * - **Push and PR**: `git push` then create pull request
 * 
 * ## Development Best Practices
 * 
 * ### Functional Programming & Pure Functions
 * - Functions should be deterministic and testable
 * - Separate pure logic from side effects
 * - Use dependency injection for external dependencies
 * 
 * ### Test-Driven Quality Assurance
 * - Every change must pass existing tests
 * - Fix broken tests immediately
 * - Always run tests before completion: `npm test && npm run test:e2e`
 * 
 * ### Domain-Driven Design
 * - Use consistent terminology across codebase
 * - Separate concerns by domain boundaries
 * - Clear distinction between system/, shared/, habitats/ domains
 * 
 * @requires module:standards/ui-architecture - Scene-based UI patterns
 * @requires module:standards/path-resolution - Path handling conventions
 * 
 * @tests
 * - UI tests: `npm run test:ui`
 * - Maintenance mode testing through scene navigation
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
// @see {@link module:standards/path-resolution} for project-root relative path conventions using rel()
const { colors } = require('../utils');

/**
 * Maintenance scene - update/troubleshoot Claude Habitat itself
 */
async function maintenanceScene(context) {
  context.log(colors.green('\n=== Claude Habitat Maintenance Mode ===\n'));
  context.log('This will launch Claude in the claude-habitat directory.');
  context.log('Claude will show you a menu of maintenance options.\n');
  context.log(colors.yellow('💡 Tip: Say "menu" at any time to see the options again\n'));
  
  // Create a session instruction file for Claude
  const projectRoot = path.join(__dirname, '..', '..');
  const sessionInstructions = `# Maintenance Mode Session

You are now in Claude Habitat maintenance mode. 

IMPORTANT: First, read and present the options from claude/MAINTENANCE.md to the user.

When the user says "menu", "options", "help", or similar, show the maintenance menu again.

Current directory: ${projectRoot}
Session started: ${new Date().toISOString()}
`;

  const instructionFile = path.join(projectRoot, '.maintenance-session.md');
  await fs.writeFile(instructionFile, sessionInstructions);
  
  // Launch Claude in the claude-habitat directory
  const claudeCmd = spawn('claude', [], {
    cwd: projectRoot,
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
  
  context.log('\nMaintenance session completed.');
  
  const { mainMenuScene } = require('./main-menu.scene');
  return mainMenuScene;
}

module.exports = { maintenanceScene };
