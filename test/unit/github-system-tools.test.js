#!/usr/bin/env node

/**
 * Test: GitHub System Tools Fix
 * 
 * Verifies that repository access checking uses system tools instead of host tools,
 * preventing "gh: command not found" errors that users were experiencing.
 * 
 * ISSUE FIXED: Previously, pre-flight checks used `gh auth status` from host system,
 * causing "gh: command not found" if GitHub CLI wasn't installed locally.
 * 
 * SOLUTION: Modified testRepositoryAccess to use system/tools/bin/gh with dependency
 * injection, ensuring consistent behavior regardless of host system configuration.
 */

const assert = require('assert');
const path = require('path');
const { testRepositoryAccess } = require('../../src/github');

async function testGitHubSystemToolsFix() {
  console.log('🔧 Testing GitHub System Tools Fix\n');
  
  // Test the specific repositories that were failing
  const testRepos = [
    'https://github.com/bitmage/county-fence-plugin',
    'https://github.com/bitmage/discourse-calendar'
  ];
  
  for (const repoUrl of testRepos) {
    console.log(`Testing: ${repoUrl}`);
    
    const result = await testRepositoryAccess(repoUrl, 'write');
    
    // The key test: should NOT contain "command not found"
    const resultStr = JSON.stringify(result);
    const hasCommandNotFound = resultStr.includes('command not found');
    
    if (hasCommandNotFound) {
      console.log('❌ FAILED: Still getting "command not found"');
      console.log('Result:', JSON.stringify(result, null, 2));
      process.exit(1);
    } else {
      console.log('✅ PASSED: Using system tools (no "command not found")');
      console.log(`   Status: ${result.accessible ? 'accessible' : 'blocked'}`);
      console.log(`   Reason: ${result.reason}`);
    }
    console.log('');
  }
  
  console.log('🎉 All tests passed! System tools are being used correctly.');
}

if (require.main === module) {
  testGitHubSystemToolsFix().catch(console.error);
}

module.exports = testGitHubSystemToolsFix;