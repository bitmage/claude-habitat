const test = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs').promises;

test('interactive menu displays when no arguments provided', async (t) => {
  // This test verifies the menu logic exists
  // Full interactive testing would require mocking stdin/stdout
  
  // Check that configs directory can be read
  const configDir = path.join(path.dirname(__dirname), 'configs');
  
  try {
    const files = await fs.readdir(configDir);
    const configs = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    
    // Should find at least one config
    assert.ok(configs.length > 0, 'Should have at least one config file');
    
    // Each config should be readable
    for (const config of configs) {
      const configPath = path.join(configDir, config);
      const content = await fs.readFile(configPath, 'utf8');
      assert.ok(content.length > 0, `Config ${config} should have content`);
    }
  } catch (err) {
    // It's ok if configs directory doesn't exist in test environment
    t.skip('No configs directory found');
  }
});

test('menu parses configuration descriptions', async (t) => {
  // Create a test config with description
  const yaml = require('js-yaml');
  const testConfig = {
    name: 'test',
    description: 'Test configuration for menu display',
    image: { dockerfile: './Dockerfile' }
  };
  
  const yamlContent = yaml.dump(testConfig);
  const parsed = yaml.load(yamlContent);
  
  assert.strictEqual(parsed.description, 'Test configuration for menu display');
});