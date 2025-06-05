# Claude Habitat Habitat - Execution Plan

## Overview
Create a habitat for developing Claude Habitat itself, enabling developers to work on Claude Habitat without affecting their host system.

## Key Requirements
1. **Docker Socket Mounting** - Not Docker-in-Docker (DinD)
2. **Volume Mounting** - For testing without full rebuilds
3. **Repository Access** - Claude Habitat's own repository
4. **No Habitat Claude Instructions** - The cloned claude-habitat already has correct CLAUDE.md

## Design Decisions (from earlier discussion)

### Docker Socket Approach
- Mount Docker socket from host: `/var/run/docker.sock:/var/run/docker.sock`
- Allows building and running containers from within the habitat
- Avoids complexity and performance issues of true DinD
- Container can manage other containers on the host

### Configuration Transparency
- No special flags like `docker_development`
- Everything explicit in the config file
- Use standard `volumes` configuration
- Clear documentation about what's being mounted

### Disable Habitat Instructions
- Add `disable_habitat_instructions: true` flag
- Prevents overwriting the claude-habitat's own CLAUDE.md
- The cloned repository already has the correct instructions

## Implementation Plan

### 1. Create Habitat Configuration
`habitats/claude-habitat/config.yaml`:
```yaml
name: claude-habitat
description: Development environment for Claude Habitat itself

image:
  dockerfile: Dockerfile
  tag: claude-habitat-dev:latest

repositories:
  - url: https://github.com/bitmage/claude-habitat
    path: /workspace/claude-habitat
    branch: main

environment:
  - NODE_ENV=development
  - DOCKER_HOST=unix:///var/run/docker.sock

volumes:
  # Mount Docker socket for container management
  - /var/run/docker.sock:/var/run/docker.sock
  # Optional: Mount local code for live development
  # - ./:/workspace/claude-habitat

setup:
  root:
    - |
      # Install Docker CLI (not daemon)
      apt-get update && apt-get install -y docker.io
      
      # Ensure docker group exists and add user
      groupadd -f docker
      usermod -aG docker developer
      
      # Fix Docker socket permissions
      chmod 666 /var/run/docker.sock || true
      
  user:
    run_as: developer
    commands:
      - |
        cd /workspace/claude-habitat
        npm install
        npm test

container:
  work_dir: /workspace/claude-habitat
  user: developer

# Disable automatic Claude instruction generation
claude:
  command: claude
  disable_habitat_instructions: true
```

### 2. Create Dockerfile
`habitats/claude-habitat/Dockerfile`:
```dockerfile
FROM node:20-bookworm

# Install development tools
RUN apt-get update && apt-get install -y \
    git \
    vim \
    curl \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Create development user
RUN useradd -m -s /bin/bash -u 1000 developer && \
    echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set up workspace
RUN mkdir -p /workspace && \
    chown -R developer:developer /workspace

USER developer
WORKDIR /workspace

# Keep container running
CMD ["tail", "-f", "/dev/null"]
```

### 3. Update claude-habitat.js to Support New Features

#### A. Add Volume Support
```javascript
// In buildPreparedImage or runContainer
if (config.volumes && Array.isArray(config.volumes)) {
  config.volumes.forEach(volume => {
    runArgs.push('-v', volume);
  });
}
```

#### B. Add disable_habitat_instructions Support
```javascript
// In the Claude instruction setup section
if (!config.claude?.disable_habitat_instructions) {
  // Only create CLAUDE.md if not disabled
  await setupClaudeInstructions(...);
}
```

### 4. Testing Plan

#### Basic Functionality
1. Build the habitat: `./claude-habitat --config claude-habitat`
2. Verify Docker socket access: `docker ps` inside container
3. Verify repository cloned correctly
4. Run tests inside container: `npm test`

#### Docker Operations
1. Build an image inside the habitat
2. Run a container inside the habitat
3. Verify container appears in host's `docker ps`

#### Development Workflow
1. Make changes to code inside habitat
2. Run tests
3. Build and test habitats from within the habitat

### 5. Documentation

#### Usage Guide
```markdown
# Claude Habitat Development Habitat

## Purpose
Develop Claude Habitat in an isolated environment with full Docker access.

## Usage
```bash
# Start the habitat
./claude-habitat --config claude-habitat

# Inside the habitat
npm test                    # Run tests
./claude-habitat --list     # List habitats (using host Docker)
docker ps                   # See host containers
```

## Architecture
- Uses Docker socket mounting (not Docker-in-Docker)
- Containers created inside run on the host
- Full access to Docker API
- Changes to code are isolated

## Limitations
- Containers share host's Docker daemon
- Network/volume operations affect host
- Not suitable for testing destructive operations
```

### 6. Edge Cases to Handle

1. **Docker Socket Permissions**
   - May need to adjust permissions based on host setup
   - Handle both root and rootless Docker

2. **Volume Mounting Conflicts**
   - Warn if mounting paths that conflict with habitat structure
   - Document which paths are safe to mount

3. **Nested Habitat Detection**
   - Detect if running inside a habitat already
   - Prevent infinite nesting scenarios

### 7. Future Enhancements

1. **Development Mode**
   - Hot reload on file changes
   - Automatic test running
   - Debug port forwarding

2. **Test Isolation**
   - Temporary Docker contexts
   - Cleanup of test containers
   - Separate test namespaces

3. **Multi-Architecture Support**
   - Build args for different platforms
   - Cross-platform testing

## Next Steps

1. [ ] Create habitat configuration file
2. [ ] Create Dockerfile
3. [ ] Implement volume support in claude-habitat.js
4. [ ] Implement disable_habitat_instructions flag
5. [ ] Test Docker socket mounting
6. [ ] Test development workflow
7. [ ] Update documentation
8. [ ] Add to habitat examples