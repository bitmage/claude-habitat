# Implementation Plan: Glob Pattern Support for files: Section

## Overview

Add glob pattern support to the `files:` section in claude-habitat config.yaml to enable flexible file copying patterns like `*.pem`, `config/*.json`, etc.

## Current State

- **Location**: `src/image-lifecycle.js` lines 90-163 (`copyConfigFiles` function)
- **Support**: Only exact file paths
- **Variables**: Supports `{container.user}` and tilde expansion (`~/`)
- **Dependencies**: Only `js-yaml` for config parsing

## Implementation Plan

### Phase 1: Add Glob Dependencies

1. **Add glob library to package.json**
   ```bash
   npm install glob
   ```

2. **Import glob in image-lifecycle.js**
   ```javascript
   const { glob } = require('glob');
   ```

### Phase 2: Modify File Processing Logic

**File**: `src/image-lifecycle.js`

1. **Update `copyConfigFiles` function** (around line 90)
   - Detect glob patterns in `src` field
   - Expand globs to multiple file entries before processing

2. **Detection logic**:
   ```javascript
   function isGlobPattern(src) {
     return src.includes('*') || src.includes('?') || src.includes('[') || src.includes('{');
   }
   ```

3. **Expansion logic**:
   ```javascript
   async function expandGlobPattern(src, workingDir) {
     // Handle tilde expansion first
     const expandedSrc = src.startsWith('~/') ? 
       path.join(os.homedir(), src.slice(2)) : src;
     
     // Convert relative paths to absolute
     const absoluteSrc = path.isAbsolute(expandedSrc) ? 
       expandedSrc : path.join(workingDir, expandedSrc);
     
     // Expand glob pattern
     const matches = await glob(absoluteSrc);
     return matches;
   }
   ```

### Phase 3: Update Configuration Processing

1. **Modify file entry processing**:
   ```javascript
   for (const fileConfig of files) {
     const { src, dest, mode, owner, description } = fileConfig;
     
     if (isGlobPattern(src)) {
       // Handle glob patterns
       const matchedFiles = await expandGlobPattern(src, workingDir);
       
       for (const matchedFile of matchedFiles) {
         await processIndividualFile({
           src: matchedFile,
           dest: determineDestination(dest, matchedFile, src),
           mode,
           owner,
           description: `${description} (${path.basename(matchedFile)})`
         });
       }
     } else {
       // Handle exact file paths (existing logic)
       await processIndividualFile(fileConfig);
     }
   }
   ```

2. **Destination resolution for globs**:
   ```javascript
   function determineDestination(destPattern, matchedFile, originalGlob) {
     // If dest is a directory or contains no filename, use matched filename
     if (destPattern.endsWith('/') || !path.extname(destPattern)) {
       return path.join(destPattern, path.basename(matchedFile));
     }
     
     // If dest is specific file and we have multiple matches, use directory
     return path.join(path.dirname(destPattern), path.basename(matchedFile));
   }
   ```

### Phase 4: Update Documentation and Examples

1. **Update configuration documentation** in `docs/`
2. **Add examples to `shared/claude.md.example`**:
   ```yaml
   files:
     # Copy all PEM files from shared directory
     - src: ./shared/*.pem
       dest: /workspace/shared/
       mode: 600
       owner: "{container.user}"
       description: "GitHub App private keys"
     
     # Copy all config files
     - src: ./config/*.yaml
       dest: /workspace/config/
       mode: 644
       description: "Configuration files"
   ```

### Phase 5: Error Handling and Edge Cases

1. **No matches handling**:
   ```javascript
   if (matchedFiles.length === 0) {
     warn(`No files matched pattern: ${src}`);
     continue; // Skip this file entry
   }
   ```

2. **Destination conflicts**:
   - Multiple files mapping to same destination
   - Directory vs file destination resolution

3. **Permissions and ownership**:
   - Apply same permissions to all matched files
   - Handle ownership for multiple files

### Phase 6: Testing

1. **Unit tests** for glob expansion logic
2. **Integration tests** with various glob patterns
3. **Update existing habitat tests** to verify glob functionality

## Configuration Changes

### claude-habitat/config.yaml Refactor

**Before** (current hardcoded):
```yaml
files:
  - src: ./shared/behold-the-power-of-claude.2025-06-04.private-key.pem
    dest: /workspace/shared/behold-the-power-of-claude.2025-06-04.private-key.pem
    mode: 600
    owner: "{container.user}"
    description: "GitHub App private key for authentication"
```

**After** (with glob support):
```yaml
files:
  - src: ./shared/*.pem
    dest: /workspace/shared/
    mode: 600
    owner: "{container.user}"
    description: "GitHub App private keys for authentication"
```

### Additional Use Cases

1. **Certificate management**:
   ```yaml
   - src: ./certs/*.{crt,key,pem}
     dest: /workspace/certs/
     mode: 600
   ```

2. **Configuration templates**:
   ```yaml
   - src: ./templates/*.env.example
     dest: /workspace/config/
     mode: 644
   ```

3. **User scripts**:
   ```yaml
   - src: ./scripts/user-*.sh
     dest: /workspace/scripts/
     mode: 755
   ```

## Implementation Timeline

1. **Week 1**: Phase 1-2 (Dependencies + Core Logic)
2. **Week 1**: Phase 3 (Configuration Processing)
3. **Week 2**: Phase 4-5 (Documentation + Error Handling)
4. **Week 2**: Phase 6 (Testing + Validation)

## Rollback Plan

- Keep existing exact file path logic as fallback
- Feature flag for glob support if needed
- Gradual migration of existing configs

## Benefits

1. **Future-proof**: New certificate files don't require config changes
2. **Flexible**: Support multiple file patterns and types
3. **DRY**: Reduce repetitive file entries in configs
4. **Maintainable**: Less hardcoded filenames in configurations

## Considerations

1. **Performance**: Glob expansion adds filesystem operations
2. **Security**: Validate glob patterns don't escape intended directories
3. **Backwards compatibility**: Existing exact file paths must continue working
4. **Error reporting**: Clear messaging when globs match no files or fail