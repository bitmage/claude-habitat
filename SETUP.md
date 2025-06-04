# Claude Habitat Setup Guide

This guide walks you through setting up Claude Habitat for the first time.

## Prerequisites

Before starting, ensure you have:

- **Docker** installed and running
- **Node.js** (version 16 or higher)
- **Claude Code CLI** installed
- **Git** for repository access
- **Basic terminal/command line knowledge**

## Step 1: Clone and Install

```bash
# Clone the repository
git clone <repo-url>
cd claude-habitat

# Install Node.js dependencies (if any)
npm install
```

## Step 2: Test Basic Functionality

```bash
# Verify the script works
./claude-habitat --help

# List available habitats (should show 'discourse')
./claude-habitat --list-configs

# Test with the example habitat (optional - requires time for Docker build)
./claude-habitat discourse
```

If this works, your basic setup is complete! You can skip to **Step 6** for your first habitat.

## Step 3: GitHub Authentication Setup (Recommended)

For working with private repositories and creating pull requests, set up both authentication methods:

### SSH Keys for Git Operations

```bash
# Generate SSH key for repository access
ssh-keygen -t ed25519 -f shared/github_deploy_key -N ""

# Display the public key
echo "Add this public key to your GitHub repositories as a deploy key:"
cat shared/github_deploy_key.pub
```

**For each repository you want to access:**
1. Go to Repository Settings → Deploy keys
2. Click "Add deploy key"
3. Paste the public key content
4. Check "Allow write access" if you want to push changes
5. Click "Add key"

### GitHub App for API Operations

1. **Create GitHub App** (follow `github-app.md` for detailed steps):
   - Go to https://github.com/settings/apps
   - Click "New GitHub App"
   - Set name, description, and permissions
   - Generate and download private key

2. **Install the app** on your repositories:
   - Go to app settings → Install App
   - Choose repositories to access

3. **Configure in Claude Habitat**:
   ```bash
   # Place the private key file in shared directory
   cp ~/Downloads/your-app.2024-01-01.private-key.pem shared/github-app-key.pem
   
   # Set correct permissions
   chmod 600 shared/github-app-key.pem
   ```

## Step 4: Create Shared Configuration Files

Place commonly used files in the `shared/` directory:

### Example: Common Git Configuration
```bash
# Create shared git config
cat > shared/gitconfig << 'EOF'
[user]
    name = Claude Code Bot
    email = claude-code@yourcompany.com
[core]
    editor = nano
[push]
    default = current
EOF
```

### Example: Common Shell Aliases
```bash
# Create shared aliases
cat > shared/common-aliases.sh << 'EOF'
#!/bin/bash
# Common development aliases

alias ll='ls -la'
alias gs='git status'
alias gc='git commit'
alias gp='git push'
alias groot='cd $(git rev-parse --show-toplevel)'

# Project-specific helpers
alias restart-services='sudo service postgresql restart && sudo service redis-server restart'
alias fresh-install='rm -rf node_modules && npm install'
EOF

chmod +x shared/common-aliases.sh
```

## Step 5: Security Setup

```bash
# Ensure .gitignore excludes sensitive files
echo "# Sensitive files" >> shared/.gitignore
echo "*.pem" >> shared/.gitignore
echo "*.key" >> shared/.gitignore
echo "*_rsa*" >> shared/.gitignore

# Set proper permissions on sensitive files
chmod 600 shared/*.pem 2>/dev/null || true
chmod 600 shared/*_key* 2>/dev/null || true
```

## Step 6: Create Your First Custom Habitat

### Method 1: AI-Assisted (Easiest)

```bash
./claude-habitat add
```

Follow the prompts:
- **Project URL**: Your repository URL
- **Additional URLs**: Any plugins/dependencies
- **Purpose**: Brief description
- **Habitat name**: Short, descriptive name
- **Special instructions**: Any Claude-specific guidance

The AI will analyze your repository and create the complete configuration.

### Method 2: Manual Creation

```bash
# Create habitat directory
mkdir habitats/my-project

# Create basic config
cat > habitats/my-project/config.yaml << 'EOF'
name: my-project
description: My project development environment

image:
  dockerfile: Dockerfile
  tag: claude-habitat-my-project:latest

repositories:
  - url: https://github.com/yourusername/your-repo
    path: /workspace
    branch: main

container:
  work_dir: /workspace
  user: developer
  startup_delay: 5

environment:
  - NODE_ENV=development
  # Add GitHub App credentials if needed
  # - GITHUB_APP_ID=123456
  # - GITHUB_APP_PRIVATE_KEY_FILE=../github-app-key.pem

setup:
  root:
    - apt-get update
    - apt-get install -y git curl build-essential
    - useradd -m developer || true
  
  user:
    run_as: developer
    commands:
      - echo "Setting up project..."
      # Add your setup commands here
      # - npm install
      # - bundle install
      # - pip install -r requirements.txt

claude:
  command: claude --dangerously-skip-permissions
EOF

# Create basic Dockerfile
cat > habitats/my-project/Dockerfile << 'EOF'
FROM ubuntu:22.04

# Install basic tools
RUN apt-get update && apt-get install -y \
    curl \
    git \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (adjust version as needed)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - \
    && apt-get install -y nodejs

# Add any language-specific setup here
# RUN curl -sSL https://get.docker.com/ | sh  # For Docker
# RUN pip install --upgrade pip               # For Python
# RUN gem install bundler                     # For Ruby

CMD ["/sbin/init"]
EOF

# Optional: Create Claude instructions
cat > habitats/my-project/CLAUDE.md << 'EOF'
# My Project Development Environment

## Project Overview
Brief description of your project and its purpose.

## Development Workflow
1. Make changes to the codebase
2. Run tests: `npm test` (or your test command)
3. Create commits: `git add . && git commit -m "Description"`
4. Create PR: `gh pr create` (if GitHub App is configured)

## Available Tools
- List the tools and commands available
- Include any project-specific scripts
- Mention helper files in ./claude-habitat/

## Important Notes
- Any project-specific guidelines
- Common gotchas or issues
- Links to documentation
EOF
```

## Step 7: Test Your Habitat

```bash
# Test the new habitat
./claude-habitat my-project

# If it fails, check the build logs and adjust your Dockerfile/config
# You can clean up failed builds with:
./claude-habitat --clean
```

## Step 8: Optional Enhancements

### Add Project-Specific Files

```bash
# Create habitat-specific files directory
mkdir habitats/my-project/files

# Add deployment scripts, configs, etc.
echo "#!/bin/bash" > habitats/my-project/files/deploy.sh
echo "echo 'Deploying...'" >> habitats/my-project/files/deploy.sh
chmod +x habitats/my-project/files/deploy.sh
```

### Multiple Repository Support

```yaml
# In your config.yaml, add multiple repositories
repositories:
  - url: https://github.com/yourusername/main-repo
    path: /workspace
    branch: main
  - url: https://github.com/yourusername/plugin-repo
    path: /workspace/plugins/plugin-name
    branch: develop
```

### Advanced Docker Setup

```dockerfile
# In your Dockerfile, add specific services
FROM ubuntu:22.04

# Install PostgreSQL
RUN apt-get update && apt-get install -y postgresql postgresql-contrib

# Install Redis
RUN apt-get install -y redis-server

# Configure services to start automatically
RUN systemctl enable postgresql redis-server

# Add custom initialization scripts
COPY files/init-db.sql /docker-entrypoint-initdb.d/
```

## Verification Checklist

- [ ] Basic habitat creation works (`./claude-habitat --list-configs`)
- [ ] Can start example habitat (`./claude-habitat discourse`)
- [ ] SSH keys generated and added to GitHub repositories
- [ ] GitHub App created and private key placed in `shared/`
- [ ] Custom habitat created and tested
- [ ] Claude can access project files and tools
- [ ] Helper files accessible at `./claude-habitat/`
- [ ] Can create commits and PRs (if GitHub integration set up)

## Next Steps

1. **Customize your habitat** based on your project's specific needs
2. **Add helper scripts** to `shared/` for common tasks
3. **Create multiple habitats** for different projects
4. **Share habitats** with your team by committing the configuration

## Troubleshooting Setup Issues

### Docker Issues
```bash
# Ensure Docker is running
docker --version
docker ps

# Clean up if needed
docker system prune -f
```

### Permission Issues
```bash
# Fix file permissions
chmod +x claude-habitat
chmod 600 shared/*.pem shared/*_key* 2>/dev/null || true
```

### Node.js Issues
```bash
# Check Node.js version
node --version  # Should be 16+
npm --version
```

### Claude Code Issues
```bash
# Verify Claude is installed
claude --version
which claude
```

If you encounter issues not covered here, run `./claude-habitat maintain` for additional troubleshooting options.