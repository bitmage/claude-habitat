# Docker BuildKit Hybrid Implementation Plan

## Overview

Transform Claude Habitat's current docker exec/commit pipeline to use Docker BuildKit inline Dockerfiles while preserving our 12-phase structure, lifecycle hooks, and intelligent caching.

## Current vs Target Architecture

### Current System (docker exec/commit)
```javascript
// Phase execution via container operations
await dockerExec(containerId, `useradd -m ${user}`, 'root');
await dockerExec(containerId, `mkdir -p ${workdir}`, 'root');
await createSnapshot(containerId, `habitat-${name}:${phase}`);
```

### Target System (BuildKit inline)
```javascript
// Generate Dockerfile content for phase
const dockerfile = generatePhaseDockerfile(phase, config);
await execDockerBuild(['build', '--target', phase.name, '-t', snapshotTag], dockerfile);
```

## Implementation Strategy

### Phase 1: Parallel Implementation
- **Keep existing pipeline functional** - no breaking changes
- **Add new BuildKit generator** alongside current system
- **Feature flag control** - config option to choose build method
- **Comprehensive testing** comparing both approaches

### Phase 2: Dockerfile Generation Engine

Create `src/buildkit-generator.js` with these core functions:

```javascript
/**
 * Generate complete multi-stage Dockerfile from config
 */
async function generateHabitatDockerfile(config, phases) {
  const stages = [];
  
  for (const phase of phases) {
    const stageContent = await generatePhaseStage(phase, config);
    stages.push(stageContent);
  }
  
  return stages.join('\n\n');
}

/**
 * Generate single phase as Dockerfile stage
 */
async function generatePhaseStage(phase, config) {
  const { before, core, after } = await generatePhaseCommands(phase, config);
  
  return `
# Phase ${phase.id}: ${phase.name} - ${phase.description}
FROM ${getPreviousStageRef(phase)} AS ${phase.name}
${before}
${core}
${after}
`;
}
```

### Phase 3: Lifecycle Hook Integration

Map current lifecycle hooks to BuildKit stages:

```yaml
# Current config.yaml syntax (unchanged)
files:
  - src: ./system
    dest: ${SYSTEM_PATH}
    after: repos  # Lifecycle hook
    owner: ${USER}

scripts:
  - run_as: root
    before: env  # Lifecycle hook
    commands:
      - apt-get update && apt-get install -y git
```

```dockerfile
# Generated BuildKit equivalent
FROM repos AS pre-env
RUN apt-get update && apt-get install -y git

FROM pre-env AS env
ENV USER=node WORKDIR=/workspace
# ... core env phase logic

FROM env AS post-repos
COPY --chown=node:node ./system /workspace/system
```

### Phase 4: Template System

#### Static Templates (Build-time)
```dockerfile
# Simple variable substitution
ARG USER=node
ARG WORKDIR=/workspace
RUN mkdir -p ${WORKDIR} && chown ${USER}:${USER} ${WORKDIR}
```

#### Dynamic Discovery (Runtime preservation)
```dockerfile
# For cases requiring runtime discovery, use RUN with shell logic
RUN set -e; \
    DETECTED_GID=$(stat -c '%g' /var/run/docker.sock); \
    echo "export DOCKER_GROUP_GID=$DETECTED_GID" >> /etc/profile.d/habitat-env.sh; \
    groupadd -g $DETECTED_GID docker || true
```

### Phase 5: Build System Integration

Modify `src/build-lifecycle.js` to support dual modes:

```javascript
async function createBuildPipeline(habitatConfigPath, options = {}) {
  const { buildMethod = 'docker-exec' } = options; // 'docker-exec' | 'buildkit'
  
  if (buildMethod === 'buildkit') {
    return await createBuildKitPipeline(habitatConfigPath, options);
  } else {
    return await createDockerExecPipeline(habitatConfigPath, options); // current
  }
}

async function createBuildKitPipeline(habitatConfigPath, options) {
  // Generate full Dockerfile with all phases as stages
  const dockerfile = await generateHabitatDockerfile(config, BUILD_PHASES);
  
  // Create pipeline that builds specific target stages
  const pipeline = new EventPipeline(`buildkit-${habitatName}`);
  
  for (const phase of BUILD_PHASES) {
    pipeline.stage(`${phase.id}-${phase.name}`, async (ctx) => {
      return await buildPhaseWithBuildKit(phase, dockerfile, ctx);
    });
  }
  
  return pipeline;
}
```

## Preserving Key Features

### 1. Intelligent Caching
- **Current**: Phase hashes + Docker image labels
- **BuildKit**: Phase hashes + BuildKit layer cache + custom cache mounts

```dockerfile
# Use BuildKit cache mounts for better caching
FROM base AS repos
RUN --mount=type=cache,target=/var/cache/git \
    git clone ${repo_url} ${repo_path}
```

### 2. Selective Rebuilds (--rebuild-from)
- **Current**: Start from cached snapshot of previous phase
- **BuildKit**: Use `--target` to build from specific stage

```javascript
// Build from specific phase
await execDockerBuild([
  'build', 
  '--target', phase.name,
  '-t', snapshotTag
], dockerfile);
```

### 3. Phase Introspection (--show-phases)
- **Current**: List BUILD_PHASES array
- **BuildKit**: Parse generated Dockerfile stages + BUILD_PHASES metadata

### 4. Runtime Discovery Features
Preserve these cases that genuinely need runtime inspection:

```dockerfile
# Docker socket GID detection (genuine runtime discovery)
RUN set -e; \
    if [ -S /var/run/docker.sock ]; then \
      DETECTED_GID=$(stat -c '%g' /var/run/docker.sock); \
      groupadd -g $DETECTED_GID docker || true; \
      usermod -aG docker ${USER}; \
    fi

# User home directory detection
RUN set -e; \
    if [ "${USER}" != "root" ]; then \
      USER_HOME=$(getent passwd ${USER} | cut -d: -f6); \
      mkdir -p "${USER_HOME}/.config"; \
      chown -R ${USER}:${USER} "${USER_HOME}/.config"; \
    fi
```

## File Structure Changes

### New Files
```
src/
├── buildkit-generator.js          # Core Dockerfile generation
├── buildkit-pipeline.js           # BuildKit pipeline implementation  
├── buildkit-templates/             # Phase-specific Dockerfile templates
│   ├── base.dockerfile.template
│   ├── users.dockerfile.template
│   ├── env.dockerfile.template
│   └── ...
└── phase-mappers/                  # Config → Dockerfile converters
    ├── files-mapper.js
    ├── scripts-mapper.js
    └── repos-mapper.js
```

### Modified Files
```
src/
├── build-lifecycle.js             # Add buildMethod option
├── cli-parser.js                   # Add --build-method flag
└── phases.js                       # Add BuildKit metadata
```

## Migration Strategy

### Stage 1: Dual Implementation (Week 1-2)
- Implement BuildKit generator alongside current system
- Add `--build-method=buildkit` CLI flag
- Comprehensive test coverage comparing both methods
- Performance benchmarking

### Stage 2: Feature Parity (Week 3-4)
- Ensure all current features work with BuildKit
- Handle edge cases and runtime discovery
- Optimize BuildKit caching strategies
- Document migration guide

### Stage 3: Default Switch (Week 5)
- Make BuildKit default for new installations
- Provide migration path for existing snapshots
- Keep docker exec method as fallback option

### Stage 4: Cleanup (Week 6)
- Remove docker exec implementation after transition period
- Optimize for BuildKit-only architecture
- Update documentation and examples

## Questions & Clarifications Needed

### 1. Snapshot Compatibility
- **Question**: How do we handle existing docker exec snapshots when switching to BuildKit?
- **Options**: 
  - A) Migration script to rebuild with BuildKit
  - B) Dual support with automatic detection
  - C) Clean break requiring `--rebuild`

### 2. Runtime Discovery Cases
- **Question**: Which runtime discovery features are essential vs. could be made build-time static?
- **Current cases**:
  - Docker socket GID detection
  - User home directory expansion
  - Container state inspection for file copying
  - Dynamic repository branch selection

### 3. Performance Requirements
- **Question**: What's acceptable build time increase vs. benefit tradeoffs?
- **Considerations**:
  - BuildKit parallel layer builds vs. sequential exec
  - Layer cache effectiveness vs. snapshot cache
  - Network efficiency for repository operations

### 4. Backwards Compatibility
- **Question**: Support period for docker exec method?
- **Options**:
  - A) Immediate deprecation with migration tools
  - B) 6 month parallel support period  
  - C) Permanent dual support with config selection

### 5. Complex Config Mapping
- **Question**: How to handle advanced config features in static Dockerfiles?
- **Examples**:
  - Conditional file copying based on existence
  - Dynamic script selection based on runtime environment
  - Repository cloning with authentication token injection

## Success Metrics

### Performance Improvements
- [ ] **Build speed**: 20-50% faster through parallel layer builds
- [ ] **Cache efficiency**: Better layer invalidation vs. current snapshot approach
- [ ] **Disk usage**: Reduced through BuildKit's layer deduplication

### Functional Preservation
- [ ] **All current features work** with BuildKit implementation
- [ ] **Lifecycle hooks preserved** through multi-stage approach
- [ ] **Selective rebuild capability** maintained with `--target`
- [ ] **Phase introspection** available for debugging

### Developer Experience
- [ ] **Transparent migration** - existing configs work unchanged
- [ ] **Better debugging** - standard Dockerfile troubleshooting tools work
- [ ] **Industry standard** - uses Docker best practices and tooling

## Implementation Notes

This hybrid approach preserves our valuable phase-based architecture and lifecycle hook system while gaining BuildKit's performance and industry-standard benefits. The key insight is treating our phases as BuildKit multi-stage targets rather than trying to flatten them into a monolithic build process.

The gradual migration strategy allows us to validate the approach thoroughly before committing, ensuring we don't lose functionality that makes our current system powerful for development workflows.