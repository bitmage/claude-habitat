/**
 * Docker module facade
 * Re-exports functions from container-operations and image-lifecycle modules
 * This maintains backward compatibility with existing code
 */

// Container operations
const {
  buildDockerRunArgs,
  buildDockerExecArgs,
  dockerRun,
  dockerExec,
  dockerImageExists,
  dockerIsRunning,
  execDockerCommand,
  execShellCommand
} = require('./container-operations');

// Image lifecycle operations
const {
  buildBaseImage,
  prepareWorkspace,
  buildPreparedImage,
  runSetupCommands,
  cloneRepository
} = require('./image-lifecycle');

// Re-export everything
module.exports = {
  // Container operations
  buildDockerRunArgs,
  buildDockerExecArgs,
  dockerRun,
  dockerExec,
  dockerImageExists,
  dockerIsRunning,
  execDockerCommand,
  execShellCommand,
  
  // Image lifecycle operations
  buildBaseImage,
  prepareWorkspace,
  buildPreparedImage, // Backward compatibility alias
  runSetupCommands,
  cloneRepository
};