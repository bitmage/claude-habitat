/**
 * @module cli
 * @description CLI interaction utilities for Claude Habitat
 * 
 * Provides interactive CLI utilities for user input, confirmations, and
 * terminal interactions. Supports the interactive-first architecture
 * with graceful user experience patterns.
 * 
 * @requires module:standards/ui-architecture - Scene-based UI patterns
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/main-entry-point.test.js`
 * - UI tests: `npm run test:ui`
 * - Run all tests: `npm test`
 */

const readline = require('readline');

const askToContinue = async (message = 'Press Enter to return to main menu...') => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  await new Promise(resolve => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
};

const askQuestion = async (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

module.exports = {
  askToContinue,
  askQuestion
};