/**
 * @module scenes/scene-runner
 * @description Scene execution engine for Claude Habitat interactive flows
 * 
 * Implements the scene-based UI architecture by running scenes in sequence.
 * Manages scene transitions, error handling, and context cleanup for both
 * interactive and test modes.
 * 
 * @requires module:scenes/scene-context - Scene execution context
 * @requires module:standards/ui-architecture - Scene-based UI patterns
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - UI tests: `npm run test:ui`
 * - Scene flow testing through UI snapshots
 */

const { SceneContext } = require('./scene-context');

/**
 * Run scenes in interactive mode
 */
async function runScene(startScene) {
  const context = new SceneContext('interactive');
  let currentScene = startScene;

  try {
    while (currentScene) {
      currentScene = await currentScene(context);
    }
    context.setExitStatus(0, 'completed');
  } catch (error) {
    context.error(`Fatal error: ${error.message}`);
    context.setExitStatus(1, 'error');
  } finally {
    context.cleanup();
  }

  return context;
}

/**
 * Run scenes with a test sequence
 */
async function runSequence(startScene, sequence, options = {}) {
  const context = new SceneContext('test', sequence, options);
  let currentScene = startScene;
  let timeout;

  try {
    // Set a timeout for the entire sequence
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error('Sequence timed out after 30 seconds'));
      }, 30000);
    });

    // Run the sequence
    const runPromise = (async () => {
      while (currentScene && context.sequenceIndex < sequence.length) {
        currentScene = await currentScene(context);
      }
      
      // Capture final state if sequence ends but scene continues
      if (currentScene) {
        context.log('\n[Sequence ended, scene still active]');
      }
    })();

    // Race between sequence completion and timeout
    await Promise.race([runPromise, timeoutPromise]);
    
    context.setExitStatus(0, 'completed');
  } catch (error) {
    context.error(`Fatal error: ${error.message}`);
    context.setExitStatus(1, 'error');
  } finally {
    clearTimeout(timeout);
    context.cleanup();
  }

  return context;
}

/**
 * Run all test sequences and generate snapshots
 */
async function runAllSequences(startScene, sequences) {
  const results = [];

  for (const { seq, desc, expected } of sequences) {
    console.log(`Running sequence: ${seq} - ${desc}`);
    const context = await runSequence(startScene, seq);
    
    results.push({
      sequence: seq,
      description: desc,
      expected: expected,
      output: context.getOutput(),
      metadata: context.getMetadata()
    });
  }

  return results;
}

/**
 * Format snapshot results into text
 */
function formatSnapshots(results) {
  const lines = [];
  
  lines.push('=== Claude Habitat UI Snapshots ===');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total sequences: ${results.length}`);
  lines.push('');

  for (const result of results) {
    lines.push('=' .repeat(60));
    lines.push(`Sequence: ${result.sequence}`);
    lines.push(`Description: ${result.description}`);
    
    // Add expected behavior if available
    if (result.expected) {
      lines.push(`Expected: ${result.expected}`);
    }
    
    lines.push(`Status: ${result.metadata.status}`);
    lines.push(`Exit Code: ${result.metadata.exitCode}`);
    lines.push('-' .repeat(60));
    lines.push(result.output);
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = {
  runScene,
  runInteractive: runScene, // Alias for backward compatibility  
  runSequence,
  runAllSequences,
  formatSnapshots
};