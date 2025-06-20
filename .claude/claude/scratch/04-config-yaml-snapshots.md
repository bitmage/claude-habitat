# Progressive Docker Build Snapshots Implementation Plan

## Goal
Eliminate Dockerfiles and implement intelligent, resumable builds with stage-by-stage snapshotting.

## What We're Changing

**Current Approach:**
- Monolithic Dockerfiles with all build steps
- Full rebuilds on any change
- No visibility into build progress
- `--rebuild` is binary (full rebuild or use cache)

**Target Approach:**
- All build logic in config.yaml with standard lifecycle phases
- Intermediate snapshots at each phase: `claude-habitat-discourse:3-repositories`
- Intelligent cache invalidation based on config changes
- Selective rebuilds: `--rebuild 3` or `--rebuild repositories`

## Standard Build Lifecycle

**File: `src/build-lifecycle.js`**

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

**Why this lifecycle:**
- **Dependency order**: phases are run in the order that subsequent commands need
    - **Setup before repos**: Ensures git/dependencies available for cloning
    - **Habitat creation**: Standard directory structure before file operations
- **String IDs**: Future-proof for inserting phases without renumbering

## Config.yaml Transformation

### Before: Dockerfile + config.yaml
```dockerfile
# habitats/discourse/Dockerfile
FROM discourse/discourse_dev:release
RUN npm install -g @anthropic-ai/claude-code
RUN apt update && apt install -y curl wget unzip
RUN mkdir -p /claude-habitat/shared/tools/bin
```

```yaml
# habitats/discourse/config.yaml
name: discourse
repositories:
  - url: https://github.com/discourse/discourse
    path: /discourse
```

### After: Pure config.yaml

No Dockerfile exists anymore, all operations are handled in config.yaml.

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

### Rebuild Targeting
```bash
# Rebuild from specific phase onward
./claude-habitat start discourse --rebuild 5           # From phase 5 (files)
./claude-habitat start discourse --rebuild files       # Same as above
./claude-habitat start discourse --rebuild repos       # From repos phase

./claude-habitat start discourse repos # Detect automatically what to rebuild
./claude-habitat start discourse --rebuild # Rebuild everything (what if an arg comes after this?  why aren't we using = sign for argument params?  the space is ambiguous, please refactor this)

# Show available phases
./claude-habitat start discourse --show-phases
# Outputs:
# 1: base - Set base image
# 2: users - Create users and set permissions
# 3: env - Set environment variables
# 4: workdir - Create project work directory
# 5: habitat - Create habitat directory structure
# 6: files - Copy files and mount volumes
# 7: setup - Install packages and run setup commands
# 8: repos - Clone repositories
# 9: tools - Install habitat tools
# 10: verify - Verify filesystem and permissions
# 11: test - Run habitat tests
# 12: final - Set final configuration and command
```

## Implementation Strategy

### Phase 1: Build Lifecycle Framework (2-3 hours)
1. **Create `src/build-lifecycle.js`** - Define standard phases and utilities
2. **Create `src/config-builder.js`** - Convert config.yaml build sections to Docker operations
3. **Update config validation** - Add schema for new build sections

### Phase 2: Snapshot Infrastructure (3-4 hours)
1. **Extend EventPipeline** - Add snapshot creation after each phase
2. **Implement cache detection** - Check for existing snapshots before building
3. **Add rebuild argument parsing** - Support `--rebuild <phase>`

### Phase 3: Config.yaml Migration (2-3 hours)
1. **Analyze existing Dockerfiles** - Extract logic from base, claude-habitat, discourse
2. **Transform to config.yaml format** - Manual conversion of 3 Dockerfiles to new schema
3. **Remove Dockerfile files** - Delete Dockerfiles and update references

### Phase 4: Intelligent Caching (2-3 hours)
1. **Image label hash system** - Store phase hashes in Docker image labels
2. **Selective invalidation** - Compare current config hashes with stored labels
3. **Cleanup utilities** - Remove orphaned snapshots

**Total Time Estimate: 9-13 hours**

## Examples

### User Experience with Snapshots
```bash
$ ./claude-habitat start discourse
🚀 Starting discourse build...
📋 Checking cached snapshots against current config...

✅ Phase 1-base: hash abc123 matches (using cache)
✅ Phase 2-users: hash def456 matches (using cache)
✅ Phase 3-env: hash 789abc matches (using cache)
❌ Phase 4-workdir: hash abc789 differs from stored def123 (config changed)

[50%] Copying files...
[50%] ✅ Copying files (0.5s) → discourse:5-files
[60%] Cloning repositories...
[60%] ✅ Cloning repositories (45s) → discourse:6-repositories
[70%] Running setup commands...
[70%] ✅ Running setup commands (2m 15s) → discourse:7-setup
[80%] Installing tools...
[80%] ✅ Installing tools (30s) → discourse:8-tools
[90%] Verifying filesystem...
[90%] ✅ Verifying filesystem (1s) → discourse:9-verify
[100%] Finalizing image...
[100%] ✅ Finalizing image (5s) → discourse:final-a7b2c3d4

✅ discourse ready in 3m 26s
```

We can build more granular logging options later... for now please support a `debug: true` flag in the config.yaml if the user wants to see full detailed output of the commands being run.  In normal (non-debug) operation, outputs should still be getting captured silently, and the full output of that phase should print in red if any error occurs while building that phase.

### Targeted Rebuild
```bash
$ ./claude-habitat start discourse --rebuild repos
🚀 Starting discourse build from phase 8 (repos)...
📋 Checking which snapshots to reuse...

✅ Phase 1-base through 7-setup: all hashes match (using cache)
🔄 Phase 8-repos: forced rebuild requested

✅ Using snapshot: discourse:7-setup
[80%] Cloning repositories...
[80%] ✅ Cloning repositories (45s) → discourse:8-repos
     Labels: base.hash=abc123, users.hash=def456, env.hash=789abc,
             workdir.hash=abc789, habitat.hash=def789, files.hash=789def,
             setup.hash=abc456, repos.hash=456def
[90%] Installing tools...
[90%] ✅ Installing tools (30s) → discourse:9-tools
[95%] Verifying filesystem...
[95%] ✅ Verifying filesystem (1s) → discourse:10-verify
[100%] Finalizing image...
[100%] ✅ Finalizing image (5s) → discourse:final-b8c3d4e5

✅ discourse ready in 1m 26s
```

## Benefits

### For Users
- **Faster iteration**: Only rebuild changed phases, not entire containers
- **Clear progress**: See exactly which phases are cached vs rebuilt
- **Selective rebuilds**: Target specific phases when debugging build issues
- **Consistent experience**: All habitats follow same build lifecycle

### For Developers
- **Simplified configuration**: Single config.yaml file instead of Dockerfile + config
- **Better caching**: Phase-level granularity instead of Docker layer caching
- **Easier debugging**: Know exactly which phase failed and restart from there
- **Standardized builds**: All habitats follow same pattern

### Technical
- **Intelligent caching**: Only rebuild what actually changed
- **Resumable builds**: Pick up from any phase after failures
- **Clean separation**: Each phase has clear inputs/outputs
- **Future extensibility**: Easy to add new phases or customize existing ones

## Migration Path

### Manual Config Migration
Since we only have 3 Dockerfiles (base, claude-habitat, discourse):
1. **Analyze each Dockerfile** - Extract FROM, RUN, ENV, COPY, CMD directives
2. **Map to config.yaml phases** - Transform Docker commands to appropriate build sections
3. **Test converted configs** - Ensure resulting containers work identically
4. **Remove Dockerfiles** - Delete files and update build references

### Breaking Change Approach
Since we're pre-alpha with no users:
1. **Convert all 3 configs** in single development session
2. **Remove all Dockerfiles** immediately
3. **Update build system** to use new config.yaml format
4. **Test all habitats** work with new approach

This provides a clean implementation without legacy support complexity.
