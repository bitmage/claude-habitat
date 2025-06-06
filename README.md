# Claude Habitat

AI-powered development environments that are isolated, reproducible, and ready for Claude Code.

## Quick Start

```bash
# Clone and setup
git clone <repo-url> && cd claude-habitat && npm install

# Try the example
./claude-habitat discourse

# Or create your own (with AI assistance)
./claude-habitat add
```

## What You Get

When "Habitat" Claude runs in a container:
- **Complete isolation** from your host system
- **All development tools** pre-installed (`rg`, `fd`, `jq`, `yq`, `gh`, etc.)
- **Project code** cloned and ready
- **Services running** (databases, caches as needed)
- **Your personal preferences** from `shared/` directory

## Documentation

📖 **[Complete Documentation →](docs/README.md)**

- **[Setup Guide](docs/SETUP.md)** - Get started quickly
- **[Usage Guide](docs/USAGE.md)** - Create and run environments
- **[Terminology](docs/TERMINOLOGY.md)** - Complete domain model and concepts
- **[GitHub Authentication](docs/GITHUB-AUTH.md)** - SSH keys and GitHub Apps
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

## Directory Structure

- **`docs/`** - User documentation and guides
- **`claude/`** - "Meta" Claude instructions (maintenance, habitat creation)
- **`system/`** - Infrastructure managed by Claude Habitat (tools, base config)
- **`shared/`** - Your personal preferences across all projects
- **`habitats/`** - Individual project development environments

Perfect for semi-autonomous AI without risk! 🚀

See **[TERMINOLOGY.md](docs/TERMINOLOGY.md)** for complete domain concepts including "Meta" Claude vs "Habitat" Claude.
