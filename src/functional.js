/**
 * Functional composition utilities for Claude Habitat
 * 
 * These utilities help create more readable and maintainable code by
 * composing operations in a declarative way.
 */

/**
 * Pipe functions together, passing the result of each to the next
 * Works with async functions
 * 
 * @param {...Function} fns - Functions to pipe together
 * @returns {Function} - Composed function
 * 
 * @example
 * const processConfig = pipe(
 *   loadConfig,
 *   validateConfig,
 *   expandEnvironmentVars,
 *   finalizeConfig
 * );
 */
const pipe = (...fns) => async (value) => {
  for (const fn of fns) {
    value = await fn(value);
  }
  return value;
};

/**
 * Merge objects at a specific key path
 * Useful for accumulating data from multiple sources
 * 
 * @param {string} key - Key to merge at
 * @returns {Function} - Function that merges objects
 * 
 * @example
 * const mergeEnvironments = merge('environment');
 * const combined = mergeEnvironments([systemConfig, sharedConfig, habitatConfig]);
 */
const merge = (key) => (objects) => {
  return objects.reduce((acc, obj) => ({
    ...acc,
    [key]: { ...acc[key], ...(obj[key] || {}) }
  }), {});
};

/**
 * Conditional execution - run function only if predicate is true
 * 
 * @param {Function} predicate - Async predicate function
 * @param {Function} fn - Function to run if predicate is true
 * @returns {Function} - Conditional function
 * 
 * @example
 * const ensureImage = unless(dockerImageExists, buildImage);
 */
const when = (predicate, fn) => async (value) => 
  (await predicate(value)) ? fn(value) : value;

/**
 * Conditional execution - run function only if predicate is false
 * 
 * @param {Function} predicate - Async predicate function
 * @param {Function} fn - Function to run if predicate is false
 * @returns {Function} - Conditional function
 * 
 * @example
 * const buildIfMissing = unless(dockerImageExists, buildImage);
 */
const unless = (predicate, fn) => async (value) =>
  (await predicate(value)) ? value : fn(value);

/**
 * Transform object properties using provided transformation functions
 * 
 * @param {Object} transforms - Object mapping keys to transformation functions
 * @returns {Function} - Transformation function
 * 
 * @example
 * const processFilePaths = transform({
 *   src: resolveSourcePath,
 *   dest: resolveDestPath
 * });
 */
const transform = (transforms) => async (input) => {
  const result = { ...input };
  for (const [key, fn] of Object.entries(transforms)) {
    result[key] = await fn(input[key], input);
  }
  return result;
};

/**
 * Execute tasks in parallel while preserving object shape
 * Uses Promise.all for concurrent execution
 * 
 * @param {Object} tasks - Object mapping keys to async functions
 * @returns {Function} - Parallel execution function
 * 
 * @example
 * const validateInParallel = parallel({
 *   config: validateConfig,
 *   repositories: checkRepositoryAccess,
 *   docker: checkDockerDaemon
 * });
 */
const parallel = (tasks) => async (input) => {
  const entries = Object.entries(tasks);
  const results = await Promise.all(
    entries.map(async ([key, fn]) => [key, await fn(input)])
  );
  return Object.fromEntries(results);
};

/**
 * Create a function that retries on failure
 * 
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Maximum number of attempts (default: 3)
 * @param {number} options.baseDelay - Base delay between attempts in ms (default: 1000)
 * @param {Function} options.shouldRetry - Function to determine if error should trigger retry
 * @returns {Function} - Function with retry logic
 * 
 * @example
 * const resilientDockerPull = retry(dockerPull, {
 *   maxAttempts: 3,
 *   baseDelay: 2000,
 *   shouldRetry: (error) => error.code === 'NETWORK_ERROR'
 * });
 */
const retry = (fn, options = {}) => {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    shouldRetry = () => true
  } = options;

  return async (...args) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        
        if (attempt === maxAttempts || !shouldRetry(error)) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  };
};

/**
 * Create a memoized version of a function
 * Caches results based on stringified arguments
 * 
 * @param {Function} fn - Function to memoize
 * @param {Function} keyFn - Function to generate cache key (optional)
 * @returns {Function} - Memoized function
 * 
 * @example
 * const cachedImageCheck = memoize(dockerImageExists);
 * const cachedRepoCheck = memoize(testRepositoryAccess, (url) => url);
 */
const memoize = (fn, keyFn = (...args) => JSON.stringify(args)) => {
  const cache = new Map();
  
  return async (...args) => {
    const key = keyFn(...args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = await fn(...args);
    cache.set(key, result);
    return result;
  };
};

/**
 * Create a debounced version of a function
 * Delays execution until after the specified delay since the last call
 * 
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Debounced function
 */
const debounce = (fn, delay) => {
  let timeoutId;
  
  return async (...args) => {
    clearTimeout(timeoutId);
    
    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  };
};

module.exports = {
  pipe,
  merge,
  when,
  unless,
  transform,
  parallel,
  retry,
  memoize,
  debounce
};