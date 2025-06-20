# Claude Habitat Cleanup and PATH Issues

## Problem Summary

1. **Cleanup Hanging**: When Ctrl+C is pressed, the cleanup process sometimes hangs indefinitely
2. **PATH Issues**: Commands like `ls` fail with "command not found" when using `--cmd`
3. **Multiple Process Detection**: The cleanup logic relies on detecting other claude-habitat processes, which can cause issues

## Root Causes

### 1. Cleanup Hanging
- The cleanup handler is registered for multiple signals (SIGINT, SIGTERM, beforeExit, exit)
- When multiple claude-habitat processes are running, the cleanup logic skips cleanup (by design)
- The async cleanup handlers may be blocking the process exit

### 2. PATH Issues in Container
- When using `--cmd "ls shared"`, the command is executed as `/bin/bash -c "ls shared"`
- The container's PATH environment variable might not be properly set
- The habitat-env.sh file is only sourced for `docker exec` commands, not for `docker run`

## Proposed Solutions

### 1. Fix Cleanup Hanging

```javascript
// In src/container-cleanup.js
function setupAutomaticCleanup(options = {}) {
  const { disabled = false } = options;
  
  if (disabled) {
    return;
  }
  
  let cleanupInProgress = false;
  
  // Create cleanup handler that prevents multiple executions
  const cleanupHandler = async (signal) => {
    if (cleanupInProgress) {
      return;
    }
    cleanupInProgress = true;
    
    try {
      await cleanupContainers();
    } catch (error) {
      // Silently ignore cleanup errors during shutdown
    } finally {
      // Force exit after cleanup attempt
      process.exit(signal === 'SIGINT' ? 130 : 0);
    }
  };
  
  // Only register essential handlers
  process.on('SIGINT', () => cleanupHandler('SIGINT'));
  process.on('SIGTERM', () => cleanupHandler('SIGTERM'));
}
```

### 2. Fix PATH Issues

```javascript
// In src/habitat.js, modify runEphemeralContainer
const fullCommand = claudeCommand;

// Ensure PATH is set properly
const bashCommand = `
  export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin;
  [ -f /etc/profile.d/habitat-env.sh ] && source /etc/profile.d/habitat-env.sh || true;
  ${fullCommand}
`;

const dockerArgs = [
  'run', '--rm', ...dockerFlags,
  ...envArgs,
  '-u', containerUser,
  '-w', workDir,
  ...volumeArgs,
  tag,
  '/bin/bash', '-c', bashCommand
];
```

### 3. Improve Process Detection

Instead of relying on `pgrep`, use a lock file or process registry:

```javascript
// In src/container-cleanup.js
const fs = require('fs');
const path = require('path');

function registerProcess() {
  const lockFile = path.join(os.tmpdir(), `claude-habitat-${process.pid}.lock`);
  fs.writeFileSync(lockFile, Date.now().toString());
  
  process.on('exit', () => {
    try {
      fs.unlinkSync(lockFile);
    } catch (e) {
      // Ignore
    }
  });
}

function getActiveProcessCount() {
  const lockDir = os.tmpdir();
  const lockFiles = fs.readdirSync(lockDir)
    .filter(f => f.startsWith('claude-habitat-') && f.endsWith('.lock'));
  
  // Clean up stale locks
  const now = Date.now();
  return lockFiles.filter(f => {
    try {
      const content = fs.readFileSync(path.join(lockDir, f), 'utf8');
      const timestamp = parseInt(content);
      // Consider locks older than 5 minutes as stale
      if (now - timestamp > 300000) {
        fs.unlinkSync(path.join(lockDir, f));
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }).length;
}
```

## Testing Strategy

1. **Test cleanup with multiple processes**:
   ```bash
   # Terminal 1
   ./claude-habitat start base
   
   # Terminal 2
   ./claude-habitat start base
   
   # Press Ctrl+C in each and verify clean exit
   ```

2. **Test PATH issues**:
   ```bash
   ./claude-habitat start base --cmd "ls -la"
   ./claude-habitat start base --cmd "which ls"
   ./claude-habitat start base --cmd "echo \$PATH"
   ```

3. **Test process detection**:
   ```bash
   # Start multiple instances and verify cleanup behavior
   ```

## Implementation Priority

1. **High Priority**: Fix PATH issues (breaks basic functionality)
2. **Medium Priority**: Fix cleanup hanging (affects user experience)
3. **Low Priority**: Improve process detection (current method works, just not optimal)

## Notes

- The cleanup mechanism's "last process wins" strategy is good but needs better implementation
- Consider adding a `--force-cleanup` flag for manual cleanup
- Add timeout to cleanup operations to prevent indefinite hanging