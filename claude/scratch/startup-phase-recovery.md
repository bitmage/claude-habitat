# Startup Phase Recovery Implementation Plan

## Goal
Robust startup with automatic recovery for common issues, but no autocorrection - detect and emit errors with helpful guidance.

## Architecture

### Startup Phase Framework
```javascript
// src/startup-recovery.js
const startupPhases = {
  dockerDaemon: {
    name: 'Docker Daemon Check',
    check: async () => {
      try {
        await execAsync('docker info', { timeout: 5000 });
        return { healthy: true };
      } catch (error) {
        return { 
          healthy: false, 
          error: 'Docker daemon not accessible',
          suggestion: 'Try: sudo systemctl start docker || sudo service docker start'
        };
      }
    }
  },

  dockerSocketAccess: {
    name: 'Docker Socket Access',
    check: async () => {
      try {
        // Check if docker socket exists and is accessible
        if (!await fileExists('/var/run/docker.sock')) {
          return {
            healthy: false,
            error: 'Docker socket not found at /var/run/docker.sock',
            suggestion: 'Ensure Docker is running and socket is properly mounted'
          };
        }

        // Get socket group ID for permission checking
        const { stdout } = await execAsync('stat -c "%g" /var/run/docker.sock');
        const socketGid = parseInt(stdout.trim());
        
        // Check if current user can access socket
        const { stdout: groups } = await execAsync('groups');
        const userGroups = groups.trim().split(' ');
        const hasDockerAccess = userGroups.includes('docker') || userGroups.includes(socketGid.toString());
        
        if (!hasDockerAccess) {
          return {
            healthy: false,
            error: `No access to Docker socket (GID ${socketGid})`,
            suggestion: `Add current user to docker group: sudo usermod -aG ${socketGid} $(whoami) && newgrp ${socketGid}`
          };
        }

        return { healthy: true, socketGid };
      } catch (error) {
        return {
          healthy: false,
          error: 'Cannot check Docker socket access',
          suggestion: 'Verify Docker installation and permissions'
        };
      }
    }
  },
  
  diskSpace: {
    name: 'Disk Space Check',
    check: async () => {
      try {
        const { stdout } = await execAsync("df -h . | tail -1 | awk '{print $5}' | sed 's/%//'");
        const usage = parseInt(stdout.trim());
        
        if (usage > 90) {
          return {
            healthy: false,
            error: `Disk usage at ${usage}% - low space may cause build failures`,
            suggestion: 'Free up disk space or clean old Docker images with: docker system prune'
          };
        }
        
        return { healthy: true };
      } catch (error) {
        return { healthy: true }; // Non-critical if we can't check
      }
    }
  },
  
  githubAuth: {
    name: 'GitHub Authentication',
    check: async () => {
      try {
        // Check if we can access GitHub
        await execAsync('curl -s -f -H "Authorization: token $(cat ~/.github-token 2>/dev/null || echo "")" https://api.github.com/user', { timeout: 10000 });
        return { healthy: true };
      } catch (error) {
        const hasPrivateKey = await fileExists('./shared/behold-the-power-of-claude.2025-06-04.private-key.pem');
        
        return {
          healthy: false,
          error: 'GitHub authentication not working',
          suggestion: hasPrivateKey 
            ? 'Try regenerating token: ./system/tools/regenerate-github-token.sh'
            : 'GitHub App private key not found - check ./shared/ directory'
        };
      }
    }
  },
  
  workspacePermissions: {
    name: 'Workspace Permissions',
    check: async () => {
      try {
        await fs.access('.', fs.constants.W_OK);
        return { healthy: true };
      } catch (error) {
        return {
          healthy: false,
          error: 'Workspace not writable',
          suggestion: 'Fix permissions: sudo chown -R $(id -u):$(id -g) .'
        };
      }
    }
  },

  baseImageAvailability: {
    name: 'Base Image Check',
    check: async (config) => {
      const baseImage = config.image?.base || 'ubuntu:22.04';
      
      try {
        await execAsync(`docker image inspect ${baseImage}`, { timeout: 5000 });
        return { healthy: true };
      } catch (error) {
        try {
          // Check if image exists remotely
          await execAsync(`docker manifest inspect ${baseImage}`, { timeout: 10000 });
          return {
            healthy: false,
            error: `Base image ${baseImage} not available locally`,
            suggestion: `Pull image: docker pull ${baseImage}`
          };
        } catch (manifestError) {
          return {
            healthy: false,
            error: `Base image ${baseImage} does not exist`,
            suggestion: 'Check image name in config.yaml or use a different base image'
          };
        }
      }
    }
  }
};

async function runStartupDiagnostics(config = {}) {
  console.log('Running startup diagnostics...\n');
  
  const results = [];
  let hasWarnings = false;
  let hasCriticalErrors = false;
  
  for (const [key, phase] of Object.entries(startupPhases)) {
    console.log(`Checking ${phase.name}...`);
    
    try {
      const result = await phase.check(config);
      result.phase = key;
      result.name = phase.name;
      
      if (result.healthy) {
        console.log(colors.green(`  ✅ ${phase.name} OK`));
      } else {
        const isCritical = ['dockerDaemon', 'dockerSocketAccess', 'workspacePermissions'].includes(key);
        
        if (isCritical) {
          hasCriticalErrors = true;
          console.log(colors.red(`  ❌ ${phase.name}: ${result.error}`));
        } else {
          hasWarnings = true;
          console.log(colors.yellow(`  ⚠️  ${phase.name}: ${result.error}`));
        }
        
        if (result.suggestion) {
          console.log(colors.cyan(`     💡 ${result.suggestion}`));
        }
      }
      
      results.push(result);
      
    } catch (error) {
      results.push({
        phase: key,
        name: phase.name,
        healthy: false,
        error: `Diagnostic failed: ${error.message}`,
        suggestion: 'This may indicate a system issue'
      });
      
      console.log(colors.red(`  ❌ ${phase.name}: Diagnostic failed`));
    }
    
    console.log(''); // Spacing
  }
  
  // Summary
  if (hasCriticalErrors) {
    console.log(colors.red('🚫 Critical issues detected - startup may fail'));
    console.log(colors.yellow('   Please resolve the issues above before continuing.\n'));
  } else if (hasWarnings) {
    console.log(colors.yellow('⚠️  Warnings detected - some features may not work'));
    console.log(colors.cyan('   Consider resolving the issues above for best experience.\n'));
  } else {
    console.log(colors.green('✅ All startup diagnostics passed\n'));
  }
  
  return {
    healthy: !hasCriticalErrors,
    hasWarnings,
    results
  };
}
```

## Integration Points

### Add to habitat startup process
```javascript
// In startSession function, before building images
const diagnostics = await runStartupDiagnostics(config);

if (!diagnostics.healthy) {
  throw new Error('Critical startup issues detected - see diagnostics above');
}

if (diagnostics.hasWarnings) {
  const proceed = await askToContinue('Continue despite warnings?');
  if (!proceed) {
    throw new Error('Startup cancelled by user');
  }
}
```

### Add CLI flag for diagnostics only
```javascript
// In cli-parser.js
if (options.diagnose) {
  const config = await loadConfig(configPath);
  await runStartupDiagnostics(config);
  process.exit(0);
}
```

## Benefits
- Early detection of common issues
- Helpful suggestions without autocorrection
- Clear separation of critical vs warning issues
- Better user guidance for problem resolution

## Implementation Steps
1. Create src/startup-recovery.js with diagnostic framework
2. Implement individual diagnostic checks
3. Integrate into habitat startup process
4. Add --diagnose CLI flag
5. Add tests for diagnostic scenarios
6. Document diagnostic behaviors

## Testing Strategy
- Mock system states (Docker down, no permissions, etc.)
- Test individual diagnostic functions
- Test critical vs warning classification
- Test user interaction with warnings