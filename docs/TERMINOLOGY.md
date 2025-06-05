# Claude Habitat Domain Model & Terminology

The ubiquitous language for understanding Claude Habitat's architecture, concepts, and workflows.

## Two Types of Claude

### "Meta" Claude (mclaude)
- **Where**: Runs locally on your host machine
- **Purpose**: Manages Claude Habitat itself - maintenance, creating new habitats, troubleshooting
- **Access**: Has access to your entire Claude Habitat installation
- **Documentation**: Uses files in `claude/` directory
- **Examples**: 
  - `./claude-habitat add` - "Meta" Claude analyzes your repository and creates habitat configs
  - `./claude-habitat maintain` - "Meta" Claude helps with system maintenance and debugging
  - Troubleshooting build issues and configuration problems

### "Habitat" Claude (hclaude)  
- **Where**: Runs inside the isolated Docker container
- **Purpose**: Works on your actual development projects
- **Access**: Only sees the project code and development environment
- **Documentation**: Uses assembled `CLAUDE.md` from system/shared/habitat sources
- **Examples**:
  - Writing code and tests for your project
  - Creating pull requests and commits
  - Debugging application issues within the development environment

## Directory Structure & Ownership

### `claude/` - "Meta" Claude Documentation
- **Audience**: "Meta" Claude (local execution only)
- **Content**: Maintenance guides, troubleshooting, habitat creation instructions
- **Container**: Never copied to container

### `system/` - Infrastructure 
- **Audience**: "Habitat" Claude (and managed by Claude Habitat)
- **Content**: Base instructions, development tools, system configuration
- **Container**: Copied to `/workspace/claude-habitat/system/`

### `shared/` - User Preferences
- **Audience**: "Habitat" Claude (configured by user)
- **Content**: Personal configs, SSH keys, user tools, personal "Habitat" Claude preferences
- **Container**: Copied to `/workspace/claude-habitat/shared/`

### `habitats/` - Project Environments
- **Audience**: "Habitat" Claude (configured per project)
- **Content**: Project-specific Dockerfiles, configs, and "Habitat" Claude instructions
- **Container**: Relevant files copied to `/workspace/claude-habitat/`

### `docs/` - User Documentation
- **Audience**: Human users
- **Content**: Setup guides, usage instructions, examples
- **Container**: Not copied (human documentation only)

## Key Concepts

### Isolation
- **"Meta" Claude**: Can see and modify your entire Claude Habitat installation
- **"Habitat" Claude**: Completely isolated in Docker, can only see the project and its development environment

### Instructions Assembly
"Habitat" Claude receives a composed `CLAUDE.md` that combines:
1. `system/CLAUDE.md` - Base environment and tools
2. `shared/claude.md` - Your personal preferences  
3. `habitats/PROJECT/claude.md` - Project-specific instructions

### Tools
- **System tools** (`system/tools/`) - Available to "Habitat" Claude in containers
- **Meta tools** - "Meta" Claude uses system tools when available for portability
- **User tools** (`shared/tools/`) - Personal tools for "Habitat" Claude

## Usage Examples

### When "Meta" Claude is Active
```bash
./claude-habitat add          # "Meta" Claude creates new habitat
./claude-habitat maintain     # "Meta" Claude troubleshoots issues  
./claude-habitat --clean      # "Meta" Claude manages Docker images
```

### When "Habitat" Claude is Active  
```bash
./claude-habitat discourse    # Launches "Habitat" Claude in container
# Now "Habitat" Claude is working on your Discourse project
# with access to project code, tools, and development environment
```

This separation ensures that:
- **"Meta" Claude** can help you manage and configure Claude Habitat itself
- **"Habitat" Claude** works safely in isolation on your actual projects
- **Instructions stay relevant** to the appropriate context and capabilities

## Core Domain Concepts

### Habitat
A complete isolated development ecosystem - more than just a "container" or "configuration":
- **Includes**: Project code, services, tools, environment, and instructions
- **Lifecycle**: Creation → Build → Preparation → Session → Cleanup
- **Bounded Context**: Self-contained development environment with clear boundaries

### Session
The active period when "Habitat" Claude is working inside a container:
- **Start**: Container launches with prepared environment
- **Active**: "Habitat" Claude works on development tasks
- **End**: Container stops, work is preserved in repositories

### Workspace  
The prepared development space inside containers where "Habitat" Claude operates:
- **Location**: Usually `/workspace` or project-specific directory
- **Contents**: Project code, tools, configuration files, scratch space
- **Scope**: "Habitat" Claude's entire accessible environment

## Architecture Patterns

### Composition (Three-Layer System)
The layered approach to building "Habitat" Claude's environment:

1. **Infrastructure Layer** (`system/`)
   - **Managed by**: Claude Habitat itself
   - **Contains**: Base tools, core instructions, system utilities
   - **Stability**: Updated with Claude Habitat releases

2. **Preferences Layer** (`shared/`)
   - **Managed by**: User (you)
   - **Contains**: Personal configs, SSH keys, workflow preferences  
   - **Scope**: Applied to all your habitats consistently

3. **Project Layer** (`habitats/*/`)
   - **Managed by**: Per-project basis
   - **Contains**: Project-specific setup, instructions, requirements
   - **Scope**: Unique to each development environment

### Instructions Assembly
The process of combining layers into a single `CLAUDE.md` for "Habitat" Claude:
```
system/CLAUDE.md        # Infrastructure base
  + shared/claude.md    # Your preferences  
  + habitat/claude.md   # Project-specific
  = Final CLAUDE.md     # Complete instructions
```

## Image Lifecycle

### Base Image
The result of building the Dockerfile:
- **Contains**: Operating system, runtime, services, system packages
- **State**: Clean install, no project code or user data
- **Caching**: Shared across similar projects for efficiency

### Prepared Image  
Base Image + repositories + tools + configuration:
- **Contains**: Everything needed for immediate development work
- **State**: Ready to start a development session instantly
- **Caching**: Unique per project configuration and extra repositories

### Cache Hash
Unique identifier for prepared images based on:
- Base configuration content
- Extra repositories specified
- System and shared files to be copied
- Ensures prepared images are rebuilt only when needed

## Execution Contexts

### Host Context
Where "Meta" Claude operates:
- **Environment**: Your local machine
- **Access**: Full Claude Habitat installation, host filesystem
- **Authentication**: Uses local git, GitHub CLI, Docker
- **Purpose**: Infrastructure management and habitat creation

### Container Context  
Where "Habitat" Claude operates:
- **Environment**: Isolated Docker container
- **Access**: Only project workspace and development tools
- **Authentication**: SSH keys for repository access
- **Purpose**: Development work on actual projects

## Repository Access Patterns

### Development Repositories
Repositories where active development occurs:
- **Access Mode**: Write (can commit and push changes)
- **Authentication**: SSH keys or GitHub App
- **Examples**: Main project repository, your forks
- **Failure Impact**: Blocks development workflow

### Dependency Repositories
Repositories needed as references or plugins:
- **Access Mode**: Read (clone and pull only)
- **Authentication**: SSH keys for private, none for public
- **Examples**: Plugin libraries, reference implementations
- **Failure Impact**: May limit functionality but won't block core development

### Repository Specifications
Format for describing repositories in configuration:
```
URL:PATH[:BRANCH]
```
- **URL**: Git clone URL (HTTPS or SSH)
- **PATH**: Where to place in container filesystem
- **BRANCH**: Optional branch specification (defaults to main)

## Authentication Scopes

### Host Authentication
Used by "Meta" Claude for infrastructure operations:
- **GitHub CLI** (`gh`): Creating repositories, managing issues
- **Git Configuration**: User identity for local operations
- **Docker Access**: Building and managing images

### Container Authentication
Used by "Habitat" Claude for development work:
- **SSH Keys**: Repository cloning and pushing
- **Git Configuration**: Copied from shared preferences
- **GitHub App Keys**: API access within containers (optional)

## File Organization Patterns

### Infrastructure Files (System)
- **Naming**: Uppercase `CLAUDE.md` for managed infrastructure
- **Ownership**: Claude Habitat project
- **Updates**: Through Claude Habitat releases and maintenance

### User Files (Shared & Habitat)
- **Naming**: Lowercase `claude.md` for user-managed content
- **Ownership**: User or project-specific
- **Updates**: User manages according to their preferences

### Security Boundaries
- **Shared Directory**: Protected by `.gitignore` for sensitive files
- **Habitat Directories**: May contain project-specific secrets
- **Container Isolation**: No access to host filesystem beyond workspace

## Operational Patterns

### Habitat Creation
Process of defining a new development environment:
1. **Analysis**: "Meta" Claude examines project repository
2. **Generation**: Creates Dockerfile and configuration  
3. **Validation**: Tests the configuration works correctly
4. **Integration**: Adds to available habitats

### Session Lifecycle
Standard flow for development work:
1. **Preparation**: Build/cache prepared image with all dependencies
2. **Launch**: Start container with development environment
3. **Development**: "Habitat" Claude works on project tasks
4. **Persistence**: Changes saved to repositories, container cleaned up

### Maintenance Operations
"Meta" Claude infrastructure management:
- **Updates**: Refreshing tools and base configurations
- **Cleanup**: Removing old Docker images and temporary files
- **Troubleshooting**: Diagnosing and fixing system issues
- **Extensions**: Adding new capabilities to the platform

This terminology provides a shared vocabulary for understanding, discussing, and extending Claude Habitat's capabilities.