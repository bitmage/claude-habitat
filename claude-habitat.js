#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const yaml = require('js-yaml');


// Import modules
const { colors, sleep, fileExists, findPemFiles, calculateCacheHash, parseRepoSpec, parseCommands } = require('./src/utils');
const { dockerRun, dockerExec, dockerImageExists, dockerIsRunning } = require('./src/docker');
const { loadConfig } = require('./src/config');
const { askToContinue, askQuestion } = require('./src/cli');
const { testRepositoryAccess } = require('./src/github');
const { runTestMode } = require('./src/testing');
const { 
  loadIgnorePatterns, 
  shouldIgnoreItem, 
  findFilesToCopy, 
  copyFilesDirectory, 
  processFileOperations, 
  copyFileToContainer, 
  verifyFilesystem, 
  runFilesystemVerification 
} = require('./src/filesystem');
const { 
  buildBaseImage, 
  buildPreparedImage, 
  runSetupCommands, 
  cloneRepository 
} = require('./src/docker');

const returnToMainMenu = async () => {
  console.log('\nReturning to main menu...\n');
  await main();
};


async function runHabitat(configPath, extraRepos = [], overrideCommand = null) {
  const config = await loadConfig(configPath);
  const hash = calculateCacheHash(config, extraRepos);
  const preparedTag = `claude-habitat-${config.name}:${hash}`;

  console.log(`Cache hash: ${hash}`);
  console.log(`Prepared image tag: ${preparedTag}`);

  // Check if prepared image exists
  if (await dockerImageExists(preparedTag)) {
    console.log(colors.green(`Using cached prepared image: ${preparedTag}`));
    console.log('This should start quickly since everything is pre-installed!');
  } else {
    console.log('No cached image found, building prepared environment...');
    console.log('This will take several minutes but subsequent runs will be instant.');

    // Build base image if needed
    await buildBaseImage(config);

    // Build prepared image
    await buildPreparedImage(config, preparedTag, extraRepos);
  }

  // Parse environment variables
  const envVars = [];
  if (config.environment && Array.isArray(config.environment)) {
    for (const env of config.environment) {
      if (env && typeof env === 'string') {
        const cleanEnv = env.replace(/^- /, '');
        envVars.push(cleanEnv);
      }
    }
  }

  // Run the container
  await runContainer(preparedTag, config, envVars, overrideCommand);
}

// Internal functions (no validation needed)

async function runContainer(tag, config, envVars, overrideCommand = null) {
  const containerName = `${config.name}_${Date.now()}_${process.pid}`;
  const workDir = config.container?.work_dir || '/workspace';
  const containerUser = config.container?.user || 'root';
  const claudeCommand = overrideCommand || config.claude?.command || 'claude';

  console.log(`Creating container from prepared image: ${containerName}`);

  // Build docker run arguments
  const runArgs = [
    'run', '-d',
    '--name', containerName,
    ...envVars.flatMap(env => ['-e', env])
  ];

  // Add volume mounts if specified
  if (config.volumes && Array.isArray(config.volumes)) {
    config.volumes.forEach(volume => {
      runArgs.push('-v', volume);
    });
  }

  runArgs.push(tag, config.container?.init_command || '/sbin/boot');

  await dockerRun(runArgs);

  // Setup cleanup
  const cleanup = async () => {
    console.log('\nCleaning up container...');
    try {
      await execAsync(`docker stop ${containerName}`);
      await execAsync(`docker rm ${containerName}`);
    } catch {
      // Ignore errors
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Wait for container to start
    console.log('Waiting for container to initialize...');
    await sleep(config.container?.startup_delay * 1000 || 5000);

    // Check if container is running
    if (!await dockerIsRunning(containerName)) {
      const { stdout: logs } = await execAsync(`docker logs ${containerName}`).catch(() => ({ stdout: 'No logs available' }));
      throw new Error(`Container exited unexpectedly:\n${logs}`);
    }

    // Verify environment
    console.log('Verifying prepared environment...');
    try {
      await dockerExec(containerName, `test -d ${workDir}`, containerUser);
    } catch {
      throw new Error(`Work directory ${workDir} not found in prepared image`);
    }

    // Run filesystem verification if configured
    const verifyResult = await verifyFilesystem(config, containerName);
    if (!verifyResult.passed) {
      console.warn(colors.yellow(`⚠️  Filesystem verification: ${verifyResult.message}`));
      if (verifyResult.missingFiles) {
        console.warn(colors.yellow(`Missing files:`));
        verifyResult.missingFiles.forEach(file => {
          console.warn(colors.yellow(`  - ${file}`));
        });
      }
    } else {
      console.log(colors.green(`✅ ${verifyResult.message}`));
    }

    console.log('');
    console.log(colors.green('Container ready!'));
    console.log('Launching Claude Code...');
    console.log('');

    // Launch Claude Code interactively
    const claudeProcess = spawn('docker', [
      'exec', '-it',
      '-u', containerUser,
      '-w', workDir,
      containerName,
      ...claudeCommand.split(' ')
    ], {
      stdio: 'inherit'
    });

    // Wait for Claude to exit
    await new Promise((resolve, reject) => {
      claudeProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Claude Code exited with code ${code}`));
      });
      claudeProcess.on('error', reject);
    });
  } finally {
    await cleanup();
  }
}

// Helper to track last used config
async function getLastUsedConfig() {
  try {
    const lastFile = path.join(__dirname, '.last-config');
    const content = await fs.readFile(lastFile, 'utf8');
    return content.trim();
  } catch {
    return null;
  }
}

async function saveLastUsedConfig(configPath) {
  try {
    const lastFile = path.join(__dirname, '.last-config');
    await fs.writeFile(lastFile, configPath);
  } catch {
    // Ignore errors
  }
}

// Add new configuration with AI assistance
async function addNewConfiguration() {
  console.log(colors.green('\n=== Create New Configuration ===\n'));
  
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
    console.log(colors.red('Project URL is required'));
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
  const context = `# New Claude Habitat Configuration

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
  
  await fs.writeFile(path.join(workspace, 'PROJECT_CONTEXT.md'), context);
  
  // Copy example for reference
  try {
    await fs.copyFile(
      path.join(__dirname, 'configs', 'discourse.yaml'),
      path.join(workspace, 'example-discourse.yaml')
    );
  } catch {
    // It's ok if example doesn't exist
  }
  
  // Copy "Meta" Claude instructions for add mode
  await fs.copyFile(
    path.join(__dirname, 'claude/INSTRUCTIONS.md'),
    path.join(workspace, 'CLAUDE.md')
  );
  
  console.log(`\nWorkspace created at: ${workspace}`);
  console.log('Launching Claude to create your configuration...\n');
  
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
  console.log('\nChecking for created files...');
  
  try {
    // Check for created files
    const dockerfileDir = path.join(workspace, 'dockerfiles', habitatName);
    const configFile = path.join(workspace, 'configs', `${habitatName}.yaml`);
    
    if (await fileExists(path.join(dockerfileDir, 'Dockerfile'))) {
      // Copy Dockerfile
      const targetDockerDir = path.join(__dirname, 'dockerfiles', habitatName);
      await fs.mkdir(targetDockerDir, { recursive: true });
      await fs.copyFile(
        path.join(dockerfileDir, 'Dockerfile'),
        path.join(targetDockerDir, 'Dockerfile')
      );
      console.log(colors.green(`✓ Dockerfile created`));
    }
    
    if (await fileExists(configFile)) {
      // Copy config
      await fs.copyFile(
        configFile,
        path.join(__dirname, 'configs', `${habitatName}.yaml`)
      );
      console.log(colors.green(`✓ Configuration created`));
    }
    
    console.log(colors.green('\nConfiguration created successfully!'));
    console.log(`You can now run: ./claude-habitat --config ${habitatName}.yaml`);
  } catch (err) {
    console.error(colors.red(`Error processing created files: ${err.message}`));
  }
}

// Tools management mode
async function runToolsManagement() {
  console.log(colors.green('\n=== Claude Habitat Tools Management ===\n'));
  console.log('Manage development tools available in all containers.\n');

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
      console.log('Tools Management Options:\n');
      console.log(`  ${colors.yellow('[1]')} Clean & reinstall all tools`);
      console.log(`  ${colors.yellow('[2]')} List tool status`);
      console.log(`  ${colors.yellow('[3]')} Reinstall specific tool`);
      console.log(`  ${colors.yellow('[q]')} Back to main menu\n`);

      const choice = await ask('Enter your choice: ');

      if (choice === 'q') {
        break;
      } else if (choice === '1') {
        await cleanAndReinstallAllTools();
      } else if (choice === '2') {
        await listToolStatus();
      } else if (choice === '3') {
        await reinstallSpecificTool();
      } else {
        console.log(colors.red('Invalid choice. Please try again.\n'));
      }
    }
  } finally {
    rl.close();
  }
}

// Clean and reinstall all tools
async function cleanAndReinstallAllTools() {
  console.log('\n' + colors.yellow('=== Clean & Reinstall All Tools ===\n'));
  
  const toolsDir = path.join(__dirname, 'system/tools');
  
  try {
    console.log('Cleaning existing tools...');
    await execAsync('cd "' + toolsDir + '" && ./install-tools.sh clean');
    
    console.log('Installing all tools...');
    await execAsync('cd "' + toolsDir + '" && ./install-tools.sh install');
    
    console.log(colors.green('✅ All tools reinstalled successfully!\n'));
  } catch (err) {
    console.error(colors.red(`❌ Error reinstalling tools: ${err.message}\n`));
  }
}

// List tool status
async function listToolStatus() {
  console.log('\n' + colors.yellow('=== Tool Status ===\n'));
  
  const toolsDir = path.join(__dirname, 'system/tools');
  
  try {
    const { stdout } = await execAsync('cd "' + toolsDir + '" && ./install-tools.sh list');
    console.log(stdout);
  } catch (err) {
    console.error(colors.red(`❌ Error listing tools: ${err.message}\n`));
  }
}

// Reinstall specific tool
async function reinstallSpecificTool() {
  console.log('\n' + colors.yellow('=== Reinstall Specific Tool ===\n'));
  
  const toolsDir = path.join(__dirname, 'system/tools');
  
  try {
    // First show available tools
    const { stdout } = await execAsync('cd "' + toolsDir + '" && ./install-tools.sh list');
    console.log('Available tools:\n');
    console.log(stdout);
    
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
      console.log('Cancelled.\n');
      return;
    }

    console.log(`Installing ${toolChoice}...`);
    await execAsync(`cd "${toolsDir}" && ./install-tools.sh install ${toolChoice}`);
    
    console.log(colors.green(`✅ ${toolChoice} reinstalled successfully!\n`));
  } catch (err) {
    console.error(colors.red(`❌ Error reinstalling tool: ${err.message}\n`));
  }
}

// Maintenance mode
async function runMaintenanceMode() {
  console.log(colors.green('\n=== Claude Habitat Maintenance Mode ===\n'));
  console.log('This will launch Claude in the claude-habitat directory.');
  console.log('Claude will show you a menu of maintenance options.\n');
  console.log(colors.yellow('💡 Tip: Say "menu" at any time to see the options again\n'));
  
  // Create a session instruction file for Claude
  const sessionInstructions = `# Maintenance Mode Session

You are now in Claude Habitat maintenance mode. 

IMPORTANT: First, read and present the options from claude/MAINTENANCE.md to the user.

When the user says "menu", "options", "help", or similar, show the maintenance menu again.

Current directory: ${__dirname}
Session started: ${new Date().toISOString()}
`;

  const instructionFile = path.join(__dirname, '.maintenance-session.md');
  await fs.writeFile(instructionFile, sessionInstructions);
  
  // Launch Claude in the claude-habitat directory
  const claudeCmd = spawn('claude', [], {
    cwd: __dirname,
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
  
  console.log('\nMaintenance session completed.');
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
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
    testType: 'all'
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-c':
      case '--config':
        options.configPath = args[++i];
        break;
      case '-r':
      case '--repo':
        options.extraRepos.push(args[++i]);
        break;
      case '--clean':
        options.clean = true;
        break;
      case '--list-configs':
        options.listConfigs = true;
        break;
      case '--cmd':
        // Override claude command
        if (i + 1 < args.length) {
          options.overrideCommand = args[++i];
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
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          options.habitatName = args[++i];
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
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          const target = args[++i];
          if (target === 'all') {
            options.testType = 'all';
          } else {
            options.testTarget = target;
            // Check for test type flag after habitat name
            if (i + 1 < args.length && args[i + 1].startsWith('--')) {
              const testTypeFlag = args[++i];
              if (testTypeFlag === '--system') {
                options.testType = 'system';
              } else if (testTypeFlag === '--shared') {
                options.testType = 'shared';
              } else if (testTypeFlag === '--verify-fs') {
                options.testType = 'verify-fs';
              } else if (testTypeFlag === '--habitat') {
                options.testType = 'habitat';
              } else if (testTypeFlag === '--all') {
                options.testType = 'all';
              }
            } else {
              // Default to all tests for the habitat
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
        if (!args[i].startsWith('-')) {
          options.configPath = args[i];
        } else {
          console.error(colors.red(`Unknown option: ${args[i]}`));
          process.exit(1);
        }
    }
  }

  // Handle special modes
  if (options.help) {
    console.log(`Usage: ${path.basename(process.argv[1])} [OPTIONS|SHORTCUTS]

OPTIONS:
    -c, --config FILE       Path to configuration YAML file
    -r, --repo REPO_SPEC    Additional repository to clone (format: URL:PATH[:BRANCH])
                           Can be specified multiple times
    --cmd COMMAND          Override the claude command for this session
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
    test discourse --verify-fs Run filesystem verification for discourse habitat
    test discourse --habitat   Run discourse-specific tests only
    test discourse --all       Run all tests for discourse habitat

EXAMPLES:
    # Start with shortcut
    ${path.basename(process.argv[1])} s

    # Start specific habitat
    ${path.basename(process.argv[1])} start discourse

    # Start with custom command
    ${path.basename(process.argv[1])} start claude-habitat --cmd "claude -p 'do some stuff'"

    # Use a configuration file
    ${path.basename(process.argv[1])} --config discourse.yaml

    # Override/add repositories
    ${path.basename(process.argv[1])} --config discourse.yaml --repo "https://github.com/myuser/my-plugin:/src/plugins/my-plugin"

    # List available configs
    ${path.basename(process.argv[1])} --list-configs`);
    
    await askToContinue();
    await returnToMainMenu();
    return;
  }

  if (options.listConfigs) {
    const habitatsDir = path.join(__dirname, 'habitats');
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
    
    await askToContinue();
    await returnToMainMenu();
    return;
  }

  if (options.clean) {
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
    
    await askToContinue();
    await returnToMainMenu();
    return;
  }

  // Handle shortcut commands
  if (options.start) {
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
        console.log(`Starting: ${path.basename(path.dirname(lastConfig))}\n`);
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
  } else if (options.add) {
    await addNewConfiguration();
    
    console.log('\nConfiguration creation completed!');
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const nextChoice = await new Promise(resolve => {
      rl.question('\nWould you like to:\n[r] Run the new habitat now\n[m] Go back to main menu\nChoice: ', answer => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
    });
    
    if (nextChoice === 'r') {
      // Try to find the newly created habitat and run it
      console.log('Looking for the newly created habitat...');
      await askToContinue('Press Enter to return to main menu to select your new habitat...');
    }
    
    await returnToMainMenu();
    return;
  } else if (options.maintain) {
    await runMaintenanceMode();
    await returnToMainMenu();
    return;
  } else if (options.test) {
    await runTestMode(options.testType, options.testTarget);
    return;
  }

  // Normal operation - require config
  if (!options.configPath) {
    // Check initialization status
    console.log('Checking system status...');
    const initStatus = await checkInitializationStatus();
    
    // No config specified - show interactive menu
    const habitatsDir = path.join(__dirname, 'habitats');
    let habitats = [];
    
    try {
      const dirs = await fs.readdir(habitatsDir);
      for (const dir of dirs) {
        const configPath = path.join(habitatsDir, dir, 'config.yaml');
        if (await fileExists(configPath)) {
          habitats.push({ name: dir, path: configPath });
        }
      }
      habitats.sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      console.error(colors.red('No habitats directory found'));
      console.log('This appears to be a fresh installation.');
      console.log('The habitats directory will be created when you add your first habitat.');
      console.log('');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const choice = await new Promise(resolve => {
        rl.question('Would you like to:\n[a] Create your first habitat with AI assistance\n[q] Quit\nChoice: ', answer => {
          rl.close();
          resolve(answer.trim().toLowerCase());
        });
      });
      
      if (choice === 'a') {
        // Create habitats directory first
        await fs.mkdir(habitatsDir, { recursive: true });
        await addNewConfiguration();
        await returnToMainMenu();
        return;
      } else {
        console.log('Goodbye!');
        process.exit(0);
      }
    }
    
    // Check repository access for existing habitats
    const habitatRepoStatus = await checkHabitatRepositories(habitatsDir);
    
    if (habitats.length === 0) {
      console.error(colors.red('No habitats found'));
      console.log('You can create your first habitat with the [a]dd option.');
      console.log('');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const choice = await new Promise(resolve => {
        rl.question('Would you like to:\n[a] Create a new habitat with AI assistance\n[q] Quit\nChoice: ', answer => {
          rl.close();
          resolve(answer.trim().toLowerCase());
        });
      });
      
      if (choice === 'a') {
        await addNewConfiguration();
        await returnToMainMenu();
        return;
      } else {
        console.log('Goodbye!');
        process.exit(0);
      }
    }
    
    // Show welcome screen
    console.log(colors.green('\n=== Claude Habitat ===\n'));
    
    // Show initialization status if incomplete
    if (initStatus.completedSteps < initStatus.totalSteps) {
      if (initStatus.completedSteps === 0) {
        console.log(colors.red('⚠️  First time setup required'));
        console.log(`   ${colors.yellow('[i]')} Initialize Claude Habitat\n`);
      } else {
        console.log(colors.yellow(`⚠️  Setup incomplete (${initStatus.completedSteps}/${initStatus.totalSteps} steps done)`));
        console.log(`   ${colors.yellow('[i]')} Complete initialization\n`);
      }
    }
    
    if (habitats.length > 0) {
      console.log('Habitats:\n');
      
      // Get the most recently used config to mark it
      const lastConfig = await getLastUsedConfig();
      const lastUsedHabitat = lastConfig ? path.basename(path.dirname(lastConfig)) : null;
      
      // Show all habitats with appropriate hotkeys
      habitats.forEach((habitat, index) => {
        let key;
        if (index < 9) {
          // Direct number keys for first 9
          key = (index + 1).toString();
        } else {
          // Tilde prefix system for 10+
          const adjusted = index - 9; // 0-based for items 10+
          const tildeCount = Math.floor(adjusted / 9) + 1;
          const digit = (adjusted % 9) + 1;
          key = '~'.repeat(tildeCount) + digit;
        }
        
        // Check if this habitat has repository issues
        const habitatStatus = habitatRepoStatus.find(h => h.name === habitat.name);
        const statusWarning = habitatStatus?.hasIssues ? ' ⚠️' : '';
        
        // Check if this is the most recent habitat
        const isLastUsed = habitat.name === lastUsedHabitat;
        const startOption = isLastUsed ? ` ${colors.yellow('[s]')}tart (most recent)` : '';
        
        try {
          const content = require('fs').readFileSync(habitat.path, 'utf8');
          const parsed = yaml.load(content);
          console.log(`  ${colors.yellow(`[${key}]`)} ${habitat.name}${statusWarning}${startOption}`);
          if (parsed.description) {
            console.log(`      ${parsed.description}`);
          }
          if (habitatStatus?.hasIssues) {
            console.log('      (may not be able to access remote repositories)');
          }
          console.log('');
        } catch (err) {
          console.log(`  ${colors.yellow(`[${key}]`)} ${habitat.name}${statusWarning}${startOption}`);
          console.log(`      (configuration error: ${err.message})`);
          console.log('');
        }
      });
    }
    
    // Add action options with clear categories
    console.log('Actions:\n');
    if (initStatus.completedSteps < initStatus.totalSteps) {
      console.log(`  ${colors.yellow('[i]')}nitialize - Set up authentication and verify system`);
    }
    console.log(`  ${colors.yellow('[a]')}dd     - Create new configuration with AI assistance`);
    console.log(`  ${colors.yellow('[t]')}est    - Run tests (system, shared, or habitat)`);
    console.log(`  t${colors.yellow('[o]')}ols   - Manage development tools`);
    console.log(`  ${colors.yellow('[m]')}aintain - Update/troubleshoot Claude Habitat itself`);
    console.log(`  ${colors.yellow('[c]')}lean   - Remove all Docker images`);
    console.log(`  ${colors.yellow('[h]')}elp    - Show usage information`);
    console.log(`  ${colors.yellow('[q]')}uit    - Exit\n`);
    
    // Get user choice with single keypress or tilde sequences
    const choice = await new Promise(resolve => {
      let tildeBuffer = '';
      
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      const onKeypress = (key) => {
        // Handle Ctrl+C
        if (key === '\u0003') {
          console.log('\n');
          process.exit(0);
        }
        
        // Handle tilde sequences
        if (key === '~') {
          tildeBuffer += '~';
          return; // Wait for more input
        }
        
        // If we have tildes, append the digit and resolve
        if (tildeBuffer.length > 0) {
          const finalChoice = tildeBuffer + key;
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onKeypress);
          resolve(finalChoice);
          return;
        }
        
        // Regular single keypress
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onKeypress);
        resolve(key.toLowerCase());
      };
      
      process.stdin.on('data', onKeypress);
    });
    
    // Handle choice
    if (choice === 'q') {
      process.exit(0);
    } else if (choice === 'i') {
      // Initialize/complete setup
      await runInitialization();
      process.exit(0);
    } else if (choice === 'h') {
      options.help = true;
    } else if (choice === 'c') {
      options.clean = true;
    } else if (choice === 's') {
      // Start - use last config or default
      const lastConfig = await getLastUsedConfig();
      if (lastConfig) {
        options.configPath = lastConfig;
        console.log(`\nStarting: ${path.basename(lastConfig)}\n`);
      } else if (configs.length > 0) {
        options.configPath = path.join(configDir, configs[0]);
        console.log(`\nStarting: ${configs[0]}\n`);
      } else {
        console.error(colors.red('\nNo configurations available'));
        process.exit(1);
      }
    } else if (choice === 'a') {
      // Add new configuration with AI
      await addNewConfiguration();
      process.exit(0);
    } else if (choice === 't') {
      // Test mode - show test menu
      await runTestMode(null, null);
      await returnToMainMenu();
      return;
    } else if (choice === 'o') {
      // Tools management
      await runToolsManagement();
      await returnToMainMenu();
      return;
    } else if (choice === 'm') {
      // Maintenance mode
      await runMaintenanceMode();
      process.exit(0);
    } else {
      // Check if it's a direct number (1-9)
      const directIndex = parseInt(choice) - 1;
      if (!isNaN(directIndex) && directIndex >= 0 && directIndex < 9 && directIndex < habitats.length) {
        options.configPath = habitats[directIndex].path;
        console.log(`\nSelected: ${habitats[directIndex].name}\n`);
      } else if (choice.startsWith('~')) {
        // Handle tilde prefix sequences (~1, ~~2, etc.)
        const tildeCount = choice.match(/^~+/)[0].length;
        const digit = choice.slice(tildeCount);
        const digitNum = parseInt(digit);
        
        if (!isNaN(digitNum) && digitNum >= 1 && digitNum <= 9) {
          // Calculate actual index: 9 + (tildeCount-1)*9 + (digitNum-1)
          const habitatIndex = 9 + (tildeCount - 1) * 9 + (digitNum - 1);
          
          if (habitatIndex < habitats.length) {
            options.configPath = habitats[habitatIndex].path;
            console.log(`\nSelected: ${habitats[habitatIndex].name}\n`);
          } else {
            console.error(colors.red('\n❌ Invalid habitat selection'));
            console.log('Returning to main menu...\n');
            await sleep(2000);
            await returnToMainMenu();
            return;
          }
        } else {
          console.error(colors.red('\n❌ Invalid tilde sequence - use ~1-9, ~~1-9, etc.'));
          console.log('Returning to main menu...\n');
          await sleep(2000);
          await returnToMainMenu();
          return;
        }
      } else {
        console.error(colors.red('\n❌ Invalid choice'));
        console.log('Use number keys 1-9, tilde sequences (~1, ~~2), or letter commands');
        console.log('Returning to main menu...\n');
        await sleep(2000);
        await returnToMainMenu();
        return;
      }
    }
  }

  // Make config path absolute (if we have one)
  if (options.configPath && !path.isAbsolute(options.configPath)) {
    // Check if it's a habitat name
    const habitatConfigPath = path.join(__dirname, 'habitats', options.configPath, 'config.yaml');
    if (await fileExists(habitatConfigPath)) {
      options.configPath = habitatConfigPath;
    } else {
      // Check if it's just a filename in old configs dir (backward compatibility)
      const configInDir = path.join(__dirname, 'configs', options.configPath);
      if (await fileExists(configInDir)) {
        options.configPath = configInDir;
      } else {
        options.configPath = path.resolve(options.configPath);
      }
    }
  }

  // Run the selected operation
  if (options.configPath) {
    try {
      // Pre-flight repository access check
      console.log('Pre-flight check...');
      const config = await loadConfig(options.configPath);
      const problemRepos = [];
      
      if (config.repositories && Array.isArray(config.repositories)) {
        for (const repo of config.repositories) {
          if (repo.url) {
            const accessMode = repo.access || 'write';
            const result = await testRepositoryAccess(repo.url, accessMode);
            if (!result.accessible) {
              problemRepos.push({ 
                url: repo.url, 
                reason: result.reason, 
                needsDeployKey: result.needsDeployKey,
                needsGitHubCli: result.needsGitHubCli,
                repoPath: result.repoPath,
                accessMode: result.accessMode,
                issues: result.issues 
              });
            }
          }
        }
      }
      
      if (problemRepos.length > 0) {
        // Separate by issue type and access mode
        const writeRepos = problemRepos.filter(repo => repo.accessMode === 'write');
        const readRepos = problemRepos.filter(repo => repo.accessMode === 'read');
        
        // Show repository access issues
        if (problemRepos.length > 0) {
          console.log(colors.yellow('⚠️ Repository access issues:'));
          
          problemRepos.forEach(repo => {
            console.log(colors.yellow(`\n   ${repo.url}: ${repo.reason}`));
          });
        }
        
        // Show GitHub App setup if repos need it
        const needsGitHubApp = problemRepos.some(repo => repo.needsGitHubApp);
        if (needsGitHubApp) {
          console.log('\n' + colors.green('GitHub App Configuration Required:'));
          console.log('1. Run: ./claude-habitat --init');
          console.log('2. Follow GitHub App setup instructions');
          console.log('3. Install the app on your repositories');
          console.log('4. Repository access will be provided by the GitHub App\n');
        }
        
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const writeRepoCount = writeRepos.length;
        const readOnlyPrompt = writeRepoCount > 0 ? `\n[s] Set failing write repositories to read-only` : '';
        
        const choice = await new Promise(resolve => {
          rl.question(`Would you like to:\n[c] Continue anyway (may fail during build)\n[f] Fix GitHub App setup\n[m] Go back to main menu\nChoice: `, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase());
          });
        });
        
        if (choice === 's' && writeRepoCount > 0) {
          // Update config to set failing write repos to read-only
          console.log('\nUpdating configuration to set failing repositories to read-only...');
          
          const configContent = await fs.readFile(options.configPath, 'utf8');
          let updatedConfig = configContent;
          
          // Update each failing write repo to have access: read
          writeRepos.forEach(repo => {
            // Find the repository in the config
            const repoUrlEscaped = repo.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const repoPattern = new RegExp(`(- url:\\s*${repoUrlEscaped}[\\s\\S]*?)(?=\\n\\s*(?:- url:|# |$))`, 'g');
            
            updatedConfig = updatedConfig.replace(repoPattern, (match) => {
              // Check if access field already exists
              if (match.includes('access:')) {
                // Update existing access field
                return match.replace(/access:\s*\w+/, 'access: read');
              } else {
                // Add access field after branch or at end
                if (match.includes('branch:')) {
                  return match.replace(/(branch:[^\n]*\n)/, '$1    access: read\n');
                } else {
                  // Add at end of repo block
                  return match.trimEnd() + '\n    access: read\n';
                }
              }
            });
          });
          
          // Write updated config back
          await fs.writeFile(options.configPath, updatedConfig);
          
          console.log(colors.green('✅ Configuration updated. Failing repositories set to read-only.'));
          console.log('Continuing with habitat startup...\n');
          // Continue with habitat launch
        } else if (choice === 'f') {
          await runInitialization();
          console.log('Returning to main menu after initialization...');
          await returnToMainMenu();
          return;
        } else if (choice === 'm') {
          console.log('Returning to main menu...');
          // Return to main menu by restarting
          const originalArgv = process.argv;
          process.argv = [process.argv[0], process.argv[1]]; // Reset to just script name
          await main();
          return;
        }
        // If 'c' or anything else, continue
        console.log('Continuing with habitat startup...\n');
      } else {
        console.log(colors.green('✅ Repository access verified'));
      }
      
      await saveLastUsedConfig(options.configPath);
      await runHabitat(options.configPath, options.extraRepos, options.overrideCommand);
    } catch (err) {
      console.error(colors.red(`\n❌ Error starting habitat: ${err.message}`));
      if (err.validationErrors) {
        err.validationErrors.forEach(e => console.error(colors.red(`  - ${e}`)));
      }
      
      console.log('\nThis could be due to:');
      console.log('• Configuration file errors');
      console.log('• Docker connectivity issues'); 
      console.log('• Repository access problems');
      console.log('• Missing dependencies');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const choice = await new Promise(resolve => {
        rl.question('\nWould you like to:\n[t] Try a different habitat\n[f] Fix authentication/setup\n[m] Go back to main menu\nChoice: ', answer => {
          rl.close();
          resolve(answer.trim().toLowerCase());
        });
      });
      
      if (choice === 't') {
        console.log('Returning to habitat selection...');
        await returnToMainMenu();
        return;
      } else if (choice === 'f') {
        await runInitialization();
        await returnToMainMenu();
        return;
      } else {
        await returnToMainMenu();
        return;
      }
    }
  }
}

// Initialization detection and testing
async function checkInitializationStatus() {
  const status = {
    githubApp: false,
    docker: false,
    claude: false,
    completedSteps: 0,
    totalSteps: 3
  };

  try {
    // Check for GitHub App (.pem files)
    const pemFiles = await findPemFiles(path.join(__dirname, 'shared'));
    status.githubApp = pemFiles.length > 0;
    if (status.githubApp) status.completedSteps++;

    // Check Docker
    try {
      await execAsync('docker --version');
      await execAsync('docker ps');
      status.docker = true;
      status.completedSteps++;
    } catch {
      status.docker = false;
    }

    // Check Claude Code
    try {
      await execAsync('claude --version');
      status.claude = true;
      status.completedSteps++;
    } catch {
      status.claude = false;
    }
  } catch (err) {
    console.warn('Warning: Error checking initialization status:', err.message);
  }

  return status;
}

// GitHub App authentication check
async function hasGitHubAppAuth() {
  const pemFiles = await findPemFiles(path.join(__dirname, 'shared'));
  return pemFiles.length > 0;
}

async function checkHabitatRepositories(habitatsDir) {
  const habitatStatus = [];
  
  try {
    const dirs = await fs.readdir(habitatsDir);
    for (const dir of dirs) {
      const configPath = path.join(habitatsDir, dir, 'config.yaml');
      if (await fileExists(configPath)) {
        try {
          const config = await loadConfig(configPath);
          const repoResults = [];
          
          if (config.repositories && Array.isArray(config.repositories)) {
            for (const repo of config.repositories) {
              if (repo.url) {
                const accessMode = repo.access || 'write';
                const result = await testRepositoryAccess(repo.url, accessMode);
                repoResults.push({
                  url: repo.url,
                  accessMode: accessMode,
                  ...result
                });
              }
            }
          }
          
          const hasIssues = repoResults.some(r => !r.accessible);
          habitatStatus.push({
            name: dir,
            hasIssues,
            repositories: repoResults
          });
        } catch (err) {
          habitatStatus.push({
            name: dir,
            hasIssues: true,
            error: `Config error: ${err.message}`
          });
        }
      }
    }
  } catch (err) {
    console.warn('Warning: Could not check habitat repositories:', err.message);
  }
  
  return habitatStatus;
}

async function runInitialization() {
  console.log(colors.green('\n=== Claude Habitat Initialization ===\n'));
  
  const status = await checkInitializationStatus();
  
  console.log('Current Status:\n');
  console.log(`${status.docker ? '✅' : '❌'} Docker: ${status.docker ? 'Working' : 'Not accessible'}`);
  console.log(`${status.claude ? '✅' : '❌'} Claude Code: ${status.claude ? 'Installed' : 'Not found'}`);
  console.log(`${status.githubApp ? '✅' : '❌'} GitHub App: ${status.githubApp ? 'Configured' : 'Not configured'}`);
  console.log('');
  
  if (!status.docker || !status.claude) {
    console.log(colors.red('⚠️  Prerequisites missing. Please install:'));
    if (!status.docker) console.log('   - Docker (https://docs.docker.com/get-docker/)');
    if (!status.claude) console.log('   - Claude Code CLI (npm install -g @anthropic-ai/claude-code)');
    console.log('\nRun initialization again after installing prerequisites.');
    return;
  }
  
  if (status.githubApp) {
    console.log(colors.green('✅ All setup complete! You\'re ready to use Claude Habitat.'));
    return;
  }
  
  console.log('Let\'s complete your setup...\n');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const ask = (question) => new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
  
  try {
    // GitHub App setup
    if (!status.githubApp) {
      console.log(colors.yellow('=== Step 1: GitHub App Setup ==='));
      console.log('This enables Claude to create pull requests and use GitHub API.\n');
      
      console.log('We need to create a GitHub App for authentication.');
      console.log('This will open GitHub in your browser.\n');
      
      const proceed = await ask('Ready to set up GitHub App? [Y/n]: ');
      if (proceed.toLowerCase() !== 'n' && proceed.toLowerCase() !== 'no') {
        // Open GitHub App creation page
        const { spawn } = require('child_process');
        const url = 'https://github.com/settings/apps/new';
        
        try {
          if (process.platform === 'darwin') {
            spawn('open', [url]);
          } else if (process.platform === 'win32') {
            spawn('start', [url], { shell: true });
          } else {
            spawn('xdg-open', [url]);
          }
          console.log(`Opening: ${url}`);
        } catch {
          console.log(`Please visit: ${url}`);
        }
        
        console.log('\nInstructions:');
        console.log('1. Fill in app name (e.g., "Claude Code Bot")');
        console.log('2. Set homepage URL to any valid URL');
        console.log('3. Uncheck "Active" under Webhook');
        console.log('4. Set permissions:');
        console.log('   - Contents: Read & Write');
        console.log('   - Pull requests: Read & Write');
        console.log('   - Metadata: Read');
        console.log('5. Click "Create GitHub App"');
        console.log('6. Generate a private key and download it');
        console.log('7. Install the app on your repositories\n');
        
        await ask('Press Enter when you\'ve downloaded the .pem file...');
        
        console.log('\nNow move your .pem file to the shared directory:');
        console.log(`   mv ~/Downloads/your-app.*.pem ${path.join(__dirname, 'shared/')}`);
        console.log('');
        
        await ask('Press Enter when you\'ve moved the .pem file...');
        
        // Verify
        const pemFiles = await findPemFiles(path.join(__dirname, 'shared'));
        if (pemFiles.length > 0) {
          console.log(colors.green('✅ GitHub App private key found!'));
          // Set secure permissions
          await execAsync(`chmod 600 "${pemFiles[0]}"`);
          console.log('   Set secure permissions (600)');
        } else {
          console.log(colors.red('❌ No .pem file found in shared directory.'));
          console.log('   You can complete this step later by running initialization again.');
        }
      }
      console.log('');
    }
    
    console.log(colors.yellow('=== GitHub App Setup Complete ==='));
    console.log('GitHub App provides repository access for habitats.');
    console.log('Private repositories will be accessible using the configured app.');
    console.log('');
    
    // Final status check
    const finalStatus = await checkInitializationStatus();
    console.log(colors.yellow('=== Setup Complete ==='));
    console.log(`Setup progress: ${finalStatus.completedSteps}/${finalStatus.totalSteps} steps done\n`);
    
    if (finalStatus.completedSteps === finalStatus.totalSteps) {
      console.log(colors.green('🎉 All setup complete! You\'re ready to use Claude Habitat.'));
      console.log('\nReturning to main menu...\n');
      
      // Return to main menu by calling main() without configPath
      const originalArgv = process.argv;
      process.argv = [process.argv[0], process.argv[1]]; // Reset to just script name
      
      // Small delay to let user read the completion message
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Clear the configPath option and restart the main flow
      await main();
    } else {
      console.log(colors.yellow('⚠️  Some steps still need completion.'));
      console.log('Run "./claude-habitat" and select [i]nitialize to continue setup.');
    }
    
  } finally {
    rl.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error(colors.red(`Fatal error: ${err.message}`));
    process.exit(1);
  });
}

module.exports = { loadConfig, calculateCacheHash, parseRepoSpec, runHabitat };
