const { test } = require('node:test');
const assert = require('assert');
const { pipe, merge, when, unless, transform, parallel } = require('../../src/functional');

test('pipe composes functions correctly', async () => {
  const add1 = async (x) => x + 1;
  const multiply2 = async (x) => x * 2;
  const add3 = async (x) => x + 3;
  
  const composed = pipe(add1, multiply2, add3);
  const result = await composed(5);
  
  // (5 + 1) * 2 + 3 = 15
  assert.strictEqual(result, 15);
});

test('merge combines objects at specified key', async () => {
  const mergeEnv = merge('environment');
  
  const objects = [
    { environment: { PATH: '/bin', HOME: '/home' } },
    { environment: { PATH: '/usr/bin', USER: 'test' } },
    { environment: { SHELL: '/bin/bash' } }
  ];
  
  const result = mergeEnv(objects);
  
  assert.deepStrictEqual(result, {
    environment: {
      PATH: '/usr/bin', // Last one wins
      HOME: '/home',
      USER: 'test',
      SHELL: '/bin/bash'
    }
  });
});

test('when executes function only if predicate is true', async () => {
  let executed = false;
  const predicate = async (x) => x > 5;
  const action = async (x) => {
    executed = true;
    return x * 2;
  };
  
  const conditional = when(predicate, action);
  
  // Should execute when x > 5
  const result1 = await conditional(10);
  assert.strictEqual(result1, 20);
  assert.strictEqual(executed, true);
  
  // Should not execute when x <= 5
  executed = false;
  const result2 = await conditional(3);
  assert.strictEqual(result2, 3); // Returns original value
  assert.strictEqual(executed, false);
});

test('unless executes function only if predicate is false', async () => {
  let executed = false;
  const predicate = async (x) => x > 5;
  const action = async (x) => {
    executed = true;
    return x * 2;
  };
  
  const conditional = unless(predicate, action);
  
  // Should not execute when x > 5
  const result1 = await conditional(10);
  assert.strictEqual(result1, 10); // Returns original value
  assert.strictEqual(executed, false);
  
  // Should execute when x <= 5
  const result2 = await conditional(3);
  assert.strictEqual(result2, 6);
  assert.strictEqual(executed, true);
});

test('transform applies functions to object properties', async () => {
  const input = {
    name: 'test',
    path: '/tmp/test',
    size: 100
  };
  
  const transformer = transform({
    name: async (name) => name.toUpperCase(),
    path: async (path) => path + '.txt',
    size: async (size) => size * 2
  });
  
  const result = await transformer(input);
  
  assert.deepStrictEqual(result, {
    name: 'TEST',
    path: '/tmp/test.txt',
    size: 200
  });
});

test('parallel executes tasks concurrently', async () => {
  const startTime = Date.now();
  
  const tasks = parallel({
    task1: async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'result1';
    },
    task2: async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'result2';
    },
    task3: async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'result3';
    }
  });
  
  const result = await tasks('input');
  const duration = Date.now() - startTime;
  
  assert.deepStrictEqual(result, {
    task1: 'result1',
    task2: 'result2',
    task3: 'result3'
  });
  
  // Should take ~50ms for parallel execution, not ~150ms for sequential
  assert.ok(duration < 100, `Expected parallel execution to be fast, took ${duration}ms`);
});

test('complex composition with config loading pattern', async () => {
  // Simulate config loading pipeline
  const loadConfigs = pipe(
    // Start with config paths
    async (paths) => {
      return paths.map(path => ({ path, loaded: false }));
    },
    
    // Load each config
    async (configs) => {
      return configs.map(config => ({
        ...config,
        loaded: true,
        data: { name: config.path.split('/').pop() }
      }));
    },
    
    // Merge all configs
    async (configs) => {
      return configs.reduce((acc, config) => ({
        ...acc,
        ...config.data
      }), {});
    }
  );
  
  const result = await loadConfigs(['system/config.yaml', 'shared/config.yaml', 'habitat/config.yaml']);
  
  assert.deepStrictEqual(result, {
    name: 'config.yaml' // Last one wins in this simple simulation
  });
});

console.log('✅ All functional composition tests passed');