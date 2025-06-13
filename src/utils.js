/**
 * @module utils
 * @description Core utility functions for Claude Habitat
 * 
 * Provides fundamental utilities used across the application including
 * path resolution, file operations, colors, command execution, and
 * cross-cutting helper functions. Implements path resolution standards.
 * 
 * @requires module:standards/path-resolution - Path handling conventions
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/verify-fs.test.js`
 * - Utilities are tested across all module tests
 * - Run all tests: `npm test`
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

// Project root relative path helper
const rel = (...segments) => path.join(__dirname, '..', ...segments);

// Container workspace relative path helper
const createWorkDirPath = (workDir) => (...segments) => path.posix.join(workDir, ...segments);

// Terminal colors for output
const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

// Object manipulation utilities
const omit = (keys, obj) => {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result;
};

// Async utilities
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// File system utilities
const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const isDirectory = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
};

// Simple glob replacement for finding .pem files
const findPemFiles = async (dir) => {
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(file => file.endsWith('.pem'))
      .map(file => path.join(dir, file));
  } catch {
    return [];
  }
};

// Hash utilities
const calculateCacheHash = (config, extraRepos = []) => {
  if (!config || typeof config !== 'object') throw new Error('Invalid config');
  if (!Array.isArray(extraRepos)) throw new Error('extraRepos must be an array');

  const relevant = omit(['environment', '_configPath'], config);
  const hashInput = JSON.stringify({ relevant, extraRepos });
  return crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 12);
};

// Repository spec parsing
const parseRepoSpec = (spec) => {
  if (!spec) throw new Error('Missing required parameter: spec');
  if (typeof spec !== 'string') throw new Error('spec must be a string');
  if (!spec.includes(':')) throw new Error('Invalid repo spec format (expected URL:PATH[:BRANCH])');

  // Match SSH format: git@host:user/repo:path[:branch]
  const sshMatch = spec.match(/^(git@[^:]+:[^:]+):([^:]+)(?::(.+))?$/);
  if (sshMatch) {
    return {
      url: sshMatch[1],
      path: sshMatch[2],
      branch: sshMatch[3] || 'main'
    };
  }

  // Match HTTP(S): https://host/repo:path[:branch]
  const httpMatch = spec.match(/^(https?:\/\/[^:]+):([^:]+)(?::(.+))?$/);
  if (httpMatch) {
    return {
      url: httpMatch[1],
      path: httpMatch[2],
      branch: httpMatch[3] || 'main'
    };
  }

  // Simple format: url:path[:branch]
  const parts = spec.split(':');
  if (parts.length < 2) {
    throw new Error(`Invalid repository spec: ${spec} (missing path)`);
  }

  return {
    url: parts[0],
    path: parts[1],
    branch: parts[2] || 'main'
  };
};

// Parse YAML command lists
const parseCommands = (commandList) => {
  if (!Array.isArray(commandList)) return [];
  return commandList.filter(cmd => cmd && typeof cmd === 'string').map(cmd => cmd.replace(/^- /, ''));
};

// Command execution pattern helper
const executeCommand = async (command, options = {}) => {
  const { promisify } = require('util');
  const { exec } = require('child_process');
  const execAsync = promisify(exec);
  
  const { timeout = 30000, ignoreErrors = false, description } = options;
  
  if (description) {
    console.log(description);
  }
  
  try {
    const result = await execAsync(command, { timeout });
    return { success: true, output: result.stdout.trim(), error: null };
  } catch (err) {
    if (ignoreErrors) {
      return { success: false, output: '', error: err.message };
    }
    throw err;
  }
};

// Container management pattern helper
const manageContainer = async (action, containerName, options = {}) => {
  const { image, runArgs = [], user } = options;
  
  const commandMap = {
    start: () => {
      const args = ['run', '-d', '--name', containerName, ...runArgs];
      if (image) args.push(image);
      return args;
    },
    stop: () => ['stop', containerName],
    remove: () => ['rm', containerName],
    exec: () => {
      const args = ['exec'];
      if (user) args.push('-u', user);
      args.push(containerName);
      return args;
    },
    exists: () => ['ps', '-q', '-f', `name=${containerName}`],
    running: () => ['ps', '-q', '-f', `name=${containerName}`]
  };
  
  const args = commandMap[action]();
  if (!args) {
    throw new Error(`Unknown container action: ${action}`);
  }
  
  return executeCommand(`docker ${args.join(' ')}`, { ignoreErrors: options.ignoreErrors });
};

// File permission and ownership pattern helper
const setFilePermissions = async (container, filePath, options = {}) => {
  const { mode = '644', user, description } = options;
  
  if (description) {
    console.log(`  ${description}`);
  }
  
  const commands = [];
  
  // Set file permissions
  commands.push(`chmod ${mode} ${filePath} 2>/dev/null || true`);
  
  // Set ownership if user specified
  if (user && user !== 'root') {
    commands.push(`chown ${user}:${user} ${filePath} 2>/dev/null || true`);
  }
  
  for (const cmd of commands) {
    await executeCommand(`docker exec ${container} ${cmd}`, { ignoreErrors: true });
  }
};

// Error categorization pattern helper
const categorizeError = (errorMessage, categoryMap) => {
  for (const [pattern, category] of Object.entries(categoryMap)) {
    if (errorMessage.toLowerCase().includes(pattern.toLowerCase())) {
      return typeof category === 'function' ? category(errorMessage) : category;
    }
  }
  
  return { type: 'unknown', message: `Unknown error: ${errorMessage}` };
};

// Configuration processing pattern helper
const processConfig = (config, processors = {}) => {
  const processed = { ...config };
  
  for (const [key, processor] of Object.entries(processors)) {
    if (config[key] !== undefined) {
      processed[key] = processor(config[key]);
    }
  }
  
  return processed;
};

// Test result processing pattern helper
const processTestResults = (output, parsers = {}) => {
  const results = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    let processed = false;
    
    for (const [pattern, parser] of Object.entries(parsers)) {
      const regex = new RegExp(pattern);
      const match = line.match(regex);
      
      if (match) {
        results.push(parser(line, match));
        processed = true;
        break;
      }
    }
    
    // Default handler for unmatched lines
    if (!processed && line.trim()) {
      results.push({ type: 'info', message: line.trim(), details: line });
    }
  }
  
  return results.length > 0 ? results : [{ type: 'info', message: 'No structured output found', details: output }];
};

module.exports = {
  colors,
  omit,
  sleep,
  fileExists,
  isDirectory,
  findPemFiles,
  calculateCacheHash,
  parseRepoSpec,
  parseCommands,
  
  // Path helpers
  rel,
  createWorkDirPath,
  
  // New parameterized helpers
  executeCommand,
  manageContainer,
  setFilePermissions,
  categorizeError,
  processConfig,
  processTestResults
};