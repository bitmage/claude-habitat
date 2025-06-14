/**
 * @module progress-ui
 * @description Progress reporting and user interface for event pipelines
 * 
 * Provides console-based progress bars, time estimates, and formatted output
 * for long-running operations. Integrates with EventPipeline to show real-time
 * progress during container builds and other operations.
 * 
 * @requires module:event-pipeline - Event pipeline framework
 * @requires module:utils - Utility functions for colors and formatting
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/progress-ui.test.js`
 * - Run all tests: `npm test`
 */

const { colors } = require('./utils');

/**
 * Simple progress reporter for event pipelines
 * 
 * Usage:
 *   const progressReporter = new ProgressReporter();
 *   progressReporter.attach(pipeline);
 */
class ProgressReporter {
  constructor(options = {}) {
    this.options = {
      showDurations: true,
      showProgress: true,
      showSnapshots: true,
      ...options
    };
    
    this.startTime = null;
  }

  /**
   * Attach to an event pipeline
   */
  attach(pipeline) {
    return pipeline.onProgress(event => this.handleEvent(event));
  }

  /**
   * Handle progress events from the pipeline
   * 
   * @private
   * @param {Object} event - Progress event
   */
  handleEvent(event) {
    switch (event.type) {
      case 'pipeline-start':
        this.handlePipelineStart(event);
        break;
      case 'stage-start':
        this.handleStageStart(event);
        break;
      case 'stage-complete':
        this.handleStageComplete(event);
        break;
      case 'stage-error':
        this.handleStageError(event);
        break;
      case 'pipeline-complete':
        this.handlePipelineComplete(event);
        break;
      case 'pipeline-error':
        this.handlePipelineError(event);
        break;
      case 'snapshot-created':
        this.handleSnapshotCreated(event);
        break;
    }
  }

  /**
   * Handle pipeline start event
   * 
   * @private
   * @param {Object} event - Pipeline start event
   */
  handlePipelineStart(event) {
    this.startTime = event.timestamp;
    console.log(`🚀 Starting ${event.pipeline}...`);
    console.log(`📋 ${event.totalStages} stages to complete`);
    console.log('');
  }

  /**
   * Handle stage start event
   */
  handleStageStart(event) {
    const progress = this.options.showProgress ? `[${event.progress}%] ` : '';
    console.log(`${progress}${this.capitalize(event.stage)}...`);
  }

  /**
   * Handle stage completion event
   */
  handleStageComplete(event) {
    const duration = this.options.showDurations ? ` (${this.formatDuration(event.duration)})` : '';
    const progress = this.options.showProgress ? `[${event.progress}%] ` : '';
    
    if (event.result === 'pass') {
      console.log(`${progress}${colors.green('✅')} ${this.capitalize(event.stage)}${duration}`);
    } else {
      console.log(`${progress}${colors.red('❌')} ${this.capitalize(event.stage)}${duration}`);
      if (event.error) {
        console.log(`   ${colors.red('Error:')} ${event.error}`);
      }
    }
  }

  /**
   * Handle stage error event
   * 
   * @private
   * @param {Object} event - Stage error event
   */
  handleStageError(event) {
    console.log(`${colors.red('❌')} ${this.capitalize(event.stage)} failed`);
    console.log(`   ${colors.red('Error:')} ${event.error}`);
  }

  /**
   * Handle pipeline completion event
   * 
   * @private
   * @param {Object} event - Pipeline completion event
   */
  handlePipelineComplete(event) {
    const totalDuration = event.timestamp - this.startTime;
    console.log('');
    console.log(`${colors.green('✅')} ${event.pipeline} ready in ${this.formatDuration(totalDuration)}`);
  }

  /**
   * Handle pipeline error event
   * 
   * @private
   * @param {Object} event - Pipeline error event
   */
  handlePipelineError(event) {
    console.log('');
    console.log(`${colors.red('❌')} ${event.pipeline} failed`);
    console.log(`   ${colors.red('Error:')} ${event.error}`);
    if (event.stage) {
      console.log(`   ${colors.yellow('Failed at stage:')} ${event.stage}`);
    }
  }

  /**
   * Handle snapshot creation event
   * 
   * @private
   * @param {Object} event - Snapshot creation event
   */
  handleSnapshotCreated(event) {
    if (this.options.showSnapshots) {
      console.log(`   ${colors.cyan('→')} snapshot: ${event.tag}`);
    }
  }


  /**
   * Format duration in milliseconds to human readable
   * 
   * @private
   * @param {number} ms - Duration in milliseconds
   * @returns {string} - Formatted duration
   */
  formatDuration(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Capitalize first letter of string
   * 
   * @private
   * @param {string} str - String to capitalize
   * @returns {string} - Capitalized string
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

/**
 * Simple progress indicator for operations without detailed stages
 * 
 * Usage:
 *   const spinner = new SimpleSpinner('Building image');
 *   spinner.start();
 *   // ... long operation ...
 *   spinner.stop('Complete!');
 */
class SimpleSpinner {
  constructor(message) {
    this.message = message;
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.frameIndex = 0;
    this.interval = null;
  }

  /**
   * Start the spinner
   */
  start() {
    process.stdout.write(`${this.frames[0]} ${this.message}...`);
    
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      process.stdout.write(`\r${this.frames[this.frameIndex]} ${this.message}...`);
    }, 80);
  }

  /**
   * Stop the spinner and show completion message
   * 
   * @param {string} finalMessage - Message to show on completion
   */
  stop(finalMessage = 'Complete') {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    process.stdout.write(`\r${colors.green('✅')} ${finalMessage}\n`);
  }

  /**
   * Stop the spinner and show error message
   * 
   * @param {string} errorMessage - Error message to show
   */
  error(errorMessage = 'Failed') {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    process.stdout.write(`\r${colors.red('❌')} ${errorMessage}\n`);
  }
}

module.exports = {
  ProgressReporter,
  SimpleSpinner
};