/**
 * Test sequences for UI testing
 * Each sequence represents a path through the menu system
 */

const TEST_SEQUENCES = [
  // Basic navigation
  { seq: 'q', desc: 'Main menu > Quit' },
  { seq: 'h', desc: 'Main menu > Help' },
  
  // Test menu navigation
  { seq: 'tq', desc: 'Main menu > Test menu > Quit' },
  { seq: 'ta', desc: 'Test menu > All tests for all habitats' },
  
  // Base habitat testing
  { seq: 't1s', desc: 'Test > Base > System tests' },
  { seq: 't1h1', desc: 'Test > Base > Shared tests' },
  { seq: 't1h2', desc: 'Test > Base > Habitat tests' },
  { seq: 't1f', desc: 'Test > Base > Filesystem verification' },
  { seq: 't1a', desc: 'Test > Base > All tests' },
  
  // Claude-habitat testing
  { seq: 't2s', desc: 'Test > Claude-habitat > System tests' },
  { seq: 't2h1', desc: 'Test > Claude-habitat > Shared tests' },
  { seq: 't2h2', desc: 'Test > Claude-habitat > Habitat tests' },
  { seq: 't2f', desc: 'Test > Claude-habitat > Filesystem verification' },
  { seq: 't2a', desc: 'Test > Claude-habitat > All tests' },
  
  // Discourse testing
  { seq: 't3s', desc: 'Test > Discourse > System tests' },
  { seq: 't3h1', desc: 'Test > Discourse > Shared tests' },
  { seq: 't3h2', desc: 'Test > Discourse > Habitat tests' },
  { seq: 't3f', desc: 'Test > Discourse > Filesystem verification' },
  { seq: 't3a', desc: 'Test > Discourse > All tests' },
  
  // Start habitat shortcuts
  { seq: 's', desc: 'Start most recent habitat' },
  { seq: '1', desc: 'Start habitat 1 (base)' },
  { seq: '2', desc: 'Start habitat 2 (claude-habitat)' },
  { seq: '3', desc: 'Start habitat 3 (discourse)' },
  
  // Other options
  { seq: 'a', desc: 'Add new habitat' },
  { seq: 'm', desc: 'Maintenance mode' },
  { seq: 'c', desc: 'Clean Docker images' },
  { seq: 'o', desc: 'Tools management' },
  { seq: 'i', desc: 'Initialize (if needed)' },
  
  // Invalid input handling
  { seq: 'xyz', desc: 'Invalid input handling' },
  { seq: '999', desc: 'Invalid habitat number' },
  { seq: 't999', desc: 'Test menu > Invalid habitat number' },
];

module.exports = { TEST_SEQUENCES };