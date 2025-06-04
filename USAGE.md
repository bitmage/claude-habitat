# Claude Habitat Usage Guide

This guide covers common usage patterns and workflows for Claude Habitat.

## Basic Usage

### Starting a Habitat

```bash
# Start by name
./claude-habitat discourse

# Interactive menu (shows all available habitats)
./claude-habitat

# List all available habitats
./claude-habitat --list-configs
```

### Inside a Habitat

When Claude starts, you're in the project's working directory with everything ready:

```bash
# You start here (example: Discourse)
pwd  # /src

# Project structure is ready
ls -la
# app/  bin/  config/  plugins/  claude-habitat/  ...

# Helper files are organized and accessible
ls claude-habitat/
# shared/  deployment-script.sh  config-template.json

ls claude-habitat/shared/
# github-app-key.pem  common-aliases.sh  deploy-tools/
```

## Common Workflows

### 1. Standard Development Workflow

```bash
# Check project status
git status
git log --oneline -10

# Make changes to code
nano app/models/user.rb  # or whatever files you need

# Run tests
./bin/rspec spec/models/user_spec.rb
npm test  # or your project's test command

# Commit changes
git add .
git commit -m "Fix user validation logic"

# Create pull request (if GitHub integration set up)
gh pr create --title "Fix user validation" --body "Detailed description"
```

### 2. Plugin/Module Development

```bash
# Navigate to plugin directory (auto-cloned)
cd plugins/my-plugin

# Check plugin structure
ls -la

# Edit plugin files
nano plugin.rb

# Test the plugin
cd /src  # back to main project
./bin/rails test plugins/my-plugin/

# Use shared tools for deployment
./claude-habitat/shared/deploy-plugin.sh my-plugin
```

### 3. Using Helper Files and Tools

```bash
# Source shared aliases and functions
source ./claude-habitat/shared/common-aliases.sh

# Now you have custom aliases available
gs    # git status
gc    # git commit
gp    # git push

# Use shared scripts
./claude-habitat/shared/setup-env.sh
./claude-habitat/shared/backup-db.sh

# Access configuration templates
cp ./claude-habitat/deployment-template.yml config/deployment.yml
```

### 4. Working with Multiple Repositories

```bash
# Main project is at working directory
pwd  # /src

# Additional repos are where you configured them
ls plugins/
# county-fence/  discourse-calendar/  my-custom-plugin/

# Work across repositories
cd plugins/county-fence
git pull origin main
# make changes...

cd /src  # back to main project
# test integration...
```

### 5. Debugging and Investigation

```bash
# Use Claude's scratch space
mkdir ./claude-habitat/scratch
echo "Investigation notes..." > ./claude-habitat/scratch/debug.md

# Save command outputs for analysis
ps aux > ./claude-habitat/scratch/processes.txt
docker ps > ./claude-habitat/scratch/containers.txt

# Use shared debugging tools
./claude-habitat/shared/debug-tools/trace-issue.sh

# Check logs
tail -f log/development.log
journalctl -f  # system logs if needed
```

### 6. Configuration and Environment Setup

```bash
# Copy shared configurations
cp ./claude-habitat/shared/configs/.vimrc ~/
cp ./claude-habitat/shared/configs/.bashrc ~/

# Use environment-specific settings
source ./claude-habitat/env-setup.sh

# Access secrets (if properly configured)
export GITHUB_TOKEN=$(cat ./claude-habitat/shared/github-token)
export DATABASE_URL=$(cat ./claude-habitat/db-config.txt)
```

## Advanced Workflows

### 1. Database Operations

```bash
# Access database (example: PostgreSQL)
psql -U postgres -d myproject_development

# Run migrations
./bin/rails db:migrate

# Seed data
./bin/rails db:seed

# Use shared database scripts
./claude-habitat/shared/db-scripts/backup.sh
./claude-habitat/shared/db-scripts/restore.sh latest-backup.sql
```

### 2. Multi-Branch Development

```bash
# Check out different branch
git checkout feature/new-feature

# Or create new feature branch
git checkout -b feature/another-feature

# Work with experimental changes
# (remember: this is isolated from your host!)
rm -rf node_modules  # safe to do destructive operations
npm install --dev-dependencies

# Test risky operations
./claude-habitat/shared/experimental-script.sh
```

### 3. Performance Testing and Monitoring

```bash
# Use shared performance tools
./claude-habitat/shared/perf-tools/benchmark.sh

# Monitor resource usage
htop
./claude-habitat/shared/monitor-resources.sh

# Profile application
./claude-habitat/shared/profiling/profile-app.rb
```

### 4. Integration with External Services

```bash
# Use API credentials from shared files
export API_KEY=$(cat ./claude-habitat/shared/api-credentials/service-key)

# Test integrations safely
./claude-habitat/shared/test-integrations.sh

# Deploy to staging environment
./claude-habitat/shared/deploy-staging.sh
```

## File Organization Patterns

### Recommended Structure in claude-habitat/

```
claude-habitat/
├── shared/                    # Shared across all habitats
│   ├── github-app-key.pem    # Authentication
│   ├── ssh-keys/             # Git access
│   ├── scripts/              # Common utilities
│   │   ├── backup.sh
│   │   ├── deploy.sh
│   │   └── setup-env.sh
│   ├── configs/              # Shared configurations
│   │   ├── .gitconfig
│   │   ├── .bashrc
│   │   └── aliases.sh
│   └── tools/                # Development tools
│       ├── debug-helper.py
│       └── perf-monitor.sh
├── scratch/                  # Temporary workspace
│   ├── notes.md
│   ├── debug-output.log
│   └── experimental-code/
├── templates/                # Configuration templates
│   ├── docker-compose.yml
│   ├── nginx.conf
│   └── database.yml
└── project-specific-script.sh # Habitat-specific tools
```

## Tips and Best Practices

### 1. Organizing Your Work

```bash
# Create logical scratch directories
mkdir -p ./claude-habitat/scratch/{notes,logs,experiments,backups}

# Use descriptive filenames
echo "Analysis of issue #123" > ./claude-habitat/scratch/notes/issue-123-analysis.md

# Keep a work log
echo "$(date): Started investigating performance issue" >> ./claude-habitat/scratch/work-log.txt
```

### 2. Leveraging Shared Tools

```bash
# Always source shared aliases first
source ./claude-habitat/shared/aliases.sh

# Use shared functions for consistent operations
backup_database  # from shared scripts
deploy_to_staging  # from shared scripts
```

### 3. Safe Experimentation

```bash
# Remember: the container is isolated and temporary
# Feel free to make destructive changes for testing

# Install experimental packages
npm install experimental-package

# Modify system configurations
sudo systemctl stop postgresql
sudo apt-get remove --purge postgresql

# Try dangerous operations
rm -rf app/models/  # test what happens
```

### 4. Efficient GitHub Integration

```bash
# Use GitHub CLI for quick operations
gh issue list
gh pr list
gh repo view

# Create PR with template
gh pr create --template ./claude-habitat/shared/pr-template.md

# Use shared PR automation
./claude-habitat/shared/github-tools/auto-pr.sh feature-branch
```

## Troubleshooting Common Issues

### Cannot Access Files
```bash
# Check current directory
pwd

# Verify files exist
ls -la ./claude-habitat/
ls -la ./claude-habitat/shared/

# Check permissions
ls -la ./claude-habitat/shared/*.pem
```

### Git Authentication Issues
```bash
# Check SSH key setup
ssh -T git@github.com

# Use HTTPS with token if SSH fails
git config --global url."https://$GITHUB_TOKEN@github.com/".insteadOf "https://github.com/"

# Or use shared authentication script
./claude-habitat/shared/setup-git-auth.sh
```

### Missing Dependencies
```bash
# Install additional tools
sudo apt-get update
sudo apt-get install -y tool-name

# Use shared installation scripts
./claude-habitat/shared/install-tools/install-database-tools.sh
```

### Performance Issues
```bash
# Check container resources
df -h  # disk space
free -h  # memory usage
top  # CPU usage

# Use shared monitoring
./claude-habitat/shared/system-check.sh
```

## Getting Help

- **Check logs**: Most operations log to `./claude-habitat/scratch/`
- **Use maintenance mode**: `./claude-habitat maintain` for interactive debugging
- **Review habitat config**: `cat config.yaml` to understand the setup
- **Check documentation**: `cat ./claude-habitat/shared/README.md` for shared tools
- **GitHub issues**: Report problems to the Claude Habitat repository

## Advanced Tips

### Custom Commands
Add to your shared aliases:
```bash
# In shared/aliases.sh
alias hc='cd claude-habitat'
alias hcs='cd claude-habitat/shared'
alias hcr='cd claude-habitat/scratch'

function work() {
    cd $(git rev-parse --show-toplevel)
    source ./claude-habitat/shared/aliases.sh
    echo "Ready to work on $(basename $(pwd))"
}
```

### Environment Customization
```bash
# Add to shared/setup-env.sh
export EDITOR=nano
export PAGER=less
export LANG=en_US.UTF-8

# Custom prompt
export PS1='\[\033[01;32m\]\u@habitat\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
```

This covers the most common usage patterns. Each habitat will have its own specific workflows based on the project type and your configuration!