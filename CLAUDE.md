# Claude Habitat - AI Assistant Instructions

## Overview

Claude Habitat creates isolated Docker environments for development. Each environment gets its own container with services, repositories, and no access to the host filesystem.

## Where to Find Information

Claude Habitat uses **contextual documentation** - information is located where you need it:

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

### "Habitat" Claude (In containers)
- **Where**: Runs inside isolated Docker containers
- **Purpose**: Works on actual development projects  
- **Access**: Only project workspace and development environment
- **Instructions**: Assembled from system/shared/habitat configurations

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

If the user asks for discussion or asks questions, don't proceed with implementation until you have answered all questions and received acknowledgement from the user that they are satisfied with your answers.

## Coding Preferences

- **Domain Driven Design** - Code reflects domain concepts from [src/types.js](src/types.js)
- **Self Documenting Code** - Link to tests, related concepts, and clarify intention
- **Functional programming over OOP** - Prefer pure functions and data transformation
- **Pure functions over mocking** - Write testable functions through dependency injection
- **Create improvement proposals** - When you discover problems or opportunities to improve, create a proposal in `claude/scratch/[foo].md`, continue working on the original objective, and list any new proposals when reporting on task completion

This is a complex architecture with many layers - be sure you understand what layer you are on and what the idiomatic practices for that layer are.

When troubleshooting be sure to identify at what layer our code differs from the architectural intent. Do not go changing the layers without thoroughly understanding how the architecture is intended to function.

This is declarative infrastructure based on yaml files, and the resulting behavior should be predictable from reading the relevant yaml files.

## Memories

- Don't guess at what is true, find evidence. Only speculate if you've exhausted available options to know for sure.

## Good luck!

We have faith in you, and we appreciate your contributions.

---

*For complete details on any topic, check the relevant source code module - all information is now contextually documented where it's used.*