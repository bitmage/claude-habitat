/**
 * @module event-pipeline
 * @description Event-driven pipeline framework using RxJS for Claude Habitat
 * 
 * Provides an observable pipeline system for long-running operations with
 * progress tracking, error handling, and snapshot integration. Enables
 * real-time feedback during container builds and other operations.
 * 
 * ## Terminology: Stages vs Phases
 * 
 * This module uses "stage" terminology internally to represent the atomic units
 * of pipeline execution. However, users see "phases" in the UI and documentation.
 * 
 * - **Stages**: Internal execution units including both phase work and snapshots
 *   - Examples: "1-base", "snapshot-base", "2-users", "snapshot-users"
 *   - Used for technical accuracy and progress tracking (22 stages total)
 * 
 * - **Phases**: Domain concepts representing logical build steps (12 phases total)
 *   - Examples: "base", "users", "env", "workdir", "habitat", etc.
 *   - Used in user-facing messages and domain documentation
 * 
 * The distinction maintains Domain Driven Design: users think in phases,
 * while the implementation tracks stages for technical precision.
 * 
 * @requires rxjs - Reactive Extensions for JavaScript
 * @requires module:snapshot-manager - Container snapshot management
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * @see {@link src/phases.js} - Phase definitions and domain concepts
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/event-pipeline.test.js`
 * - Run all tests: `npm test`
 */

// Simplified event pipeline without RxJS dependency

/**
 * Simple event-driven pipeline with callback-based progress reporting
 * 
 * Usage:
 *   const pipeline = new EventPipeline('habitat-build')
 *     .stage('validate', validateConfig)
 *     .stage('build-base', buildBaseImage);
 *   
 *   pipeline.onProgress((event) => console.log(event));
 *   const result = await pipeline.run(context);
 */
class EventPipeline {
  constructor(name) {
    this.name = name;
    this.stages = [];
    this.progressCallback = null;
    this.currentStage = 0;
    this.totalStages = 0;
  }

  /**
   * Add a stage to the pipeline
   */
  stage(name, handler, options = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Stage name must be a non-empty string');
    }
    
    if (!handler || typeof handler !== 'function') {
      throw new Error('Stage handler must be a function');
    }

    this.stages.push({
      name,
      handler,
      options: { noSnapshot: false, timeout: 300000, ...options }
    });
    
    this.totalStages = this.stages.length;
    return this;
  }

  /**
   * Set progress callback
   */
  onProgress(callback) {
    this.progressCallback = callback;
    return { unsubscribe: () => { this.progressCallback = null; } };
  }

  /**
   * Emit progress event
   */
  _emit(event) {
    if (this.progressCallback) {
      this.progressCallback(event);
    }
  }

  /**
   * Execute the pipeline
   */
  async run(context) {
    this.currentStage = 0;
    
    this._emit({
      type: 'pipeline-start',
      pipeline: this.name,
      totalStages: this.totalStages,
      timestamp: Date.now()
    });

    try {
      let currentContext = context;
      
      for (const stage of this.stages) {
        this.currentStage++;
        currentContext = await this._runStage(stage, currentContext);
      }

      this._emit({
        type: 'pipeline-complete',
        pipeline: this.name,
        result: currentContext,
        timestamp: Date.now()
      });

      return currentContext;
    } catch (error) {
      this._emit({
        type: 'pipeline-error',
        pipeline: this.name,
        error: error.message,
        stage: this.currentStage,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * Run a single stage
   */
  async _runStage(stage, context) {
    const startTime = Date.now();
    
    this._emit({
      type: 'stage-start',
      pipeline: this.name,
      stage: stage.name,
      stageNumber: this.currentStage,
      totalStages: this.totalStages,
      progress: Math.round((this.currentStage - 1) / this.totalStages * 100),
      timestamp: startTime
    });

    try {
      // Execute with timeout if specified
      const result = stage.options.timeout 
        ? await Promise.race([
            stage.handler(context),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Stage ${stage.name} timed out`)), stage.options.timeout)
            )
          ])
        : await stage.handler(context);
      
      const duration = Date.now() - startTime;
      this._emit({
        type: 'stage-complete',
        pipeline: this.name,
        stage: stage.name,
        stageNumber: this.currentStage,
        totalStages: this.totalStages,
        progress: Math.round(this.currentStage / this.totalStages * 100),
        duration,
        result: 'pass',
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this._emit({
        type: 'stage-complete',
        pipeline: this.name,
        stage: stage.name,
        stageNumber: this.currentStage,
        totalStages: this.totalStages,
        progress: Math.round(this.currentStage / this.totalStages * 100),
        duration,
        result: 'fail',
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }
}

module.exports = {
  EventPipeline
};