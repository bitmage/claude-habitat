# Container Health Checks Implementation Plan

## Goal
Progressive health checks with graceful degradation instead of binary pass/fail.

## Architecture

### Health Check Pipeline
```javascript
// src/health-checks.js
const healthCheckPipeline = [
  {
    name: 'Container Running',
    check: async (container) => dockerIsRunning(container),
    recovery: null, // No recovery, just info
    critical: true
  },
  {
    name: 'Responds to Commands',
    check: async (container) => {
      const { exitCode } = await dockerExec(container, 'echo OK');
      return exitCode === 0;
    },
    recovery: async (container) => {
      await sleep(5000); // Wait a bit more
    },
    critical: false
  },
  {
    name: 'Workspace Available',
    check: async (container) => {
      const { exitCode } = await dockerExec(container, 'test -d /workspace');
      return exitCode === 0;
    },
    recovery: async (container) => {
      // This would indicate a serious problem
      throw new Error('Workspace missing - rebuild required');
    },
    critical: true
  },
  {
    name: 'Tools Available',
    check: async (container) => {
      const { exitCode } = await dockerExec(container, 'which rg fd jq');
      return exitCode === 0;
    },
    recovery: async (container) => {
      console.log('Installing missing tools...');
      await dockerExec(container, '/workspace/system/tools/install-tools.sh install');
    },
    critical: false
  },
  {
    name: 'Git Configuration',
    check: async (container) => {
      const { exitCode } = await dockerExec(container, 'git config --get user.name');
      return exitCode === 0;
    },
    recovery: async (container) => {
      console.log('Setting up git configuration...');
      await dockerExec(container, '/workspace/system/tools/bin/install-gitconfig');
    },
    critical: false
  }
];

async function runHealthChecks(container) {
  const results = [];
  let criticalFailure = false;
  
  for (const check of healthCheckPipeline) {
    const result = { name: check.name, passed: false, attempted_recovery: false };
    
    try {
      result.passed = await check.check(container);
      
      if (!result.passed && check.recovery) {
        console.log(`Health check failed: ${check.name}, attempting recovery...`);
        result.attempted_recovery = true;
        await check.recovery(container);
        
        // Retry check after recovery
        result.passed = await check.check(container);
      }
      
      if (!result.passed && check.critical) {
        criticalFailure = true;
      }
      
    } catch (error) {
      result.error = error.message;
      if (check.critical) {
        criticalFailure = true;
      }
    }
    
    results.push(result);
  }
  
  return {
    passed: !criticalFailure,
    results,
    message: formatHealthCheckMessage(results, criticalFailure)
  };
}

function formatHealthCheckMessage(results, criticalFailure) {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  if (criticalFailure) {
    return `Critical health check failure (${passed}/${total} passed)`;
  } else if (passed === total) {
    return `All health checks passed (${passed}/${total})`;
  } else {
    return `Health checks completed with warnings (${passed}/${total} passed)`;
  }
}
```

## Integration Points

### Replace in habitat.js
```javascript
// Replace simple dockerIsRunning check with comprehensive health checks
const healthResult = await runHealthChecks(containerName);
if (!healthResult.passed) {
  throw new Error(`Container health check failed: ${healthResult.message}`);
} else {
  console.log(colors.green(`✅ ${healthResult.message}`));
  if (healthResult.results.some(r => r.attempted_recovery)) {
    console.log(colors.yellow('ℹ️  Some issues were automatically resolved'));
  }
}
```

## Benefits
- Graceful degradation for non-critical issues
- Automatic recovery for common problems
- Better diagnostic information
- Progressive enhancement of container state

## Implementation Steps
1. Create src/health-checks.js with pipeline framework
2. Implement individual health check functions
3. Integrate into habitat.js startup process
4. Add tests for health check scenarios
5. Document health check behaviors

## Testing Strategy
- Mock container states (running, stopped, corrupted)
- Test individual health checks
- Test recovery mechanisms
- Test critical vs non-critical failure handling