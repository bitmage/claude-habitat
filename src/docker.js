const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

// Pure function: construct docker arguments
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

// Pure function: construct docker exec arguments  
function buildDockerExecArgs(container, command, user = null) {
  const args = ['exec'];
  if (user) args.push('-u', user);
  args.push(container, 'bash', '-c', command);
  return args;
}

// Infrastructure function: execute docker command
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
        resolve(stdout.trim());
      }
    });
    
    docker.on('error', (err) => {
      reject(err);
    });
  });
}

// Infrastructure function: execute shell command
async function execShellCommand(command) {
  try {
    const { stdout } = await execAsync(command);
    return { success: true, output: stdout.trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Composed functions using pure + infrastructure
async function dockerRun(args, dockerClient = execDockerCommand) {
  return dockerClient(args);
}

async function dockerExec(container, command, user = null, dockerClient = execDockerCommand) {
  const args = buildDockerExecArgs(container, command, user);
  return dockerClient(args);
}

async function dockerImageExists(tag, shellClient = execShellCommand) {
  const result = await shellClient(`docker image inspect ${tag}`);
  return result.success;
}

async function dockerIsRunning(container, shellClient = execShellCommand) {
  const result = await shellClient(`docker ps -q -f name=${container}`);
  return result.success && result.output.length > 0;
}

// Create docker client interface for dependency injection
const createDockerClient = () => ({
  run: dockerRun,
  exec: dockerExec,
  imageExists: dockerImageExists,
  isRunning: dockerIsRunning
});

module.exports = {
  // Pure functions (easily testable)
  buildDockerRunArgs,
  buildDockerExecArgs,
  
  // Infrastructure functions
  execDockerCommand,
  execShellCommand,
  
  // Composed functions (legacy API with DI)
  dockerRun,
  dockerExec,
  dockerImageExists,
  dockerIsRunning,
  
  // Client factory
  createDockerClient
};