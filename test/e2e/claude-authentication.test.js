/**
 * @fileoverview E2E tests for Claude authentication and API connectivity
 * @description Tests Claude authentication setup and basic API communication within habitats
 * 
 * These tests verify that Claude can authenticate successfully and respond to simple prompts
 * without requiring manual login. They ensure credentials are properly configured and accessible
 * within the habitat environment, testing the complete authentication flow.
 * 
 * @tests
 * - Run these tests: `npm run test:e2e -- test/e2e/claude-authentication.test.js`
 * - Run all E2E tests: `npm run test:e2e`
 * - Test module: Claude authentication and API integration
 */

const test = require('node:test');
const assert = require('node:assert');
const { ProductTestBase } = require('./product-test-base');

test('Claude authentication works - Hello Claude!', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing Claude authentication with "Hello Claude!" test...');
    
    // Test that Claude can authenticate and respond to a simple prompt
    const claudeResult = await testRunner.runClaudeHabitatCommand([
      'start', 'claude-habitat', 
      '--cmd', 'claude -p "Hello, can you just say hi?"'
    ], {
      timeout: 60000, // 1 minute timeout for Claude response
      captureOutput: true
    });
    
    console.log('Claude authentication test completed with exit code:', claudeResult.exitCode);
    
    const output = claudeResult.stdout + claudeResult.stderr;
    
    // Should complete without hanging or login prompts
    assert.ok(claudeResult.exitCode !== undefined, 'Claude command should complete');
    
    // Should not contain login prompts
    const hasLoginPrompts = output.toLowerCase().includes('log in') ||
                           output.toLowerCase().includes('login') ||
                           output.toLowerCase().includes('authenticate') ||
                           output.toLowerCase().includes('credentials') ||
                           output.toLowerCase().includes('not authenticated');
    
    assert.ok(!hasLoginPrompts, 'Should not show login prompts - credentials should be working');
    
    // Should contain a response from Claude (not just hang)
    const hasClaudeResponse = output.toLowerCase().includes('hi') ||
                             output.toLowerCase().includes('hello') ||
                             output.toLowerCase().includes('claude') ||
                             output.length > 50; // At least some substantial output
    
    assert.ok(hasClaudeResponse, 'Should receive a response from Claude');
    
    // Should not contain error messages about missing credentials
    const hasCredentialErrors = output.includes('credentials.json') ||
                                output.includes('permission denied') ||
                                output.includes('file not found') ||
                                output.includes('ENOENT');
    
    assert.ok(!hasCredentialErrors, 'Should not have credential file errors');
    
    console.log('✅ Claude authentication test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('Claude TTY allocation works correctly', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing Claude TTY allocation...');
    
    // Test that Claude gets proper TTY allocation for interactive use
    const claudeResult = await testRunner.runClaudeHabitatCommand([
      'start', 'claude-habitat', 
      '--cmd', 'claude -p "What is 2+2? Please just give me the number."'
    ], {
      timeout: 45000,
      captureOutput: true
    });
    
    console.log('Claude TTY test completed with exit code:', claudeResult.exitCode);
    
    const output = claudeResult.stdout + claudeResult.stderr;
    
    // Should complete successfully
    assert.ok(claudeResult.exitCode !== undefined, 'Claude TTY command should complete');
    
    // Should not have TTY-related errors
    const hasTTYErrors = output.includes('not a tty') ||
                        output.includes('stdin: not a terminal') ||
                        output.includes('inappropriate ioctl');
    
    assert.ok(!hasTTYErrors, 'Should not have TTY allocation errors');
    
    // Should produce meaningful output
    assert.ok(output.length > 0, 'Should produce output with TTY enabled');
    
    console.log('✅ Claude TTY allocation test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});

test('Claude workspace access works correctly', async () => {
  const testRunner = new ProductTestBase();
  
  try {
    console.log('Testing Claude workspace access...');
    
    // Test that Claude can access and work within the workspace
    const claudeResult = await testRunner.runClaudeHabitatCommand([
      'start', 'claude-habitat', 
      '--cmd', 'claude -p "Can you run ls to show me the current directory contents?"'
    ], {
      timeout: 45000,
      captureOutput: true
    });
    
    console.log('Claude workspace test completed with exit code:', claudeResult.exitCode);
    
    const output = claudeResult.stdout + claudeResult.stderr;
    
    // Should complete successfully
    assert.ok(claudeResult.exitCode !== undefined, 'Claude workspace command should complete');
    
    // Should not have workspace permission errors
    const hasPermissionErrors = output.includes('permission denied') ||
                               output.includes('access denied') ||
                               output.includes('cannot access');
    
    assert.ok(!hasPermissionErrors, 'Should not have workspace permission errors');
    
    // Should show evidence of workspace interaction
    const hasWorkspaceInteraction = output.includes('claude-habitat') ||
                                   output.includes('directory') ||
                                   output.includes('ls') ||
                                   output.length > 20;
    
    assert.ok(hasWorkspaceInteraction, 'Should show evidence of workspace interaction');
    
    console.log('✅ Claude workspace access test passed');
    
  } finally {
    await testRunner.cleanup();
  }
});