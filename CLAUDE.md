# Claude Habitat - AI Assistant Instructions

## Overview

Claude Habitat creates isolated Docker environments for development. Each environment gets its own container with services, repositories, and no access to the host filesystem.

## Deprecation Policy & Versioning

**Claude Habitat is PRE-ALPHA software.** No backwards compatibility should be expected.

### Version Management
- **Starting version**: 0.1.1
- **Increment policy**: Version should be bumped with every commit that contains breaking changes or new features
- **Version location**: Update the version in `package.json`

### Committing Changes
When making commits that change functionality:
1. **Update version in package.json** - Increment patch version (0.1.1 → 0.1.2)
2. **Breaking changes** - Increment minor version (0.1.x → 0.2.0) 
3. **Major architectural changes** - Increment major version (0.x.y → 1.0.0)

Example commit workflow:
```bash
# Make your changes
vim src/some-file.js

# Update version
npm version patch  # or minor/major as appropriate

# Commit with descriptive message
git commit -am "Add new feature X

- Implement functionality Y
- Update Z for better performance
- BREAKING: Remove deprecated setup format

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Backwards Compatibility
- **We are in Pre-alpha**: No backwards compatibility guaranteed
- **API changes**: Function signatures and module exports may change
- **CLI changes**: Command-line interface may change without deprecation warnings

### Migration Strategy
Since this is pre-alpha with no users:
- Remove deprecated features immediately rather than maintaining backwards compatibility
- Prefer clean, simple code over complex compatibility layers
- Focus on architectural correctness over migration paths

## Where to Find Information

Claude Habitat uses **contextual documentation** - information is located where you need it.  Please MAINTAIN this standard for any new code being written.

### 🎯 Architecture
- **System overview**: [claude-habitat.js](claude-habitat.js) - Overall project purpose and high-level architecture
- **Domain concepts**: [src/types.js](src/types.js) - Complete domain model and terminology

### 🔧 Habitat Configuration
*Habitats for productive Claude Coding can be created through declarative config.yaml files.*
- **Configuration system**: [src/config.js](src/config.js) - Loading order, environment variables
- **Build pipeline**: [src/phases.js](src/phases.js) - 12-phase progressive build system and cache invalidation
- **GitHub authentication**: [src/github.js](src/github.js) - GitHub App setup and repository access
- **Error handling**: [src/errors.js](src/errors.js) - Troubleshooting patterns and recovery

### 🎮 User Interfaces
- **Interactive workflows**: [src/scenes/](src/scenes/) - All user interaction flows
- **Command-line operations**: [src/cli-parser.js](src/cli-parser.js) and [src/command-executor.js](src/command-executor.js)

### 🧪 Testing
- **Testing approach**: [src/habitat-testing.js](src/habitat-testing.js) - Unit, E2E, and habitat testing
- **UI snapshots**: Simulate user interactions with `./claude-habitat --test-sequence="t2f"`
- **Complete testing**: Regenerate and review UI snapshots before publishing: `npm run test:ui:view`

### 🔨 Development
- **Development lifecycle**: [src/scenes/maintenance.scene.js](src/scenes/maintenance.scene.js) - Standard development workflow
- **Development tools**: [src/scenes/tools.scene.js](src/scenes/tools.scene.js) - Available tools and workflow
- **Best practices**: [src/scenes/maintenance.scene.js](src/scenes/maintenance.scene.js) - Development guidelines

## Two Types of Claude

### "Meta" Claude (You, in maintenance mode)
- **Where**: Runs locally on your host machine  
- **Purpose**: Manages Claude Habitat itself - maintenance, creating habitats, troubleshooting
- **Access**: Full Claude Habitat installation
- **Instructions**: [src/scenes/maintenance.scene.js](src/scenes/maintenance.scene.js) for role and available tasks
- **Authentication**: Authentication for github and other endpoints is handled by host.

### "Habitat" Claude (In containers)
- **Where**: Runs inside isolated Docker containers
- **Purpose**: Works on actual development projects  
- **Access**: Only project workspace and development environment
- **Instructions**: Assembled from system/shared/habitat configurations
- **Authentication**: A .pem key exists in the shared folder.  This is used for `gh` access and to generate `GITHUB_TOKEN` which is then used for github https operations.  `GITHUB_TOKEN` should be generated when the habitat is first started, and can be regenerated with `source system/tools/regenerate-github-token.sh`.

## Interactive-First Architecture

The tool supports both direct CLI operations and interactive scene-based flows:

- **CLI Operations**: `./claude-habitat start discourse`, `./claude-habitat --clean`
- **Interactive Flows**: Main menu navigation with guided workflows
- **Graceful Experience**: Every path leads back to a decision point

All interaction patterns are documented in [src/scenes/](src/scenes/) modules.

## Runtime Environment Information

Host system information is available in `shared/host-info.yaml` with OS details, tool versions, and platform-specific information generated during initialization.

Claude Habitat has self-hosting capabilities. If `/.dockerenv` exists, you're definitely in a container!

## Communication Preferences

- If the user asks for discussion or asks questions, don't proceed with implementation until you have answered all questions and received acknowledgement from the user that they are satisfied with your answers.
- If you're referring to code and explaining how it functions, tell me what file and line number to find the code that you're talking about.
- Don't present large code examples in proposals or discussion (or large excerpts from the codebase) unless I ask for it.  1-5 lines of code is ok.

## Coding Preferences

- **Domain Driven Design** - Code reflects domain concepts from [src/types.js](src/types.js)
- **Self Documenting Code** - Link to tests, related concepts, and clarify intention
- **Test Driven Development (TDD)** - Rather than ad hoc probes into the system, write tests.
- **Functional programming over OOP** - Prefer pure functions and data transformation
- **Pure functions over mocking** - Write testable functions through dependency injection
- **Create improvement proposals** - When you discover problems or opportunities to improve, create a proposal in `claude/scratch/[foo].md`, continue working on the original objective, and list any new proposals when reporting on task completion
- **Value evidence over speculation** - Don't guess at what is true, find evidence. Only speculate if you've exhausted available options to know for sure.
- **config.yaml files are part of the spec** - Unless specifically instructed to change them, assume that the config.yaml files are part of the architectural spec given to you, and don't modify them without confirming with the user.
- **WE LOATHE CODE DUPLICATION** - If you find yourself writing code that looks 90% similar to other code, or implements the same functionality for a slightly different use case, STOP.  See if you can find a way to share logic, and if you can't BRING IT UP IN CONVERSATION before continuing with implementation.  It's much easier to catch code divergence early than after other parts of the codebase have begun to rely on it.

This is a complex architecture with many layers - be sure you understand what layer you are on and what the idiomatic practices for that layer are.

When troubleshooting be sure to identify at what layer our code differs from the architectural intent. Do not go changing the layers without thoroughly understanding how the architecture is intended to function.

This is declarative infrastructure based on yaml files, and the resulting behavior should be predictable from reading the relevant yaml files.

## Documentation Standards

### JSDoc Link Format
When referencing other modules or files in JSDoc comments, use this format:
```
@see {@link filename} for [purpose/description]
```

Examples:
- `@see {@link src/phases.js} for phase definitions and configuration sections`
- `@see {@link claude-habitat.js} for system composition and architectural overview`
- `@see {@link src/config.js} for configuration loading and processing`

### Avoid Duplication
- Reference authoritative sources rather than copying information
- Link to implementations rather than describing them inline
- Maintain single source of truth for domain concepts (e.g., phase definitions in src/phases.js)

### Module Documentation Pattern
Each module should have a consistent JSDoc header:
```javascript
/**
 * @module module-name
 * @description Brief description of module purpose
 * 
 * Detailed explanation of functionality and architectural role
 * 
 * @requires module:dependency - Why this dependency is needed
 * @see {@link related-module.js} for related functionality
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/module.test.js`
 * - Integration tests: `npm run test:e2e`
 */
```

## Good luck!

We have faith in you, and we appreciate your contributions.

---

*For complete details on any topic, check the relevant source code module - all information is now contextually documented where it's used.*
