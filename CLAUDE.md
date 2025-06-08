# Claude Habitat - AI Assistant Instructions

## Overview

Claude Habitat creates isolated Docker environments for development. Each environment gets its own container with services, repositories, and no access to the host filesystem.

## Design Philosophy

### Interactive-First Architecture

Claude Habitat is designed as an **interactive-first** tool that maintains user engagement:

- **Continuous Flow**: CLI commands (`--help`, `--list-configs`, `--clean`) display their output and return to the main menu, rather than exiting to the terminal
- **User Context**: Users stay within the tool's context, enabling them to perform multiple operations without restarting
- **Graceful Experience**: Every path leads back to a decision point, never leaving users at a dead end

### Hybrid Architecture: CLI + Interactive

The tool intentionally supports two complementary modes:

1. **Direct CLI Operations** - For automation and quick actions:
   - `./claude-habitat start discourse` - Start specific habitat directly
   - `./claude-habitat test base --system` - Run specific tests
   - `./claude-habitat --clean` - Clean Docker images (then return to menu)

2. **Interactive Scene-Based Flows** - For exploration and complex workflows:
   - Main menu navigation with single-key selections
   - Test menu for choosing test types interactively
   - Context-aware prompts and confirmations

This hybrid approach serves both power users (who know exactly what they want) and exploratory users (who benefit from guided interaction).

### Domain-Driven Functional Programming

Code should reflect the domain model defined in `docs/TERMINOLOGY.md`:

1. **Use Domain Language** in function names:
   ```javascript
   // Good: Domain-focused names
   startSession(habitat, repositories)
   prepareWorkspace(sessionConfig)
   validateSessionAccess(habitat)

   // Avoid: Technical implementation names
   runContainer(config, repos)
   buildImage(cfg)
   checkRepos(hab)
   ```

2. **Prefer Pure Functions** and data transformation:
   ```javascript
   // Good: Pure function that transforms data
   function calculateCacheHash(config, extraRepos) {
     return sha256(JSON.stringify({ config, extraRepos }));
   }

   // Avoid: Stateful operations mixed with logic
   function updateAndGetHash() {
     this.config.lastUsed = Date.now();
     return this.hash;
   }
   ```

3. **Functional Composition** over OOP:
   ```javascript
   // Good: Compose simple functions
   const validateAndStart = flow(
     validateConfig,
     prepareWorkspace,
     startSession
   );

   // Avoid: Complex class hierarchies
   class HabitatManager extends BaseManager {
     constructor() { super(); }
   }
   ```

### Code Organization Principles

1. **Small, Focused Modules** with single responsibilities:
   - `src/cli-parser.js` - Only parses CLI arguments
   - `src/session.js` - Only manages habitat sessions
   - `src/workspace.js` - Only handles workspace operations

2. **Clear Separation** between layers:
   - **Infrastructure**: `docker.js`, `filesystem.js`, `github.js`
   - **Domain**: `session.js`, `workspace.js`, `habitat.js`
   - **UI**: `src/scenes/*.js`

3. **Scene-Based UI Architecture** for testability:
   - Each scene is an async function: `async (context) => nextScene`
   - Scenes are pure in terms of application state
   - Input/output handled through context object

### Testing Philosophy

1. **Product-Focused Tests** over infrastructure tests:
   - Test what users actually do, not implementation details
   - Focus on workflows and outcomes, not internal APIs

2. **UI Testing Through Workflows**:
   ```bash
   # Test complete user journeys as sequences:
   ./claude-habitat --test-sequence="t2f"  # Test > Claude-habitat > Filesystem

   # What this validates:
   # - User can navigate from main menu to test menu
   # - Test menu displays correctly with all options
   # - Selecting option 2 shows habitat list
   # - Selecting 'f' runs filesystem verification
   # - Results display correctly
   # - User returns to appropriate menu
   ```

   **How to test workflows**:
   - Identify common user paths (start habitat, run tests, get help)
   - Create test sequences that follow these paths
   - Verify both successful completion and error handling
   - Check that navigation flows correctly between scenes
   - Ensure error states provide helpful recovery options

3. **Visual Verification** through snapshots:
   - Generate snapshots: `npm run test:ui`
   - Review output formatting and content
   - Catch visual regressions before users see them

### Error Handling Philosophy

- **Always provide a path forward** - Never leave users stuck
- **Suggest solutions** - Include actionable next steps in error messages
- **Preserve user context** - Return to appropriate menu after errors
- **Make errors educational** - Help users understand what went wrong

## Your Roles

### 1. Configuration Creator (Add Mode)

When launched in "add" mode, you'll be in a temporary workspace with:
- `PROJECT_CONTEXT.md` - Contains user's answers about the project
- Example configurations for reference
- Empty directories for your output

Your tasks:
1. **Analyze the project URL(s)** - Clone and examine the repositories to understand:
   - Language/framework (Ruby, Node.js, Python, etc.)
   - Required services (databases, caches, queues)
   - Dependencies and build requirements
   - Development workflow

2. **Create the Dockerfile** in `dockerfiles/[habitat-name]/`:
   - Choose appropriate base image
   - Install system dependencies
   - Set up required services
   - Configure user permissions
   - Ensure services start properly

3. **Create the YAML configuration** in `configs/[habitat-name].yaml`:
   ```yaml
   name: [habitat-name]
   description: [purpose from user]

   image:
     dockerfile: ./dockerfiles/[habitat-name]/Dockerfile
     tag: claude-habitat-[habitat-name]:latest

   repositories:
     - url: [main-project-url]
       path: /appropriate/path
       branch: main
     # Additional repos for plugins/modules

   environment:
     - KEY=value

   setup:
     root:
       - System-level setup commands
     user:
       run_as: appropriate-user
       commands:
         - Project setup commands

   container:
     work_dir: /path/to/work
     user: appropriate-user
     startup_delay: 10  # seconds

   claude:
     command: claude
   ```

4. **Create a test plan** in `TEST_PLAN.md`:
   - How to verify the configuration works
   - Expected behavior
   - Common issues and solutions

### 2. Maintenance Mode

When launched in maintenance mode, you'll be in the claude-habitat directory itself.

**IMPORTANT**: First action should be to read and present the maintenance menu from `claude/MAINTENANCE_MENU.md`.

Your tasks may include:
1. **Update existing configurations** - Improve or fix issues
2. **Troubleshoot problems** - Debug Docker or setup issues
3. **Enhance the tool** - Add features or improve code
4. **Create pull requests** - Use git/gh to contribute improvements

Users can say "menu" at any time to see the options again.

For further instructions about maintenance mode refer to these items in the claude/ directory:

claude/BEST_PRACTICES.md
claude/MAINTENANCE.md
claude/TROUBLESHOOTING.md
claude/INSTRUCTIONS.md

In addition you may use the claude/scratch directory for any temporary files you wish to create.

## Important Guidelines

### For Configuration Creation:

1. **Infer intelligently** - Use the repository structure to determine:
   - Package managers (Gemfile, package.json, requirements.txt)
   - Database configs (database.yml, .env.example)
   - Service dependencies (Redis, PostgreSQL, Elasticsearch)

2. **Follow patterns** - Study existing configs (discourse.yaml) for:
   - Directory structure conventions
   - Service initialization patterns
   - User permission handling

3. **Be thorough** - Include:
   - All necessary services
   - Proper environment variables
   - Database creation/migration commands
   - Asset compilation steps

4. **Think about caching** - Structure for optimal Docker layer caching

### For Maintenance Mode:

1. **Preserve functionality** - Don't break existing features
2. **Follow code style** - Match the existing patterns
3. **Test thoroughly** - Test using unit tests (always), integration (when specific flows are modified)
4. **Document changes** - Update README when adding features

## Common Patterns

### Node.js Projects:
- Base: `node:20` image
- Services: MongoDB, Redis
- Setup: `npm install`, database initialization

## Special Considerations

1. **Service startup** - Use proper init systems or supervisord
2. **Permissions** - Ensure files are owned by the right user
3. **Networking** - Services must be accessible within container
4. **Environment isolation** - No host filesystem access
5. **Developer experience** - Fast rebuilds, clear error messages

## Your Strengths

- You can analyze repository structure efficiently
- You understand Docker best practices
- You can infer requirements from code
- You can create production-ready configurations
- You can troubleshoot complex issues

## Testing Lifecycle

When developing features, always run the full test suite to ensure nothing is broken:

### 1. Unit Tests

Use these constantly to find the state of the system.  Add to these rather than creating ad-hoc requests into the system.

```bash
npm test                    # Run all unit tests
npm run test:unit          # Same as above
npm run test:watch         # Run tests in watch mode
```

### 2. E2E Tests

At minimum run these before you commit a feature.

```bash
npm run test:e2e           # Run end-to-end tests
```

### 3. UI Testing

At minimum run these before you commit a feature.  Snapshots require manual verification.  Look at them and ensure that what is happening is what you expected.

```bash
npm run test:ui            # Generate UI snapshots
npm run test:ui:view       # Generate and view snapshots
```

### 4. Habitat Tests

You should always be working with a test habitat in mind, and run the tests for that habitat.  Then run tests for all habitats before committing.

```bash
npm run test:habitat       # Run base habitat system tests
./claude-habitat test base --system    # Manual habitat testing
```

### 5. Complete Test Suite
```bash
npm run test:all           # Run unit + e2e tests
```

## UI Snapshot Review

After making changes that affect the user interface, always check the UI snapshots:

1. **Generate snapshots**: `npm run test:ui`
2. **Review the output**: Check `test/ui-snapshots.txt` (gitignored)
3. **Look for issues**:
   - Crashes or errors in any sequence
   - Broken menu formatting
   - Missing options or incorrect navigation
   - Error messages that don't make sense
   - Different screen than you expected to be on

## Generate UI Snapshots

Use these to quickly Generate UI Snapshots from a simulated sequence of key presses:

- `./claude-habitat --test-sequence="q"` - Test main menu
- `./claude-habitat --test-sequence="tq"` - Test navigation to test menu
- `./claude-habitat --test-sequence="t2f"` - Test filesystem verification
- `./claude-habitat --test-sequence="h"` - Test help display
- `./claude-habitat --test-sequence="q" --preserve-colors` - Test with colors preserved

## Coding Guidelines

### Explicit Configuration Over Magic Detection

**NEVER** implement logic that changes fundamental system behavior based on innocuous inference. This drives users insane.

**❌ Bad Examples:**
```javascript
// DON'T: Magic string detection for TTY behavior
// a -p in the command line leading to a non interactive TTY is completely random from a user perspective
const isNonInteractive = claudeCommand.includes('-p') || claudeCommand.includes('--prompt');
const dockerFlags = isNonInteractive ? ['-i'] : ['-it'];
```

**✅ Good Examples:**
```yaml
# DO: Explicit configuration in habitat config
container:
  tty: true           # or false - explicit and clear
  user: developer
  work_dir: /workspace

# DO: Feature flags and explicit options
ui:
  colors: true
  verbose: false
```

### Configuration Design Principles

1. **Explicit over implicit** - All behavior should be configurable in config files
2. **Predictable defaults** - Default values should work for 90% of use cases
3. **No hidden dependencies** - Behavior should not depend on parsing command content
4. **Clear documentation** - Every config option should be documented
5. **Backward compatibility** - New options should have sensible defaults

### TTY Configuration

TTY allocation should be explicit in habitat configuration:

```yaml
container:
  tty: true    # Default: true for interactive applications
               # Set to false for headless/batch operations
```

**Default behavior:** Interactive TTY enabled (`docker exec -it`)
**When to disable:** Batch jobs, CI/CD, non-interactive automation

## Additional Guidelines

- Always check the user experience to ensure it complies with intended design
- Use UI snapshots to verify that changes don't break the interface
- Test both successful and error scenarios

Remember: The goal is to create a perfect, isolated development environment that "just works" when developers run it!

## Path Resolution Standards

To eliminate path resolution bugs and regressions, always follow these standards:

### Host-Side Paths

**Rule: Always use `rel()` for host filesystem paths (relative to project root)**

```javascript
// Import the helper
const { rel } = require('./utils');

// Good: Consistent project-root relative paths
const dockerfilePath = rel('habitats', 'claude-habitat', 'Dockerfile');
const systemDir = rel('system');
const sharedDir = rel('shared');
const configPath = rel('habitats', 'discourse', 'config.yaml');

// Bad: Manual path construction prone to errors
const dockerfilePath = path.join(__dirname, '..', 'habitats', 'claude-habitat', 'Dockerfile');
const systemDir = path.join(process.cwd(), 'system');
```

### Container-Side Paths

**Rule 1: Use absolute strings for fixed container paths**

```javascript
// Good: Clear, fixed container paths
const claudeCredentials = '/opt/claude-credentials.json';
const homeDir = '/home/node';
const systemBin = '/usr/bin/docker';

// Bad: Unnecessary helper overhead
const homeDir = containerPath('/home', 'node');
```

**Rule 2: Use `createWorkDirPath()` for workspace-relative paths**

```javascript
// Import the helper factory
const { createWorkDirPath } = require('./utils');

// Create workspace-relative helper for this container
const workDirPath = createWorkDirPath(config.container.work_dir);

// Good: Workspace-relative paths
const repoPath = workDirPath('my-repo');
const habitatSystem = workDirPath('claude-habitat', 'system');
const toolPath = workDirPath('claude-habitat', 'system', 'tools', 'bin', 'setup-github-auth');

// Bad: Manual construction with repetition
const repoPath = path.posix.join(config.container.work_dir, 'my-repo');
const toolPath = path.posix.join(config.container.work_dir, 'claude-habitat', 'system', 'tools', 'bin', 'setup-github-auth');
```

### Configuration Files

**Rule: Dockerfile and other paths in configs are always relative to project root**

```yaml
# Good: Relative to project root (no leading ./)
image:
  dockerfile: habitats/claude-habitat/Dockerfile

# Bad: Ambiguous relative paths
image:
  dockerfile: ./habitats/claude-habitat/Dockerfile  # Relative to what?
```

### Variable Templates

**Rule: Use simplified variable names in template substitution**

```yaml
# Good: Simple, clear variable names
setup:
  user:
    commands:
      - ${work_dir}/claude-habitat/system/tools/bin/setup-github-auth

# Avoid: Verbose nested references
setup:
  user:
    commands:
      - ${container.work_dir}/claude-habitat/system/tools/bin/setup-github-auth
```

### Benefits of This Approach

1. **Eliminates path duplication bugs**: No more `habitats/habitat/habitats/habitat` errors
2. **Clear context separation**: `rel()` = host, `workDirPath()` = container workspace, `'/absolute'` = container fixed
3. **Self-documenting code**: Function names indicate the path context immediately
4. **Centralized logic**: Path resolution logic is in one place
5. **Consistent mental model**: Always know which context you're working in

### Migration Guide

When updating existing code:

1. **Replace project-relative constructions with `rel()`**:
   ```javascript
   // Before
   const configPath = path.join(__dirname, '..', 'system', 'config.yaml');
   
   // After  
   const configPath = rel('system', 'config.yaml');
   ```

2. **Replace workspace-relative constructions with `workDirPath()`**:
   ```javascript
   // Before
   const toolPath = path.posix.join(config.container.work_dir, 'claude-habitat', 'system', 'tools', 'bin', 'tool');
   
   // After
   const workDirPath = createWorkDirPath(config.container.work_dir);
   const toolPath = workDirPath('claude-habitat', 'system', 'tools', 'bin', 'tool');
   ```

3. **Simplify absolute container paths**:
   ```javascript
   // Before
   const containerPath = buildContainerPath('/home', 'node', '.claude');
   
   // After
   const containerPath = '/home/node/.claude';
   ```
