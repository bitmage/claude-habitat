# Claude Habitat Documentation

AI-powered development environments that are isolated, reproducible, and ready for Claude Code.

## Overview

Claude Habitat creates isolated Docker containers where "Habitat" Claude can work on your projects safely. Each **habitat** includes your code, required services, and development tools with no access to your host filesystem.

Perfect for AI pair programming without risk! 

## Where to Find Information

Claude Habitat now uses **contextual documentation** - information is located where you need it:

### Domain Concepts & Types
- **Start here**: `src/types.js` - Complete domain model and terminology
- Understanding habitats, sessions, workspaces, and repositories

### Configuration
- **Configuration system**: `src/config.js` - Loading order, environment variables, path variables
- **Validation**: `src/config-validation.js` - Configuration validation and help

### GitHub Integration  
- **Authentication setup**: `src/github.js` - GitHub App creation and setup
- **Repository operations**: `src/github.js` - Access verification and error handling

### Tools & Workflows
- **Development tools**: `src/scenes/tools.scene.js` - Available tools and installation
- **Interactive workflows**: `src/scenes/` - All user interaction flows

### Runtime Operations
- **Session management**: `src/habitat.js` - Starting, stopping, monitoring active sessions  
- **Container operations**: `src/container-operations.js` - Docker runtime operations

### Error Handling & Troubleshooting
- **Common issues**: `src/errors.js` - Troubleshooting patterns and debug methods
- **Error recovery**: `src/errors.js` - Structured error handling

### Testing
- **Test approach**: `src/testing.js` - Testing philosophy and execution
- **All test commands**: Each module's JSDoc header links to relevant tests

## Quick Start

```bash
# Clone and setup
git clone <repo-url> && cd claude-habitat && npm install

# Try the example  
./claude-habitat discourse

# Or create your own
./claude-habitat add
```

## Setup (Optional)

For private repositories, add SSH keys or GitHub App authentication to `shared/`. The tool will guide you through this when needed.

## Available Commands

```bash
./claude-habitat <habitat-name>     # Start specific habitat
./claude-habitat                    # Interactive menu
./claude-habitat add                # Create new habitat
./claude-habitat maintain           # Maintenance mode
./claude-habitat --list-configs     # List available habitats
```

## What You Get

When "Habitat" Claude runs in a container:
- **Complete isolation** from your host system
- **All development tools** pre-installed (`rg`, `fd`, `jq`, `yq`, `gh`, etc.)
- **Project code** cloned and ready
- **Services running** (databases, caches as needed)
- **System infrastructure** in `./claude-habitat/system/` (managed)
- **Your preferences** in `./claude-habitat/shared/` (your configs, keys, tools)
- **Scratch space** for "Habitat" Claude's notes and experiments

## Directory Structure

### `docs/` - User Documentation
- **`README.md`** - This overview and main guide
- **`SETUP.md`** - Installation and setup instructions
- **`USAGE.md`** - How to create and use environments
- **`TERMINOLOGY.md`** - Complete domain model and concepts
- **`GITHUB-AUTH.md`** - Authentication setup guide
- **`TROUBLESHOOTING.md`** - Common issues and solutions
- **`TOOLS-WORKFLOW.md`** - Managing system development tools

### `claude/` - "Meta" Claude Instructions
- **`INSTRUCTIONS.md`** - Instructions for "Meta" Claude (maintenance, habitat creation)
- **`MAINTENANCE.md`** - Maintenance mode procedures
- **`TROUBLESHOOTING.md`** - "Meta" Claude troubleshooting guide
- **`BEST_PRACTICES.md`** - Development standards and lessons learned
- **Never copied to containers** - Local execution only

### `system/` - Infrastructure (Managed)
- **`CLAUDE.md`** - Base instructions for "Habitat" Claude
- **`tools/`** - Development tools available in all containers
- **`README.md`** - System infrastructure documentation
- **Copied to containers** at `./claude-habitat/system/`

### `shared/` - Your Personal Preferences  
- **`claude.md.example`** - Template for personal "Habitat" Claude preferences
- **`README.md`** - Guide for personal customization
- **`BEST_PRACTICES.md`** - Symlink to development standards (accessible in containers)
- **Personal configs** - Git settings, SSH keys, aliases, tools
- **Copied to containers** at `./claude-habitat/shared/`

### `habitats/` - Project Environments
- **`PROJECT/config.yaml`** - Docker and setup configuration
- **`PROJECT/Dockerfile`** - Container definition
- **`PROJECT/claude.md`** - Project-specific "Habitat" Claude instructions
- **Copied to containers** at `./claude-habitat/`

## Requirements

- Docker
- Node.js  
- Claude Code CLI

## Documentation

- `SETUP.md` - Setup details
- `USAGE.md` - Usage examples
- `github-app.md` - GitHub authentication
- `troubleshooting.md` - Common issues

The tool will guide you through what you need!