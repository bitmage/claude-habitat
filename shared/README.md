# Shared Directory - Your Personal Preferences

This directory contains your personal preferences and configurations that extend across all your Claude Habitat projects.

## What Goes Here

### Personal Configuration
- **`claude.md`** - Your personal Claude preferences and instructions
- **`gitconfig`** - Your git configuration (name, email, aliases)
- **`aliases.sh`** - Your personal shell aliases and functions
- **`host-info.yaml`** - Host system information (generated during init)
- **Custom scripts** - Your personal utility scripts

### Authentication
- **`github_deploy_key*`** - Your SSH keys for GitHub access
- **`*.pem`** - Your GitHub App private keys
- **Other credentials** - API keys, tokens (ensure they're git-ignored)

### Personal Tools
- **`tools/`** - Your additional development tools
- **`templates/`** - Your project templates and boilerplates

## How It Works

Files in this directory are:
- **Copied to every habitat** at `./claude-habitat/shared/`
- **Git-ignored by default** (for sensitive files)
- **Combined with system infrastructure** to create your complete environment
- **Persistent across Claude Habitat updates**

## Getting Started

1. **Copy the example**: `cp claude.md.example claude.md`
2. **Edit your preferences**: Customize `claude.md` with your workflow preferences
3. **Add your git config**: Create `gitconfig` with your settings
4. **Add authentication**: Place SSH keys or GitHub App files here

## Example Structure

```
shared/
├── claude.md              # Your Claude preferences
├── gitconfig              # Your git settings
├── host-info.yaml         # Host system information (auto-generated)
├── aliases.sh             # Your shell aliases
├── github_deploy_key      # Your SSH key
├── my-github-app.pem      # Your GitHub App key
├── tools/                 # Your personal tools
│   ├── install-tools.sh   # Your tool installer
│   └── tools.yaml         # Your tool definitions
└── scripts/               # Your utility scripts
    └── my-helper.sh
```

## Security

- **Automatic protection**: The `shared/.gitignore` file protects sensitive files
- **Sensitive files ignored**: `.pem`, `*_key*`, personal configs, API keys, etc.
- **Use proper permissions**: `chmod 600` for private keys
- **Safe by default**: Most personal files are automatically excluded from git

## Composition

Your preferences are layered as:
1. **System** (`system/CLAUDE.md`) - Base environment + tools
2. **Your preferences** (`shared/claude.md`) - Your workflow style
3. **Project-specific** (`habitats/*/claude.md`) - Project instructions

This gives you consistent personal preferences across all projects while allowing project-specific customization.