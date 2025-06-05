# Usage

📖 **See [TERMINOLOGY.md](TERMINOLOGY.md) for domain concepts** including habitats, sessions, composition layers, etc.

## Basic Commands

```bash
./claude-habitat                    # Interactive menu
./claude-habitat <name>             # Start specific habitat
./claude-habitat add                # Create new habitat (with AI assistance)
./claude-habitat --list-configs     # List available habitats
```

## Creating Your Environment

### Option 1: AI-Assisted Creation (Recommended)
```bash
./claude-habitat add
```
The AI will analyze your repository and create a complete habitat configuration automatically.

### Option 2: Manual Setup

#### 1. Create Habitat Structure
```bash
mkdir habitats/my-project
```

#### 2. Create Configuration (`habitats/my-project/config.yaml`)
```yaml
name: my-project
description: My project development environment

image:
  dockerfile: Dockerfile
  tag: claude-habitat-my-project:latest

repositories:
  - url: https://github.com/user/repo
    path: /workspace
    branch: main

container:
  work_dir: /workspace
  user: developer

setup:
  root:
    - apt-get update && apt-get install -y build-essential
  user:
    run_as: developer
    commands:
      - npm install  # or your project's setup commands
```

#### 3. Create Dockerfile (`habitats/my-project/Dockerfile`)
```dockerfile
FROM ubuntu:22.04

# Install basic tools
RUN apt-get update && apt-get install -y \
    curl git sudo \
    && rm -rf /var/lib/apt/lists/*

# Install your language runtime (example: Node.js)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Create user
RUN useradd -m developer

CMD ["/sbin/init"]
```

#### 4. Add Project Instructions (Optional)
Create `habitats/my-project/claude.md` with project-specific guidance.

## Customizing Your Environment

### Personal Preferences (`shared/`)

Add your personal configurations that apply to all projects:

#### Personal Claude Instructions
```bash
# Copy the template
cp shared/claude.md.example shared/claude.md

# Edit your preferences
# - Your development workflow
# - Your preferred tools and aliases
# - Your coding style preferences
```

#### Personal Git Configuration
```bash
# Create shared/gitconfig
[user]
    name = Your Name
    email = your.email@example.com
[core]
    editor = nano
[alias]
    st = status
    co = checkout
    br = branch
```

#### Personal Aliases
```bash
# Create shared/aliases.sh
#!/bin/bash
alias ll='ls -la'
alias gs='git status'
alias gc='git commit'
alias gp='git push'
```

#### Personal Tools
```bash
# Add your own tools in shared/tools/
mkdir -p shared/tools
# Add your custom tools and install scripts
```

### Authentication Setup

```bash
# SSH keys for repository access
ssh-keygen -t ed25519 -f shared/github_deploy_key -N ""
# Add shared/github_deploy_key.pub to GitHub as deploy key

# GitHub App authentication (optional)
# Place your GitHub App .pem file in shared/
```

**Note**: Sensitive files are automatically git-ignored via `shared/.gitignore`

## Running Your Habitat

```bash
# Start your environment
./claude-habitat my-project

# With additional repositories
./claude-habitat my-project --repo "https://github.com/user/plugin:/workspace/plugins/plugin"
```

## Maintenance

```bash
./claude-habitat maintain    # Maintenance menu
./claude-habitat --clean     # Remove old images
```

Your environment combines:
- **System**: Managed tools and base configuration
- **Shared**: Your personal preferences across all projects  
- **Habitat**: Project-specific setup and instructions