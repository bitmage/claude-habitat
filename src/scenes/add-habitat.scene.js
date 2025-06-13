/**
 * @module scenes/add-habitat.scene
 * @description Add habitat scene for creating new configurations with AI assistance
 * 
 * Interactive workflow for creating new habitat configurations. Guides users
 * through project analysis, repository selection, and launches AI-assisted
 * configuration creation in add mode.
 * 
 * @requires module:standards/ui-architecture - Scene-based UI patterns
 * @requires module:standards/path-resolution - Path handling conventions
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - UI tests: `npm run test:ui`
 * - Add workflow testing through scene navigation
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
// @see {@link module:standards/path-resolution} for project-root relative path conventions using rel()
const { colors, fileExists } = require('../utils');

/**
 * Add habitat scene - interactive workflow for creating new habitat configurations with AI assistance
 */
async function addHabitatScene(context) {
  context.log(colors.green('\n=== Create New Configuration ===\n'));
  
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
    context.log(colors.red('Project URL is required'));
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
  const contextContent = `# New Claude Habitat Configuration

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
  
  await fs.writeFile(path.join(workspace, 'PROJECT_CONTEXT.md'), contextContent);
  
  // Copy example for reference
  try {
    await fs.copyFile(
      path.join(__dirname, '..', '..', 'habitats', 'discourse', 'config.yaml'),
      path.join(workspace, 'example-discourse.yaml')
    );
  } catch {
    // It's ok if example doesn't exist
  }
  
  // Copy "Meta" Claude instructions for add mode
  await fs.copyFile(
    path.join(__dirname, '..', '..', 'claude', 'INSTRUCTIONS.md'),
    path.join(workspace, 'CLAUDE.md')
  );
  
  context.log(`\nWorkspace created at: ${workspace}`);
  context.log('Launching Claude to create your configuration...\n');
  
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
  context.log('\nChecking for created files...');
  
  try {
    // Check for created files
    const dockerfileDir = path.join(workspace, 'dockerfiles', habitatName);
    const configFile = path.join(workspace, 'configs', `${habitatName}.yaml`);
    
    if (await fileExists(path.join(dockerfileDir, 'Dockerfile'))) {
      // Copy Dockerfile
      const targetDockerDir = path.join(__dirname, '..', '..', 'habitats', habitatName);
      await fs.mkdir(targetDockerDir, { recursive: true });
      await fs.copyFile(
        path.join(dockerfileDir, 'Dockerfile'),
        path.join(targetDockerDir, 'Dockerfile')
      );
      context.log(colors.green(`✓ Dockerfile created`));
    }
    
    if (await fileExists(configFile)) {
      // Copy config
      await fs.copyFile(
        configFile,
        path.join(__dirname, '..', '..', 'habitats', habitatName, 'config.yaml')
      );
      context.log(colors.green(`✓ Configuration created`));
    }
    
    context.log(colors.green('\nConfiguration created successfully!'));
    context.log(`You can now run: ./claude-habitat start ${habitatName}`);
  } catch (err) {
    context.log(colors.red(`Error processing created files: ${err.message}`));
  }

  await context.getInput('Press Enter to return to main menu...', false);
  
  const { mainMenuScene } = require('./main-menu.scene');
  return mainMenuScene;
}

module.exports = { addHabitatScene };