/**
 * Docker container runtime operations
 * Handles running containers, executing commands, and checking container status
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
  args.push(container, '/usr/bin/bash', '-c', command);
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
      if (code !== 0 && stderr && !stderr.includes('WARNING')) {
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

module.exports = {
  buildDockerRunArgs,
  buildDockerExecArgs,
  dockerRun,
  dockerExec,
  dockerImageExists,
  dockerIsRunning,
  execDockerCommand,
  execShellCommand
};