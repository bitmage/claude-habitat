# Setup

📖 **See [TERMINOLOGY.md](TERMINOLOGY.md) for domain concepts** including habitats, composition layers, authentication scopes, etc.

## Prerequisites

- Docker (running)
- Node.js  
- Claude Code CLI
- Git

## Install

```bash
git clone <repo-url> && cd claude-habitat && npm install
```

## Test

```bash
./claude-habitat --help
./claude-habitat discourse  # Try the example
```

## Initialization (Recommended)

Run the initialization process to set up authentication and generate host information:

```bash
./claude-habitat --init
```

This will:
- Check system prerequisites (Docker, Node.js, Claude Code)
- Set up GitHub App authentication for private repositories
- Generate safe host system information for Claude (with your consent)
- Verify everything is working correctly

## GitHub Authentication (Optional)

For private repositories, put SSH keys or GitHub App files in `shared/`:

```bash
# SSH key approach
ssh-keygen -t ed25519 -f shared/github_deploy_key -N ""
# Add shared/github_deploy_key.pub to GitHub as deploy key

# OR GitHub App approach  
# Put your GitHub App .pem file in shared/
# See github-app.md for details
```

## Development Tools

All habitats automatically include these system tools:
- **rg** (ripgrep) - Fast text search
- **fd** - Fast file finder  
- **jq** - JSON processor
- **yq** - YAML processor
- **gh** - GitHub CLI
- **bat**, **tree**, **delta**, **fzf** (optional tools)

The tools are organized as:
- **System tools**: `system/tools/` (managed by Claude Habitat)
- **User tools**: `shared/tools/` (your personal additions)

Optional system tools can be installed with:
```bash
# Inside any habitat
cd claude-habitat/system/tools && ./install-tools.sh install-optional
```

That's it! Now you can:

```bash
# Create a new habitat
./claude-habitat add

# Or try the example
./claude-habitat discourse
```

The tool will guide you through the rest!