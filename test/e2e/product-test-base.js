const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const path = require('path');

/**
 * Base class for product-focused e2e testing
 * Tests our actual claude-habitat product, not external infrastructure
 */
class ProductTestBase {
  constructor() {
    this.testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.cleanupActions = [];
    this.projectRoot = path.join(__dirname, '..', '..');
    this.claudeHabitatScript = path.join(this.projectRoot, 'claude-habitat.js');
  }

  /**
   * Clean test environment - remove test artifacts
   */
  async cleanupTestEnvironment(habitatName = null) {
    console.log(`Cleaning up test environment${habitatName ? ` for ${habitatName}` : ''}...`);
    
    try {
      // Remove any running containers with test prefix or habitat name
      const containerPattern = habitatName ? habitatName : this.testId;
      const { stdout: containers } = await execAsync(
        `docker ps -aq --filter "name=${containerPattern}" 2>/dev/null || true`
      );
      
      if (containers.trim()) {
        await execAsync(`docker stop ${containers.trim().split('\n').join(' ')} 2>/dev/null || true`);
        await execAsync(`docker rm ${containers.trim().split('\n').join(' ')} 2>/dev/null || true`);
      }

      // Remove any test images
      const { stdout: images } = await execAsync(
        `docker images -q --filter "label=test-id=${this.testId}" 2>/dev/null || true`
      );
      
      if (images.trim()) {
        await execAsync(`docker rmi ${images.trim().split('\n').join(' ')} 2>/dev/null || true`);
      }

      // Remove habitat-specific images if requested
      if (habitatName) {
        const { stdout: habitatImages } = await execAsync(
          `docker images -q "claude-habitat-${habitatName}:*" 2>/dev/null || true`
        );
        
        if (habitatImages.trim()) {
          await execAsync(`docker rmi ${habitatImages.trim().split('\n').join(' ')} 2>/dev/null || true`);
        }
      }

    } catch (err) {
      // Ignore cleanup errors - they're common in test environments
    }
  }

  /**
   * Build habitat from scratch using our actual product code
   */
  async buildHabitatFromScratch(habitatName, options = {}) {
    const startTime = Date.now();
    
    try {
      // First clean up any existing artifacts
      await this.cleanupTestEnvironment(habitatName);
      
      // Prepare the command arguments
      const args = ['test', habitatName, '--system'];
      if (options.verifyFs) {
        args.push('--verify-fs');
      }
      
      console.log(`Building ${habitatName} habitat from scratch...`);
      console.log(`Command: node ${this.claudeHabitatScript} ${args.join(' ')}`);
      
      // Run the claude-habitat command
      const result = await this.runClaudeHabitatCommand(args, {
        timeout: options.timeout || 300000, // 5 minutes default timeout
        captureOutput: true
      });
      
      const duration = Date.now() - startTime;
      
      // Parse the results
      const buildResult = {
        success: result.exitCode === 0,
        duration,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        // Analyze output for specific success indicators
        baseImageCreated: result.stdout.includes('Base image ready') || result.stdout.includes('Using base image'),
        preparedImageCreated: result.stdout.includes('Prepared image ready') || result.stdout.includes('Using cached prepared image'),
        repositoryCloned: result.stdout.includes('Cloning') || result.stdout.includes('Repository'),
        scriptsCommandsRan: result.stdout.includes('Running scripts') || result.stdout.includes('Scripts complete'),
        testsExecuted: result.stdout.includes('test') && result.stdout.includes('ok'),
        filesystemVerified: options.verifyFs && result.stdout.includes('Filesystem verification')
      };
      
      return buildResult;
      
    } catch (err) {
      return {
        success: false,
        duration: Date.now() - startTime,
        error: err.message,
        exitCode: err.code || 1
      };
    }
  }

  /**
   * Verify a habitat works correctly
   */
  async verifyHabitat(habitatName, options = {}) {
    try {
      console.log(`Verifying ${habitatName} habitat...`);
      
      // Check if prepared image exists
      const { stdout: images } = await execAsync(
        `docker images --format "{{.Repository}}:{{.Tag}}" | grep "claude-habitat-${habitatName}:"`
      );
      
      const imageExists = images.trim().length > 0;
      
      // Try to run system tests if image exists
      let systemTestsPass = false;
      let filesystemVerified = false;
      
      if (imageExists) {
        try {
          const testResult = await this.runClaudeHabitatCommand(['test', habitatName, '--system'], {
            timeout: 60000 // 1 minute for verification
          });
          systemTestsPass = testResult.exitCode === 0;
        } catch (err) {
          // Test failures are not fatal for verification
        }
        
        // Try filesystem verification if requested
        if (options.verifyFs) {
          try {
            const fsResult = await this.runClaudeHabitatCommand(['test', habitatName, '--verify-fs'], {
              timeout: 30000 // 30 seconds for fs verification
            });
            filesystemVerified = fsResult.exitCode === 0;
          } catch (err) {
            // FS verification failures are not fatal
          }
        }
      }
      
      return {
        imageExists,
        systemTestsPass,
        filesystemVerified,
        containerStarts: imageExists, // If image exists, assume container can start
        success: imageExists && systemTestsPass
      };
      
    } catch (err) {
      return {
        success: false,
        error: err.message,
        imageExists: false,
        systemTestsPass: false,
        filesystemVerified: false,
        containerStarts: false
      };
    }
  }

  /**
   * Run claude-habitat command with proper error handling
   */
  async runClaudeHabitatCommand(args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [this.claudeHabitatScript, ...args], {
        cwd: this.projectRoot,
        stdio: options.captureOutput ? 'pipe' : 'inherit',
        env: { ...process.env, ...options.env }
      });

      let stdout = '';
      let stderr = '';
      let timeoutId;

      if (options.captureOutput) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      if (options.timeout) {
        timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Command timed out after ${options.timeout}ms`));
        }, options.timeout);
      }

      child.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        
        resolve({
          exitCode: code,
          stdout,
          stderr
        });
      });

      child.on('error', (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  /**
   * Time a habitat build operation
   */
  async timeHabitatBuild(habitatName, options = {}) {
    const startTime = Date.now();
    const result = await this.buildHabitatFromScratch(habitatName, options);
    const duration = Date.now() - startTime;
    
    return {
      duration,
      success: result.success,
      result
    };
  }

  /**
   * Cleanup resources created during testing
   */
  async cleanup() {
    console.log('Running test cleanup...');
    
    // Execute any registered cleanup actions
    for (const action of this.cleanupActions) {
      try {
        await action();
      } catch (err) {
        // Ignore cleanup errors
      }
    }
    
    // Final environment cleanup
    await this.cleanupTestEnvironment();
  }

  /**
   * Register a cleanup action to run later
   */
  registerCleanup(action) {
    this.cleanupActions.push(action);
  }
}

module.exports = { ProductTestBase };