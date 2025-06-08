# Habitat Environment Setup Fixes - Execution Plan

## Problem Summary
Claude in habitat can't find tools (gh, git config) that exist but aren't accessible due to:
1. Tools not in PATH
2. Git config not applied in bypass mode
3. Tests verify file existence but not functionality 
4. 1-minute startup delay possibly due to auth timeouts

## Solution Architecture

### 1. Enhanced PATH Management via Environment Variables

**Approach**: Use existing environment variable system to build PATH incrementally

**Implementation**:
```yaml
# system/config.yaml
environment:
  - SYSTEM_TOOLS_PATH=${SYSTEM_PATH}/tools/bin
  - PATH=${PATH}:${SYSTEM_TOOLS_PATH}

# shared/config.yaml  
environment:
  - SHARED_TOOLS_PATH=${SHARED_PATH}/tools/bin
  - PATH=${PATH}:${SHARED_TOOLS_PATH}

# habitats/*/config.yaml
environment:
  - LOCAL_TOOLS_PATH=${LOCAL_PATH}/tools/bin
  - PATH=${PATH}:${LOCAL_TOOLS_PATH}
```

### 2. Relative Path Support for Files

**Approach**: Support relative paths from config location (../../shared/gitconfig)

**Benefits**: 
- Transparent (no @ jargon)
- Reusable across configs
- Clear path relationships

**Implementation**: Enhance file operations to resolve relative paths from config directory

### 3. Centralized Git Config Installation

**Create system script**: `system/tools/bin/install-gitconfig`
```bash
#!/bin/bash
# Install gitconfig from shared directory with proper user context
if [ -f "${SHARED_PATH}/gitconfig" ]; then
  cp "${SHARED_PATH}/gitconfig" ~/.gitconfig
  chmod 644 ~/.gitconfig
  echo "Git configuration applied for user: $(whoami)"
else
  echo "Warning: No gitconfig found at ${SHARED_PATH}/gitconfig"
fi
```

**Usage in configs**:
```yaml
# shared/config.yaml
setup:
  user:
    commands:
      - "${SYSTEM_PATH}/tools/bin/install-gitconfig"

# habitats/claude-habitat/config.yaml  
setup:
  user:
    commands:
      - "${SYSTEM_PATH}/tools/bin/install-gitconfig"
```

### 4. Enhanced Functional Testing

**Upgrade shared/tests/test-user-config.sh**:
- Test private repo access (shallow clone)
- Test gh CLI functionality (gh repo list)
- Test git config applied correctly
- Test PATH includes system tools

### 5. File Path Resolution Enhancement

**Update file operations** to support relative paths from config location:
```yaml
files:
  - src: ../../shared/gitconfig  # Relative to config file location
    dest: /etc/gitconfig
    mode: 644
```

## Implementation Order

### Phase 1: PATH Management
1. Add PATH environment variables to system/shared/habitat configs
2. Test that tools become accessible

### Phase 2: Relative File Paths  
1. Enhance file operation processing to resolve relative paths
2. Update configs to use relative paths for shared resources

### Phase 3: Centralized Git Config
1. Create system/tools/bin/install-gitconfig script
2. Update shared/config.yaml to use script
3. Update habitats/claude-habitat/config.yaml to use script
4. Remove duplicate git config logic

### Phase 4: Enhanced Testing
1. Upgrade shared/tests/test-user-config.sh with functional tests
2. Add private repo access tests
3. Add gh CLI functionality tests

### Phase 5: Verification
1. Run enhanced tests to verify functionality
2. Test claude-habitat environment with updated script
3. Measure if PATH availability reduces startup delay

## Expected Outcomes

1. **Tools accessible**: Claude finds gh, git, etc. via PATH
2. **Git config applied**: Same gitconfig works for normal and bypass habitats  
3. **Functional verification**: Tests verify tools work, not just exist
4. **Code reuse**: Shared installation scripts work across habitat types
5. **Reduced startup time**: Proper tool availability may reduce auth timeout delays
6. **Transparent paths**: ../../ syntax is clear and doesn't introduce jargon

## Files to Modify

1. `system/config.yaml` - Add SYSTEM_TOOLS_PATH and PATH
2. `shared/config.yaml` - Add SHARED_TOOLS_PATH and PATH, use install-gitconfig
3. `habitats/claude-habitat/config.yaml` - Add PATH, use install-gitconfig
4. `src/filesystem.js` - Add relative path resolution for files.src
5. `system/tools/bin/install-gitconfig` - New centralized script
6. `shared/tests/test-user-config.sh` - Enhanced functional testing

This approach leverages existing environment variable infrastructure, provides transparency through relative paths, and creates reusable components that work for both normal and bypass habitats.