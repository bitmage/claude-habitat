/**
 * @module build-lifecycle
 * @description 12-phase build lifecycle for habitat containers with progressive snapshots
 * 
 * Implements a standardized build pipeline that breaks complex container preparation
 * into discrete phases. Each phase creates a snapshot for intelligent caching and
 * enables selective rebuilds when only specific configuration sections change.
 * 
 * @requires module:event-pipeline - Pipeline framework
 * @requires module:snapshot-manager - Snapshot creation and management
 * @requires module:phase-hash - Phase-based hash calculation
 * @requires module:phases - Build phase definitions and configuration sections
 * @requires module:container-operations - Docker operations
 * @requires module:image-lifecycle - Existing build functions
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/build-lifecycle.test.js`
 * - E2E tests: `npm run test:e2e -- test/e2e/progressive-builds.test.js`
 * - Run all tests: `npm test`
 */

const fs = require('fs').promises;
const path = require('path');
const { EventPipeline } = require('./event-pipeline');
const { createSnapshot, findValidSnapshot } = require('./snapshot-manager');
const { calculateAllPhaseHashes, createPhaseLabels } = require('./phase-hash');
const { BUILD_PHASES, findPhaseIndex } = require('./phases');
const { execDockerCommand, dockerRun, dockerExec, startTempContainer, execDockerBuild } = require('./container-operations');
const { buildBaseImage, cloneRepository, copyDirectoryToContainer, copyConfigFiles } = require('./image-lifecycle');
const { fileExists, rel, createWorkDirPath } = require('./utils');
const { loadConfig, loadHabitatEnvironmentFromConfig } = require('./config');


/**
 * Create a progressive build pipeline for a habitat
 * 
 * @param {string} habitatConfigPath - Path to habitat config.yaml
 * @param {Object} options - Build options
 * @param {boolean} options.rebuild - Force rebuild from beginning
 * @param {string|number} options.rebuildFrom - Phase to rebuild from
 * @param {Array} options.extraRepos - Additional repositories to clone
 * @returns {Promise<EventPipeline>} - Configured build pipeline
 */
async function createBuildPipeline(habitatConfigPath, options = {}) {
  const { rebuild = false, rebuildFrom = null, target = null, extraRepos = [] } = options;
  
  // Load the coalesced configuration
  const config = await loadHabitatEnvironmentFromConfig(habitatConfigPath);
  const habitatName = config.name;
  
  // Calculate current phase hashes for standard phases
  const phaseNames = BUILD_PHASES.map(p => p.name);
  
  // Check if Dockerfile exists for phase 1 logic
  const habitatDir = path.dirname(habitatConfigPath);
  const dockerfilePath = path.join(habitatDir, 'Dockerfile');
  const hasDockerfile = await fileExists(dockerfilePath);
  
  // Calculate hashes for all phases (no separate dockerfile phase anymore)
  const currentHashes = await calculateAllPhaseHashes(habitatConfigPath, phaseNames);
  
  // Determine target phase index if target is specified
  let targetPhaseIndex = BUILD_PHASES.length - 1; // Default to all phases
  if (target !== null) {
    targetPhaseIndex = findPhaseIndex(target);
    if (targetPhaseIndex === -1) {
      throw new Error(`Unknown target phase: ${target}`);
    }
    console.log(`🎯 Building up to phase ${target}`);
  }
  
  // Find valid snapshot to start from (unless forcing full rebuild)
  let startFromPhase = 0;
  let baseImageTag = null;
  
  if (!rebuild) {
    const validSnapshot = await findValidSnapshot(habitatName, currentHashes, BUILD_PHASES, targetPhaseIndex);
    if (validSnapshot) {
      startFromPhase = validSnapshot.startFromPhase;
      baseImageTag = validSnapshot.snapshotTag;
      
      if (startFromPhase > targetPhaseIndex) {
        // Target phase is already cached - use that snapshot directly
        const targetPhase = BUILD_PHASES[targetPhaseIndex];
        console.log(`✅ Using cached snapshot: ${validSnapshot.snapshotTag} (${targetPhase.id}-${targetPhase.name})`);
        // Set startFromPhase beyond target so no phases will be executed
        startFromPhase = BUILD_PHASES.length;
      } else {
        console.log(`✅ Using cached snapshot: ${validSnapshot.snapshotTag} (skipping ${startFromPhase} phases)`);
      }
    }
  }
  
  // Handle rebuild from specific phase
  if (rebuildFrom !== null) {
    const rebuildPhaseIndex = findPhaseIndex(rebuildFrom);
    if (rebuildPhaseIndex !== -1) {
      startFromPhase = rebuildPhaseIndex;
      console.log(`🔄 Rebuilding from phase ${rebuildFrom}`);
      
      // Find snapshot from the phase BEFORE the rebuild phase to start from
      if (rebuildPhaseIndex > 0) {
        const previousPhase = BUILD_PHASES[rebuildPhaseIndex - 1];
        const snapshotTag = `habitat-${habitatName}:${previousPhase.id}-${previousPhase.name}`;
        
        // Check if the previous phase snapshot exists
        const { dockerImageExists } = require('./container-operations');
        if (await dockerImageExists(snapshotTag)) {
          baseImageTag = snapshotTag;
          console.log(`✅ Using snapshot: ${snapshotTag} (starting from ${previousPhase.name})`);
        } else {
          console.log(`⚠️  Previous snapshot ${snapshotTag} not found, rebuilding from beginning`);
          startFromPhase = 0;
          baseImageTag = null;
        }
      }
    }
  }
  
  // Create the pipeline
  const pipeline = new EventPipeline(`habitat-${habitatName}`);
  
  // Add phases to pipeline
  let phaseIndex = 0;
  
  // Standard phases
  for (const phase of BUILD_PHASES) {
    if (phaseIndex >= startFromPhase && phaseIndex <= targetPhaseIndex) {
      const noSnapshot = phase.name === 'verify' || phase.name === 'test';
      
      pipeline.stage(`${phase.id}-${phase.name}`, async (ctx) => {
        // Pass hasDockerfile info to phase 1 (base)
        if (phase.name === 'base') {
          return await executePhase(phase.name, { ...ctx, hasDockerfile, habitatDir });
        }
        return await executePhase(phase.name, ctx);
      }, { noSnapshot });
      
      // Add snapshot creation for phases that need it
      if (!noSnapshot) {
        pipeline.stage(`snapshot-${phase.name}`, async (ctx) => {
          const snapshotTag = `habitat-${habitatName}:${phase.id}-${phase.name}`;
          
          // For the final phase, recalculate hashes to ensure they're current
          // This fixes the stale hash issue when config changes between pipeline creation and snapshot
          let phaseHashes;
          if (phase.name === 'final') {
            phaseHashes = await calculateAllPhaseHashes(habitatConfigPath, phaseNames);
          } else {
            phaseHashes = currentHashes; // Use pre-calculated hashes for non-final phases
          }
          
          const labels = createPhaseLabels(phaseHashes, 'pass');
          
          // Apply any Docker changes (like ENTRYPOINT) if present
          const snapshotOptions = { labels };
          if (ctx.entrypointChange) {
            snapshotOptions.dockerChange = ctx.entrypointChange;
          }
          
          await createSnapshot(ctx.containerId, snapshotTag, snapshotOptions);
          
          ctx.progressSubject?.next({
            type: 'snapshot-created',
            tag: snapshotTag,
            phase: phase.name,
            timestamp: Date.now()
          });
          
          return ctx;
        }, { noSnapshot: true });
      }
    }
    phaseIndex++;
  }
  
  // Store context information for the pipeline
  pipeline._context = {
    habitatName,
    currentHashes,
    startFromPhase,
    baseImageTag
  };
  
  return pipeline;
}


/**
 * Wraps a phase handler with automatic before/after lifecycle hooks
 * 
 * @param {string} phaseName - Name of the phase
 * @param {Function} handler - Core phase handler function
 * @returns {Function} - Wrapped handler with lifecycle hooks
 */
function withLifecycleHooks(phaseName, handler) {
  return async (ctx) => {
    const env = ctx.config._environment || {};
    const user = env.USER || 'root';
    const workdir = env.WORKDIR || '/workspace';
    
    // Run before:phase file hooks
    await runFilesForPhase(ctx.containerId, ctx.config, `before:${phaseName}`, user, workdir);
    
    // Run before:phase scripts
    await runScriptsForPhase(ctx.containerId, ctx.config, `before:${phaseName}`, user, workdir);
    
    // Execute the core phase logic
    const result = await handler(ctx);
    
    // Run after:phase file hooks
    await runFilesForPhase(ctx.containerId, ctx.config, `after:${phaseName}`, user, workdir);
    
    // Run after:phase scripts
    await runScriptsForPhase(ctx.containerId, ctx.config, `after:${phaseName}`, user, workdir);
    
    return result;
  };
}

/**
 * Core phase handler implementations (without lifecycle hooks)
 */
const CORE_PHASE_HANDLERS = {
  base: async (ctx) => {
    const config = ctx.config;
    
    // Load and resolve volumes for build container
    const { loadAndResolveVolumes } = require('./volume-resolver');
    const environment = config._environment || {};
    const resolvedVolumes = await loadAndResolveVolumes(config, environment);
    
    if (ctx.hasDockerfile) {
      // Build from Dockerfile in habitat directory
      const dockerfilePath = path.join(ctx.habitatDir, 'Dockerfile');
      const tempTag = `temp-dockerfile-${Date.now()}`;
      
      await execDockerBuild(['build', '-f', dockerfilePath, '-t', tempTag, ctx.habitatDir]);
      const containerId = await startTempContainer(tempTag, 'build', resolvedVolumes);
      
      return { ...ctx, containerId, baseImageTag: tempTag, fromDockerfile: true, resolvedVolumes };
    } else if (config.base_image) {
      const containerId = await startTempContainer(config.base_image, 'build', resolvedVolumes);
      return { ...ctx, containerId, baseImageTag: config.base_image, resolvedVolumes };
    } else {
      const baseTag = await buildBaseImage(config, { rebuild: ctx.rebuild });
      const containerId = await startTempContainer(baseTag, 'build', resolvedVolumes);
      return { ...ctx, containerId, baseImageTag: baseTag, resolvedVolumes };
    }
  },

  users: async (ctx) => {
    const env = ctx.config._environment || {};
    const user = env.USER || 'root';
    
    if (user !== 'root') {
      await dockerExec(ctx.containerId, `id ${user} || useradd -m -s /bin/bash ${user}`, 'root');
      await dockerExec(ctx.containerId, `usermod -a -G sudo,docker ${user} || true`, 'root');
    }
    return ctx;
  },

  env: async (ctx) => {
    const env = ctx.config._environment || {};
    
    // Environment variable implementation:
    // Variables from config are written to /etc/profile.d/habitat-env.sh
    // This ensures they're available in multiple contexts:
    // - Login shells (via /etc/profile.d/)
    // - Build scripts (via dockerExec wrapper)
    // - Main container process (via /entrypoint.sh wrapper)
    
    const envEntries = Object.entries(env)
      .map(([key, value]) => `export ${key}="${value}"`)
      .join('\n');
    
    const envScript = `#!/bin/bash\n# Habitat environment variables\n${envEntries}\n# Set working directory to WORKDIR by default\ncd "$WORKDIR" 2>/dev/null || true\n`;
    
    await dockerExec(ctx.containerId, `mkdir -p /etc/profile.d`, 'root');
    await dockerExec(ctx.containerId, `cat > /etc/profile.d/habitat-env.sh << 'EOF'\n${envScript}\nEOF`, 'root');
    
    // Make the script executable
    await dockerExec(ctx.containerId, 'chmod +x /etc/profile.d/habitat-env.sh', 'root');
    
    return ctx;
  },

  workdir: async (ctx) => {
    const env = ctx.config._environment || {};
    const workdir = env.WORKDIR || '/workspace';
    const user = env.USER || 'root';
    
    await dockerExec(ctx.containerId, `mkdir -p ${workdir}`, 'root');
    if (user !== 'root') {
      await dockerExec(ctx.containerId, `chown ${user}:${user} ${workdir}`, 'root');
    }
    
    return ctx;
  },

  habitat: async (ctx) => {
    const env = ctx.config._environment || {};
    const habitatPath = env.HABITAT_PATH || '/workspace/habitat';
    const user = env.USER || 'root';
    
    const dirs = [
      habitatPath,
      path.posix.join(habitatPath, 'system'),
      path.posix.join(habitatPath, 'shared'),
      path.posix.join(habitatPath, 'local')
    ];
    
    for (const dir of dirs) {
      await dockerExec(ctx.containerId, `mkdir -p ${dir}`, 'root');
      if (user !== 'root') {
        await dockerExec(ctx.containerId, `chown ${user}:${user} ${dir}`, 'root');
      }
    }
    
    return ctx;
  },

  files: async (ctx) => {
    const config = ctx.config;
    const env = config._environment || {};
    const workdir = env.WORKDIR || '/workspace';
    const user = env.USER || 'root';
    const isBypassHabitat = config.claude?.bypass_habitat_construction || false;
    
    if (!isBypassHabitat) {
      const workDirPath = createWorkDirPath(workdir);
      
      // Copy system, shared, and local files
      for (const [dirName, srcPath] of [
        ['system', rel('system')],
        ['shared', rel('shared')],
        ['local', path.dirname(config._configPath)]
      ]) {
        if (await fileExists(srcPath)) {
          const containerPath = workDirPath('habitat', dirName);
          await dockerExec(ctx.containerId, `mkdir -p ${containerPath}`, 'root');
          await copyDirectoryToContainer(ctx.containerId, srcPath, containerPath);
        }
      }
    }
    
    // Run file hooks for files phase (files with no before/after specified)
    await runFilesForPhase(ctx.containerId, ctx.config, 'files', user, workdir);
    
    return ctx;
  },

  scripts: async (ctx) => {
    const env = ctx.config._environment || {};
    const user = env.USER || 'root';
    const workdir = env.WORKDIR || '/workspace';
    
    // Create entrypoint wrapper script that ensures environment is loaded
    const entrypointScript = `#!/bin/bash
# Habitat entrypoint wrapper - ensures environment variables are available
# Ensure standard PATH is available even if not set in environment
export PATH="\${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}"
source /etc/profile.d/habitat-env.sh 2>/dev/null || true
exec "$@"
`;
    await dockerExec(ctx.containerId, `cat > /entrypoint.sh << 'EOF'\n${entrypointScript}\nEOF`, 'root');
    await dockerExec(ctx.containerId, 'chmod +x /entrypoint.sh', 'root');
    
    // Run scripts for scripts phase (scripts with no before/after specified)
    await runScriptsForPhase(ctx.containerId, ctx.config, 'scripts', user, workdir);
    return ctx;
  },

  repos: async (ctx) => {
    const config = ctx.config;
    const env = config._environment || {};
    const workdir = env.WORKDIR || '/workspace';
    const user = env.USER || 'root';
    
    // Clone repositories from config
    const repos = config.repos || config.repositories || [];
    for (const repo of repos) {
      await cloneRepository(ctx.containerId, repo, workdir, user);
    }
    
    // Clone extra repositories if provided
    if (ctx.extraRepos && ctx.extraRepos.length > 0) {
      for (const repoSpec of ctx.extraRepos) {
        const { parseRepoSpec } = require('./utils');
        const repoInfo = parseRepoSpec(repoSpec);
        await cloneRepository(ctx.containerId, repoInfo, workdir, user);
      }
    }
    
    return ctx;
  },

  tools: async (ctx) => {
    // Tools are installed via file structure copied in files phase
    return ctx;
  },

  verify: async (ctx) => {
    const config = ctx.config;
    if (config['verify-fs'] && config['verify-fs'].required_files) {
      const env = config._environment || {};
      for (const file of config['verify-fs'].required_files) {
        const expandedFile = file.replace(/\$\{([^}]+)\}/g, (match, varName) => env[varName] || '');
        const result = await dockerExec(ctx.containerId, `test -e ${expandedFile} && echo "exists" || echo "missing"`, env.USER || 'root');
        if (result.trim() === 'missing') {
          throw new Error(`Required file not found: ${expandedFile}`);
        }
      }
    }
    return ctx;
  },

  test: async (ctx) => {
    const config = ctx.config;
    if (config.tests && Array.isArray(config.tests)) {
      const env = config._environment || {};
      const workdir = env.WORKDIR || '/workspace';
      for (const testScript of config.tests) {
        await dockerExec(ctx.containerId, `cd ${workdir} && bash ${testScript}`, env.USER || 'root');
      }
    }
    return ctx;
  },

  final: async (ctx) => {
    // Set ENTRYPOINT to ensure environment variables are available for main process
    // This will be applied when the final snapshot is created
    ctx.entrypointChange = 'ENTRYPOINT ["/entrypoint.sh"]';
    return ctx;
  }
};

/**
 * Apply lifecycle hooks wrapper to all phase handlers programmatically
 */
const PHASE_HANDLERS = {};
BUILD_PHASES.forEach(phase => {
  const coreHandler = CORE_PHASE_HANDLERS[phase.name];
  if (coreHandler) {
    PHASE_HANDLERS[phase.name] = withLifecycleHooks(phase.name, coreHandler);
  } else {
    throw new Error(`Missing phase handler for phase: ${phase.name}`);
  }
});

/**
 * Execute a specific build phase
 * 
 * @private
 * @param {string} phaseName - Name of the phase to execute
 * @param {Object} ctx - Pipeline context
 * @returns {Promise<Object>} - Updated context
 */
async function executePhase(phaseName, ctx) {
  const handler = PHASE_HANDLERS[phaseName];
  if (!handler) {
    throw new Error(`Unknown phase: ${phaseName}`);
  }
  return await handler(ctx);
}

/**
 * Run files for a specific lifecycle hook
 * 
 * @private
 * @param {string} containerId - Container ID
 * @param {Object} config - Coalesced configuration (system + shared + local)
 * @param {string} hook - Hook name ('files', 'before:phase', 'after:phase')
 * @param {string} defaultUser - Default user to run as
 * @param {string} workdir - Working directory
 */
async function runFilesForPhase(containerId, config, hook, defaultUser, workdir) {
  if (!config.files || !Array.isArray(config.files)) {
    return; // No files to process
  }
  
  // Filter files for this hook
  const hookFiles = config.files.filter(file => {
    if (hook === 'files') {
      // Default files phase - files with no before/after specified
      return !file.before && !file.after;
    } else {
      // Specific hook - files with matching before/after
      return file.before === hook.replace('before:', '') || 
             file.after === hook.replace('after:', '');
    }
  });
  
  if (hookFiles.length === 0) {
    return; // No files for this hook
  }
  
  console.log(`Copying ${hook} files...`);
  
  // Use copyConfigFiles to handle the file copying
  const { copyConfigFiles } = require('./image-lifecycle');
  
  // Create a temporary config with only the hookFiles
  const tempConfig = {
    ...config,
    files: hookFiles
  };
  
  await copyConfigFiles(containerId, tempConfig, defaultUser, workdir);
}

/**
 * Run scripts for a specific lifecycle hook
 * 
 * @private
 * @param {string} containerId - Container ID
 * @param {Object} config - Coalesced configuration (system + shared + local)
 * @param {string} hook - Hook name ('scripts', 'before:phase', 'after:phase')
 * @param {string} defaultUser - Default user to run as
 * @param {string} workdir - Working directory
 */
async function runScriptsForPhase(containerId, config, hook, defaultUser, workdir) {
  const scripts = config.scripts || [];
  
  // Filter scripts for this hook
  const hookScripts = scripts.filter(script => {
    if (hook === 'scripts') {
      // Default scripts phase - scripts with no before/after specified
      return !script.before && !script.after;
    } else {
      // Specific hook - scripts with matching before/after
      return script.before === hook.replace('before:', '') || 
             script.after === hook.replace('after:', '');
    }
  });
  
  if (hookScripts.length > 0) {console.log(`Running ${hook} scripts...`)};
  
  // Execute scripts in order
  for (const script of hookScripts) {
    const runAsUser = script.run_as || defaultUser;
    if (script.commands && Array.isArray(script.commands)) {
      for (const cmd of script.commands) {
        if (cmd && cmd.trim()) {
          console.log(`  [${runAsUser}] ${cmd.split('\n')[0]}...`);
          await dockerExec(containerId, cmd, runAsUser);
        }
      }
    }
  }
}



/**
 * Find phase index by name or ID
 * 
 * @private
 * @param {string|number} phase - Phase name or ID
 * @returns {number} - Phase index or -1 if not found
 */

module.exports = {
  createBuildPipeline,
  executePhase
};
