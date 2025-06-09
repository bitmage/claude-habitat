# Network Operation Recovery Implementation Plan

## Goal
Circuit breaker pattern for network operations with intelligent fallbacks and retry strategies.

## Architecture

### Circuit Breaker Implementation
```javascript
// src/circuit-breaker.js
class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.monitorWindow = options.monitorWindow || 120000; // 2 minutes
    this.failureCount = 0;
    this.lastFailure = null;
    this.state = 'closed'; // closed, open, half-open
    this.failures = []; // Track failure timestamps
  }
  
  async execute(operation, fallback = null) {
    // Clean up old failures outside monitor window
    const now = Date.now();
    this.failures = this.failures.filter(f => now - f < this.monitorWindow);
    this.failureCount = this.failures.length;
    
    if (this.state === 'open') {
      if (now - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
        console.log('Circuit breaker moving to half-open state');
      } else if (fallback) {
        console.log('Circuit breaker open - using fallback');
        return fallback();
      } else {
        throw new Error(`Circuit breaker is open. Service unavailable. Try again in ${Math.ceil((this.resetTimeout - (now - this.lastFailure)) / 1000)}s`);
      }
    }
    
    try {
      const result = await operation();
      
      if (this.state === 'half-open') {
        console.log('Circuit breaker closing - operation succeeded');
        this.state = 'closed';
        this.failures = [];
        this.failureCount = 0;
      }
      
      return result;
      
    } catch (error) {
      this.failures.push(now);
      this.failureCount = this.failures.length;
      this.lastFailure = now;
      
      if (this.failureCount >= this.threshold) {
        this.state = 'open';
        console.log(`Circuit breaker opening - ${this.failureCount} failures in ${this.monitorWindow / 1000}s`);
      }
      
      if (fallback && this.state === 'open') {
        console.log('Using fallback due to circuit breaker');
        return fallback();
      }
      
      throw error;
    }
  }
  
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailure: this.lastFailure,
      timeUntilReset: this.lastFailure ? Math.max(0, this.resetTimeout - (Date.now() - this.lastFailure)) : 0
    };
  }
}

// Retry with exponential backoff
class RetryStrategy {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.backoffFactor = options.backoffFactor || 2;
    this.jitter = options.jitter || 0.1;
  }
  
  async execute(operation, isRetryable = () => true) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.maxAttempts || !isRetryable(error)) {
          throw error;
        }
        
        const delay = this.calculateDelay(attempt);
        console.log(`Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }
  
  calculateDelay(attempt) {
    const baseDelay = Math.min(
      this.baseDelay * Math.pow(this.backoffFactor, attempt - 1),
      this.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = baseDelay * this.jitter * (Math.random() * 2 - 1);
    return Math.max(0, baseDelay + jitter);
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Network operation wrapper
function createNetworkOperation(options = {}) {
  const circuitBreaker = new CircuitBreaker({
    threshold: options.circuitThreshold || 3,
    resetTimeout: options.circuitResetTimeout || 60000
  });
  
  const retryStrategy = new RetryStrategy({
    maxAttempts: options.maxRetries || 3,
    baseDelay: options.baseDelay || 1000
  });
  
  return {
    async execute(operation, fallback = null) {
      return circuitBreaker.execute(async () => {
        return retryStrategy.execute(operation, (error) => {
          // Retry on network errors, timeouts, and 5xx responses
          return error.code === 'ENOTFOUND' ||
                 error.code === 'ECONNRESET' ||
                 error.code === 'ETIMEDOUT' ||
                 (error.response && error.response.status >= 500);
        });
      }, fallback);
    },
    
    getStatus() {
      return circuitBreaker.getState();
    }
  };
}
```

### GitHub API Client with Circuit Breaker
```javascript
// src/github-client.js
const { createNetworkOperation } = require('./circuit-breaker');

class GitHubClient {
  constructor() {
    this.networkOp = createNetworkOperation({
      circuitThreshold: 5,
      circuitResetTimeout: 120000, // 2 minutes
      maxRetries: 3,
      baseDelay: 2000
    });
  }
  
  async testRepositoryAccess(url, accessMode = 'read') {
    return this.networkOp.execute(
      async () => {
        // Main operation - test actual access
        const result = await this.doRepositoryTest(url, accessMode);
        return result;
      },
      // Fallback - return degraded info
      () => ({
        accessible: false,
        reason: 'GitHub API temporarily unavailable',
        degraded: true
      })
    );
  }
  
  async generateAppToken() {
    return this.networkOp.execute(
      async () => {
        // Main operation
        return await this.doTokenGeneration();
      },
      // Fallback - use cached token if available
      async () => {
        const cachedToken = await this.getCachedToken();
        if (cachedToken && !this.isTokenExpired(cachedToken)) {
          console.log('Using cached GitHub token due to API issues');
          return cachedToken;
        }
        throw new Error('GitHub API unavailable and no valid cached token');
      }
    );
  }
  
  async doRepositoryTest(url, accessMode) {
    // Actual implementation of repository testing
    // This would make the HTTP requests
  }
  
  async doTokenGeneration() {
    // Actual implementation of token generation
    // This would make the HTTP requests to GitHub API
  }
  
  async getCachedToken() {
    // Check for cached token
    try {
      const cached = await fs.readFile('.github-token-cache', 'utf8');
      return JSON.parse(cached);
    } catch {
      return null;
    }
  }
  
  isTokenExpired(token) {
    // Check if token is expired
    return Date.now() > token.expires_at;
  }
}
```

### Docker Registry Operations
```javascript
// src/docker-registry.js
const dockerNetworkOp = createNetworkOperation({
  circuitThreshold: 3,
  circuitResetTimeout: 180000, // 3 minutes for registry issues
  maxRetries: 5,
  baseDelay: 1000
});

async function pullImageWithFallback(imageName) {
  return dockerNetworkOp.execute(
    async () => {
      await execAsync(`docker pull ${imageName}`, { timeout: 300000 });
      return { image: imageName, source: 'registry' };
    },
    async () => {
      // Fallback - check if we have a local copy
      try {
        await execAsync(`docker image inspect ${imageName}`);
        console.log(`Using local copy of ${imageName} due to registry issues`);
        return { image: imageName, source: 'local-cache' };
      } catch {
        throw new Error(`Cannot pull ${imageName} and no local copy available`);
      }
    }
  );
}
```

## Integration Points

### Replace network operations in existing code
```javascript
// In src/github.js
const githubClient = new GitHubClient();

async function testRepositoryAccess(url, accessMode) {
  return githubClient.testRepositoryAccess(url, accessMode);
}

// In src/docker.js
async function ensureBaseImage(imageName) {
  return pullImageWithFallback(imageName);
}
```

### Add circuit breaker status to diagnostics
```javascript
// In startup diagnostics
function getNetworkStatus() {
  const status = githubClient.networkOp.getStatus();
  return {
    state: status.state,
    failureCount: status.failureCount,
    healthy: status.state !== 'open'
  };
}
```

## Benefits
- Graceful degradation during network issues
- Prevents cascading failures
- Intelligent retry strategies
- Fallback to cached/local resources
- Better user feedback during outages

## Implementation Steps
1. Create src/circuit-breaker.js with core patterns
2. Create src/github-client.js with circuit breaker integration
3. Update docker operations to use network recovery
4. Add network status to diagnostics
5. Add tests for circuit breaker scenarios
6. Monitor and tune circuit breaker parameters

## Testing Strategy
- Mock network failures (timeouts, connection refused, 5xx errors)
- Test circuit breaker state transitions
- Test fallback mechanisms
- Test retry strategies with different error types
- Load testing to verify circuit breaker thresholds