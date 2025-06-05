# Claude Habitat Refactoring Plan

## Problem Statement
`claude-habitat.js` has grown to 2200+ lines, making it difficult to maintain and understand. The file contains:
- Embedded bash scripts
- Docker operations
- File operations
- Authentication logic
- Menu/CLI code
- Initialization routines
- Habitat management

## Refactoring Goals
1. **Single Responsibility**: Each module handles one domain
2. **DRY (Don't Repeat Yourself)**: Extract common patterns into reusable functions
3. **Testability**: Pure functions where possible
4. **Clear Interfaces**: Well-defined module exports
5. **Separation of Concerns**: Business logic vs I/O operations

## Proposed Structure

### Final Target Structure
```
claude-habitat.js (< 300 lines - just orchestration)
src/
├── docker.js         (enhanced ~400 lines)
├── habitat.js        (~300 lines)
├── file-operations.js (~200 lines)
├── github-auth.js    (~350 lines)
├── menu.js          (~250 lines)
├── init.js          (~200 lines)
├── cli.js           (existing, enhanced)
├── config.js        (existing)
├── utils.js         (existing)
├── scripts/         (bash scripts ~100 lines each)
│   ├── git-auth-setup.sh
│   ├── clone-repository.sh
│   └── test-github-token.sh
└── templates/       (config templates)
    ├── ssh-config
    └── git-config
```

## Execution Plan

### Phase 1: Extract Bash Scripts
**Goal**: Move embedded bash scripts to separate files

**Files to create**:
- `src/scripts/git-auth-setup.sh` - Git credential configuration
- `src/scripts/clone-repository.sh` - Repository cloning logic
- `src/scripts/test-github-token.sh` - Token verification script

**Benefits**:
- Syntax highlighting for bash
- Easier to test and debug
- Can be run independently

### Phase 2: Extract File Operations
**Goal**: Consolidate all file copying/moving operations

**New module**: `src/file-operations.js`
```javascript
module.exports = {
  findFilesToCopy,
  copyFilesDirectory, 
  copyFileToContainer,
  copySystemFiles,
  copySharedFiles,
  copyHabitatFiles
};
```

**Patterns to extract**:
- Repeated file copying logic
- Directory traversal
- Permission handling
- Container file operations

### Phase 3: Enhance Docker Module
**Goal**: Move all Docker operations to `src/docker.js`

**Functions to move**:
- `buildBaseImage()`
- `buildPreparedImage()`
- `runContainer()`
- `cloneRepository()`
- `runSetupCommands()`

**Current `docker.js` has**:
- `dockerRun()`
- `dockerExec()`
- `dockerImageExists()`
- `dockerIsRunning()`

### Phase 4: Extract GitHub Authentication
**Goal**: Separate authentication concerns

**New module**: `src/github-auth.js`
```javascript
module.exports = {
  checkAuthenticationStatus,
  generateGitHubTokenAutomatically,
  ensureGitHubAuthentication,
  manualTokenSetupInstructions,
  testRepositoryAccess
};
```

**Includes**:
- OAuth device flow
- Token management
- Repository access testing
- Authentication status checking

### Phase 5: Extract Menu System
**Goal**: Separate UI/interaction logic

**New module**: `src/menu.js`
```javascript
module.exports = {
  showMainMenu,
  showHabitatMenu,
  handleMenuChoice,
  generateMenuKey,
  parseMenuChoice
};
```

**Features**:
- Tilde key system
- Interactive selection
- Menu generation
- Choice parsing

### Phase 6: Extract Habitat Operations
**Goal**: Core habitat business logic

**New module**: `src/habitat.js`
```javascript
module.exports = {
  runHabitat,
  buildHabitatImage,
  setupHabitatEnvironment,
  getLastUsedConfig,
  saveLastUsedConfig
};
```

### Phase 7: Extract Initialization
**Goal**: Separate setup/initialization logic

**New module**: `src/init.js`
```javascript
module.exports = {
  runInitialization,
  checkInitializationStatus,
  setupGitHubApp,
  setupGitHubToken
};
```

### Phase 8: Update Main File
**Goal**: Orchestration only

`claude-habitat.js` becomes:
```javascript
// Imports
const { runHabitat } = require('./src/habitat');
const { showMainMenu } = require('./src/menu');
const { runInitialization } = require('./src/init');
// etc...

// Main orchestration
async function main() {
  const args = parseArgs();
  
  if (args.help) {
    showHelp();
  } else if (args.init) {
    await runInitialization();
  } else if (args.configPath) {
    await runHabitat(args.configPath);
  } else {
    await showMainMenu();
  }
}
```

## Implementation Strategy

### Order of Execution
1. **Start with Scripts** - Extract bash scripts first (easiest, lowest risk)
2. **File Operations** - Extract file copying/moving patterns
3. **Docker Operations** - Move Docker-specific functions
4. **Authentication** - Extract GitHub auth logic
5. **Menu System** - Extract CLI/menu code
6. **Habitat Logic** - Extract core habitat operations
7. **Wire It Up** - Update main file to use new modules
8. **Test Everything** - Ensure all functionality still works

### Testing Strategy
- Unit test each new module
- Integration test the full flow
- Verify bash scripts work independently
- Test menu navigation
- Test authentication flow
- Test habitat creation and running

### Rollback Plan
- Keep original `claude-habitat.js` as backup
- Test each phase before proceeding
- Use git branches for each phase
- Ensure CI/CD passes at each step

## Success Metrics
- [ ] Main file < 300 lines
- [ ] No file > 400 lines
- [ ] All tests passing
- [ ] Improved code coverage
- [ ] Faster test execution
- [ ] Easier to understand and modify
- [ ] Clear separation of concerns

## Risks and Mitigations
1. **Risk**: Breaking existing functionality
   - **Mitigation**: Comprehensive testing at each phase
   
2. **Risk**: Import/export complexity
   - **Mitigation**: Clear module interfaces
   
3. **Risk**: Performance regression
   - **Mitigation**: Profile before and after

## Timeline Estimate
- Phase 1-2: 1 hour (low complexity)
- Phase 3-4: 2 hours (medium complexity)
- Phase 5-7: 2 hours (medium complexity)
- Phase 8 & Testing: 1 hour
- **Total**: ~6 hours of focused work