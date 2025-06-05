const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

// Terminal colors for output
const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
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

module.exports = {
  colors,
  omit,
  sleep,
  fileExists,
  findPemFiles,
  calculateCacheHash,
  parseRepoSpec,
  parseCommands
};