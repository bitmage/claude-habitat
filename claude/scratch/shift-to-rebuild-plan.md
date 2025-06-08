# Shift to Rebuild Feature Implementation Plan

## Overview

Add a "shift to rebuild" feature that allows users to force rebuild containers instead of using cached images. This provides a quick way to rebuild when changes are made to Dockerfiles or dependencies.

## User Experience

### Interactive Mode
- **Normal behavior**: Press `1`, `2`, `3`, etc. to start habitats using cached images
- **Rebuild behavior**: Press `!`, `@`, `#`, etc. (shift + number) to rebuild and start habitats
- **Visual indication**: Show `[!]` next to habitat names to indicate rebuild option
- **Feedback**: Clear messaging when rebuild is triggered vs. cached start

### CLI Mode
- **Normal behavior**: `./claude-habitat start habitat-name`
- **Rebuild behavior**: `./claude-habitat start habitat-name --rebuild`
- **Alternative**: `./claude-habitat --rebuild start habitat-name`

## Technical Implementation

### 1. CLI Argument Parsing (src/cli-parser.js)

```javascript
// Add rebuild option to parseCliArguments
function parseCliArguments(argv) {
  const options = {
    // ... existing options
    rebuild: false,
    // ... other options
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg === '--rebuild' || arg === '-r') {
      options.rebuild = true;
    }
    // ... existing argument parsing
  }
  
  return options;
}
```

### 2. Menu Key Detection (claude-habitat.js)

```javascript
// Extend menu choice handling to detect shift+number combinations
const choice = await new Promise(resolve => {
  let tildeBuffer = '';
  
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  
  const onKeypress = (key) => {
    // Handle Ctrl+C
    if (key === '\u0003') {
      console.log('\n');
      process.exit(0);
    }
    
    // Detect shift+number keys for rebuild
    const shiftNumberMap = {
      '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
      '^': '6', '&': '7', '*': '8', '(': '9', ')': '0'
    };
    
    if (shiftNumberMap[key]) {
      const numberKey = shiftNumberMap[key];
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onKeypress);
      resolve({ choice: numberKey, rebuild: true });
      return;
    }
    
    // ... existing tilde and regular key handling
    // Modify to return { choice: key, rebuild: false }
  };
  
  process.stdin.on('data', onKeypress);
});
```

### 3. Menu Display Updates (claude-habitat.js)

```javascript
// Update habitat display to show rebuild option
habitats.forEach((habitat, index) => {
  let key;
  let shiftKey;
  
  if (index < 9) {
    key = (index + 1).toString();
    const shiftMap = { '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
                      '6': '^', '7': '&', '8': '*', '9': '(' };
    shiftKey = shiftMap[key];
  } else {
    // Tilde prefix system for 10+
    const adjusted = index - 9;
    const tildeCount = Math.floor(adjusted / 9) + 1;
    const digit = (adjusted % 9) + 1;
    key = '~'.repeat(tildeCount) + digit;
    shiftKey = null; // No shift support for tilde sequences initially
  }
  
  // ... status checking code
  
  const shiftOption = shiftKey ? ` ${colors.cyan(`[${shiftKey}]`)}rebuild` : '';
  console.log(`  ${colors.yellow(`[${key}]`)} ${habitat.name}${statusWarning}${startOption}${shiftOption}`);
  
  if (parsed.description) {
    console.log(`      ${parsed.description}`);
  }
  // ... rest of display code
});
```

### 4. Container Building Logic (src/image-lifecycle.js)

```javascript
// Add rebuild parameter to prepareWorkspace function
async function prepareWorkspace(config, tag, extraRepos, options = {}) {
  const { rebuild = false } = options;
  
  if (rebuild) {
    console.log(colors.yellow('🔄 Rebuild requested - building fresh images...'));
    
    // Force rebuild by removing existing images
    const preparedTag = `${config.image.tag}:${tag}`;
    try {
      await dockerRun(['rmi', preparedTag]);
      console.log(`Removed existing image: ${preparedTag}`);
    } catch (err) {
      // Image might not exist, continue
    }
    
    // Force rebuild base image too
    try {
      await dockerRun(['rmi', config.image.tag]);
      console.log(`Removed base image: ${config.image.tag}`);
    } catch (err) {
      // Image might not exist, continue
    }
  }
  
  // Continue with normal build process
  const baseTag = await buildBaseImage(config, { rebuild });
  // ... rest of function
}

async function buildBaseImage(config, options = {}) {
  const { rebuild = false } = options;
  
  if (rebuild) {
    // Add --no-cache flag to docker build
    const buildArgs = [
      'build',
      '--no-cache',
      '-t', config.image.tag,
      '-f', dockerfilePath,
      contextPath
    ];
  } else {
    // Normal build with cache
    const buildArgs = [
      'build',
      '-t', config.image.tag,
      '-f', dockerfilePath,
      contextPath
    ];
  }
  
  // ... rest of function
}
```

### 5. Session Starting Logic (src/habitat.js)

```javascript
// Update startSession to accept rebuild option
async function startSession(configPath, extraRepos = [], overrideCommand = null, options = {}) {
  const { rebuild = false } = options;
  
  // ... existing code
  
  // Pass rebuild option to prepareWorkspace
  const preparedTag = await prepareWorkspace(config, cacheHash, extraRepos, { rebuild });
  
  // ... rest of function
}
```

### 6. CLI Integration Updates

#### claude-habitat.js main function
```javascript
// Handle CLI start with rebuild
if (options.start) {
  // ... existing habitat selection logic
  
  // Pass rebuild option to startSession
  await startSession(options.configPath, options.extraRepos, options.overrideCommand, {
    rebuild: options.rebuild
  });
}

// Handle interactive choice with rebuild
if (choice.rebuild) {
  console.log(`\n🔄 Rebuilding: ${habitats[directIndex].name}\n`);
} else {
  console.log(`\nSelected: ${habitats[directIndex].name}\n`);
}

await startSession(options.configPath, options.extraRepos, options.overrideCommand, {
  rebuild: choice.rebuild || false
});
```

### 7. Help Text Updates (src/command-executor.js)

```javascript
async function showHelp() {
  console.log(`Usage: ${path.basename(process.argv[1])} [OPTIONS|SHORTCUTS]

OPTIONS:
    -c, --config FILE       Path to configuration YAML file
    -r, --repo REPO_SPEC    Additional repository to clone (format: URL:PATH[:BRANCH])
                           Can be specified multiple times
    --cmd COMMAND          Override the claude command for this session
    --rebuild              Force rebuild of Docker images (ignore cache)
    --clean                Remove all Claude Habitat Docker images
    --list-configs         List available configuration files
    -h, --help             Display this help message

SHORTCUTS:
    s, start [HABITAT]     Start habitat (last used if no name given)
    start HABITAT --rebuild    Force rebuild and start habitat
    a, add                 Create new configuration with AI assistance
    m, maintain            Update/troubleshoot Claude Habitat itself

INTERACTIVE KEYS:
    1-9                    Start habitat using cached images
    !@#$%^&*(             Start habitat with rebuild (Shift+1-9)
    
EXAMPLES:
    # Start with rebuild
    ${path.basename(process.argv[1])} start discourse --rebuild
    
    # In interactive mode, press ! to rebuild habitat 1
    # Press @ to rebuild habitat 2, etc.`);
}
```

## Implementation Steps

### Phase 1: Basic CLI Support
1. [ ] Add `--rebuild` flag to CLI argument parsing
2. [ ] Update `startSession` to accept rebuild option
3. [ ] Modify `prepareWorkspace` and `buildBaseImage` to support rebuild
4. [ ] Add tests for CLI rebuild functionality
5. [ ] Update help text

### Phase 2: Interactive Shift Key Support  
1. [ ] Implement shift+number key detection in menu
2. [ ] Update menu display to show rebuild options
3. [ ] Modify choice handling to return rebuild flag
4. [ ] Add visual feedback for rebuild operations
5. [ ] Add tests for interactive rebuild

### Phase 3: Enhanced Features
1. [ ] Add rebuild confirmation prompts (optional)
2. [ ] Support tilde sequences with shift (~~! for habitat 10 rebuild)
3. [ ] Add selective rebuild options (base-only vs full rebuild)
4. [ ] Implement build progress indicators
5. [ ] Add rebuild statistics/timing

## Testing Strategy

### Unit Tests
- CLI argument parsing with `--rebuild` flag
- Menu key detection for shift+number combinations
- Build parameter passing through function calls

### Integration Tests  
- End-to-end rebuild from CLI
- Interactive rebuild from menu
- Rebuild with extra repositories
- Error handling when rebuild fails

### Manual Testing
- Test all shift+number combinations (! through ()
- Verify rebuild messaging and feedback
- Test rebuild performance vs cached builds
- Verify proper image cleanup and rebuild

## Edge Cases & Considerations

### Technical Challenges
1. **Key Detection**: Raw mode stdin handling for shift combinations
2. **Docker Cache**: Proper cleanup of existing images before rebuild
3. **Error Handling**: Graceful fallback if rebuild fails
4. **Performance**: Rebuild operations are significantly slower

### User Experience
1. **Feedback**: Clear indication when rebuild is happening vs cached start
2. **Confirmation**: Optional confirmation for expensive rebuild operations
3. **Progress**: Visual progress for long rebuild operations
4. **Recovery**: Clear error messages if rebuild fails

### Compatibility
1. **Terminal Support**: Ensure shift key detection works across different terminals
2. **Docker Versions**: Test with different Docker versions for build flags
3. **Platform Support**: Verify behavior on Linux/macOS/Windows (if applicable)

## Success Criteria

1. **CLI Interface**: `./claude-habitat start habitat --rebuild` works reliably
2. **Interactive Interface**: Shift+number keys trigger rebuild in menu
3. **Visual Feedback**: Clear indication of rebuild vs cached operations
4. **Performance**: Rebuilds complete without hanging or errors
5. **Documentation**: Help text and examples are clear and accurate
6. **Testing**: Comprehensive test coverage for both CLI and interactive modes

## Future Enhancements

1. **Partial Rebuild**: Options to rebuild only base image or only prepared image
2. **Build Profiles**: Named rebuild configurations (--rebuild=fresh, --rebuild=deps-only)
3. **Build Caching**: Smarter cache invalidation based on file changes
4. **Parallel Builds**: Support for rebuilding multiple habitats simultaneously
5. **Build History**: Track and display rebuild history/statistics