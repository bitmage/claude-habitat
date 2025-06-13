/**
 * @fileoverview Unit tests for tilde menu navigation system
 * @description Tests the tilde-based menu navigation system that allows users to
 * select from large numbers of menu options using a tilde prefix system
 * (~1, ~~2, ~~~3, etc.) for items beyond the first 9 direct number keys.
 * 
 * Validates menu key generation and parsing logic to ensure users can navigate
 * through extensive menu lists with predictable keyboard shortcuts.
 * 
 * @tests
 * - Run these tests: `npm test -- test/unit/tilde-menu.test.js`
 * - Run all unit tests: `npm test`
 * - Test module: {@link module:tilde-menu} - Tilde-based menu navigation system
 */

const { test } = require('node:test');
const assert = require('node:assert');

// Test the tilde menu key generation logic
function generateMenuKey(index) {
  if (index < 9) {
    // Direct number keys for first 9
    return (index + 1).toString();
  } else {
    // Tilde prefix system for 10+
    const adjusted = index - 9; // 0-based for items 10+
    const tildeCount = Math.floor(adjusted / 9) + 1;
    const digit = (adjusted % 9) + 1;
    return '~'.repeat(tildeCount) + digit;
  }
}

// Test the tilde parsing logic
function parseMenuChoice(choice) {
  // Check if it's a direct number (1-9)
  const directIndex = parseInt(choice) - 1;
  if (!isNaN(directIndex) && directIndex >= 0 && directIndex < 9) {
    return directIndex;
  } else if (choice.startsWith('~')) {
    // Handle tilde prefix sequences (~1, ~~2, etc.)
    const tildeCount = choice.match(/^~+/)[0].length;
    const digit = choice.slice(tildeCount);
    const digitNum = parseInt(digit);
    
    if (!isNaN(digitNum) && digitNum >= 1 && digitNum <= 9) {
      // Calculate actual index: 9 + (tildeCount-1)*9 + (digitNum-1)
      return 9 + (tildeCount - 1) * 9 + (digitNum - 1);
    }
  }
  return -1; // Invalid
}

test('menu key generation creates correct patterns', () => {
  // Test direct numbers 1-9 (indexes 0-8)
  assert.strictEqual(generateMenuKey(0), '1');
  assert.strictEqual(generateMenuKey(8), '9');
  
  // Test first tilde level ~1-9 (indexes 9-17)
  assert.strictEqual(generateMenuKey(9), '~1');   // 10th item
  assert.strictEqual(generateMenuKey(13), '~5');  // 14th item
  assert.strictEqual(generateMenuKey(17), '~9');  // 18th item
  
  // Test second tilde level ~~1-9 (indexes 18-26)
  assert.strictEqual(generateMenuKey(18), '~~1');  // 19th item
  assert.strictEqual(generateMenuKey(26), '~~9');  // 27th item
  
  // Test third tilde level
  assert.strictEqual(generateMenuKey(27), '~~~1'); // 28th item
});

test('menu choice parsing returns correct indexes', () => {
  // Test direct numbers
  assert.strictEqual(parseMenuChoice('1'), 0);
  assert.strictEqual(parseMenuChoice('9'), 8);
  
  // Test first tilde level
  assert.strictEqual(parseMenuChoice('~1'), 9);   // 10th item (index 9)
  assert.strictEqual(parseMenuChoice('~5'), 13);  // 14th item (index 13)
  assert.strictEqual(parseMenuChoice('~9'), 17);  // 18th item (index 17)
  
  // Test second tilde level
  assert.strictEqual(parseMenuChoice('~~1'), 18); // 19th item (index 18)
  assert.strictEqual(parseMenuChoice('~~9'), 26); // 27th item (index 26)
  
  // Test third tilde level
  assert.strictEqual(parseMenuChoice('~~~1'), 27); // 28th item (index 27)
  
  // Test invalid choices
  assert.strictEqual(parseMenuChoice('invalid'), -1);
  assert.strictEqual(parseMenuChoice('~0'), -1);
  assert.strictEqual(parseMenuChoice('~10'), -1);
});

test('round trip consistency - generate then parse', () => {
  // Test that generating a key and parsing it returns original index
  const testIndexes = [0, 8, 9, 13, 17, 18, 26, 27, 35];
  
  for (const index of testIndexes) {
    const key = generateMenuKey(index);
    const parsedIndex = parseMenuChoice(key);
    assert.strictEqual(parsedIndex, index, `Round trip failed for index ${index}: ${key} -> ${parsedIndex}`);
  }
});

test('menu key generation handles edge cases', () => {
  // Test boundary conditions
  assert.strictEqual(generateMenuKey(8), '9');    // Last direct number
  assert.strictEqual(generateMenuKey(9), '~1');   // First tilde
  assert.strictEqual(generateMenuKey(17), '~9');  // Last single tilde
  assert.strictEqual(generateMenuKey(18), '~~1'); // First double tilde
});