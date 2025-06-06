# Claude Habitat - AI Assistant Instructions

## Overview

Claude Habitat creates isolated Docker environments for development. Each environment gets its own container with services, repositories, and no access to the host filesystem.

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
```bash
npm test                    # Run all unit tests
npm run test:unit          # Same as above
npm run test:watch         # Run tests in watch mode
```

### 2. E2E Tests
```bash
npm run test:e2e           # Run end-to-end tests
```

### 3. UI Testing
```bash
npm run test:ui            # Generate UI snapshots
npm run test:ui:view       # Generate and view snapshots
```

### 4. Habitat Tests
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

## Common Test Sequences

Use these to quickly test specific functionality:

- `./claude-habitat --test-sequence="q"` - Test main menu
- `./claude-habitat --test-sequence="tq"` - Test navigation to test menu  
- `./claude-habitat --test-sequence="t2f"` - Test filesystem verification
- `./claude-habitat --test-sequence="h"` - Test help display
- `./claude-habitat --test-sequence="q" --preserve-colors` - Test with colors preserved

## Additional Guidelines

- Always check the user experience to ensure it complies with intended design
- Use UI snapshots to verify that changes don't break the interface
- Test both successful and error scenarios

Remember: The goal is to create a perfect, isolated development environment that "just works" when developers run it!
