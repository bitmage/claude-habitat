const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const { dockerRun, dockerExec, dockerImageExists, dockerIsRunning } = require('../src/docker');

// Helper to check if Docker is available
async function isDockerAvailable() {
  try {
    await execAsync('docker --version');
    return true;
  } catch {
    return false;
  }
}

// Helper to create test container
async function createTestContainer() {
  const containerName = `claude-habitat-test-${Date.now()}`;
  
  try {
    // Use a minimal image for testing
    const containerId = await dockerRun([
      'run', '-d', '--name', containerName, 
      'ubuntu:22.04', 'sleep', '300'
    ]);
    
    return { containerName, containerId };
  } catch (err) {
    throw new Error(`Failed to create test container: ${err.message}`);
  }
}

// Helper to cleanup test container
async function cleanupContainer(containerName) {
  try {
    await execAsync(`docker stop ${containerName}`);
    await execAsync(`docker rm ${containerName}`);
  } catch {
    // Ignore cleanup errors
  }
}

test('Docker operations with real Docker daemon', async (t) => {
  const dockerAvailable = await isDockerAvailable();
  
  if (!dockerAvailable) {
    t.skip('Docker not available, skipping integration tests');
    return;
  }
  
  // Test 1: Image existence check
  const ubuntuExists = await dockerImageExists('ubuntu:22.04');
  if (!ubuntuExists) {
    console.log('Pulling ubuntu:22.04 for tests...');
    await execAsync('docker pull ubuntu:22.04');
  }
  
  assert.strictEqual(await dockerImageExists('ubuntu:22.04'), true, 'Ubuntu image should exist');
  assert.strictEqual(await dockerImageExists('nonexistent:image'), false, 'Nonexistent image should not exist');
  
  // Test 2: Container creation and management
  const { containerName } = await createTestContainer();
  
  try {
    // Test container is running
    const isRunning = await dockerIsRunning(containerName);
    assert.strictEqual(isRunning, true, 'Container should be running');
    
    // Test command execution in container
    const result = await dockerExec(containerName, 'echo "Hello from container"');
    assert.strictEqual(result, 'Hello from container', 'Command execution should work');
    
    // Test command execution with output
    const dateResult = await dockerExec(containerName, 'date +%Y');
    const currentYear = new Date().getFullYear().toString();
    assert.strictEqual(dateResult, currentYear, 'Date command should return current year');
    
    // Test file operations
    await dockerExec(containerName, 'echo "test content" > /tmp/test.txt');
    const fileContent = await dockerExec(containerName, 'cat /tmp/test.txt');
    assert.strictEqual(fileContent, 'test content', 'File operations should work');
    
  } finally {
    await cleanupContainer(containerName);
  }
  
  // Verify cleanup
  const isStillRunning = await dockerIsRunning(containerName);
  assert.strictEqual(isStillRunning, false, 'Container should be stopped after cleanup');
});

test('Tool installation simulation', async (t) => {
  const dockerAvailable = await isDockerAvailable();
  
  if (!dockerAvailable) {
    t.skip('Docker not available, skipping tool installation test');
    return;
  }
  
  const { containerName } = await createTestContainer();
  
  try {
    // Simulate basic tool installation
    await dockerExec(containerName, 'apt-get update');
    await dockerExec(containerName, 'apt-get install -y curl');
    
    // Test tool is available
    const curlVersion = await dockerExec(containerName, 'curl --version');
    assert(curlVersion.includes('curl'), 'curl should be installed and working');
    
    // Test directory creation (like claude-habitat structure)
    await dockerExec(containerName, 'mkdir -p /workspace/claude-habitat/system');
    await dockerExec(containerName, 'mkdir -p /workspace/claude-habitat/shared');
    await dockerExec(containerName, 'mkdir -p /workspace/claude-habitat/scratch');
    
    // Verify directory structure
    const lsResult = await dockerExec(containerName, 'find /workspace -type d');
    assert(lsResult.includes('/workspace/claude-habitat'), 'Claude habitat directory should exist');
    assert(lsResult.includes('/workspace/claude-habitat/system'), 'System directory should exist');
    assert(lsResult.includes('/workspace/claude-habitat/shared'), 'Shared directory should exist');
    assert(lsResult.includes('/workspace/claude-habitat/scratch'), 'Scratch directory should exist');
    
    // Test file creation and permissions
    await dockerExec(containerName, 'echo "# Claude Habitat Environment" > /workspace/CLAUDE.md');
    const claudeContent = await dockerExec(containerName, 'cat /workspace/CLAUDE.md');
    assert.strictEqual(claudeContent, '# Claude Habitat Environment', 'CLAUDE.md should be created correctly');
    
  } finally {
    await cleanupContainer(containerName);
  }
});

test('Container environment simulation', async (t) => {
  const dockerAvailable = await isDockerAvailable();
  
  if (!dockerAvailable) {
    t.skip('Docker not available, skipping environment simulation test');
    return;
  }
  
  const { containerName } = await createTestContainer();
  
  try {
    // Test environment variables
    await dockerExec(containerName, 'export TEST_VAR="habitat-test"');
    
    // Test working directory setup
    await dockerExec(containerName, 'mkdir -p /workspace && cd /workspace');
    const pwd = await dockerExec(containerName, 'cd /workspace && pwd');
    assert.strictEqual(pwd, '/workspace', 'Working directory should be set correctly');
    
    // Test user creation (common in habitat setup)
    await dockerExec(containerName, 'useradd -m developer || true');
    const userExists = await dockerExec(containerName, 'id developer');
    assert(userExists.includes('developer'), 'Developer user should be created');
    
    // Test command execution as different user
    const whoami = await dockerExec(containerName, 'whoami', 'developer');
    assert.strictEqual(whoami, 'developer', 'Commands should execute as specified user');
    
    // Test basic development tools that might be installed
    await dockerExec(containerName, 'apt-get update && apt-get install -y git');
    const gitVersion = await dockerExec(containerName, 'git --version');
    assert(gitVersion.includes('git version'), 'Git should be installed and working');
    
  } finally {
    await cleanupContainer(containerName);
  }
});

test('Error handling in Docker operations', async (t) => {
  const dockerAvailable = await isDockerAvailable();
  
  if (!dockerAvailable) {
    t.skip('Docker not available, skipping error handling tests');
    return;
  }
  
  // Test error when running command on non-existent container
  try {
    await dockerExec('nonexistent-container', 'echo test');
    assert.fail('Should throw error for non-existent container');
  } catch (err) {
    assert(err.message.includes('No such container'), 'Should get "No such container" error');
  }
  
  // Test error when checking non-existent image
  const badImageExists = await dockerImageExists('this-image-definitely-does-not-exist:latest');
  assert.strictEqual(badImageExists, false, 'Non-existent image should return false');
  
  // Test error when checking non-existent container status
  const badContainerRunning = await dockerIsRunning('definitely-not-running-container');
  assert.strictEqual(badContainerRunning, false, 'Non-existent container should not be running');
});

test('System and shared directory separation', async (t) => {
  const dockerAvailable = await isDockerAvailable();
  
  if (!dockerAvailable) {
    t.skip('Docker not available, skipping system/shared separation test');
    return;
  }
  
  const { containerName } = await createTestContainer();
  
  try {
    // Simulate system files (infrastructure)
    await dockerExec(containerName, 'mkdir -p /workspace/claude-habitat/system/tools');
    await dockerExec(containerName, 'echo "# System CLAUDE Instructions" > /workspace/claude-habitat/system/CLAUDE.md');
    await dockerExec(containerName, 'echo "#!/bin/bash\necho system-tool" > /workspace/claude-habitat/system/tools/system-tool.sh');
    await dockerExec(containerName, 'chmod +x /workspace/claude-habitat/system/tools/system-tool.sh');
    
    // Simulate shared files (user preferences)
    await dockerExec(containerName, 'mkdir -p /workspace/claude-habitat/shared/tools');
    await dockerExec(containerName, 'echo "# User Preferences" > /workspace/claude-habitat/shared/CLAUDE.md');
    await dockerExec(containerName, 'echo "#!/bin/bash\necho user-tool" > /workspace/claude-habitat/shared/tools/user-tool.sh');
    await dockerExec(containerName, 'chmod +x /workspace/claude-habitat/shared/tools/user-tool.sh');
    
    // Test that both directories exist and are separate
    const systemExists = await dockerExec(containerName, 'test -d /workspace/claude-habitat/system && echo "exists"');
    const sharedExists = await dockerExec(containerName, 'test -d /workspace/claude-habitat/shared && echo "exists"');
    
    assert.strictEqual(systemExists, 'exists', 'System directory should exist');
    assert.strictEqual(sharedExists, 'exists', 'Shared directory should exist');
    
    // Test that files are in correct locations
    const systemClaude = await dockerExec(containerName, 'cat /workspace/claude-habitat/system/CLAUDE.md');
    const sharedClaude = await dockerExec(containerName, 'cat /workspace/claude-habitat/shared/CLAUDE.md');
    
    assert(systemClaude.includes('System CLAUDE'), 'System CLAUDE.md should contain system content');
    assert(sharedClaude.includes('User Preferences'), 'Shared CLAUDE.md should contain user content');
    
    // Test that tools from both locations work
    const systemTool = await dockerExec(containerName, '/workspace/claude-habitat/system/tools/system-tool.sh');
    const userTool = await dockerExec(containerName, '/workspace/claude-habitat/shared/tools/user-tool.sh');
    
    assert.strictEqual(systemTool, 'system-tool', 'System tool should work');
    assert.strictEqual(userTool, 'user-tool', 'User tool should work');
    
    // Test composition (simulate what claude-habitat.js does)
    await dockerExec(containerName, `cat /workspace/claude-habitat/system/CLAUDE.md > /workspace/CLAUDE.md`);
    await dockerExec(containerName, `echo "\\n\\n---\\n\\n# User Preferences\\n" >> /workspace/CLAUDE.md`);
    await dockerExec(containerName, `cat /workspace/claude-habitat/shared/CLAUDE.md >> /workspace/CLAUDE.md`);
    
    const composedClaude = await dockerExec(containerName, 'cat /workspace/CLAUDE.md');
    assert(composedClaude.includes('System CLAUDE'), 'Composed CLAUDE.md should include system content');
    assert(composedClaude.includes('User Preferences'), 'Composed CLAUDE.md should include section header');
    assert(composedClaude.includes('User Preferences'), 'Composed CLAUDE.md should include user content');
    
  } finally {
    await cleanupContainer(containerName);
  }
});

// Simple performance test
test('Docker operations performance', async (t) => {
  const dockerAvailable = await isDockerAvailable();
  
  if (!dockerAvailable) {
    t.skip('Docker not available, skipping performance tests');
    return;
  }
  
  const { containerName } = await createTestContainer();
  
  try {
    // Test that basic operations complete within reasonable time
    const start = Date.now();
    
    await dockerExec(containerName, 'echo "performance test"');
    await dockerIsRunning(containerName);
    await dockerImageExists('ubuntu:22.04');
    
    const duration = Date.now() - start;
    
    // Should complete within 5 seconds (generous for CI environments)
    assert(duration < 5000, `Basic operations should complete quickly, took ${duration}ms`);
    
  } finally {
    await cleanupContainer(containerName);
  }
});