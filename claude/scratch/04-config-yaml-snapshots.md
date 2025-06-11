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
  { id: '1', name: 'base', description: 'Set base image' },
  { id: '2', name: 'users', description: 'Create users and set permissions' },
  { id: '3', name: 'env', description: 'Set environment variables' },
  { id: '4', name: 'habitat', description: 'Create habitat directory structure' },
  { id: '5', name: 'files', description: 'Copy files and mount volumes' },
  { id: '6', name: 'setup', description: 'Install packages and run setup commands' },
  { id: '7', name: 'repos', description: 'Clone repositories' },
  { id: '8', name: 'tools', description: 'Install habitat tools' },
  { id: '9', name: 'verify', description: 'Verify filesystem and permissions' },
  { id: '10', name: 'final', description: 'Set final configuration and command' }
];
```

**Why this lifecycle:**
- **Dependency order**: base → users → env → habitat → files → setup → repos → tools
- **Setup before repos**: Ensures git/dependencies available for cloning
- **Habitat creation**: Standard directory structure before file operations
- **Volume/file separation**: Different handling for mounts vs copies
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
```yaml
# habitats/discourse/config.yaml
name: discourse
description: Discourse development environment

build:
  base:
    image: discourse/discourse_dev:release
  
  users:
    - name: discourse
      uid: 1000
      groups: [sudo]
      shell: /bin/bash
  
  env:
    - DEBIAN_FRONTEND=noninteractive
    - PATH=/claude-habitat/shared/tools/bin:$PATH
  
  habitat:
    shared_dirs:
      - /claude-habitat/shared/tools/bin
    work_dir: /discourse
  
  files:
    volumes:
      - source: ./shared
        dest: /claude-habitat/shared
        readonly: true
    copies:
      - source: shared/gitconfig
        dest: /home/discourse/.gitconfig
        owner: discourse
  
  setup:
    packages:
      apt: [curl, wget, unzip]
      npm: 
        - name: "@anthropic-ai/claude-code"
          global: true
    commands:
      root:
        - git config --global --add safe.directory /discourse
      user: discourse
      scripts:
        - bundle install
        - yarn install
  
  repos:
    - url: https://github.com/discourse/discourse
      path: /discourse
      branch: main
      owner: discourse
  
  final:
    workdir: /discourse
    user: discourse
    command: ["/sbin/boot"]
```

## Snapshot Strategy

### Naming Convention
```
habitat-{habitat}:{phase-id}-{phase-name}
habitat-{habitat}:final-{content-hash}

Examples:
habitat-discourse:1-base
habitat-discourse:3-env  
habitat-discourse:7-repos
habitat-discourse:final-a7b2c3d4
```

### Cache Invalidation Logic
```javascript
// Detect which phase was modified and invalidate from that point forward
function detectInvalidatedPhases(oldConfig, newConfig) {
  const phases = BUILD_PHASES.map(p => p.name);
  
  for (const phase of phases) {
    if (!isEqual(oldConfig.build[phase], newConfig.build[phase])) {
      // Return this phase and all subsequent phases
      const phaseIndex = phases.indexOf(phase);
      return phases.slice(phaseIndex);
    }
  }
  
  return []; // No changes, use full cache
}

// Examples:
// Changed repositories section → rebuild from phase 6 (repositories) onward
// Changed packages section → rebuild from phase 2 (packages) onward  
// Only changed description → no rebuild needed
```

### Rebuild Targeting
```bash
# Rebuild from specific phase onward
./claude-habitat start discourse --rebuild 5           # From phase 5 (files)
./claude-habitat start discourse --rebuild files       # Same as above
./claude-habitat start discourse --rebuild repos       # From repos phase

# Show available phases
./claude-habitat start discourse --show-phases
# Outputs:
# 1: base - Set base image
# 2: users - Create users and set permissions  
# 3: env - Set environment variables
# 4: habitat - Create habitat directory structure
# 5: files - Copy files and mount volumes
# 6: setup - Install packages and run setup commands
# 7: repos - Clone repositories
# 8: tools - Install habitat tools
# 9: verify - Verify filesystem and permissions
# 10: final - Set final configuration and command
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
1. **Config change detection** - Hash config sections and detect changes
2. **Selective invalidation** - Rebuild only affected phases
3. **Cleanup utilities** - Remove orphaned snapshots

**Total Time Estimate: 9-13 hours**

## Examples

### User Experience with Snapshots
```bash
$ ./claude-habitat start discourse
🚀 Starting discourse build...
📋 Checking for cached snapshots...

✅ Found snapshot: 1-base (using cache)
✅ Found snapshot: 2-packages (using cache)  
✅ Found snapshot: 3-users (using cache)
❌ Missing snapshot: 4-directories (config changed)

[40%] Creating directories...
[40%] ✅ Creating directories (0.2s) → discourse:4-directories
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

### Targeted Rebuild
```bash
$ ./claude-habitat start discourse --rebuild repos
🚀 Starting discourse build from phase 7 (repos)...

✅ Using snapshot: discourse:6-setup
[70%] Cloning repositories...
[70%] ✅ Cloning repositories (45s) → discourse:7-repos  
[80%] Installing tools...
[80%] ✅ Installing tools (30s) → discourse:8-tools
[90%] Verifying filesystem...
[90%] ✅ Verifying filesystem (1s) → discourse:9-verify
[100%] Finalizing image...
[100%] ✅ Finalizing image (5s) → discourse:final-b8c3d4e5

✅ discourse ready in 3m 36s
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