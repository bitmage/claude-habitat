# Dynamic Container Paths Implementation Plan

## Problem Statement

You're absolutely right to be confused. When I said "Fixed container file paths from /src to /workspace" and listed code changes in `src/docker.js`, `src/testing.js`, etc., that indicates a **fundamental design flaw**. 

**The Issue**: We have hard-coded container paths scattered throughout the JavaScript code instead of reading them dynamically from the YAML configuration files.

**What Should Happen**: All container paths should be read from `config.yaml` files, and the JavaScript code should be path-agnostic.

## Current State Analysis

### Hard-Coded Paths Found ❌

#### In `src/docker.js`:
```javascript
// Line 192: Hard-coded default
async function cloneRepository(container, repoInfo, workDir = '/workspace') {

// Line 291: Hard-coded default  
const workDir = config.container?.work_dir || '/workspace';
```

#### In `src/testing.js`:
```javascript  
// Line 367: Hard-coded default
const workDir = habitatConfig.container?.work_dir || '/workspace';
```

#### In `claude-habitat.js`:
```javascript
// Line 84: Hard-coded default
const workDir = config.container?.work_dir || '/workspace';
```

### Configuration-Driven Paths ✅

#### In config files (correct approach):
```yaml
# habitats/claude-habitat/config.yaml
container:
  work_dir: /workspace
  
# habitats/discourse/config.yaml  
container:
  work_dir: /src
```

## Root Cause Analysis

The problem occurred because:

1. **JavaScript code contains fallback defaults** instead of requiring config values
2. **Defaults were hard-coded as `/src`** in multiple places
3. **When changing claude-habitat config**, we changed the defaults instead of removing them
4. **No validation** ensures config files specify required paths

## Implementation Plan

### Phase 1: Remove Hard-Coded Defaults

#### 1.1 Make work_dir Required in Config
**Files**: All habitat `config.yaml` files
- **Principle**: Every habitat MUST specify its work_dir explicitly
- **Validation**: Code should fail fast if work_dir is missing
- **No defaults**: JavaScript code should never assume a work directory

**Example**:
```yaml
# habitats/base/config.yaml
container:
  work_dir: /workspace  # REQUIRED - no fallback

# habitats/discourse/config.yaml  
container:
  work_dir: /src       # REQUIRED - explicitly chosen

# habitats/claude-habitat/config.yaml
container:
  work_dir: /workspace # REQUIRED - explicitly chosen
```

#### 1.2 Remove JavaScript Fallbacks
**Files**: `src/docker.js`, `src/testing.js`, `claude-habitat.js`

**Before (problematic)**:
```javascript
const workDir = config.container?.work_dir || '/workspace';
```

**After (correct)**:
```javascript
const workDir = config.container?.work_dir;
if (!workDir) {
  throw new Error(`Missing required config: container.work_dir in ${config.name}`);
}
```

### Phase 2: Configuration Validation

#### 2.1 Create Config Schema Validation
**File**: `src/config-validation.js`
```javascript
const REQUIRED_CONTAINER_FIELDS = [
  'work_dir',
  'user',
  'init_command'
];

function validateHabitatConfig(config) {
  // Validate container section exists
  if (!config.container) {
    throw new Error(`Missing required section: container in ${config.name}`);
  }
  
  // Validate required container fields
  for (const field of REQUIRED_CONTAINER_FIELDS) {
    if (!config.container[field]) {
      throw new Error(`Missing required config: container.${field} in ${config.name}`);
    }
  }
  
  // Validate work_dir is absolute path
  if (!config.container.work_dir.startsWith('/')) {
    throw new Error(`container.work_dir must be absolute path in ${config.name}`);
  }
  
  return true;
}
```

#### 2.2 Integrate Validation into Config Loading
**File**: `src/config.js`
```javascript
async function loadConfig(configPath) {
  // ... existing YAML loading logic ...
  
  // Add validation
  validateHabitatConfig(config);
  
  return config;
}
```

### Phase 3: Dynamic Path Usage Throughout Codebase

#### 3.1 Repository Cloning Path Handling
**File**: `src/docker.js`

**Current Issue**:
```javascript
// Hard-coded default parameter
async function cloneRepository(container, repoInfo, workDir = '/workspace') {
```

**Fix**:
```javascript
// Work dir must be passed explicitly, no defaults
async function cloneRepository(container, repoInfo, workDir) {
  if (!workDir) {
    throw new Error('workDir parameter is required for cloneRepository');
  }
  // ... rest of function uses workDir dynamically
}

// All callers must pass workDir from config:
await cloneRepository(tempContainer, repo, config.container.work_dir);
```

#### 3.2 Test Execution Path Handling
**File**: `src/testing.js`

**Current Issue**:
```javascript
const workDir = habitatConfig.container?.work_dir || '/workspace';
```

**Fix**:
```javascript
const workDir = habitatConfig.container.work_dir;
// No fallback - config validation ensures this exists
```

#### 3.3 Container Runtime Path Handling
**File**: `claude-habitat.js`

**Current Issue**:
```javascript
const workDir = config.container?.work_dir || '/workspace';
```

**Fix**:
```javascript
const workDir = config.container.work_dir;
// No fallback - config validation ensures this exists
```

### Phase 4: Path Standardization Strategy

#### 4.1 Define Path Conventions
**File**: `docs/CONFIGURATION.md`
```markdown
## Container Path Conventions

### Standard Layouts

**Development Habitat** (claude-habitat, custom projects):
```yaml
container:
  work_dir: /workspace
```
- Source code: `/workspace`
- Claude Habitat infrastructure: `/workspace/habitat/`

**Framework Habitat** (discourse, rails, etc):
```yaml
container:
  work_dir: /src  
```
- Application code: `/src`
- Claude Habitat infrastructure: `/src/habitat/`

### Path Requirements
- `work_dir` MUST be absolute path
- `work_dir` MUST be specified in every habitat config
- Infrastructure paths are always relative to `work_dir`
```

#### 4.2 Update Existing Configs for Consistency
**Files**: All `habitats/*/config.yaml`

Ensure every habitat has explicit, sensible work_dir:
```yaml
# habitats/base/config.yaml
container:
  work_dir: /workspace  # Simple base environment

# habitats/claude-habitat/config.yaml  
container:
  work_dir: /workspace  # Development workspace

# habitats/discourse/config.yaml
container:
  work_dir: /src        # Rails convention
```

### Phase 5: Infrastructure Path Handling

#### 5.1 Habitat Infrastructure Paths
**Current**: Hard-coded assumptions about habitat/ directory location
**Fix**: All habitat infrastructure paths relative to work_dir

```javascript
// Instead of hard-coding paths:
const systemDir = `${workDir}/habitat/system`;
const sharedDir = `${workDir}/habitat/shared`;
const localDir = `${workDir}/habitat/local`;

// Use a helper function:
function getHabitatInfrastructurePath(workDir, component) {
  return path.join(workDir, 'habitat', component);
}

const systemDir = getHabitatInfrastructurePath(workDir, 'system');
const sharedDir = getHabitatInfrastructurePath(workDir, 'shared');
const localDir = getHabitatInfrastructurePath(workDir, 'local');
```

#### 5.2 Repository Clone Path Handling
**Current**: Complex logic for handling same-directory cloning
**Fix**: Use config-specified repository paths relative to work_dir

```yaml
# habitats/claude-habitat/config.yaml
repositories:
  - url: https://github.com/bitmage/claude-habitat
    path: /workspace          # Absolute path specified
    branch: main

# habitats/discourse/config.yaml  
repositories:
  - url: https://github.com/discourse/discourse
    path: /src               # Different absolute path
    branch: main
```

### Phase 6: Testing and Validation

#### 6.1 Config Validation Tests
**File**: `test/unit/config-validation.test.js`
```javascript
test('config validation catches missing work_dir', () => {
  const invalidConfig = { name: 'test', container: {} };
  assert.throws(() => validateHabitatConfig(invalidConfig));
});

test('config validation catches relative work_dir', () => {
  const invalidConfig = { 
    name: 'test', 
    container: { work_dir: 'workspace' }  // Missing leading /
  };
  assert.throws(() => validateHabitatConfig(invalidConfig));
});
```

#### 6.2 Path Handling Tests
**File**: `test/unit/dynamic-paths.test.js`
```javascript
test('cloneRepository requires workDir parameter', async () => {
  await assert.rejects(
    () => cloneRepository('container', {}, undefined),
    /workDir parameter is required/
  );
});

test('all functions read paths from config dynamically', () => {
  // Test that changing config work_dir affects all operations
  // No hard-coded path assumptions
});
```

## Implementation Order

1. **Add config validation** - Prevent invalid configurations
2. **Update all habitat configs** - Ensure explicit work_dir everywhere  
3. **Remove JavaScript fallbacks** - Force config-driven paths
4. **Update function signatures** - Remove default parameters
5. **Add path helper functions** - Centralize path logic
6. **Update all callers** - Pass paths from config explicitly
7. **Add comprehensive tests** - Validate dynamic behavior
8. **Update documentation** - Document new path conventions

## Success Criteria

- ✅ No hard-coded paths in JavaScript code
- ✅ All paths read dynamically from config.yaml files
- ✅ Config validation prevents missing path configuration
- ✅ Can change container layout by editing config only
- ✅ Different habitats can use different work_dir layouts
- ✅ Infrastructure paths adapt to any work_dir configuration
- ✅ Repository cloning works regardless of target directory structure

## Benefits of This Approach

1. **True configuration-driven design** - Change behavior via config files
2. **Habitat flexibility** - Each habitat can choose optimal layout
3. **No JavaScript changes** for path modifications
4. **Easier testing** - Mock different path configurations easily
5. **Better error messages** - Fail fast on configuration problems
6. **Documentation clarity** - Path conventions explicit in configs

## Risk Mitigation

- **Breaking changes**: Phased rollout with validation first
- **Config complexity**: Good defaults documented, validation catches errors
- **Path confusion**: Clear documentation and helpful error messages  
- **Test coverage**: Comprehensive tests for all path scenarios
- **Migration effort**: Automated validation to catch issues early

The fundamental principle: **JavaScript code should be path-agnostic and read all paths from configuration files.**