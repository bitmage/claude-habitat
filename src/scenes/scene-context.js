const readline = require('readline');
const { colors } = require('../utils');

/**
 * Context object for scene execution
 * Handles input/output for both interactive and test modes
 */
class SceneContext {
  constructor(mode = 'interactive', sequence = '', options = {}) {
    this.mode = mode;
    this.sequence = sequence;
    this.sequenceIndex = 0;
    this.output = [];
    this.captureOutput = mode === 'test';
    this.preserveColors = options.preserveColors || false;
    this.rl = null;
    this.exitCode = 0;
    this.status = 'running';
  }

  /**
   * Initialize readline interface for interactive mode
   */
  initReadline() {
    if (this.mode === 'interactive' && !this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
    }
  }

  /**
   * Get input based on mode (interactive or test sequence)
   */
  async getInput(prompt = 'Enter your choice: ') {
    if (this.mode === 'test') {
      // In test mode, return next character from sequence
      const input = this.sequence[this.sequenceIndex++] || 'q';
      this.log(`${prompt}${input}`);
      return input;
    }

    // Interactive mode
    this.initReadline();
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Output text (captured in test mode)
   */
  log(...args) {
    const text = args.join(' ');
    
    if (this.captureOutput) {
      // Strip ANSI color codes for snapshots by default
      const stripped = this.preserveColors ? text : text.replace(/\x1b\[[0-9;]*m/g, '');
      this.output.push(stripped);
    } else {
      // Interactive mode - always show colors
      console.log(...args);
    }
  }

  /**
   * Output error text
   */
  error(...args) {
    const text = args.join(' ');
    
    if (this.captureOutput) {
      const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
      this.output.push(`ERROR: ${stripped}`);
    } else {
      console.error(...args);
    }
  }

  /**
   * Clear screen (only in interactive mode)
   */
  clear() {
    if (this.mode === 'interactive' && !this.captureOutput) {
      console.clear();
    }
  }

  /**
   * Set exit code and status
   */
  setExitStatus(code, status = 'exited') {
    this.exitCode = code;
    this.status = status;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  /**
   * Get captured output as string
   */
  getOutput() {
    return this.output.join('\n');
  }

  /**
   * Get snapshot metadata
   */
  getMetadata() {
    return {
      sequence: this.sequence,
      exitCode: this.exitCode,
      status: this.status,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { SceneContext };