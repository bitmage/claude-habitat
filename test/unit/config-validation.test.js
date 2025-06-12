const test = require('node:test');
const assert = require('node:assert');
const { validateHabitatConfig, getConfigValidationHelp } = require('../../src/config-validation');

test('config validation catches missing work_dir', () => {
  const invalidConfig = { 
    name: 'test', 
    container: { user: 'root' } 
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /Missing required config: container.work_dir/
  );
});

test('config validation catches relative work_dir', () => {
  const invalidConfig = { 
    name: 'test', 
    container: { 
      work_dir: 'workspace',  // Missing leading /
      user: 'root'
    }
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /container.work_dir must be absolute path/
  );
});

test('config validation catches missing container section', () => {
  const invalidConfig = { name: 'test' };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /Missing required section: container/
  );
});

test('config validation catches missing user', () => {
  const invalidConfig = { 
    name: 'test', 
    container: { work_dir: '/workspace' } 
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /Missing required config: container.user/
  );
});

test('config validation passes with valid config', () => {
  const validConfig = {
    name: 'test',
    container: {
      work_dir: '/workspace',
      user: 'root'
    }
  };
  
  assert.strictEqual(validateHabitatConfig(validConfig), true);
});

test('config validation validates repository paths', () => {
  const invalidConfig = {
    name: 'test',
    container: {
      work_dir: '/workspace',
      user: 'root'
    },
    repositories: [
      {
        url: 'https://github.com/test/repo',
        path: 'relative/path'  // Should be absolute
      }
    ]
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /repositories\[0\].path must be absolute path/
  );
});

test('config validation passes with valid repositories', () => {
  const validConfig = {
    name: 'test',
    container: {
      work_dir: '/workspace',
      user: 'root'
    },
    repositories: [
      {
        url: 'https://github.com/test/repo',
        path: '/workspace/repo'
      }
    ]
  };
  
  assert.strictEqual(validateHabitatConfig(validConfig), true);
});

test('getConfigValidationHelp provides helpful error messages', () => {
  const error = new Error('Missing required config: container.work_dir in test');
  const helpMessage = getConfigValidationHelp(error);
  
  assert(helpMessage.includes('Suggestion:'));
  assert(helpMessage.includes('container:'));
  assert(helpMessage.includes('work_dir: /workspace'));
});

test('config validation handles optional startup_delay', () => {
  const validConfig = {
    name: 'test',
    container: {
      work_dir: '/workspace',
      user: 'root',
      startup_delay: 5
    }
  };
  
  assert.strictEqual(validateHabitatConfig(validConfig), true);
});

test('config validation catches invalid startup_delay', () => {
  const invalidConfig = {
    name: 'test',
    container: {
      work_dir: '/workspace',
      user: 'root',
      startup_delay: -1
    }
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /container.startup_delay must be a non-negative number/
  );
});

test('config validation catches missing name', () => {
  const invalidConfig = {
    container: {
      work_dir: '/workspace',
      user: 'root'
    }
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /Missing required config: name/
  );
});

test('config validation catches empty user', () => {
  const invalidConfig = {
    name: 'test',
    env: ['USER=', 'WORKDIR=/workspace']  // Empty USER value
  };
  
  assert.throws(
    () => validateHabitatConfig(invalidConfig),
    /USER environment variable must be non-empty/
  );
});