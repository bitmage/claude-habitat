/**
 * @module container-operations
 * @description Docker container runtime operations for Claude Habitat
 * 
 * Handles running containers, executing commands, and checking container status.
 * Provides low-level Docker operations with consistent error handling and
 * argument construction patterns.
 * 
 * @requires module:types - Domain model definitions
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - E2E tests: `npm run test:e2e -- test/e2e/claude-in-habitat.test.js`
 * - Run all tests: `npm test`
 */

const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

/**
 * Pure function: construct docker arguments
 */
function buildDockerRunArgs(command, options = {}) {
  const args = [command];
  
  if (options.detached) args.push('-d');
  if (options.name) args.push('--name', options.name);
  if (options.environment) {
    options.environment.forEach(env => {
      args.push('-e', env);
    });
  }
  if (options.image) args.push(options.image);
  if (options.initCommand) args.push(options.initCommand);
  
  return args;
}

/**
 * Pure function: construct docker exec arguments
 */
function buildDockerExecArgs(container, command, user = null) {
  const args = ['exec'];
  if (user) args.push('-u', user);
  
  // Wrap command to source environment variables first
  const wrappedCommand = `source /etc/profile.d/habitat-env.sh 2>/dev/null || true; ${command}`;
  
  args.push(container, '/bin/bash', '-c', wrappedCommand);
  return args;
}

/**
 * Infrastructure function: execute docker command
 */
async function execDockerCommand(args) {
  return new Promise((resolve, reject) => {
    const docker = spawn('docker', args);
    let stdout = '';
    let stderr = '';
    
    docker.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    docker.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    docker.on('close', (code) => {
      if (code !== 0 && stderr && !stderr.includes('WARNING') && !stderr.includes('npm notice')) {
        reject(new Error(stderr));
      } else {
        resolve(stdout);
      }
    });
    
    docker.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Infrastructure function: execute shell command
 */
async function execShellCommand(command) {
  const { stdout, stderr } = await execAsync(command);
  if (stderr && !stderr.includes('WARNING')) {
    throw new Error(stderr);
  }
  return stdout;
}

/**
 * Run a docker command with given arguments
 */
async function dockerRun(args, dockerClient = execDockerCommand) {
  return dockerClient(args);
}

/**
 * Execute a command inside a running container
 */
async function dockerExec(container, command, user = null, dockerClient = execDockerCommand) {
  const args = buildDockerExecArgs(container, command, user);
  return dockerClient(args);
}

/**
 * Check if a Docker image exists
 */
async function dockerImageExists(tag, shellClient = execShellCommand) {
  try {
    const output = await shellClient(`docker images -q ${tag}`);
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a container is running
 */
async function dockerIsRunning(container, shellClient = execShellCommand) {
  try {
    const output = await shellClient(`docker ps -q -f name=${container}`);
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Execute Docker build command with cleaner error handling
 * 
 * @param {Array} buildArgs - Docker build arguments
 * @returns {Promise<string>} - Build output
 */
async function execDockerBuild(buildArgs) {
  return new Promise((resolve, reject) => {
    const docker = spawn('docker', buildArgs);
    let stdout = '';
    let stderr = '';
    
    docker.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    docker.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    docker.on('close', (code) => {
      if (code !== 0) {
        // Extract just the essential error info from Docker build output
        const lines = stderr.split('\n');
        const errorLine = lines.find(line => line.includes('ERROR:')) || 
                         lines.find(line => line.includes('failed to solve:')) ||
                         lines.find(line => line.includes('exit code:'));
        
        const cleanError = errorLine || 'Docker build failed';
        reject(new Error(cleanError));
      } else {
        resolve(stdout);
      }
    });
    
    docker.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Start a temporary container from an image
 * 
 * @param {string} imageTag - Image to start container from
 * @param {string} [prefix='build'] - Container name prefix (e.g., 'build', 'prep')
 * @returns {Promise<string>} - Container ID
 */
async function startTempContainer(imageTag, prefix = 'build') {
  const containerId = `claude-habitat-${prefix}-${Date.now()}`;
  await dockerRun(['run', '-d', '--name', containerId, imageTag, '/bin/sh', '-c', 'tail -f /dev/null']);
  
  // Wait for container to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return containerId;
}

module.exports = {
  buildDockerRunArgs,
  buildDockerExecArgs,
  dockerRun,
  dockerExec,
  dockerImageExists,
  dockerIsRunning,
  startTempContainer,
  execDockerCommand,
  execDockerBuild,
  execShellCommand
};