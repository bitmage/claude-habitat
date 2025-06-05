#!/usr/bin/env node

/**
 * Integration Test: Repository Access Pre-flight Check
 * 
 * Tests the repository access checking functionality as experienced by users,
 * including the system tools infrastructure that should be used instead of host tools.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

// Import the modules we're testing
const { testRepositoryAccess, testGitHubCliAccess, parseRepoPath } = require('../../src/github');

class IntegrationTestRunner {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    this.systemToolsPath = path.join(this.projectRoot, 'system/tools/bin');
    this.testResults = [];
  }

  async run() {
    console.log('🧪 Running Repository Access Integration Tests\n');
    
    try {
      await this.testSystemToolsAvailable();
      await this.testParseRepoPath();
      await this.testGitHubCliWithSystemTools();
      await this.testRepositoryAccessWithMockedTools();
      await this.testRepositoryAccessWithRealSystemTools();
      await this.testUserExperienceFlow();
      
      this.printResults();
      
      const failures = this.testResults.filter(r => !r.passed);
      if (failures.length > 0) {
        console.log(`\n❌ ${failures.length} test(s) failed`);
        process.exit(1);
      } else {
        console.log('\n✅ All integration tests passed!');
      }
    } catch (error) {
      console.error('💥 Test runner failed:', error.message);
      process.exit(1);
    }
  }

  async testSystemToolsAvailable() {
    const testName = 'System tools are available and executable';
    
    try {
      // Check that our system tools exist (install if needed)
      const tools = ['gh', 'rg', 'fd', 'jq', 'yq'];
      const results = [];
      
      // Ensure tools are installed for testing
      const toolsDir = path.join(this.projectRoot, 'system/tools');
      const installScript = path.join(toolsDir, 'install-tools.sh');
      
      try {
        // Check if gh exists, if not install tools
        const ghPath = path.join(this.systemToolsPath, 'gh');
        await fs.access(ghPath, fs.constants.F_OK);
      } catch {
        console.log('   Installing system tools for testing...');
        await execAsync(`cd "${toolsDir}" && ./install-tools.sh`, { timeout: 120000 });
      }
      
      for (const tool of tools) {
        const toolPath = path.join(this.systemToolsPath, tool);
        try {
          await fs.access(toolPath, fs.constants.F_OK | fs.constants.X_OK);
          results.push(`${tool}: ✓`);
        } catch (err) {
          results.push(`${tool}: ❌ (${err.code})`);
        }
      }
      
      // Test that gh specifically works
      const ghPath = path.join(this.systemToolsPath, 'gh');
      try {
        const { stdout } = await execAsync(`"${ghPath}" --version`);
        
        if (stdout.includes('gh version')) {
          results.push('gh --version: ✓');
          this.addResult(testName, true, results.join(', '));
        } else {
          this.addResult(testName, false, `gh version check failed: ${stdout}`);
        }
      } catch (error) {
        this.addResult(testName, false, `gh not working: ${error.message}`);
      }
    } catch (error) {
      this.addResult(testName, false, `Error: ${error.message}`);
    }
  }

  async testParseRepoPath() {
    const testName = 'parseRepoPath handles various URL formats';
    
    try {
      const testCases = [
        { input: 'https://github.com/user/repo', expected: 'user/repo' },
        { input: 'https://github.com/user/repo.git', expected: 'user/repo' },
        { input: 'git@github.com:user/repo.git', expected: 'user/repo' },
        { input: 'git@github.com:user/repo', expected: 'user/repo' },
        { input: 'invalid-url', expected: null },
        { input: '', expected: null },
        { input: null, expected: null }
      ];
      
      const results = [];
      for (const testCase of testCases) {
        const result = parseRepoPath(testCase.input);
        if (result === testCase.expected) {
          results.push(`"${testCase.input}" → "${result}" ✓`);
        } else {
          results.push(`"${testCase.input}" → "${result}" ❌ (expected "${testCase.expected}")`);
        }
      }
      
      const allPassed = results.every(r => r.includes('✓'));
      this.addResult(testName, allPassed, results.join('; '));
    } catch (error) {
      this.addResult(testName, false, `Error: ${error.message}`);
    }
  }

  async testGitHubCliWithSystemTools() {
    const testName = 'testGitHubCliAccess uses injected gh command';
    
    try {
      const ghPath = path.join(this.systemToolsPath, 'gh');
      
      // Test with a public repository that should exist
      const result = await testGitHubCliAccess('octocat/Hello-World', ghPath);
      
      // We expect this to fail with authentication error (since we're not logged in)
      // but it should use our system gh, not fail with "command not found"
      if (result.error && result.error.includes('command not found')) {
        this.addResult(testName, false, `Still trying to use system gh: ${result.error}`);
      } else if (result.error && (result.error.includes('not authenticated') || result.error.includes('GitHub CLI error'))) {
        this.addResult(testName, true, `Correctly using system gh (expected auth error): ${result.error}`);
      } else if (result.accessible) {
        this.addResult(testName, true, `System gh working and authenticated: ${result.error || 'success'}`);
      } else {
        this.addResult(testName, true, `System gh working but expected auth/access issue: ${result.error}`);
      }
    } catch (error) {
      this.addResult(testName, false, `Error: ${error.message}`);
    }
  }

  async testRepositoryAccessWithMockedTools() {
    const testName = 'testRepositoryAccess with mocked gh command';
    
    try {
      // Create a mock gh command that simulates "not found"
      const mockGhPath = '/bin/false';  // This command always fails with exit code 1
      
      const result = await testRepositoryAccess(
        'https://github.com/user/repo', 
        'write', 
        { ghCommand: mockGhPath }
      );
      
      // Should detect the failure but not crash
      if (result.accessible === false && result.issues) {
        const ghIssue = result.issues.find(issue => issue.type === 'github-cli');
        if (ghIssue) {
          this.addResult(testName, true, `Correctly detected gh failure: ${ghIssue.error}`);
        } else {
          this.addResult(testName, false, `Expected github-cli issue but got: ${JSON.stringify(result.issues)}`);
        }
      } else {
        this.addResult(testName, false, `Expected failure but got accessible: ${result.accessible}, reason: ${result.reason}`);
      }
    } catch (error) {
      this.addResult(testName, false, `Error: ${error.message}`);
    }
  }

  async testRepositoryAccessWithRealSystemTools() {
    const testName = 'testRepositoryAccess with real system tools';
    
    try {
      // Test with our actual system tools
      const result = await testRepositoryAccess('https://github.com/octocat/Hello-World', 'write');
      
      // We expect this to have GitHub CLI issues (since we're not authenticated)
      // but should not have "command not found" errors
      if (result.accessible === false) {
        const hasCommandNotFound = JSON.stringify(result).includes('command not found');
        if (hasCommandNotFound) {
          this.addResult(testName, false, `Still getting 'command not found': ${JSON.stringify(result)}`);
        } else {
          this.addResult(testName, true, `System tools working, expected auth issues: ${result.reason}`);
        }
      } else {
        this.addResult(testName, true, `System tools working and authenticated: ${result.reason}`);
      }
    } catch (error) {
      this.addResult(testName, false, `Error: ${error.message}`);
    }
  }

  async testUserExperienceFlow() {
    const testName = 'User experience flow: pre-flight check with system tools';
    
    try {
      // Simulate the user experience flow from claude-habitat.js
      // This tests the actual integration path
      
      const testRepos = [
        { url: 'https://github.com/bitmage/county-fence-plugin', access: 'write' },
        { url: 'https://github.com/bitmage/discourse-calendar', access: 'write' }
      ];
      
      const results = [];
      for (const repo of testRepos) {
        const result = await testRepositoryAccess(repo.url, repo.access);
        results.push({
          url: repo.url,
          accessible: result.accessible,
          reason: result.reason,
          hasCommandNotFound: JSON.stringify(result).includes('command not found')
        });
      }
      
      // Check that none of the results have "command not found"
      const commandNotFoundResults = results.filter(r => r.hasCommandNotFound);
      
      if (commandNotFoundResults.length === 0) {
        this.addResult(testName, true, `All repositories tested with system tools. Results: ${JSON.stringify(results.map(r => ({ url: r.url, accessible: r.accessible })))}`);
      } else {
        this.addResult(testName, false, `Found 'command not found' in ${commandNotFoundResults.length} results: ${JSON.stringify(commandNotFoundResults)}`);
      }
    } catch (error) {
      this.addResult(testName, false, `Error: ${error.message}`);
    }
  }

  addResult(testName, passed, details) {
    this.testResults.push({ testName, passed, details });
  }

  printResults() {
    console.log('\n📊 Test Results:\n');
    this.testResults.forEach((result, index) => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.testName}`);
      if (result.details) {
        console.log(`   ${result.details}`);
      }
      console.log('');
    });
  }
}

// Run the tests if this file is executed directly
if (require.main === module) {
  const runner = new IntegrationTestRunner();
  runner.run().catch(console.error);
}

module.exports = IntegrationTestRunner;