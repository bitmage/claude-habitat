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

const returnToMainMenu = async () => {
  console.log('\nReturning to main menu...\n');
  await main();
};


async function runHabitat(configPath, extraRepos = []) {
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
  await runContainer(preparedTag, config, envVars);
}

// Internal functions (no validation needed)
async function buildBaseImage(config) {
  const { image } = config;
  const tag = image.tag || `claude-habitat-${config.name}:latest`;

  // Check if image already exists
  if (await dockerImageExists(tag)) {
    console.log(`Using existing base image: ${tag}`);
    return tag;
  }

  console.log(`Building base Docker image: ${tag}`);

  // Resolve dockerfile path
  let dockerfilePath = image.dockerfile;
  if (!path.isAbsolute(dockerfilePath)) {
    // Check if it's just "Dockerfile" - use from environment directory
    if (dockerfilePath === 'Dockerfile' || dockerfilePath === './Dockerfile') {
      dockerfilePath = path.join(path.dirname(config._configPath), 'Dockerfile');
    } else {
      dockerfilePath = path.join(path.dirname(config._configPath), dockerfilePath);
    }
  }

  // Build command
  const buildArgs = ['build', '-f', dockerfilePath, '-t', tag];

  // Add build args if any
  if (image.build_args && Array.isArray(image.build_args)) {
    image.build_args.forEach(arg => {
      if (arg && arg !== '---') {
        const cleanArg = arg.replace(/^- /, '');
        if (cleanArg.includes('=')) {
          buildArgs.push('--build-arg', cleanArg);
        }
      }
    });
  }

  buildArgs.push(path.dirname(dockerfilePath));

  // Run build
  console.log(`Build command: docker ${buildArgs.join(' ')}`);
  await dockerRun(buildArgs);

  return tag;
}

async function cloneRepository(container, repoInfo, workDir = '/src') {
  const { url, path: repoPath, branch = 'main' } = repoInfo;
  
  // Ensure we're using HTTPS URLs for token authentication
  let cloneUrl = url;
  if (url.startsWith('git@github.com:')) {
    cloneUrl = url.replace('git@github.com:', 'https://github.com/');
    if (!cloneUrl.endsWith('.git')) {
      cloneUrl += '.git';
    }
    console.log(`Converting SSH to HTTPS: ${url} -> ${cloneUrl}`);
  } else if (!cloneUrl.endsWith('.git') && cloneUrl.includes('github.com')) {
    cloneUrl += '.git';
  }
  
  console.log(`Cloning ${cloneUrl} to ${repoPath} (branch: ${branch})`);

  const cloneScript = `
    # Ensure parent directory exists
    mkdir -p $(dirname ${repoPath})

    # Test GitHub App authentication
    echo "=== GitHub App Authentication Verification ==="
    if [ -d ${workDir}/claude-habitat/shared ] && find ${workDir}/claude-habitat/shared -name "*.pem" -type f | grep -q .; then
      echo "GitHub App: Available"
      echo "GitHub App authentication will be used for repository access"
      
      # Show environment variables for debugging
      echo "Environment check:"
      echo "GITHUB_APP_ID=\$GITHUB_APP_ID"
      echo "CLAUDE_HABITAT_WORKDIR=\$CLAUDE_HABITAT_WORKDIR"
      
      # Test credential helper
      echo "Testing credential helper..."
      echo | /usr/local/bin/git-credential-github-app get | head -2
      
      # Check git config
      echo "Git credential config:"
      git config --global --list | grep credential || echo "No credential config found"
    else
      echo "GitHub App: NOT CONFIGURED - will try anonymous access"
    fi

    # Clone the repository using HTTPS
    echo "Starting clone operation..."
    git clone --depth 1 --branch ${branch} ${cloneUrl} ${repoPath}

    # Add safe directory
    git config --global --add safe.directory ${repoPath}

    # Set ownership to discourse user (1000:1000)
    chown -R 1000:1000 ${repoPath}
  `;

  try {
    // Run as root to ensure directory creation permissions
    await dockerExec(container, cloneScript, 'root');
    console.log(`Successfully cloned ${cloneUrl}`);
  } catch (err) {
    throw new Error(`Failed to clone repository ${cloneUrl}: ${err.message}`);
  }
}

async function loadIgnorePatterns(sourceDir) {
  const ignoreFile = path.join(sourceDir, '.habignore');
  const patterns = [];
  
  try {
    const content = await fs.readFile(ignoreFile, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.push(trimmed);
      }
    }
  } catch (err) {
    // No .habignore file found, that's OK
  }
  
  return patterns;
}

function shouldIgnoreItem(item, patterns) {
  return patterns.some(pattern => {
    if (pattern.includes('*')) {
      // Convert glob pattern to regex
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      return regex.test(item);
    } else if (pattern.endsWith('/')) {
      // Directory pattern
      return item === pattern.slice(0, -1);
    } else {
      // Exact match
      return item === pattern;
    }
  });
}

async function findFilesToCopy(sourceDir, destBase = '/claude-habitat', isShared = false) {
  const filesToCopy = [];
  
  // Load ignore patterns from .habignore file
  const ignorePatterns = await loadIgnorePatterns(sourceDir);
  
  try {
    const items = await fs.readdir(sourceDir);
    for (const item of items) {
      // Check if item should be ignored based on .habignore
      if (shouldIgnoreItem(item, ignorePatterns)) {
        continue;
      }
      
      const itemPath = path.join(sourceDir, item);
      const stat = await fs.stat(itemPath);
      
      if (stat.isFile()) {
        filesToCopy.push({
          src: itemPath,
          dest: `${destBase}/${item}`
        });
      } else if (stat.isDirectory() && isShared) {
        // For shared directory, copy subdirectories recursively
        await copyFilesDirectory(itemPath, `${destBase}/${item}`, filesToCopy);
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not read directory: ${err.message}`);
  }
  
  return filesToCopy;
}

async function copyFilesDirectory(srcDir, destBase, filesToCopy) {
  const items = await fs.readdir(srcDir);
  for (const item of items) {
    const srcPath = path.join(srcDir, item);
    const stat = await fs.stat(srcPath);
    
    if (stat.isFile()) {
      filesToCopy.push({
        src: srcPath,
        dest: path.join(destBase, item)
      });
    } else if (stat.isDirectory()) {
      // Recursively handle subdirectories
      await copyFilesDirectory(srcPath, path.join(destBase, item), filesToCopy);
    }
  }
}

async function processFileOperations(container, config, configDir, containerUser = null) {
  if (!config.files || !Array.isArray(config.files)) {
    return;
  }

  console.log('Processing file operations...');
  for (const fileOp of config.files) {
    const { src, dest, mode = '644', description } = fileOp;
    
    if (!src || !dest) {
      console.warn(`Warning: Invalid file operation - missing src or dest: ${JSON.stringify(fileOp)}`);
      continue;
    }

    const srcPath = path.join(configDir, src);
    
    // Check if source file exists
    if (!await fileExists(srcPath)) {
      console.warn(`Warning: Source file not found: ${srcPath}`);
      continue;
    }

    if (description) {
      console.log(`  ${description}`);
    }
    
    console.log(`  Copying ${src} to ${dest} (mode: ${mode})`);
    
    try {
      // Copy file to container
      await copyFileToContainer(container, srcPath, dest, containerUser);
      
      // Set permissions
      await dockerExec(container, `chmod ${mode} ${dest} 2>/dev/null || true`);
      
    } catch (err) {
      console.warn(`Warning: Failed to process file operation for ${src}: ${err.message}`);
    }
  }
}

async function copyFileToContainer(container, srcPath, destPath, containerUser = null) {
  console.log(`  Copying ${path.basename(srcPath)} to ${destPath}`);
  
  try {
    // Create destination directory
    const destDir = path.dirname(destPath);
    await dockerExec(container, `mkdir -p ${destDir}`);
    
    // Resolve symlinks before copying to avoid Docker cp issues
    const realSrcPath = await fs.realpath(srcPath);
    
    // Copy file using docker cp
    await execAsync(`docker cp "${realSrcPath}" ${container}:${destPath}`);
    
    // Get original file permissions
    const stat = await fs.stat(srcPath);
    const isExecutable = (stat.mode & parseInt('111', 8)) !== 0;
    
    // Set appropriate permissions based on file type
    if (isExecutable) {
      await dockerExec(container, `chmod 755 ${destPath} 2>/dev/null || true`);
    } else {
      // Keep original permissions for sensitive files like .pem
      const permissions = destPath.includes('.pem') || destPath.includes('_key') ? '600' : '644';
      await dockerExec(container, `chmod ${permissions} ${destPath} 2>/dev/null || true`);
    }
    
    // Set ownership to container user if specified
    if (containerUser && containerUser !== 'root') {
      await dockerExec(container, `chown ${containerUser}:${containerUser} ${destPath} 2>/dev/null || true`);
    }
  } catch (err) {
    console.warn(`Warning: Failed to copy ${srcPath}: ${err.message}`);
  }
}

async function runSetupCommands(container, config) {
  // Run root commands
  if (config.setup?.root) {
    console.log('Running root setup commands...');

    for (const command of parseCommands(config.setup.root)) {
      console.log('Executing root command:');
      console.log(command);
      try {
        await dockerExec(container, command);
      } catch (err) {
        console.error(colors.red(`Setup command failed: ${err.message}`));
        throw err;
      }
    }
  }

  // Run user commands
  if (config.setup?.user?.commands && config.setup.user.run_as) {
    const runAs = config.setup.user.run_as;
    console.log(`Running user setup commands as ${runAs}...`);

    for (const command of parseCommands(config.setup.user.commands)) {
      console.log(`Executing user command as ${runAs}:`);
      console.log(command);
      try {
        await dockerExec(container, command, runAs);
      } catch (err) {
        console.error(colors.red(`Setup command failed: ${err.message}`));
        throw err;
      }
    }
  }
}

// Filesystem verification for containers
async function verifyFilesystem(config, containerName) {
  if (!config['verify-fs'] || !config['verify-fs'].required_files) {
    return { passed: true, message: 'No filesystem verification configured' };
  }

  const requiredFiles = config['verify-fs'].required_files;
  const missingFiles = [];
  
  console.log('Verifying filesystem structure...');
  
  for (const file of requiredFiles) {
    try {
      await dockerExec(containerName, `test -e "${file}"`, 'node');
    } catch (err) {
      missingFiles.push(file);
    }
  }
  
  if (missingFiles.length > 0) {
    return {
      passed: false,
      message: `Missing files: ${missingFiles.join(', ')}`,
      missingFiles
    };
  }
  
  return { 
    passed: true, 
    message: `All ${requiredFiles.length} required files verified` 
  };
}

// Run filesystem verification as a test
async function runFilesystemVerification(config) {
  console.log(colors.green('=== Filesystem Verification ===\n'));
  
  if (!config['verify-fs'] || !config['verify-fs'].required_files) {
    console.log(colors.yellow('No filesystem verification configured for this habitat'));
    return;
  }
  
  // Check if a container is already running for this habitat
  const containerName = `${config.name}_fs_verify_${Date.now()}`;
  
  try {
    // Build/get the prepared image
    const tag = `claude-habitat-${config.name}:latest`;
    const cacheHash = calculateCacheHash(config, []);
    const preparedTag = `claude-habitat-${config.name}:${cacheHash}`;
    
    // Try to use existing prepared image, or build if needed
    const { stdout: images } = await execAsync(`docker images -q ${preparedTag}`);
    if (!images.trim()) {
      console.log('No prepared image found, building...');
      await buildPreparedImage(config, preparedTag, []);
    }
    
    // Start a temporary container for verification
    const runArgs = [
      'run', '-d',
      '--name', containerName,
      preparedTag,
      config.container?.init_command || '/sbin/init'
    ];
    
    await dockerRun(runArgs);
    
    // Wait a moment for container to start
    await sleep(2000);
    
    // Run verification
    const verifyResult = await verifyFilesystem(config, containerName);
    
    if (verifyResult.passed) {
      console.log(colors.green(`✅ ${verifyResult.message}`));
    } else {
      console.log(colors.red(`❌ ${verifyResult.message}`));
      if (verifyResult.missingFiles) {
        console.log(colors.red('Missing files:'));
        verifyResult.missingFiles.forEach(file => {
          console.log(colors.red(`  - ${file}`));
        });
      }
    }
    
  } catch (err) {
    console.error(colors.red(`Error during filesystem verification: ${err.message}`));
    throw err;
  } finally {
    // Cleanup
    try {
      await execAsync(`docker stop ${containerName}`);
      await execAsync(`docker rm ${containerName}`);
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function buildPreparedImage(config, tag, extraRepos) {
  console.log(`Building prepared image: ${tag}`);
  console.log('This may take several minutes for the first build...');

  const baseTag = config.image.tag || `claude-habitat-${config.name}:latest`;
  const tempContainer = `${config.name}_prepare_${Date.now()}_${process.pid}`;

  // Parse environment variables
  const envArgs = [];
  if (config.environment && Array.isArray(config.environment)) {
    config.environment.forEach(env => {
      if (env && typeof env === 'string' && !env.startsWith('GITHUB_APP_PRIVATE_KEY_FILE=')) {
        envArgs.push('-e', env.replace(/^- /, ''));
      }
    });
  }

  // Create temporary container
  console.log('Creating temporary container for preparation...');
  const runArgs = [
    'run', '-d',
    '--name', tempContainer,
    ...envArgs
  ];

  // Add volume mounts if specified
  if (config.volumes && Array.isArray(config.volumes)) {
    config.volumes.forEach(volume => {
      runArgs.push('-v', volume);
    });
  }

  runArgs.push(baseTag, config.container?.init_command || '/sbin/boot');

  const containerId = await dockerRun(runArgs);

  // Cleanup function
  const cleanup = async () => {
    console.log('Cleaning up temporary container...');
    try {
      await execAsync(`docker stop ${tempContainer}`);
      await execAsync(`docker rm ${tempContainer}`);
    } catch {
      // Ignore errors
    }
  };

  try {
    // Wait for services to initialize
    console.log('Waiting for services to initialize...');
    await sleep(10000);

    // Check if container is still running
    if (!await dockerIsRunning(tempContainer)) {
      const { stdout: logs } = await execAsync(`docker logs ${tempContainer} --tail 20`).catch(() => ({ stdout: 'No logs available' }));
      throw new Error(`Container exited unexpectedly:\n${logs}`);
    }

    // Get working directory and user for file placement first
    const workDir = config.container?.work_dir || '/src';
    const containerUser = config.container?.user || 'root';
    
    // Copy shared files FIRST so they're available for authentication
    const sharedDir = path.join(__dirname, 'shared');
    const sharedConfigPath = path.join(sharedDir, 'config.yaml');
    
    if (await fileExists(sharedConfigPath)) {
      console.log('Processing shared configuration...');
      const sharedConfig = await loadConfig(sharedConfigPath);
      
      // Process shared file operations
      await processFileOperations(tempContainer, sharedConfig, sharedDir, containerUser);
      
      // Run shared setup commands (replace {container_user} placeholder)
      if (sharedConfig.setup) {
        // Replace placeholder with actual container user
        const processedConfig = JSON.parse(JSON.stringify(sharedConfig).replace(/\{container_user\}/g, containerUser));
        await runSetupCommands(tempContainer, processedConfig);
      }
    }
    
    // Copy remaining shared files (user preferences)
    const sharedFiles = await findFilesToCopy(sharedDir, `${workDir}/claude-habitat/shared`, true);
    if (sharedFiles.length > 0) {
      console.log('Copying shared files to container...');
      for (const file of sharedFiles) {
        await copyFileToContainer(tempContainer, file.src, file.dest, containerUser);
      }
    }

    // Setup Git authentication using GitHub App AFTER shared files are available
    console.log('Setting up Git authentication...');
    
    if (await hasGitHubAppAuth()) {
      console.log('Configuring GitHub App authentication...');
      
      // Extract GitHub App ID from config
      const appIdEnv = config.environment?.find(env => env.includes('GITHUB_APP_ID='));
      const appId = appIdEnv ? appIdEnv.split('=')[1] : '1357221'; // fallback to known value
      
      const gitAuthSetup = `
        echo "Setting up GitHub App authentication..."
        
        # Install required tools for GitHub App authentication
        apt-get update -qq && apt-get install -y jq curl openssl > /dev/null 2>&1
        
        # Create dynamic git credential helper script for GitHub App
        cat > /usr/local/bin/git-credential-github-app << 'EOF'
#!/bin/bash
# Git credential helper for GitHub App authentication
# Generates fresh tokens on each use to avoid expiration issues

if [ "$1" = "get" ]; then
    # Read the input 
    while read -r line; do
        if [ -z "$line" ]; then
            break
        fi
    done
    
    # Find the most recent PEM file by timestamp in filename
    # Ensure we have environment variables (source /etc/environment if needed)
    if [ -z "\$GITHUB_APP_ID" ] || [ -z "\$CLAUDE_HABITAT_WORKDIR" ]; then
        set -a; source /etc/environment 2>/dev/null || true; set +a
    fi
    
    # Use CLAUDE_HABITAT_WORKDIR environment variable to find PEM files
    if [ -n "\$CLAUDE_HABITAT_WORKDIR" ] && [ -d "\$CLAUDE_HABITAT_WORKDIR/claude-habitat/shared" ]; then
        pem_file=\$(find "\$CLAUDE_HABITAT_WORKDIR/claude-habitat/shared" -name "*.pem" -type f | sort -r | head -1)
    else
        # Fallback: try common locations
        for shared_path in "/src/claude-habitat/shared" "/claude-habitat/shared" "\$(pwd)/claude-habitat/shared"; do
            if [ -d "\$shared_path" ]; then
                pem_file=\$(find "\$shared_path" -name "*.pem" -type f | sort -r | head -1)
                if [ -n "\$pem_file" ]; then
                    break
                fi
            fi
        done
    fi
    
    if [ -f "\$pem_file" ] && [ -n "\$GITHUB_APP_ID" ]; then
        # Generate JWT for GitHub App
        header='{"alg":"RS256","typ":"JWT"}'
        payload="{\\\"iat\\\":\$(date +%s),\\\"exp\\\":\$((\$(date +%s) + 600)),\\\"iss\\\":\\\"\$GITHUB_APP_ID\\\"}"
        
        # Encode header and payload
        header_b64=\$(echo -n "\$header" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
        payload_b64=\$(echo -n "\$payload" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
        
        # Create signature
        signature=\$(echo -n "\$header_b64.\$payload_b64" | openssl dgst -sha256 -sign "\$pem_file" | base64 -w 0 | tr '+/' '-_' | tr -d '=' 2>/dev/null)
        
        if [ -n "\$signature" ]; then
            # Create JWT
            jwt="\$header_b64.\$payload_b64.\$signature"
            
            # Get installation token with error handling
            installations_response=\$(curl -s -H "Authorization: Bearer \$jwt" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations" 2>/dev/null)
            installation_id=\$(echo "\$installations_response" | jq -r '.[0].id' 2>/dev/null)
            
            if [ "\$installation_id" != "null" ] && [ -n "\$installation_id" ] && [ "\$installation_id" != "" ]; then
                token_response=\$(curl -s -X POST -H "Authorization: Bearer \$jwt" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations/\$installation_id/access_tokens" 2>/dev/null)
                token=\$(echo "\$token_response" | jq -r '.token' 2>/dev/null)
                
                if [ "\$token" != "null" ] && [ -n "\$token" ] && [ "\$token" != "" ]; then
                    echo "username=x-access-token"
                    echo "password=\$token"
                    exit 0
                fi
            fi
        fi
    fi
    
    # Fallback: no token available
    echo "username="
    echo "password="
fi
EOF
        chmod +x /usr/local/bin/git-credential-github-app
        
        # Set up environment variables for the credential helper
        export GITHUB_APP_ID="${appId}"
        export CLAUDE_HABITAT_WORKDIR="${workDir}"
        echo "export GITHUB_APP_ID=${appId}" >> /etc/environment
        echo "export CLAUDE_HABITAT_WORKDIR=${workDir}" >> /etc/environment
        
        # Configure git to use our credential helper for GitHub
        git config --global credential."https://github.com".helper /usr/local/bin/git-credential-github-app
        
        echo "GitHub App dynamic credential helper configured"
      `;
      
      try {
        await dockerExec(tempContainer, gitAuthSetup);
        console.log('Git authentication setup completed');
        
        // Test the setup
        console.log('Testing credential helper installation...');
        const testResult = await dockerExec(tempContainer, `
          echo "Checking git config..."
          git config --global --list | grep credential || echo "No credential config found"
          echo "Checking credential helper..."
          ls -la /usr/local/bin/git-credential-github-app
          echo "Testing token generation..."
          echo "Environment variables:"
          echo "GITHUB_APP_ID=\$GITHUB_APP_ID"
          echo "CLAUDE_HABITAT_WORKDIR=\$CLAUDE_HABITAT_WORKDIR"
          set -a; source /etc/environment 2>/dev/null || true; set +a
          echo "After sourcing /etc/environment:"
          echo "GITHUB_APP_ID=\$GITHUB_APP_ID"
          echo "CLAUDE_HABITAT_WORKDIR=\$CLAUDE_HABITAT_WORKDIR"
          echo "Contents of /etc/environment:"
          cat /etc/environment
          echo "PEM files in \$CLAUDE_HABITAT_WORKDIR/claude-habitat/shared:"
          find "\$CLAUDE_HABITAT_WORKDIR/claude-habitat/shared" -name "*.pem" -type f 2>/dev/null || echo "No PEM files found"
          echo "Testing credential helper with verbose output:"
          GITHUB_APP_ID=\$GITHUB_APP_ID CLAUDE_HABITAT_WORKDIR=\$CLAUDE_HABITAT_WORKDIR bash -x /usr/local/bin/git-credential-github-app get < /dev/null 2>&1 | head -20
          echo "Simplified test:"
          echo | /usr/local/bin/git-credential-github-app get | head -2 || echo "Credential helper test failed"
        `);
        console.log('Credential helper test result:', testResult);
      } catch (authError) {
        console.error('Git authentication setup failed:', authError.message);
        // Don't throw - continue with the build
      }
    } else {
      console.log('No GitHub App configured - public repositories only');
    }

    // Clone repositories from config
    if (config.repositories && Array.isArray(config.repositories)) {
      console.log('Cloning repositories into prepared image...');
      for (let i = 0; i < config.repositories.length; i++) {
        const repo = config.repositories[i];
        if (repo && repo.url) {
          console.log(`Processing repository ${i}: ${repo.url}`);
          await cloneRepository(tempContainer, repo, workDir);
        }
      }
    }

    // Clone extra repositories
    if (extraRepos.length > 0) {
      console.log('Cloning additional repositories...');
      for (const repoSpec of extraRepos) {
        const repo = parseRepoSpec(repoSpec);
        await cloneRepository(tempContainer, repo, workDir);
      }
    }

    // Working directory and user already defined above
    
    // Process system configuration and files
    const systemDir = path.join(__dirname, 'system');
    const systemConfigPath = path.join(systemDir, 'config.yaml');
    
    if (await fileExists(systemConfigPath)) {
      console.log('Processing system configuration...');
      const systemConfig = await loadConfig(systemConfigPath);
      
      // Process system file operations
      await processFileOperations(tempContainer, systemConfig, systemDir, containerUser);
      
      // Run system setup commands
      if (systemConfig.setup) {
        await runSetupCommands(tempContainer, systemConfig);
      }
    }
    
    // Copy remaining system files (infrastructure)
    const systemFiles = await findFilesToCopy(systemDir, `${workDir}/claude-habitat/system`, true);
    if (systemFiles.length > 0) {
      console.log('Copying system files to container...');
      for (const file of systemFiles) {
        await copyFileToContainer(tempContainer, file.src, file.dest, containerUser);
      }
    }

    // Shared files were already processed before authentication setup

    // Copy additional files from habitat directory to local
    const habitatDir = path.dirname(config._configPath);
    const filesToCopy = await findFilesToCopy(habitatDir, `${workDir}/claude-habitat/local`);
    if (filesToCopy.length > 0) {
      console.log('Copying habitat files to container...');
      for (const file of filesToCopy) {
        await copyFileToContainer(tempContainer, file.src, file.dest, containerUser);
      }
    }

    // Install Claude Habitat tools
    const systemToolsScript = `${workDir}/claude-habitat/system/tools/install-tools.sh`;
    const sharedToolsScript = `${workDir}/claude-habitat/shared/tools/install-tools.sh`;
    
    // Install system tools (core infrastructure)
    if (systemFiles.some(file => file.dest.includes('tools/install-tools.sh'))) {
      console.log('Installing system tools...');
      try {
        await dockerExec(tempContainer, `chmod +x ${systemToolsScript}`);
        await dockerExec(tempContainer, `cd ${workDir}/claude-habitat/system/tools && ./install-tools.sh install`);
        console.log('✅ System tools installed successfully');
      } catch (err) {
        console.warn(`Warning: Failed to install system tools: ${err.message}`);
        console.warn('Container will still work, but some development tools may be missing');
      }
    }
    
    // Install shared tools (user's personal tools)
    if (sharedFiles.some(file => file.dest.includes('tools/install-tools.sh'))) {
      console.log('Installing user tools...');
      try {
        await dockerExec(tempContainer, `chmod +x ${sharedToolsScript}`);
        await dockerExec(tempContainer, `cd ${workDir}/claude-habitat/shared/tools && ./install-tools.sh install`);
        console.log('✅ User tools installed successfully');
      } catch (err) {
        console.warn(`Warning: Failed to install user tools: ${err.message}`);
        console.warn('User tools not available, but system tools should work');
      }
    }

    // Create concatenated CLAUDE.md instructions (unless disabled)
    if (!config.claude?.disable_habitat_instructions) {
      console.log('Setting up Claude instructions...');
      try {
        const systemClaudePath = path.join(__dirname, 'system/CLAUDE.md');
        const sharedClaudePath = path.join(__dirname, 'shared/CLAUDE.md');
        const habitatDir = path.dirname(config._configPath);
        const habitatClaudePath = path.join(habitatDir, 'CLAUDE.md');
        
        let claudeContent = '';
        
        // Add system base instructions (infrastructure)
        if (await fileExists(systemClaudePath)) {
          const systemContent = await fs.readFile(systemClaudePath, 'utf8');
          claudeContent += systemContent;
        }
        
        // Add shared user preferences
        if (await fileExists(sharedClaudePath)) {
          const sharedContent = await fs.readFile(sharedClaudePath, 'utf8');
          if (claudeContent.length > 0) {
            claudeContent += '\n\n---\n\n# User Preferences\n\n';
          }
          claudeContent += sharedContent;
        }
        
        // Add habitat-specific instructions
        if (await fileExists(habitatClaudePath)) {
          const habitatContent = await fs.readFile(habitatClaudePath, 'utf8');
          if (claudeContent.length > 0) {
            claudeContent += '\n\n---\n\n# Project-Specific Instructions\n\n';
          }
          claudeContent += habitatContent;
        }
        
        // Only create the file if we have content
        if (claudeContent.length > 0) {
          // Write to temporary file first
          const tempClaudePath = '/tmp/CLAUDE.md';
          await dockerExec(tempContainer, `cat > ${tempClaudePath} << 'CLAUDE_EOF'\n${claudeContent}\nCLAUDE_EOF`);
          
          // Move to working directory (not in claude-habitat subdirectory)
          await dockerExec(tempContainer, `mv ${tempClaudePath} ${workDir}/CLAUDE.md`);
          
          // Set ownership to container user
          if (containerUser && containerUser !== 'root') {
            await dockerExec(tempContainer, `chown ${containerUser}:${containerUser} ${workDir}/CLAUDE.md`);
          }
          
          console.log('✅ Claude instructions configured');
        } else {
          console.log('ℹ️  No Claude instructions found');
        }
      } catch (err) {
        console.warn(`Warning: Failed to setup Claude instructions: ${err.message}`);
      }
    } else {
      console.log('⏭️  Skipping Claude instruction setup (disabled in config)');
    }

    // Git configuration is now handled by shared/config.yaml file operations

    // Ensure the entire claude-habitat directory is accessible to the container user
    if (containerUser && containerUser !== 'root' && (sharedFiles.length > 0 || filesToCopy.length > 0)) {
      console.log(`Setting ownership of claude-habitat directory to ${containerUser}...`);
      await dockerExec(tempContainer, `chown -R ${containerUser}:${containerUser} ${workDir}/claude-habitat 2>/dev/null || true`);
    }

    // Run setup commands
    console.log('Running setup commands...');
    await runSetupCommands(tempContainer, config);

    // Check if container is still running
    if (!await dockerIsRunning(tempContainer)) {
      const { stdout: logs } = await execAsync(`docker logs ${tempContainer} --tail 30`).catch(() => ({ stdout: 'No logs available' }));
      throw new Error(`Container exited during setup:\n${logs}`);
    }

    // Commit the prepared container
    console.log(`Committing prepared container to image: ${tag}`);
    await dockerRun(['commit', tempContainer, tag]);

    console.log(colors.green(`Successfully built prepared image: ${tag}`));
  } catch (err) {
    await cleanup();
    throw err;
  }

  await cleanup();
  return tag;
}

async function runContainer(tag, config, envVars) {
  const containerName = `${config.name}_${Date.now()}_${process.pid}`;
  const workDir = config.container?.work_dir || '/src';
  const containerUser = config.container?.user || 'root';
  const claudeCommand = config.claude?.command || 'claude';

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

// Test running functionality
async function runTestMode(testType, testTarget) {
  console.log(colors.green('\n=== Claude Habitat Test Runner ===\n'));

  if (testType === 'all' && !testTarget) {
    // Run all tests for all habitats
    await runAllTests();
  } else if (testType === 'menu' || (!testType && !testTarget)) {
    // Show test menu
    await showTestMenu();
  } else if (testTarget) {
    // Run tests for specific habitat
    const habitatConfigPath = path.join(__dirname, 'habitats', testTarget, 'config.yaml');
    if (!await fileExists(habitatConfigPath)) {
      console.error(colors.red(`Habitat ${testTarget} not found`));
      process.exit(1);
    }
    
    const habitatConfig = await loadConfig(habitatConfigPath);
    
    if (testType === 'system') {
      console.log(`Running system tests in ${testTarget} habitat...`);
      await runSystemTests(habitatConfig);
    } else if (testType === 'shared') {
      console.log(`Running shared tests in ${testTarget} habitat...`);
      await runSharedTests(habitatConfig);
    } else if (testType === 'verify-fs') {
      console.log(`Running filesystem verification for ${testTarget} habitat...`);
      await runFilesystemVerification(habitatConfig);
    } else if (testType === 'habitat') {
      console.log(`Running ${testTarget}-specific tests...`);
      if (habitatConfig.tests && habitatConfig.tests.length > 0) {
        await runTestsInHabitatContainer(habitatConfig.tests, 'habitat', habitatConfig);
      } else {
        console.log(`No ${testTarget}-specific tests configured`);
      }
    } else {
      // Default: run all tests for the habitat
      await runHabitatTests(testTarget);
    }
  } else {
    console.error(colors.red('Invalid test configuration'));
    process.exit(1);
  }
}

async function showTestMenu() {
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
    console.log('No habitats directory found');
    return;
  }

  if (habitats.length === 0) {
    console.log('No habitats found to test');
    return;
  }

  console.log('Select Habitat to Test:\n');
  
  habitats.forEach((habitat, index) => {
    const key = (index + 1).toString();
    console.log(`  ${colors.yellow(`[${key}]`)} ${habitat.name}`);
  });
  console.log('');
  console.log(`  ${colors.yellow('[b]')}ack - Return to main menu\n`);
  
  // Use single keypress for habitat selection
  const choice = await new Promise(resolve => {
    if (!process.stdin.isTTY) {
      // Fallback for non-TTY mode
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl.question('Select habitat: ', answer => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
      return;
    }
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    const onKeypress = (key) => {
      // Handle Ctrl+C
      if (key === '\u0003') {
        console.log('\n');
        process.exit(0);
      }
      
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onKeypress);
      resolve(key.toLowerCase());
    };
    
    process.stdin.on('data', onKeypress);
  });
  
  if (choice === 'b') {
    // Return to main menu
    await returnToMainMenu();
    return;
  }
  
  // Check if it's a habitat number
  const habitatIndex = parseInt(choice) - 1;
  if (!isNaN(habitatIndex) && habitatIndex >= 0 && habitatIndex < habitats.length) {
    await showHabitatTestMenu(habitats[habitatIndex].name);
  } else {
    console.error(colors.red('\n❌ Invalid choice'));
    await sleep(1500);
    await showTestMenu();
  }
}

async function showHabitatTestMenu(habitatName) {
  console.log(`\n${colors.green(`=== Testing ${habitatName} ===`)}\n`);
  console.log('Which tests to run?\n');
  console.log(`  ${colors.yellow('[a]')}ll     - Run all tests (default)`);
  console.log(`  ${colors.yellow('[s]')}ystem  - System infrastructure only`);
  console.log(`  ${colors.yellow('[h]')}ared   - Shared configuration only`);
  console.log(`  ${colors.yellow('[hab]')}itat - ${habitatName}-specific tests only`);
  console.log(`  ${colors.yellow('[b]')}ack    - Back to habitat selection\n`);
  
  // Use single keypress with support for multi-char options
  const choice = await new Promise(resolve => {
    if (!process.stdin.isTTY) {
      // Fallback for non-TTY mode
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl.question('Select test type (a/s/h/hab/b): ', answer => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
      return;
    }
    
    let buffer = '';
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    const onKeypress = (key) => {
      // Handle Ctrl+C
      if (key === '\u0003') {
        console.log('\n');
        process.exit(0);
      }
      
      // For 'h', wait to see if it's 'hab' or just 'h'
      if (key === 'h' && buffer === '') {
        buffer = 'h';
        // Set a timeout to process just 'h' if no more input
        setTimeout(() => {
          if (buffer === 'h') {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('data', onKeypress);
            resolve('h');
          }
        }, 200);
        return;
      }
      
      // Complete 'hab' if we have 'h' buffered
      if (buffer === 'h' && key === 'a') {
        buffer = 'ha';
        return;
      }
      
      if (buffer === 'ha' && key === 'b') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onKeypress);
        resolve('hab');
        return;
      }
      
      // For other keys, resolve immediately
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onKeypress);
      resolve(key.toLowerCase());
    };
    
    process.stdin.on('data', onKeypress);
  });
  
  console.log(''); // Add newline after selection
  
  if (choice === 'b') {
    await showTestMenu();
    return;
  }
  
  // Capture test results for interactive display
  let testResults = [];
  const startTime = new Date();
  
  if (choice === 'a' || choice === '') {
    // Default to all tests
    testResults = await runHabitatTests(habitatName, true);
  } else if (choice === 's') {
    testResults = await runSystemTests(null, true);
  } else if (choice === 'h') {
    testResults = await runSharedTests(null, true);
  } else if (choice === 'hab') {
    // Run only habitat-specific tests
    const habitatConfigPath = path.join(__dirname, 'habitats', habitatName, 'config.yaml');
    const habitatConfig = await loadConfig(habitatConfigPath);
    
    if (habitatConfig.tests && habitatConfig.tests.length > 0) {
      console.log(`Running ${habitatName}-specific tests...\n`);
      testResults = await runTestsInHabitatContainer(habitatConfig.tests, 'habitat', habitatConfig, true);
    } else {
      console.log(`No ${habitatName}-specific tests configured`);
      testResults = [{ type: 'info', message: `No ${habitatName}-specific tests configured` }];
    }
  } else {
    console.error(colors.red('\n❌ Invalid choice'));
    await sleep(1500);
    await showHabitatTestMenu(habitatName);
    return;
  }
  
  const endTime = new Date();
  const duration = ((endTime - startTime) / 1000).toFixed(1);
  
  // Show results screen for interactive mode
  await showTestResults(testResults, habitatName, choice, duration);
}

async function runAllTests() {
  console.log(colors.yellow('=== Running All Tests ===\n'));
  
  console.log('1. System Tests:');
  await runSystemTests();
  
  console.log('\n2. Shared Tests:');
  await runSharedTests();
  
  // Run tests for all habitats
  const habitatsDir = path.join(__dirname, 'habitats');
  try {
    const dirs = await fs.readdir(habitatsDir);
    for (const dir of dirs) {
      const configPath = path.join(habitatsDir, dir, 'config.yaml');
      if (await fileExists(configPath)) {
        console.log(`\n3. ${dir} Habitat Tests:`);
        await runHabitatTests(dir);
      }
    }
  } catch (err) {
    console.log('No habitats found to test');
  }
}

async function runSystemTests(habitatConfig = null, captureResults = false) {
  console.log(colors.yellow('Running system infrastructure tests...\n'));
  
  // If no habitat provided, use the base habitat
  if (!habitatConfig) {
    const baseConfigPath = path.join(__dirname, 'habitats/base/config.yaml');
    habitatConfig = await loadConfig(baseConfigPath);
  }
  
  const systemConfig = await loadConfig(path.join(__dirname, 'system/config.yaml'));
  if (systemConfig.tests && systemConfig.tests.length > 0) {
    return await runTestsInHabitatContainer(systemConfig.tests, 'system', habitatConfig, captureResults);
  } else {
    console.log('No system tests configured');
    return captureResults ? [{ type: 'info', message: 'No system tests configured' }] : undefined;
  }
}

async function runSharedTests(habitatConfig = null, captureResults = false) {
  console.log(colors.yellow('Running shared configuration tests...\n'));
  
  // If no habitat provided, use the base habitat
  if (!habitatConfig) {
    const baseConfigPath = path.join(__dirname, 'habitats/base/config.yaml');
    habitatConfig = await loadConfig(baseConfigPath);
  }
  
  const sharedConfig = await loadConfig(path.join(__dirname, 'shared/config.yaml'));
  if (sharedConfig.tests && sharedConfig.tests.length > 0) {
    return await runTestsInHabitatContainer(sharedConfig.tests, 'shared', habitatConfig, captureResults);
  } else {
    console.log('No shared tests configured');
    return captureResults ? [{ type: 'info', message: 'No shared tests configured' }] : undefined;
  }
}

async function runHabitatTests(habitatName, captureResults = false) {
  console.log(colors.yellow(`Running tests for ${habitatName} habitat...\n`));
  
  const habitatConfigPath = path.join(__dirname, 'habitats', habitatName, 'config.yaml');
  if (!await fileExists(habitatConfigPath)) {
    console.error(colors.red(`Habitat ${habitatName} not found`));
    process.exit(1);
  }
  
  const habitatConfig = await loadConfig(habitatConfigPath);
  let allResults = [];
  
  // Run system tests first
  console.log('System tests:');
  const systemResults = await runSystemTests(habitatConfig, captureResults);
  if (captureResults && systemResults) allResults.push(...systemResults);
  
  // Run shared tests
  console.log('\nShared tests:');
  const sharedResults = await runSharedTests(habitatConfig, captureResults);
  if (captureResults && sharedResults) allResults.push(...sharedResults);
  
  // Run habitat-specific tests
  if (habitatConfig.tests && habitatConfig.tests.length > 0) {
    console.log(`\n${habitatName} habitat tests:`);
    const habitatResults = await runTestsInHabitatContainer(habitatConfig.tests, 'habitat', habitatConfig, captureResults);
    if (captureResults && habitatResults) allResults.push(...habitatResults);
  } else {
    console.log(`No ${habitatName}-specific tests configured`);
    if (captureResults) allResults.push({ type: 'info', message: `No ${habitatName}-specific tests configured` });
  }
  
  return captureResults ? allResults : undefined;
}

async function runTestsInHabitatContainer(tests, testType, habitatConfig = null, captureResults = false) {
  // If no habitat config provided, we need one to run tests properly
  if (!habitatConfig) {
    console.error(colors.red('Error: No habitat specified for testing'));
    console.log('Please select a habitat from the test menu or use: ./claude-habitat test <habitat-name>');
    return captureResults ? [] : undefined;
  }

  const containerName = `claude-habitat-test-${habitatConfig.name}-${Date.now()}_${process.pid}`;
  
  try {
    // Always use the habitat's prepared image
    const hash = calculateCacheHash(habitatConfig, []);
    const preparedTag = `claude-habitat-${habitatConfig.name}:${hash}`;
    let imageTag = preparedTag;
    
    if (!await dockerImageExists(preparedTag)) {
      console.log(colors.yellow('Prepared image not found. Building habitat for testing...'));
      await buildBaseImage(habitatConfig);
      await buildPreparedImage(habitatConfig, preparedTag, []);
      imageTag = preparedTag;
    }
    
    console.log(`Using habitat image: ${imageTag}`);
    
    // Start test container with same configuration as normal habitat
    const workDir = habitatConfig.container?.work_dir || '/src';
    const containerUser = habitatConfig.container?.user || 'root';
    
    // Parse environment variables from config
    const envArgs = [];
    if (habitatConfig.environment && Array.isArray(habitatConfig.environment)) {
      habitatConfig.environment.forEach(env => {
        if (env && typeof env === 'string' && !env.startsWith('GITHUB_APP_PRIVATE_KEY_FILE=')) {
          envArgs.push('-e', env.replace(/^- /, ''));
        }
      });
    }
    
    // Build test command to run instead of normal init
    const testCommands = tests.map(testScript => {
      const testPath = testType === 'habitat' 
        ? `${workDir}/claude-habitat/local/${testScript}`
        : `${workDir}/claude-habitat/${testType}/${testScript}`;
      
      return `
        echo "Running ${testScript}..."
        if [ -f ${testPath} ]; then
          chmod +x ${testPath}
          ${testPath}
        else
          echo "Test not found: ${testPath}"
          exit 1
        fi
      `;
    }).join('\n');
    
    // Create the full test script
    const testEntrypoint = `
      #!/bin/bash
      set -e
      
      # Source environment
      set -a; source /etc/environment 2>/dev/null || true; set +a
      
      # Run all tests
      ${testCommands}
      
      echo "All tests completed"
    `;
    
    // Run container with test script as entrypoint
    const runArgs = [
      'run', '--rm',
      '--name', containerName,
      '-w', workDir,
      ...envArgs
    ];

    // Add volume mounts if specified
    if (config.volumes && Array.isArray(config.volumes)) {
      config.volumes.forEach(volume => {
        runArgs.push('-v', volume);
      });
    }

    runArgs.push(imageTag, '/bin/bash', '-c', testEntrypoint);
    
    console.log('Running tests in container...\n');
    
    let results = [];
    if (captureResults) {
      try {
        const output = await execAsync(`docker ${runArgs.join(' ')}`);
        results = parseTestOutput(output, testType);
      } catch (err) {
        results = [{ 
          type: 'error', 
          message: `Test execution failed: ${err.message}`,
          details: err.stdout || err.stderr || ''
        }];
      }
    } else {
      await dockerRun(runArgs);
    }
    
    return captureResults ? results : undefined;
    
  } catch (err) {
    console.error(colors.red(`Error running tests: ${err.message}`));
    // Container already removed with --rm flag
    return captureResults ? [{ type: 'error', message: err.message }] : undefined;
  }
}

function parseTestOutput(output, testType) {
  const results = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Parse TAP output
    if (line.match(/^ok \d+/)) {
      const match = line.match(/^ok \d+ - (.+)/);
      results.push({
        type: 'pass',
        test: match ? match[1] : line,
        details: line
      });
    } else if (line.match(/^not ok \d+/)) {
      const match = line.match(/^not ok \d+ - (.+)/);
      results.push({
        type: 'fail',
        test: match ? match[1] : line,
        details: line
      });
    } else if (line.match(/^# /)) {
      // TAP diagnostic message
      results.push({
        type: 'info',
        message: line.replace(/^# /, ''),
        details: line
      });
    } else if (line.includes('Error') || line.includes('Failed')) {
      results.push({
        type: 'error',
        message: line,
        details: line
      });
    }
  }
  
  // If no structured results found, treat the whole output as info
  if (results.length === 0) {
    results.push({
      type: 'info',
      message: `${testType} tests completed`,
      details: output
    });
  }
  
  return results;
}

async function showTestResults(results, habitatName, testChoice, duration) {
  console.log(`\n${colors.green('=')}${colors.green('='.repeat(50))}${colors.green('=')}`);
  console.log(`${colors.green('Test Results Summary')}`);
  console.log(`${colors.green('=')}${colors.green('='.repeat(50))}${colors.green('=')}`);
  
  console.log(`\nHabitat: ${colors.cyan(habitatName)}`);
  console.log(`Test Type: ${colors.cyan(getTestTypeName(testChoice))}`);
  console.log(`Duration: ${colors.cyan(duration + 's')}`);
  console.log(`Timestamp: ${colors.cyan(new Date().toLocaleString())}\n`);
  
  // Count results by type
  const counts = {
    pass: results.filter(r => r.type === 'pass').length,
    fail: results.filter(r => r.type === 'fail').length,
    error: results.filter(r => r.type === 'error').length,
    info: results.filter(r => r.type === 'info').length
  };
  
  console.log(`${colors.green('✓ Passed:')} ${counts.pass}`);
  console.log(`${colors.red('✗ Failed:')} ${counts.fail}`);
  console.log(`${colors.red('⚠ Errors:')} ${counts.error}`);
  console.log(`${colors.yellow('ℹ Info:')} ${counts.info}\n`);
  
  // Show failed tests first
  const failedTests = results.filter(r => r.type === 'fail' || r.type === 'error');
  if (failedTests.length > 0) {
    console.log(`${colors.red('Failed Tests:')}`);
    failedTests.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.test || result.message}`);
      if (result.details && result.details !== result.message) {
        console.log(`     ${colors.gray(result.details)}`);
      }
    });
    console.log('');
  }
  
  // Show passed tests
  const passedTests = results.filter(r => r.type === 'pass');
  if (passedTests.length > 0) {
    console.log(`${colors.green('Passed Tests:')}`);
    passedTests.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.test || result.message}`);
    });
    console.log('');
  }
  
  console.log(`${colors.green('=')}${colors.green('='.repeat(50))}${colors.green('=')}\n`);
  
  // Interactive options
  console.log('Options:');
  console.log(`  ${colors.yellow('[Enter]')} - Continue to test menu`);
  console.log(`  ${colors.yellow('[s]')}ave   - Save results to file`);
  console.log(`  ${colors.yellow('[r]')}un    - Run tests again`);
  console.log('');
  
  const choice = await new Promise(resolve => {
    if (!process.stdin.isTTY) {
      resolve('');
      return;
    }
    
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    const onKeypress = (key) => {
      // Handle Ctrl+C
      if (key === '\u0003') {
        console.log('\n');
        process.exit(0);
      }
      
      // Handle Enter
      if (key === '\r' || key === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onKeypress);
        resolve('');
        return;
      }
      
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onKeypress);
      resolve(key.toLowerCase());
    };
    
    process.stdin.on('data', onKeypress);
  });
  
  console.log(''); // Add newline after selection
  
  if (choice === 's') {
    await saveTestResults(results, habitatName, testChoice, duration);
    // Show results again after saving
    await showTestResults(results, habitatName, testChoice, duration);
  } else if (choice === 'r') {
    // Run tests again
    await showHabitatTestMenu(habitatName);
  } else {
    // Return to test menu
    await showTestMenu();
  }
}

function getTestTypeName(choice) {
  switch (choice) {
    case 'a': case '': return 'All tests';
    case 's': return 'System tests';
    case 'h': return 'Shared tests';
    case 'hab': return 'Habitat-specific tests';
    default: return 'Unknown';
  }
}

async function saveTestResults(results, habitatName, testChoice, duration) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const filename = await new Promise(resolve => {
    const defaultName = `test-results-${habitatName}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    rl.question(`Enter filename (${colors.gray(defaultName)}): `, answer => {
      rl.close();
      resolve(answer.trim() || defaultName);
    });
  });
  
  const timestamp = new Date().toLocaleString();
  const testTypeName = getTestTypeName(testChoice);
  
  const report = `Claude Habitat Test Results
==========================

Habitat: ${habitatName}
Test Type: ${testTypeName}
Duration: ${duration}s
Timestamp: ${timestamp}

Summary:
--------
✓ Passed: ${results.filter(r => r.type === 'pass').length}
✗ Failed: ${results.filter(r => r.type === 'fail').length}
⚠ Errors: ${results.filter(r => r.type === 'error').length}
ℹ Info: ${results.filter(r => r.type === 'info').length}

Detailed Results:
----------------
${results.map((result, index) => {
  const icon = result.type === 'pass' ? '✓' : 
               result.type === 'fail' ? '✗' : 
               result.type === 'error' ? '⚠' : 'ℹ';
  return `${index + 1}. ${icon} ${result.test || result.message}
   ${result.details || ''}`;
}).join('\n\n')}

Generated by Claude Habitat v1.0
`;
  
  try {
    const fs = require('fs');
    fs.writeFileSync(filename, report);
    console.log(`${colors.green('✓')} Test results saved to: ${colors.cyan(filename)}\n`);
  } catch (err) {
    console.error(`${colors.red('✗')} Failed to save results: ${err.message}\n`);
  }
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
      case '-h':
      case '--help':
        options.help = true;
        break;
      case 's':
      case 'start':
        options.start = true;
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
    --clean                 Remove all Claude Habitat Docker images
    --list-configs          List available configuration files
    -h, --help             Display this help message

SHORTCUTS:
    s, start               Start last used configuration (or first available)
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
    const lastConfig = await getLastUsedConfig();
    const habitatsDir = path.join(__dirname, 'habitats');
    
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
        
        try {
          const content = require('fs').readFileSync(habitat.path, 'utf8');
          const parsed = yaml.load(content);
          console.log(`  ${colors.yellow(`[${key}]`)} ${habitat.name}${statusWarning}`);
          if (parsed.description) {
            console.log(`      ${parsed.description}`);
          }
          if (habitatStatus?.hasIssues) {
            console.log('      (may not be able to access remote repositories)');
          }
          console.log('');
        } catch (err) {
          console.log(`  ${colors.yellow(`[${key}]`)} ${habitat.name}${statusWarning}`);
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
    console.log(`  ${colors.yellow('[s]')}tart   - Start last used configuration`);
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
      await runHabitat(options.configPath, options.extraRepos);
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
