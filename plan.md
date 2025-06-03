# Claude Habitat Migration Plan

## Overview
Transform the Discourse-specific `d/claude-code` script into a generic, reusable tool for creating isolated Claude development environments for any project.

## 1. Script Migration

### Current State
- Script lives at `bin/docker/claude-code`
- Hardcoded for Discourse development
- Relies on being inside Discourse directory structure
- Uses local file copying with tar

### Target State
- Standalone `claude-habitat` CLI tool
- Configuration-driven (YAML files)
- Git-based repository cloning
- No dependency on local files

### Migration Steps
1. Copy core logic to `claude-habitat/claude-habitat.sh`
2. Remove Discourse-specific assumptions
3. Replace file copying with git cloning
4. Add configuration loading
5. Make paths and commands configurable

## 2. Configuration Design

### YAML Structure
```yaml
name: discourse-development
description: Discourse plugin development environment

# Base Docker image configuration
image:
  dockerfile: ./dockerfiles/Dockerfile.discourse
  tag: claude-habitat-discourse:latest
  build_args:
    DISCOURSE_IMAGE: discourse/discourse_dev:release

# Environment variables to pass through
environment:
  - RAILS_ENV=test
  - RUBY_GLOBAL_METHOD_CACHE_SIZE=131072
  - LD_PRELOAD=/usr/lib/libjemalloc.so
  # These come from host environment
  - GITHUB_TOKEN
  - GITHUB_APP_ID
  - GITHUB_APP_PRIVATE_KEY

# Git repositories to clone
repositories:
  - url: https://github.com/discourse/discourse
    path: /src
    branch: main
    shallow: true
    
  # Plugins can be specified here or via CLI
  - url: https://github.com/discourse/discourse-calendar
    path: /src/plugins/discourse-calendar
    branch: main
    shallow: true

# Post-clone setup commands
setup:
  # Commands run as root
  root:
    - | 
      # Wait for services to start
      timeout 30 bash -c "while ! pg_isready -U postgres -q; do sleep 1; done"
      
      # Set up database
      sudo -u postgres createuser discourse 2>/dev/null || true
      sudo -u postgres createdb discourse_test -O discourse 2>/dev/null || true

  # Commands run as the specified user
  user:
    run_as: discourse
    commands:
      - cd /src && bundle install
      - cd /src && pnpm install
      - cd /src && RAILS_ENV=test bin/rails db:create db:migrate

# Container settings
container:
  work_dir: /src
  user: discourse
  init_command: /sbin/boot
  startup_delay: 10  # seconds to wait for services

# Claude-specific settings
claude:
  instructions_file: CLAUDE.md  # Will be copied from repo if exists
  command: claude --dangerously-skip-permissions
```

### Command Line Interface
```bash
# Basic usage with config file
claude-habitat --config discourse.yaml

# Override repositories via CLI
claude-habitat --config discourse.yaml \
  --repo "https://github.com/myuser/discourse:/src" \
  --repo "https://github.com/myuser/my-plugin:/src/plugins/my-plugin"

# List available configs
claude-habitat --list-configs

# Clean up images
claude-habitat --clean
```

## 3. Repository Cloning System

### Features
- Support multiple repositories
- Configurable clone paths
- Shallow clones by default (faster)
- Branch selection
- Override via CLI arguments

### Implementation
```bash
# Parse repository configuration
# Format: URL:PATH[:BRANCH]
clone_repository() {
  local repo_url="$1"
  local clone_path="$2"
  local branch="${3:-main}"
  local shallow="${4:-true}"
  
  if [ "$shallow" = "true" ]; then
    git clone --depth 1 --branch "$branch" "$repo_url" "$clone_path"
  else
    git clone --branch "$branch" "$repo_url" "$clone_path"
  fi
}
```

## 4. Discourse Configuration File

### discourse.yaml
This configuration replicates our current Discourse setup:

```yaml
name: discourse-development
description: Discourse plugin development environment

image:
  dockerfile: ./dockerfiles/Dockerfile.discourse
  tag: claude-habitat-discourse:latest
  build_args:
    DISCOURSE_IMAGE: discourse/discourse_dev:release

environment:
  - RAILS_ENV=test
  - RUBY_GLOBAL_METHOD_CACHE_SIZE=131072
  - LD_PRELOAD=/usr/lib/libjemalloc.so
  - CI
  - NO_EMBER_CLI
  - QUNIT_RAILS_ENV
  - GITHUB_TOKEN

repositories:
  - url: https://github.com/discourse/discourse
    path: /src
    branch: main
    shallow: true

setup:
  root:
    - |
      # Wait for PostgreSQL
      echo "Waiting for PostgreSQL to be ready..."
      timeout 30 bash -c "while ! pg_isready -U postgres -q; do sleep 1; done"
      
      # Create test database
      sudo -u postgres createuser discourse 2>/dev/null || true
      sudo -u postgres createdb discourse_test -O discourse 2>/dev/null || true
      
      # Git safe directory
      git config --global --add safe.directory /src

  user:
    run_as: discourse
    commands:
      - |
        cd /src
        echo "Installing Ruby dependencies..."
        bundle install
        
        echo "Installing JavaScript dependencies..."
        pnpm install
        
        echo "Setting up test database..."
        RAILS_ENV=test bin/rails db:create db:migrate

container:
  work_dir: /src
  user: discourse
  init_command: /sbin/boot
  startup_delay: 10

claude:
  instructions_file: CLAUDE-docker.md
  command: claude --dangerously-skip-permissions
```

### Dockerfile.discourse
Move our existing Dockerfile.claude here, unchanged.

## 5. Testing Plan

### Phase 1: Core Functionality
1. Test config loading
2. Test image building
3. Test repository cloning
4. Test container creation

### Phase 2: Discourse Compatibility
1. Run with discourse.yaml
2. Verify PostgreSQL/Redis start
3. Test bundle/pnpm install
4. Test database creation
5. Launch Claude successfully

### Phase 3: Edge Cases
1. Test with missing config file
2. Test with invalid git URLs
3. Test cleanup on errors
4. Test parallel sessions
5. Test CLI overrides

### Phase 4: Extended Testing
1. Create a simple Node.js project config
2. Test with different base images
3. Test with private repositories
4. Test with multiple plugins

## Implementation Order

1. **Create basic structure**
   - `claude-habitat.sh` - Main script
   - `configs/discourse.yaml` - Discourse config
   - `dockerfiles/Dockerfile.discourse` - Discourse image
   - `README.md` - Documentation

2. **Core features**
   - YAML parsing (using yq or similar)
   - Argument parsing
   - Image building logic
   - Container creation

3. **Git integration**
   - Repository cloning
   - Multiple repo support
   - CLI overrides

4. **Polish**
   - Error handling
   - Progress indicators
   - Cleanup command
   - List configs command

## Migration Notes

### Key Changes from Original Script
1. **No local file copying** - Everything comes from git
2. **Config-driven** - No hardcoded paths or commands
3. **Generic structure** - Works for any project type
4. **Multiple repos** - Not just main + plugins
5. **Flexible paths** - Repos can clone anywhere

### Backwards Compatibility
- The `discourse.yaml` config provides full compatibility
- Same isolated environment
- Same PostgreSQL/Redis setup
- Same Claude experience

### Future Enhancements
1. Repository caching for faster clones
2. Config inheritance/templates
3. Published image registry
4. Web UI for config management
5. Integration with Claude Code's native project management