# Claude Habitat Usage Guide

Practical examples and workflows for using Claude Habitat development environments.

> **Quick Start**: For installation, see [SETUP.md](SETUP.md). For architecture overview, see [README.md](../README.md).

## Core Concepts

Before diving into usage, understand these key concepts from [src/types.js](../src/types.js):

- **Habitat**: A complete development environment configuration (code + services + tools)
- **Session**: An active running instance of a habitat 
- **Workspace**: The container's `/workspace` directory containing your code
- **Meta Claude**: Claude running on your host system (maintenance, habitat creation)
- **Habitat Claude**: Claude running inside the container (development work)

## Basic Usage Patterns

### Starting a Habitat

```bash
# Interactive menu (choose from available habitats)
./claude-habitat

# Direct start by name
./claude-habitat discourse
./claude-habitat my-project

# Start with additional repositories  
./claude-habitat discourse https://github.com/user/plugin:/plugins/my-plugin

# Rebuild environment from scratch
./claude-habitat discourse --rebuild
```

### Managing Habitats

```bash
# List all available habitats
./claude-habitat --list-configs

# Create new habitat (with AI assistance)
./claude-habitat add

# Enter maintenance mode (update claude-habitat itself)
./claude-habitat maintain
```

### Testing and Verification

```bash
# Test a specific habitat
./claude-habitat test discourse --all

# Test only system infrastructure
./claude-habitat test discourse --system

# Test filesystem operations
./claude-habitat test discourse --verify-fs

# Interactive testing menu
./claude-habitat test
```

## Creating Your First Habitat

### Method 1: AI-Assisted Creation

The easiest way to create a new habitat:

```bash
./claude-habitat add
```

You'll be prompted for:
- **Project repositories**: One or more Git URLs
- **Project description**: What the project does
- **Required services**: Databases, caches, etc.
- **Special requirements**: Language versions, tools, etc.

Claude will analyze your repositories and create appropriate configuration.

### Method 2: Manual Configuration

For advanced users, create habitat configurations manually:

```bash
mkdir -p habitats/my-project
```

Create `habitats/my-project/config.yaml`:
```yaml
name: my-project
description: My awesome project

image:
  dockerfile: ./habitats/my-project/Dockerfile
  tag: claude-habitat-my-project:latest

repositories:
  - url: https://github.com/user/my-project
    path: /workspace/my-project
    branch: main

env:
  - USER=node
  - WORKDIR=/workspace
  - HABITAT_PATH=${WORKDIR}/habitat
  - SYSTEM_PATH=${HABITAT_PATH}/system
  - SHARED_PATH=${HABITAT_PATH}/shared
  - LOCAL_PATH=${HABITAT_PATH}/local

container:
  work_dir: /workspace
  user: node
  startup_delay: 10

claude:
  command: claude
```

Create corresponding `Dockerfile` based on [existing examples](../habitats/).

## Common Workflows

### Development Session

1. **Start habitat**:
   ```bash
   ./claude-habitat my-project
   ```

2. **Work within the container**: Claude has access to:
   - Your project code at `/workspace/my-project/`
   - Development tools in `/workspace/habitat/system/tools/bin/`
   - Your personal configs in `/workspace/habitat/shared/`
   - Scratch space for notes and experiments

3. **Exit cleanly**: Use `exit` or Ctrl+D in the container

### Adding Extra Repositories

For projects with multiple repositories or plugins:

```bash
# Add a plugin repository to main project
./claude-habitat my-project \\
  https://github.com/user/plugin:/workspace/plugins/my-plugin

# Add multiple extra repos  
./claude-habitat my-project \\
  https://github.com/user/plugin1:/workspace/plugins/plugin1 \\
  https://github.com/user/plugin2:/workspace/plugins/plugin2:feature-branch
```

### Debugging and Troubleshooting

```bash
# Rebuild habitat completely (fixes most issues)
./claude-habitat my-project --rebuild

# Test specific components
./claude-habitat test my-project --system     # System infrastructure
./claude-habitat test my-project --shared     # Personal configurations  
./claude-habitat test my-project --habitat    # Project-specific tests

# Check filesystem operations
./claude-habitat test my-project --verify-fs

# Generate UI interaction snapshots for debugging
npm run test:ui
```

### Working with Private Repositories

Ensure authentication is set up ([SETUP.md](SETUP.md)), then use normal commands:

```bash
# SSH authentication (recommended)
./claude-habitat add
# Enter private repository URLs when prompted

# Works with additional repos too
./claude-habitat my-project \\
  git@github.com:private-org/internal-lib:/workspace/libs/internal
```

## Advanced Usage

### Custom Environment Variables

Add project-specific environment variables to your habitat configuration:

```yaml
env:
  - DATABASE_URL=postgresql://localhost:5432/myproject
  - REDIS_URL=redis://localhost:6379
  - NODE_ENV=development
  - API_KEY=${SHARED_PATH}/secrets/api-key.txt
```

### Service Dependencies

For projects requiring databases or other services:

```yaml
# In your Dockerfile
RUN apt-get update && apt-get install -y \\
    postgresql \\
    redis-server

# In config.yaml setup commands
setup:
  root:
    - systemctl enable postgresql
    - systemctl enable redis
  user:
    run_as: node
    commands:
      - createdb myproject
      - npm install
```

### Custom Development Tools

Add project-specific tools to `system/tools/tools.yaml` or include them in your Dockerfile:

```yaml
# In config.yaml
setup:
  user:
    commands:
      - npm install -g your-special-tool
      - pip install your-python-package
```

### Sharing Configurations

Habitat configurations can be committed to your project repository:

```bash
# In your project repo, create .claude-habitat/
mkdir .claude-habitat
cp claude-habitat/habitats/my-project/* .claude-habitat/

# Others can use it with:
./claude-habitat add --from-project /path/to/project
```

## Interactive Features

### Menu Navigation

The interactive menu supports single-key navigation:

- **Numbers**: Select habitats (1, 2, 3, ...)
- **Letters**: Actions (a=add, t=test, c=clean, q=quit)
- **Shift+Numbers**: Force rebuild (!@#$%^&*() for habitats 1-9)

### Test Menu

```bash
./claude-habitat test
```

Navigate with:
- **Numbers**: Select habitat to test
- **Letters**: Test types (a=all, s=system, h=habitat, f=filesystem)
- **b**: Back to previous menu

### UI Testing

Generate snapshots of user interactions:

```bash
# Test main menu display
./claude-habitat --test-sequence="q"

# Test navigation flows
./claude-habitat --test-sequence="tq"    # test menu → quit
./claude-habitat --test-sequence="t2f"   # test → habitat 2 → filesystem

# Generate comprehensive snapshots
npm run test:ui:view
```

## Best Practices

### Project Organization

1. **One habitat per project**: Don't mix unrelated projects
2. **Clear naming**: Use descriptive habitat names 
3. **Version control**: Include habitat configs in project repos
4. **Documentation**: Add project-specific instructions to `claude.md`

### Development Workflow

1. **Test first**: Always run habitat tests before development
2. **Clean rebuilds**: Use `--rebuild` when configuration changes
3. **Incremental development**: Use `npm run test:watch` for rapid iteration
4. **Document changes**: Update configurations when adding dependencies

### Security Practices

1. **Isolation**: Never mount host directories into containers
2. **Credentials**: Store keys in `shared/` directory only
3. **Minimal privileges**: Use non-root users in containers
4. **Regular updates**: Keep base images and tools updated

## Troubleshooting Common Issues

### Container Won't Start

```bash
# Check configuration validity
./claude-habitat test my-project --system

# Rebuild completely
./claude-habitat my-project --rebuild

# Check Docker resources
docker system df
docker system prune  # If low on space
```

### Repository Access Issues

```bash
# Test SSH access
ssh -T git@github.com

# Check key permissions  
ls -la shared/id_*

# Verify repository URLs
git ls-remote https://github.com/user/repo
```

### Performance Issues

```bash
# Check resource usage
docker stats

# Clean up unused images
docker image prune

# Use faster rebuild with cache
./claude-habitat my-project --rebuild --cache
```

## Integration Examples

### VS Code Integration

You can use VS Code with Remote-Containers extension:

```json
// .devcontainer/devcontainer.json in your project
{
  "name": "Claude Habitat",
  "dockerComposeFile": "../claude-habitat/docker-compose.yml",
  "service": "habitat",
  "workspaceFolder": "/workspace"
}
```

### CI/CD Integration

Use habitats in CI environments:

```yaml
# GitHub Actions example
- name: Setup Claude Habitat
  run: |
    git clone https://github.com/org/claude-habitat
    cd claude-habitat && npm install
    
- name: Test in Habitat
  run: |
    ./claude-habitat test my-project --all
```

---

> **Next Steps**: Explore the [architectural overview](../claude-habitat.js) and [domain model](../src/types.js) to understand how Claude Habitat works internally.