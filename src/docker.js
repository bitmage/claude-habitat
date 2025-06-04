const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

// Simple docker helper
async function dockerRun(args) {
  // Use spawn instead of exec to avoid shell interpretation issues
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

async function dockerExec(container, command, user = null) {
  const args = ['exec'];
  if (user) args.push('-u', user);
  args.push(container, 'bash', '-c', command);
  return dockerRun(args);
}

async function dockerImageExists(tag) {
  try {
    await execAsync(`docker image inspect ${tag}`);
    return true;
  } catch {
    return false;
  }
}

async function dockerIsRunning(container) {
  try {
    const { stdout } = await execAsync(`docker ps -q -f name=${container}`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

module.exports = {
  dockerRun,
  dockerExec,
  dockerImageExists,
  dockerIsRunning
};