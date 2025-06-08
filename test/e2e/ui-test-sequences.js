/**
 * Test sequences for UI testing
 * Each sequence represents a path through the menu system
 */

const TEST_SEQUENCES = [
  // Basic navigation
  { 
    seq: 'q', 
    desc: 'Main menu > Quit',
    expected: 'Display main menu with options (s/1/2/3/t/h/a/m/c/o/i/q), then exit cleanly when q is pressed'
  },
  { 
    seq: 'h', 
    desc: 'Main menu > Help',
    expected: 'Display main menu, then show comprehensive help text with usage instructions and examples'
  },
  
  // Test menu navigation
  { 
    seq: 'tq', 
    desc: 'Main menu > Test menu > Quit',
    expected: 'Display main menu, then test menu with habitat list and options (a/s/h/q), then return to main menu on q'
  },
  { 
    seq: 'ta', 
    desc: 'Test menu > All tests for all habitats',
    expected: 'Show main menu, test menu, then execute comprehensive tests for all configured habitats'
  },
  
  // Base habitat testing
  { 
    seq: 't1s', 
    desc: 'Test > Base > System tests',
    expected: 'Navigate to test menu, select base habitat (1), then run system infrastructure tests'
  },
  { 
    seq: 't1h1', 
    desc: 'Test > Base > Shared tests',
    expected: 'Navigate to test menu, select base habitat, show test type menu, then run shared configuration tests'
  },
  { 
    seq: 't1h2', 
    desc: 'Test > Base > Habitat tests',
    expected: 'Navigate to test menu, select base habitat, show test type menu, then run habitat-specific tests'
  },
  { 
    seq: 't1f', 
    desc: 'Test > Base > Filesystem verification',
    expected: 'Navigate to test menu, select base habitat, then run filesystem structure verification'
  },
  { 
    seq: 't1a', 
    desc: 'Test > Base > All tests',
    expected: 'Navigate to test menu, select base habitat, then run complete test suite for base habitat'
  },
  
  // Claude-habitat testing
  { 
    seq: 't2s', 
    desc: 'Test > Claude-habitat > System tests',
    expected: 'Navigate to test menu, select claude-habitat (2), then run system infrastructure tests'
  },
  { 
    seq: 't2h1', 
    desc: 'Test > Claude-habitat > Shared tests',
    expected: 'Navigate to test menu, select claude-habitat, show test type menu, then run shared tests'
  },
  { 
    seq: 't2h2', 
    desc: 'Test > Claude-habitat > Habitat tests',
    expected: 'Navigate to test menu, select claude-habitat, show test type menu, then run habitat-specific tests'
  },
  { 
    seq: 't2f', 
    desc: 'Test > Claude-habitat > Filesystem verification',
    expected: 'Navigate to test menu, select claude-habitat, then run filesystem structure verification'
  },
  { 
    seq: 't2a', 
    desc: 'Test > Claude-habitat > All tests',
    expected: 'Navigate to test menu, select claude-habitat, then run complete test suite'
  },
  
  // Discourse testing (commented out - too slow for standard UI testing)
  // { 
  //   seq: 't3s', 
  //   desc: 'Test > Discourse > System tests',
  //   expected: 'Navigate to test menu, select discourse (3), then run system infrastructure tests'
  // },
  // { 
  //   seq: 't3h1', 
  //   desc: 'Test > Discourse > Shared tests',
  //   expected: 'Navigate to test menu, select discourse, show test type menu, then run shared tests'
  // },
  // { 
  //   seq: 't3h2', 
  //   desc: 'Test > Discourse > Habitat tests',
  //   expected: 'Navigate to test menu, select discourse, show test type menu, then run habitat-specific tests'
  // },
  // { 
  //   seq: 't3f', 
  //   desc: 'Test > Discourse > Filesystem verification',
  //   expected: 'Navigate to test menu, select discourse, then run filesystem structure verification'
  // },
  // { 
  //   seq: 't3a', 
  //   desc: 'Test > Discourse > All tests',
  //   expected: 'Navigate to test menu, select discourse, then run complete test suite'
  // },
  
  // Start habitat shortcuts
  { 
    seq: 's', 
    desc: 'Start most recent habitat',
    expected: 'Display main menu, then start the most recently used habitat session'
  },
  { 
    seq: '1', 
    desc: 'Start habitat 1 (base)',
    expected: 'Display main menu, then directly start base habitat session'
  },
  { 
    seq: '2', 
    desc: 'Start habitat 2 (claude-habitat)',
    expected: 'Display main menu, then directly start claude-habitat session'
  },
  // { 
  //   seq: '3', 
  //   desc: 'Start habitat 3 (discourse)',
  //   expected: 'Display main menu, then directly start discourse habitat session'
  // },
  
  // Other options
  { 
    seq: 'a', 
    desc: 'Add new habitat',
    expected: 'Display main menu, then show add habitat wizard/instructions'
  },
  { 
    seq: 'm', 
    desc: 'Maintenance mode',
    expected: 'Display main menu, then enter maintenance mode for system management'
  },
  { 
    seq: 'c', 
    desc: 'Clean Docker images',
    expected: 'Display main menu, then show Docker image cleanup interface with size/removal options'
  },
  { 
    seq: 'o', 
    desc: 'Tools management',
    expected: 'Display main menu, then show tools management interface for system tools'
  },
  { 
    seq: 'i', 
    desc: 'Initialize (if needed)',
    expected: 'Display main menu, then run initialization if system needs setup'
  },
  
  // Invalid input handling
  { 
    seq: 'xyz', 
    desc: 'Invalid input handling',
    expected: 'Display main menu, show error for invalid input, then return to main menu for retry'
  },
  { 
    seq: '999', 
    desc: 'Invalid habitat number',
    expected: 'Display main menu, show error for invalid habitat number, then return to main menu'
  },
  { 
    seq: 't999', 
    desc: 'Test menu > Invalid habitat number',
    expected: 'Show main menu, test menu, then error for invalid habitat number and return to test menu'
  },
  
  // Note: Discourse sequences (t3*) and start discourse (3) are commented out
  // to avoid slow Docker builds during standard UI testing
];

module.exports = { TEST_SEQUENCES };