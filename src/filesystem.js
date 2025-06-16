/**
 * @module filesystem
 * @description Filesystem operations and verification for Claude Habitat
 * 
 * Handles file copying, permission management, ignore patterns, and filesystem
 * verification tests. Provides utilities for managing files between host and
 * container environments with proper permission handling.
 * 
 * @requires module:types - Domain model definitions
 * @requires module:container-operations - Docker execution operations
 * @requires module:standards/path-resolution - Path handling conventions
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/filesystem-verification.test.js`
 * - System tests: `npm test -- test/unit/verify-fs.test.js`
 * - Run all tests: `npm test`
 */

const fs = require('fs').promises;
const path = require('path');

// @see {@link module:standards/path-resolution} for project-root relative path conventions using rel()
const { colors, sleep, fileExists, calculateCacheHash, executeCommand, setFilePermissions, manageContainer, rel } = require('./utils');
const { dockerRun, dockerExec } = require('./container-operations');

// File ignore patterns functionality
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

// File discovery and copying
async function findFilesToCopy(sourceDir, destBase, isShared = false) {
  if (!destBase) {
    throw new Error('destBase parameter is required - specify the destination base path');
  }
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

// Container file operations
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
  // Removed verbose file copying log
  
  try {
    // Create destination directory as root to ensure permissions
    const destDir = path.dirname(destPath);
    await dockerExec(container, `mkdir -p ${destDir}`, 'root');
    
    // Resolve symlinks before copying to avoid Docker cp issues
    const realSrcPath = await fs.realpath(srcPath);
    
    // Copy file using docker cp
    await executeCommand(`docker cp "${realSrcPath}" ${container}:${destPath}`);
    
    // Get original file permissions
    const stat = await fs.stat(srcPath);
    const isExecutable = (stat.mode & parseInt('111', 8)) !== 0;
    
    // Set appropriate permissions and ownership
    const mode = isExecutable ? '755' : 
                 (destPath.includes('.pem') || destPath.includes('_key') ? '600' : '644');
    
    await setFilePermissions(container, destPath, {
      mode,
      user: containerUser,
      description: `Setting permissions for ${path.basename(destPath)}`
    });
  } catch (err) {
    console.warn(`Warning: Failed to copy ${srcPath}: ${err.message}`);
  }
}

// Filesystem verification


// Run verify-fs bash script with scope support
async function runVerifyFsScript(containerName, scope = 'all', config = null) {
  const { dockerExec } = require('./container-operations');
  const { colors } = require('./utils');
  
  try {
    // Determine work directory from config or default
    const workDir = config?.container?.work_dir || '/workspace';
    const containerUser = config?.container?.user || 'root';
    
    console.log(`Running filesystem verification (scope: ${scope})...`);
    
    // Determine correct path based on bypass mode
    const isBypassHabitat = config?.claude?.bypass_habitat_construction || false;
    const scriptPath = isBypassHabitat ? './system/tools/bin/verify-fs' : './habitat/system/tools/bin/verify-fs';
    
    // For bypass habitats, only run habitat scope (system/shared are not applicable)
    const effectiveScope = isBypassHabitat ? 'habitat' : scope;
    
    // Run the verify-fs script inside the container
    const command = `cd ${workDir} && ${scriptPath} ${effectiveScope}`;
    const result = await dockerExec(containerName, command, 'root');
    
    // For bypass habitats, inform user about scope limitation
    if (isBypassHabitat && scope === 'all') {
      console.log(colors.yellow('ℹ️  Bypass habitat detected - running habitat scope only'));
    }
    
    // Parse TAP output
    const lines = result.split('\n').filter(line => line.trim());
    let passed = 0;
    let failed = 0;
    let total = 0;
    
    lines.forEach(line => {
      if (line.startsWith('ok ')) {
        passed++;
      } else if (line.startsWith('not ok ')) {
        failed++;
      } else if (line.match(/^1\.\.(\d+)$/)) {
        total = parseInt(line.split('..')[1]);
      }
    });
    
    // If total wasn't found from TAP format, calculate from passed + failed
    if (total === 0) {
      total = passed + failed;
    }
    
    const success = failed === 0 && total > 0;
    const message = success 
      ? `Filesystem verification passed (${passed}/${total} files verified)`
      : `Filesystem verification failed (${failed}/${total} files missing)`;
    
    return {
      passed: success,
      message,
      scope: effectiveScope,  // Use effective scope not requested scope
      totalFiles: total,
      passedFiles: passed,
      failedFiles: failed,
      output: result
    };
    
  } catch (err) {
    return {
      passed: false,
      message: `Filesystem verification error: ${err.message}`,
      scope,
      error: err.message
    };
  }
}

// Enhanced verification that uses ephemeral containers
async function runEnhancedFilesystemVerification(preparedTag, scope = 'all', config = null, rebuild = false) {
  const { colors } = require('./utils');
  const { spawn } = require('child_process');
  
  console.log(`Starting filesystem verification in ephemeral container...`);
  
  try {
    // Get environment variables
    let containerUser = 'root';
    let workDir = '/workspace';
    let compiledEnv = {};
    
    if (config) {
      try {
        const { createHabitatPathHelpers } = require('./habitat-path-helpers');
        const pathHelpers = await createHabitatPathHelpers(config);
        compiledEnv = pathHelpers.getEnvironment();
        containerUser = compiledEnv.USER || config.container?.user || 'root';
        workDir = compiledEnv.WORKDIR || config.container?.work_dir || '/workspace';
      } catch (err) {
        console.warn(`Warning: Could not resolve environment variables: ${err.message}`);
        // Use config fallbacks
        containerUser = config.container?.user || 'root';
        workDir = config.container?.work_dir || '/workspace';
      }
    }
    
    // Determine script path and scope based on bypass mode
    const isBypassHabitat = config?.claude?.bypass_habitat_construction || false;
    const scriptPath = isBypassHabitat ? './system/tools/bin/verify-fs' : './habitat/system/tools/bin/verify-fs';
    const effectiveScope = isBypassHabitat ? 'habitat' : scope;
    
    // Build verification script that includes initialization and verification
    let verificationScript = `#!/bin/bash\nset -e\n\ncd ${workDir}\n\n`;
    
    // Add initialization commands for bypass habitats
    if (isBypassHabitat) {
      verificationScript += `
# Initialize habitat files for bypass mode
echo "Running habitat file initialization..."
if [ -f /workspace/shared/gitconfig ]; then
  sudo cp /workspace/shared/gitconfig /etc/gitconfig 2>/dev/null || true
  sudo cp /workspace/shared/gitconfig /root/.gitconfig 2>/dev/null || true
  cp /workspace/shared/gitconfig /home/node/.gitconfig 2>/dev/null || true
fi
if [ -f /home/node/.claude/.credentials.json ]; then
  sudo mkdir -p /root/.claude
  sudo cp /home/node/.claude/.credentials.json /root/.claude/.credentials.json 2>/dev/null || true
  sudo chmod 600 /root/.claude/.credentials.json 2>/dev/null || true
fi
\n`;
    }
    
    // Add the verification command
    verificationScript += `
# Run filesystem verification
echo "Running filesystem verification (scope: ${effectiveScope})..."
${scriptPath} ${effectiveScope}
`;
    
    // NOTE: We do NOT pass environment variables via -e flags because:
    // 1. The entrypoint script (/entrypoint.sh) and habitat-env.sh handle all environment setup
    // 2. Passing -e variables can override the container's built-in environment setup
    // 3. This approach maintains consistency with the main habitat execution path
    
    // Load and resolve volumes from configuration
    const { loadAndResolveVolumes, buildVolumeArgs } = require('./volume-resolver');
    const resolvedVolumes = await loadAndResolveVolumes(config, compiledEnv);
    const volumeArgs = buildVolumeArgs(resolvedVolumes);
    
    // Docker run arguments for ephemeral verification
    // NOTE: We use the entrypoint script for consistency with main habitat execution.
    // No -e or -w flags needed as the entrypoint handles environment and working directory.
    const dockerArgs = [
      'run', '--rm',
      '-u', containerUser,
      ...volumeArgs,
      preparedTag,
      '/entrypoint.sh', '/bin/bash', '-c', verificationScript
    ];
    
    // Execute verification in ephemeral container
    const output = await new Promise((resolve, reject) => {
      const dockerProcess = spawn('docker', dockerArgs);
      let stdout = '';
      let stderr = '';
      
      dockerProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      dockerProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      dockerProcess.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Filesystem verification failed with exit code ${code}. stderr: ${stderr}`));
        }
      });
      
      dockerProcess.on('error', (error) => {
        reject(new Error(`Process error: ${error.message}`));
      });
    });
    
    // Parse TAP output from verification script
    const verifyResult = parseVerificationOutput(output, effectiveScope, isBypassHabitat, scope);
    
    if (verifyResult.passed) {
      console.log(colors.green(`✅ ${verifyResult.message}`));
    } else {
      console.log(colors.red(`❌ ${verifyResult.message}`));
      if (verifyResult.output) {
        console.log(colors.yellow('Verification output:'));
        console.log(verifyResult.output);
      }
    }
    
    return verifyResult;
    
  } catch (err) {
    console.error(colors.red(`Error during filesystem verification: ${err.message}`));
    throw err;
  }
  // No cleanup needed - container is automatically removed with --rm
}

// Parse verification output from TAP format
function parseVerificationOutput(output, effectiveScope, isBypassHabitat, originalScope) {
  const { colors } = require('./utils');
  
  // For bypass habitats, inform user about scope limitation
  if (isBypassHabitat && originalScope === 'all') {
    console.log(colors.yellow('ℹ️  Bypass habitat detected - running habitat scope only'));
  }
  
  // Parse TAP output
  const lines = output.split('\n').filter(line => line.trim());
  let passed = 0;
  let failed = 0;
  let total = 0;
  
  lines.forEach(line => {
    if (line.startsWith('ok ')) {
      passed++;
    } else if (line.startsWith('not ok ')) {
      failed++;
    } else if (line.match(/^1\.\.(\d+)$/)) {
      total = parseInt(line.split('..')[1]);
    }
  });
  
  // If total wasn't found from TAP format, calculate from passed + failed
  if (total === 0) {
    total = passed + failed;
  }
  
  const success = failed === 0 && total > 0;
  const message = success 
    ? `Filesystem verification passed (${passed}/${total} checks)`
    : `Filesystem verification failed (${failed}/${total} checks failed)`;
  
  return {
    passed: success,
    message,
    output: success ? null : output,
    results: { passed, failed, total }
  };
}

module.exports = {
  loadIgnorePatterns,
  shouldIgnoreItem,
  findFilesToCopy,
  copyFilesDirectory,
  processFileOperations,
  copyFileToContainer,
  runVerifyFsScript,
  runEnhancedFilesystemVerification
};