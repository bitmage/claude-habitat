# Docker Image Management Implementation Plan

## Overview

Implement comprehensive Docker image management for claude-habitat with three main features:
1. Interactive submenu for selective image cleaning
2. Automatic orphan image cleanup on startup
3. CLI support for image operations

## 1. Interactive Image Cleaning Submenu

### Implementation Location
- Add new scene: `src/scenes/clean-images.scene.js`
- Integrate into main menu via `src/scenes/main-menu.scene.js`
- Update `src/scenes/clean.scene.js` to include image cleaning option

### Scene Flow
```
Main Menu → Clean Menu → Image Cleaning Menu
                      ↓
        ┌─────────────────────────────────────┐
        │ Image Cleaning Options:             │
        │ 1. Clean all claude-habitat images  │
        │ 2. Clean specific habitat images    │
        │ 3. Clean orphan images only         │
        │ q. Back to clean menu               │
        └─────────────────────────────────────┘
```

### Core Functions Needed
```javascript
// In src/docker.js (or new src/image-management.js)
async function listClaudeHabitatImages()
async function listImagesByHabitat()
async function cleanAllImages()
async function cleanHabitatImages(habitatName)
async function cleanOrphanImages()
async function removeContainersUsingImage(imageId)
```

### Interactive Features
- Display image sizes and creation dates
- Show which containers are using images
- Confirmation prompts before deletion
- Progress indicators for bulk operations
- Error handling with user-friendly messages

## 2. Startup Orphan Image Cleanup

### Implementation Location
- Add to `src/cli.js` main startup sequence
- Create `src/background-cleanup.js` for async operations
- Add logging to `logs/` directory (ensure in .gitignore)

### Background Process Design
```javascript
// Startup sequence in src/cli.js
async function startApplication() {
  // Start background cleanup (non-blocking)
  backgroundCleanup.startOrphanCleanup().catch(logError);
  
  // Continue with normal startup
  await showMainMenu();
}

// In src/background-cleanup.js
async function startOrphanCleanup() {
  try {
    const orphanImages = await findOrphanImages();
    if (orphanImages.length > 0) {
      await cleanupOrphans(orphanImages);
      logCleanupResults(orphanImages);
    }
  } catch (error) {
    logError('Orphan cleanup failed', error);
  }
}
```

### Orphan Detection Logic
- Images tagged with `claude-habitat-*` but not referenced by any habitat config
- Images older than a configurable threshold (default: 7 days)
- Images not currently in use by any container
- Exclude images from currently active habitat sessions

### Logging Implementation
```javascript
// Log format: logs/YYYY-MM-DD.txt
// Sample log entry:
// [2024-01-15 10:30:25] CLEANUP: Removed orphan image claude-habitat-old:abc123 (2.1GB freed)
// [2024-01-15 10:30:26] ERROR: Failed to remove image def456: container still running

function logCleanup(level, message, details = null) {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const logFile = `logs/${new Date().toISOString().slice(0, 10)}.txt`;
  const logEntry = `[${timestamp}] ${level}: ${message}`;
  
  // Append to daily log file
  fs.appendFileSync(logFile, logEntry + '\n');
}
```

## 3. CLI Arguments Support

### New CLI Commands
```bash
# Clean all images
./claude-habitat --clean-images
./claude-habitat --clean-images all

# Clean specific habitat
./claude-habitat --clean-images discourse
./claude-habitat --clean-images claude-habitat

# Clean orphans only
./claude-habitat --clean-images orphans

# Combined with existing clean
./claude-habitat --clean --images
```

### CLI Parser Updates
```javascript
// In src/cli-parser.js
const imageCommands = {
  '--clean-images': { 
    action: 'cleanImages',
    allowedValues: ['all', 'orphans', ...habitatNames],
    defaultValue: 'all'
  }
};

// Integration with existing --clean flag
if (args.clean && args.images) {
  args.cleanImages = 'all';
}
```

### Implementation in src/cli.js
```javascript
async function handleCleanImages(target = 'all') {
  console.log(`Cleaning ${target} images...`);
  
  switch (target) {
    case 'all':
      await cleanAllClaudeHabitatImages();
      break;
    case 'orphans':
      await cleanOrphanImages();
      break;
    default:
      // Assume it's a habitat name
      await cleanHabitatImages(target);
  }
  
  console.log('Image cleanup completed.');
  
  // Return to main menu if interactive, exit if CLI
  if (process.argv.includes('--clean-images')) {
    process.exit(0);
  }
}
```

## Implementation Steps

### Phase 1: Core Infrastructure
1. Create `src/image-management.js` with Docker image utilities
2. Add logging infrastructure for cleanup operations
3. Update `.gitignore` to include `logs/` directory
4. Add basic unit tests for image management functions

### Phase 2: Interactive UI
1. Create `src/scenes/clean-images.scene.js`
2. Update clean menu to include image cleaning option
3. Implement user-friendly image selection and confirmation
4. Add comprehensive error handling and user feedback

### Phase 3: Background Cleanup
1. Implement orphan detection logic
2. Add background cleanup to startup sequence
3. Create configurable cleanup policies
4. Add monitoring and logging for cleanup operations

### Phase 4: CLI Integration
1. Update CLI parser for image commands
2. Integrate with existing `--clean` flag
3. Add help documentation for new commands
4. Test CLI and interactive mode integration

## Configuration Options

Add to `shared/config.yaml` or system config:
```yaml
image_cleanup:
  enabled: true
  orphan_age_threshold_days: 7
  startup_cleanup: true
  log_retention_days: 30
  exclude_patterns:
    - "*-dev"
    - "*-experimental"
```

## Testing Strategy

### Unit Tests
- Image listing and filtering functions
- Container dependency detection
- Orphan image identification logic
- Logging functionality

### Integration Tests
- Full cleanup workflows
- CLI argument parsing and execution
- Background cleanup process
- Error handling scenarios

### E2E Tests
- Interactive image cleaning workflow
- Startup cleanup verification
- CLI command execution and output
- Cross-habitat image management

## Error Handling

### Common Scenarios
- Docker daemon not running
- Insufficient permissions for image removal
- Images in use by running containers
- Network issues during cleanup
- Disk space constraints

### Recovery Strategies
- Graceful degradation when Docker is unavailable
- Clear error messages with suggested actions
- Automatic retry logic for transient failures
- Fallback to manual cleanup instructions

## Documentation Updates

### User Documentation
- Update `docs/USAGE.md` with image management commands
- Add troubleshooting section for image cleanup issues
- Document CLI flags and interactive menu options

### Developer Documentation
- API documentation for image management functions
- Architecture notes for background cleanup
- Testing guidelines for image-related features

## Success Metrics

### Functionality
- [ ] Interactive submenu works for all habitat types
- [ ] Background cleanup reduces disk usage without user intervention
- [ ] CLI commands provide consistent behavior with interactive mode
- [ ] Error handling provides clear feedback and recovery options

### Performance
- [ ] Startup cleanup completes within 30 seconds
- [ ] Interactive operations respond within 5 seconds
- [ ] Background operations don't impact user experience
- [ ] Cleanup operations minimize Docker daemon load

### Reliability
- [ ] No data loss or corruption during cleanup
- [ ] Proper cleanup of temporary containers and volumes
- [ ] Consistent behavior across different Docker configurations
- [ ] Comprehensive logging for troubleshooting and monitoring