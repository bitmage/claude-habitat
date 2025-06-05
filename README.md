# Claude Habitat

AI-powered development environments that are isolated, reproducible, and ready for Claude Code.

Claude Habitat creates isolated Docker containers where Claude Code can work on your projects safely. Each habitat includes your code, required services, and development tools with no access to your host filesystem.

Perfect for AI pair programming without risk.

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

When Claude runs in a habitat:
- **Complete isolation** from your host system
- **All development tools** pre-installed (`rg`, `fd`, `jq`, `yq`, `gh`, etc.)
- **Project code** cloned and ready
- **Services running** (databases, caches as needed)
- **Helper files** in `./claude-habitat/shared/`
- **Scratch space** for Claude's notes and experiments

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