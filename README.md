# Claude Habitat

Create completely isolated development environments for Claude Code. Each environment gets its own Docker container with dedicated services, cloned repositories, and no access to your local filesystem.

## Features

- 🐳 **Complete Isolation**: Each session runs in its own Docker container
- 🔧 **Service Orchestration**: Built-in PostgreSQL, Redis, and other services
- 📦 **Multi-Repository Support**: Clone main project + plugins/extensions
- 🚀 **Fast Startup**: Pre-built images with all tools installed
- 🔐 **GitHub Integration**: Create PRs directly from Claude
- 📝 **Configuration-Driven**: YAML files define environments
- 🎯 **Project Agnostic**: Works with any project type

## Quick Start

### Discourse Development

```bash
# Basic usage
./claude-habitat.sh --config discourse.yaml

# With custom plugin
./claude-habitat.sh --config discourse.yaml \
  --repo "https://github.com/myuser/my-plugin:/src/plugins/my-plugin"

# With multiple plugins
./claude-habitat.sh --config discourse.yaml \
  --repo "https://github.com/myuser/plugin1:/src/plugins/plugin1" \
  --repo "https://github.com/myuser/plugin2:/src/plugins/plugin2"
```

### Other Commands

```bash
# List available configurations
./claude-habitat.sh --list-configs

# Clean up Docker images
./claude-habitat.sh --clean

# Show help
./claude-habitat.sh --help
```

## Configuration

Configuration files use YAML format and define:
- Base Docker image
- Environment variables
- Repositories to clone
- Setup commands
- Container settings

See `configs/discourse.yaml` for a complete example.

### Minimal Configuration Example

```yaml
name: myproject
description: My project development environment

image:
  dockerfile: ./Dockerfile
  tag: claude-habitat-myproject:latest

repositories:
  - url: https://github.com/myorg/myproject
    path: /app
    branch: main

container:
  work_dir: /app
  user: root
  
claude:
  command: claude --dangerously-skip-permissions
```

## Repository Specification

Repositories can be specified in the config file or via command line:

```bash
# Format: URL:PATH[:BRANCH]
--repo "https://github.com/user/repo:/path/in/container"
--repo "https://github.com/user/repo:/path/in/container:develop"
```

## Claude Authentication

Claude Code uses session-based authentication through your claude.ai account (not API keys). 

**First time in each container:**
1. Claude will prompt: "Please visit the following URL to authenticate"
2. Copy and open the URL in your browser
3. Authenticate with your claude.ai account
4. Copy the token from the browser
5. Paste it back into Claude

This auth process happens once per container session. Your Claude Pro/Team subscription at claude.ai includes Claude Code access.

## GitHub Authentication

For creating PRs, you can use either:
- `GITHUB_TOKEN` - Personal access token
- `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` - GitHub App authentication (recommended)

## How It Works

1. **Build/Load Image**: Checks if the configured Docker image exists, builds if needed
2. **Create Container**: Starts an isolated container with its own services
3. **Clone Repositories**: Clones all configured repositories into the container
4. **Run Setup**: Executes setup commands (install dependencies, create databases, etc.)
5. **Launch Claude**: Starts Claude Code in the prepared environment
6. **Cleanup**: Automatically removes the container when you exit

## Creating New Environments

1. Create a Dockerfile in `dockerfiles/`
2. Create a YAML config in `configs/`
3. Run with `--config your-config.yaml`

## Dependencies

- Docker
- Git
- Python3 (with PyYAML) or yq for YAML parsing

## Tips

- Each session is completely isolated - perfect for parallel development
- Changes only leave the container via git commits and PRs
- Pre-built images make subsequent runs very fast
- Use `--repo` to override repository URLs for testing forks

## Troubleshooting

### Build Failures
- Check Docker is running
- Ensure base images are accessible
- Review Dockerfile syntax

### Clone Failures
- Verify repository URLs
- Check GitHub authentication for private repos
- Ensure network connectivity

### Service Issues
- Allow enough startup_delay for services
- Check service logs with `docker logs <container>`
- Verify service configurations in setup commands