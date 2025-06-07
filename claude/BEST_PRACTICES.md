# Claude Habitat Best Practices

This document captures lessons learned from development sessions and establishes patterns for maintaining high-quality, reliable code.

## Core Development Principles

### 1. Functional Programming & Pure Functions

**Pure Functions for Testing**
- Functions should be deterministic and testable
- Separate pure logic from side effects
- Use dependency injection for external dependencies

```javascript
// ✅ Pure function - easily testable
function parseRepoPath(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/github\.com[\/:]([^\/]+\/[^\/]+?)(?:\.git)?(?:\/|$)/);
  return match ? match[1] : null;
}

// ✅ Dependency injection for testability (still impure due to shell calls)
async function testGitHubCliAccess(repoPath, ghCommand = 'gh') {
  // External dependency injected, easier to mock in tests
  return await execAsync(`${ghCommand} auth status`);
}

// ❌ Hard-coded dependency - harder to test
async function testGitHubCliAccess(repoPath) {
  return await execAsync('gh auth status'); // Fixed dependency
}
```

**Benefits Observed:**
- Pure functions (like `parseRepoPath`) are completely predictable and testable
- Dependency injection allows mocking external systems in tests
- Clear separation between business logic and side effects

### 2. Domain-Driven Design (DDD)

**Clear Domain Language**
- Use consistent terminology across codebase
- Separate concerns by domain boundaries
- Model real-world concepts accurately

**Examples from our codebase:**
- `system/` = Infrastructure managed by maintainers
- `shared/` = User preferences and configuration
- `habitats/` = Project-specific environments
- Tools vs host tools distinction

**Key Insight:** Clear domain boundaries make the system easier to understand and maintain.

### 3. Test-Driven Quality Assurance

**Always Run Tests Before Success**
- Every change must pass existing tests
- Fix broken tests immediately
- Never report completion without test validation

**Create Tests for Ad-Hoc Discoveries**
- Encountered "gh: command not found" during manual testing
- Immediately created regression test: `test/github-system-tools.test.js`
- Prevented future occurrences of the same issue

**Testing Strategy:**
```bash
# Always run before committing
npm test
npm run test:integration
npm run test:github-fix
```

### 4. Dependency Injection for Testability

**Problem:** Hard-coded dependencies make testing difficult
**Solution:** Inject dependencies as parameters

```javascript
// Before: Hard to test - gh command path is hidden
async function testRepositoryAccess(repoPath) {
  const result = await testGitHubCliAccess(repoPath);
}

// After: Easy to test with mocks - gh command path is explicit
async function testRepositoryAccess(repoPath, ghCommand = 'system/tools/bin/gh') {
  const result = await testGitHubCliAccess(repoPath, ghCommand);
}
```

**Key Insight:** This isn't about making functions pure (shell commands will always be impure), but about making them testable by removing hidden dependencies.

## Architecture Patterns

### 1. Configuration Over Convention

**Simplified tools.yaml structure:**
- Removed optional/core distinction
- All tools treated equally
- Configuration drives behavior

### 2. Progressive Enhancement

**User Experience Flow:**
1. Basic functionality works without setup
2. Enhanced features available with configuration
3. Clear guidance for improvement

### 3. Separation of Concerns

**Clear Boundaries:**
- System infrastructure (managed)
- User preferences (customizable)
- Project-specific (habitat-level)

## Refactoring Lessons Learned

### 1. Incremental Improvement

**What Worked:**
- Small, focused changes
- One concern per refactoring session
- Comprehensive testing at each step

### 2. User Experience First

**Key Insights:**
- Menu-driven interfaces reduce cognitive load
- Clear error messages with actionable solutions
- Progressive disclosure of complexity

### 3. Technical Debt Management

**Immediate Actions Taken:**
- Removed 65MB of committed binaries
- Simplified configuration structure
- Added comprehensive documentation

### 4. Documentation as First-Class Citizen

**Documentation Strategy:**
- User-facing guides (`docs/`)
- Developer instructions (`claude/`)
- Inline code documentation
- Workflow documentation (`TOOLS-WORKFLOW.md`)

## Testing Philosophy

### 1. Test Organization by Performance

**Unit Tests (< 5 seconds total):**
- Pure functions and business logic only
- No external dependencies (file system, network, Docker)
- Run on every code change during development
- Located in `test/unit/`
- Examples: `command-builders.test.js`, `github-pure.test.js`

**E2E Tests (< 5 minutes total):**
- System integration, Docker workflows, and repository access
- Heavy operations like container creation and GitHub API calls
- Run before commits or releases
- Located in `test/e2e/`
- Examples: `github-functions.test.js`, `repository-access.test.js`

**Habitat Tests (< 15 seconds for required tests):**
- Infrastructure validation within specific habitats
- Run via `./claude-habitat test base --system`
- Split into required (fast) and optional (slower) categories
- Examples: system tool availability, shared configuration

### 2. Development Workflow Testing

```bash
# During development (fast feedback)
npm test                    # Unit tests only (< 5 seconds)
npm run test:watch         # Continuous unit testing

# Before commits (verify integration)
npm run test:e2e           # E2E tests (< 5 minutes)
npm run test:habitat       # Habitat system tests (< 15 seconds)

# Complete validation
npm run test:all           # Unit + E2E tests
```

### 3. Regression Prevention

**Process:**
1. Manual testing reveals issue
2. Create automated test immediately (choose category by performance):
   - Unit test if logic can be isolated
   - E2E test if it requires integration
   - Habitat test if it's infrastructure-related
3. Fix the issue
4. Verify test passes
5. Commit both fix and test

**Test Category Guidelines:**
- Pure functions → Unit tests
- Command builders and data parsers → Unit tests  
- GitHub API integration → E2E tests
- Docker workflows → E2E tests
- System tool availability → Habitat tests

### 4. Test Maintenance

**Guidelines:**
- Tests should be self-explanatory
- Test names describe the scenario
- Clean up test artifacts
- Mock external dependencies in unit tests
- Real dependencies required in E2E and habitat tests
- Refactor similar test patterns into parameterized helpers

**Code Reuse Patterns:**
- Use parameterized helpers from `utils.js` for common operations
- Extract pure functions for better testability
- Standardize error categorization patterns
- Reuse command execution and container management helpers

## Code Quality Standards

### 1. Error Handling

**Standardized Pattern:**
```javascript
// Use parameterized error categorization
const categoryMap = {
  'permission denied': { type: 'auth', message: 'Authentication failed' },
  'not found': { type: 'missing', message: 'Resource not found' }
};
const error = categorizeError(errorMessage, categoryMap);

// Use consistent command execution
const result = await executeCommand(command, { 
  timeout: 10000,
  ignoreErrors: false,
  description: 'Testing GitHub access'
});
```

**Benefits:**
- Eliminates code duplication (reduced ~300 lines of similar patterns)
- Standardizes error handling across modules
- Improves testability through parameterization
- Centralizes common operations in `utils.js`

### 2. Logging and Debugging

**Levels:**
- Info: Normal operation progress
- Warn: Recoverable issues
- Error: Failures requiring attention
- Debug: Detailed troubleshooting info

### 3. Performance Considerations

**Tool Installation Optimization:**
- Download on-demand vs committed binaries
- Caching strategies
- Parallel operations where safe

## Maintenance Workflow

### 1. Change Management

**Process:**
1. Identify improvement opportunity
2. Plan changes with clear scope
3. Implement incrementally
4. Test thoroughly
5. Document changes
6. Update related documentation

### 2. User Communication

**Principles:**
- Clear, actionable error messages
- Progressive guidance for setup
- Comprehensive help documentation

### 3. System Health

**Monitoring:**
- Tool availability checks
- Repository access verification
- Docker system status
- Integration test results

## Future Considerations

### 1. Scalability

- Tool management for large teams
- Configuration inheritance patterns
- Performance optimization opportunities

### 2. Maintainability

- Automated dependency updates
- Health check automation
- Documentation generation

### 3. User Experience

- Improved error recovery
- Better progress indication
- Enhanced troubleshooting guides

## Summary

The key insights from our development session:

1. **Pure functions** make testing and maintenance easier
2. **Domain-driven design** clarifies system boundaries
3. **Test-first mentality** prevents regressions
4. **Dependency injection** enables better testing
5. **User experience focus** drives better architecture decisions
6. **Incremental improvement** is more sustainable than big rewrites

These practices have proven effective in maintaining code quality while delivering user value efficiently.