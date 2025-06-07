const fs = require('fs').promises;
const path = require('path');

const { colors, sleep, fileExists, calculateCacheHash, executeCommand, setFilePermissions, manageContainer, rel } = require('./utils');
const { dockerRun, dockerExec } = require('./docker');

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
  console.log(`  Copying ${path.basename(srcPath)} to ${destPath}`);
  
  try {
    // Create destination directory
    const destDir = path.dirname(destPath);
    await dockerExec(container, `mkdir -p ${destDir}`);
    
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

// Run filesystem verification as a standalone test
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
    const imagesResult = await executeCommand(`docker images -q ${preparedTag}`);
    if (!imagesResult.output.trim()) {
      console.log('No prepared image found, building...');
      const { buildPreparedImage } = require('../claude-habitat');
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
    await manageContainer('stop', containerName, { ignoreErrors: true });
    await manageContainer('remove', containerName, { ignoreErrors: true });
  }
}

module.exports = {
  loadIgnorePatterns,
  shouldIgnoreItem,
  findFilesToCopy,
  copyFilesDirectory,
  processFileOperations,
  copyFileToContainer,
  verifyFilesystem,
  runFilesystemVerification
};