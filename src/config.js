const yaml = require('js-yaml');
const fs = require('fs').promises;
const { fileExists } = require('./utils');

// Public API functions with simple validation
async function loadConfig(configPath) {
  if (!configPath) throw new Error('Missing required parameter: configPath');
  if (!await fileExists(configPath)) throw new Error('Configuration file not found');

  const configContent = await fs.readFile(configPath, 'utf8');
  const config = yaml.load(configContent);
  return { ...config, _configPath: configPath };
}

module.exports = {
  loadConfig
};