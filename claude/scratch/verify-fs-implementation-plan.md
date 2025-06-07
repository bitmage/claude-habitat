# verify-fs Implementation Plan

## Current State Analysis

### What's Currently Implemented ✅
- Basic `verifyFilesystem()` function in `src/filesystem.js`
- CLI integration exists (`--verify-fs` flag in claude-habitat.js)
- Test menu integration exists ('f' option for "file system" in testing.js)
- verify-fs sections exist in some config files:
  - `system/config.yaml` - has verify-fs with core system tools
  - `habitats/claude-habitat/config.yaml` - has verify-fs with main project files
- Unit tests exist for filesystem verification in `test/unit/filesystem-verification.test.js`

### What's Missing ❌
1. **No bash script in system/tools** - Core requirement for container-based verification
2. **Not integrated into preflight checks** - Should check if container already built
3. **Not checked during container boot** - Should verify after container setup
4. **Not included in "run all tests" flows** - Missing from comprehensive test suites
5. **Shared config has no verify-fs section** - No verification of shared/user files
6. **npm script integration incomplete** - `test:habitat` should include verify-fs
7. **No system/shared/habitat scope handling** - Can't run verify-fs for specific scopes

## Implementation Plan

### Phase 1: Core Bash Script Implementation

#### 1.1 Create verify-fs bash script
**File**: `system/tools/bin/verify-fs`
- Should be executable and self-contained
- Read config.yaml files directly (yq available in container)
- Support scope arguments: `system`, `shared`, `habitat`, `all`
- Output TAP format for consistency with other tests
- Handle missing config files gracefully

**Usage Examples**:
```bash
# Within container
./habitat/system/tools/bin/verify-fs system
./habitat/system/tools/bin/verify-fs shared  
./habitat/system/tools/bin/verify-fs habitat
./habitat/system/tools/bin/verify-fs all
```

#### 1.2 Add verify-fs section to shared/config.yaml
**File**: `shared/config.yaml`
- Add verify-fs section for user/shared files
- Include git config, SSH keys (if present), user tools
- Example files to verify:
  - `~/.gitconfig` (copied from shared/gitconfig)
  - User-specific tools or config files

### Phase 2: Integration Points

#### 2.1 Preflight Check Integration
**File**: `claude-habitat.js` (runHabitat function)
- Add verify-fs check if prepared image already exists
- Run before starting container if image is cached
- Show verification results in preflight output
- Option to skip verification with flag

#### 2.2 Container Boot Integration  
**File**: `src/docker.js` (buildPreparedImage function)
- Add verify-fs check after setup commands complete
- Run verification before committing prepared image
- Fail image build if verification fails
- Log verification results during build

#### 2.3 Test Menu Integration Enhancement
**File**: `src/testing.js` (showHabitatTestMenu function)
- Current 'f' option runs verify-fs for habitat only
- Add sub-menu for verify-fs scope selection:
  - `[fs]` File system verification → submenu
    - `[s]` System verification only
    - `[h]` Shared/user verification only  
    - `[h]` Habitat verification only
    - `[a]` All verification scopes
    - `[b]` Back to main test menu

#### 2.4 "Run All Tests" Integration
**File**: `src/testing.js` (runHabitatTests function)
- Add verify-fs check to comprehensive test runs
- Include in `runAllTests()` function
- Add to individual habitat test runs
- Run after system/shared tests but before habitat-specific tests

### Phase 3: CLI and npm Script Integration

#### 3.1 Enhanced CLI Arguments
**File**: `claude-habitat.js` (argument parsing)
- Support `--verify-fs=scope` syntax:
  - `./claude-habitat test claude-habitat --verify-fs=system`
  - `./claude-habitat test claude-habitat --verify-fs=shared`
  - `./claude-habitat test claude-habitat --verify-fs=habitat`  
  - `./claude-habitat test claude-habitat --verify-fs=all`
  - `./claude-habitat test claude-habitat --verify-fs` (defaults to all)

#### 3.2 npm Script Updates
**File**: `package.json`
- Update `test:habitat` to include verify-fs:
  ```json
  "test:habitat": "./claude-habitat test base --system && ./claude-habitat test base --verify-fs"
  ```
- Add specific verify-fs scripts:
  ```json
  "test:verify-fs": "./claude-habitat test base --verify-fs",
  "test:verify-system": "./claude-habitat test base --verify-fs=system",
  "test:verify-shared": "./claude-habitat test base --verify-fs=shared"
  ```

### Phase 4: Implementation Details

#### 4.1 Bash Script Structure
**File**: `system/tools/bin/verify-fs`
```bash
#!/bin/bash
set -e

SCOPE="${1:-all}"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-/workspace}"
HABITAT_ROOT="$WORKSPACE_ROOT/habitat"

# TAP format output
echo "TAP version 13"

case "$SCOPE" in
  "system"|"all")
    verify_system_files
    ;;
  "shared"|"all") 
    verify_shared_files
    ;;
  "habitat"|"all")
    verify_habitat_files
    ;;
  *)
    echo "not ok 1 - Invalid scope: $SCOPE"
    exit 1
    ;;
esac
```

#### 4.2 Config File Reading Strategy
- Use `yq` to parse YAML files (already available in container)
- Read from standard locations:
  - System: `$HABITAT_ROOT/system/config.yaml`
  - Shared: `$HABITAT_ROOT/shared/config.yaml`  
  - Habitat: `$HABITAT_ROOT/local/config.yaml` (or detect habitat name)
- Handle missing files gracefully (skip verification for that scope)

#### 4.3 Error Handling and Output
- Use TAP format for consistency with other tests
- Provide clear success/failure messages
- Include file path in error messages
- Support verbose mode for debugging
- Exit with appropriate codes (0=success, 1=failure)

### Phase 5: Testing and Documentation

#### 5.1 Unit Tests Enhancement
**File**: `test/unit/filesystem-verification.test.js`
- Add tests for new bash script integration
- Test scope parameter handling
- Test config file reading logic
- Mock container environment for testing

#### 5.2 E2E Tests
- Add e2e tests that build containers and run verify-fs
- Test all scopes (system, shared, habitat, all)
- Test integration with habitat test flows
- Test preflight check integration

#### 5.3 Documentation Updates
**Files**: `docs/USAGE.md`, `README.md`
- Document new verify-fs commands and options
- Update test workflow documentation
- Add troubleshooting section for verification failures
- Document how to add custom verify-fs checks

## Implementation Order

1. **Create bash script** (`system/tools/bin/verify-fs`) - Core functionality
2. **Add shared config section** - Complete config coverage
3. **Integrate into test flows** - Make it part of standard testing
4. **Add preflight checks** - Optimize user experience  
5. **Enhance CLI arguments** - Improve usability
6. **Update npm scripts** - Complete integration
7. **Add comprehensive tests** - Ensure reliability
8. **Update documentation** - Support users

## Success Criteria

- ✅ `./claude-habitat test claude-habitat --verify-fs` works from host
- ✅ Verify-fs runs for all scopes (system, shared, habitat)
- ✅ Integrated into preflight checks when container exists
- ✅ Runs automatically during container boot/build
- ✅ Available in interactive test menu with scope selection
- ✅ Included in "run all tests" workflows
- ✅ npm scripts include verify-fs in habitat testing
- ✅ TAP format output consistent with other tests
- ✅ Comprehensive test coverage for new functionality

## Dependencies

- `yq` tool (already available in containers)
- `jq` tool (already available in containers) 
- TAP format knowledge (already used in other tests)
- Existing config.yaml structure (already defined)
- Container file system layout (already established)

## Risk Mitigation

- **Config file parsing errors**: Graceful handling of malformed YAML
- **Missing files**: Clear messaging, don't fail entire verification
- **Performance impact**: Quick checks, parallel where possible
- **Backward compatibility**: All changes should be additive
- **Testing complexity**: Start with simple cases, build up complexity