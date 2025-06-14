# Combined Event-Driven Architecture & Progressive Snapshots Plan

## Overview

This plan combines the 03-event-driven-architecture.md with progressive snapshot functionality, creating a complete phase-based build system. The migration of Dockerfiles to the new system described in 04-config-yaml-snapshots.md becomes a separate, simpler task.

## Phase Division

**Phase 03: Complete Infrastructure**
- Event-driven phase system with RxJS
- Progressive snapshot creation after each phase
- Support for both Dockerfile and config.yaml builds
- Full snapshotting from day one

**Phase 04: Migration Only**
- Convert existing Dockerfiles to config.yaml format
- Remove Dockerfile support once migration complete

## Implementation Plan for Phase 03

### Core Architecture

**Phase 0: Dockerfile Build (if present)**
```javascript
// Special phase that only runs if Dockerfile exists
{ id: '0', name: 'dockerfile', description: 'Build Dockerfile' }, # run_as: root
```

**Standard 12 Phases (always run):**
```javascript
// Standard phases for all habitat builds
const BUILD_PHASES = [
  { id: '1', name: 'base', description: 'Set base image' }, # run_as: root
  { id: '2', name: 'users', description: 'Create users and set permissions' }, # run_as: root
  { id: '3', name: 'env', description: 'Set environment variables' }, # run_as: root, $USER
  { id: '4', name: 'workdir', description: 'Create project work directory' }, # run_as: $USER
  { id: '5', name: 'habitat', description: 'Create habitat directory structure' }, # run_as: $USER
  { id: '6', name: 'files', description: 'Copy files and mount volumes' }, # run_as: $USER (default), root (if instructed)
  { id: '7', name: 'setup', description: 'Install packages and run setup commands' }, # run_as: root or $USER, as instructed
  { id: '8', name: 'repos', description: 'Clone repositories' }, # run_as: $USER
  { id: '9', name: 'tools', description: 'Install habitat tools' }, # run_as: $USER
  { id: '10', name: 'verify', description: 'Verify filesystem and permissions' }, # run_as: root (read only) # no layer generated
  { id: '11', name: 'test', description: 'Run habitat tests' }, # run_as: $USER # no layer generated
  { id: '12', name: 'final', description: 'Set final configuration and command' } # run_as: $USER
];
```

### Snapshot Integration

Each phase automatically creates a snapshot:

```javascript
class EventPipeline {
  stage(name, handler, options = {}) {
    const wrappedHandler = async (ctx) => {
      // Run the actual phase
      const result = await handler(ctx);
      
      // Create snapshot (unless disabled)
      if (!options.noSnapshot) {
        const snapshotTag = `habitat-${ctx.config.name}:${name}`;
        await createSnapshot(ctx.containerId, snapshotTag, {
          labels: ctx.phaseHashes
        });
      }
      
      return result;
    };
    
    return this.addStage(name, wrappedHandler, options);
  }
}
```

### Cache Detection

Before running any phase, check if valid snapshot exists:

```javascript
async function findValidSnapshot(config, targetPhase) {
  const phases = BUILD_PHASES.slice(0, targetPhase.index + 1);
  
  for (const phase of phases.reverse()) {
    const snapshotTag = `habitat-${config.name}:${phase.id}-${phase.name}`;
    const image = await getImageWithLabels(snapshotTag);
    
    if (image && validatePhaseHashes(image.labels, currentHashes, phase)) {
      return { image, startPhase: phase.index + 1 };
    }
  }
  
  return null;
}
```

### Modified prepareWorkspace

The existing `prepareWorkspace` function becomes the implementation for phases 5-9:
- Phase 5 (habitat): Create directory structure
- Phase 6 (files): Copy files
- Phase 7 (setup): Run setup commands
- Phase 8 (repos): Clone repositories
- Phase 9 (tools): Install tools

Each section becomes its own phase with a snapshot.

### User Experience

```bash
$ ./claude-habitat start discourse
🚀 Starting discourse build...
📋 Checking for existing snapshots...

✅ Using snapshot: discourse:4-workdir (phases 0-4 cached)

[50%] Creating habitat directories...
[50%] ✅ habitat (0.1s) → snapshot: discourse:5-habitat
[58%] Copying files...
[58%] ✅ files (0.5s) → snapshot: discourse:6-files
[66%] Running setup commands...
[66%] ✅ setup (2m 15s) → snapshot: discourse:7-setup
[75%] Cloning repositories...
[75%] ✅ repos (45s) → snapshot: discourse:8-repos
[83%] Installing tools...
[83%] ✅ tools (30s) → snapshot: discourse:9-tools
[91%] Verifying filesystem...
[91%] ✅ verify (1s)
[95%] Running tests...
[95%] ✅ test (5s)
[100%] Finalizing...
[100%] ✅ final (0.1s) → snapshot: discourse:12-final

✅ discourse ready in 3m 36s (phases 0-4 from cache)
```

### After: New config.yaml format

The Dockerfile is no longer necessary, but if it's present then `base_image` is optional.

```yaml
# habitats/discourse/config.yaml
name: discourse
description: Discourse development environment
base_image: discourse/discourse_dev:release

# same, no change
env:
  - PATH=/claude-habitat/shared/tools/bin:$PATH

  # $WORKDIR folder automatically created, owned by $USER
  - WORKDIR=/workspace

  # habitat gets constructed at these locations
  - HABITAT_PATH=${WORKDIR}/habitat
  - SYSTEM_PATH=${HABITAT_PATH}/system
  - SHARED_PATH=${HABITAT_PATH}/shared
  - LOCAL_PATH=${HABITAT_PATH}/local

  # $USER automatically created, workspace created with this ownership, other build steps will run as this user
  - USER=node

# same, no change
files:
  - source: shared/gitconfig
    dest: /home/discourse/.gitconfig
    owner: discourse

# same, no change
volumes:
  - source: ./shared
    dest: /claude-habitat/shared
    readonly: true

# same, no change, but commands previously in Dockerfile get migrated here
setup:
  root:
    - |
    npm install -g @anthropic-ai/claude-code
    apt update && apt install -y curl wget unzip
    mkdir -p /claude-habitat/shared/tools/bin

# renamed from `repositories`, same functionality
repos:
  - url: https://github.com/discourse/discourse
    path: /discourse
    branch: main
    owner: discourse

# tools are defined within file structure, no change

# no change
verify-fs:
  required_files:
    # Main claude-habitat source files at repository root
    - "${WORKDIR}/.git/config"
    - "${WORKDIR}/CLAUDE.md"
    - "${WORKDIR}/README.md"

# no change
tests:
  - tests/test-discourse-setup.sh

# merged from `container` and `claude`
entry:
  init_command: /sbin/boot
  startup_delay: 10
  command: claude --dangerously-skip-permissions
```
## Snapshot Strategy

### Naming Convention
```
habitat-{habitat}:{phase-id}-{phase-name}
habitat-{habitat}:final

Examples:
habitat-discourse:1-base
habitat-discourse:3-env
habitat-discourse:8-repos
habitat-discourse:final

Each snapshot includes Docker labels:
--label base.hash=abc123def456
--label users.hash=def456abc123
--label env.hash=456789abc123
--label repos.hash=789abc123def
--label final.hash=2309y234hlo2
```

### Cache Invalidation Logic

**Image Labeling Strategy:**
- Each snapshot has labels for its own phase hash and all previous phase hashes
- Cache validity determined by comparing current config hashes with image labels
- No need to store separate state files or compare full configs

PSEUDOCODE FOR COMPARISON ALGORITHM

```pseudocode
  obj = a javascript object from the relevant subset of the coalesced (system, shared, local) yaml file
  hash = JSON.stringify(obj) (no spaces or endlines, maximum compaction), and run a hash function on it
  tag = <phase>.hash = <hash>
```

```
// Examples:
// Changed repos section → repo hash differs → rebuild from repos phase onward
// Changed env section → env hash differs → rebuild from env phase onward
// Only changed description → no phase data affected → use full cache
```

## Implementation Steps

### Step 1: Create Event Pipeline Framework (2 hours)
- `src/event-pipeline.js` - RxJS-based pipeline with progress
- `src/progress-ui.js` - Progress bar implementation
- Unit tests for pipeline

### Step 2: Create Snapshot Infrastructure (2 hours)
- `src/snapshot-manager.js` - Docker snapshot creation/detection
- `src/phase-hash.js` - Hash calculation for cache invalidation
- Label management utilities

### Step 3: Implement 12-Phase System (3 hours)
- `src/build-lifecycle.js` - Phase definitions and handlers
- Refactor existing functions into phase handlers
- Phase 0 for Dockerfile support

### Step 4: Integration and Testing (2 hours)
- Update `src/habitat.js` to use new pipeline
- Test with existing Dockerfile-based habitats
- Test with new config.yaml format
- Verify snapshots work correctly

**Total: ~9 hours**

## Benefits of Combined Approach

1. **Immediate value** - Snapshots work from first implementation
2. **Reduced development time** - Test snapshots while building
3. **Clean architecture** - Infrastructure separate from migration
4. **Progressive enhancement** - Dockerfiles continue working
5. **Better testing** - Can test snapshot functionality before migration

## Notes for Phase 04

Once phase 03 is complete and tested, phase 04 becomes straightforward:

1. Manually convert 3 Dockerfiles to config.yaml format
2. Test each conversion thoroughly
3. Remove Dockerfile support code
4. Update documentation

This is now just a content migration task rather than infrastructure work.
