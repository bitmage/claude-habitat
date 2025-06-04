# Claude Habitat

AI-powered development environments that are isolated, reproducible, and ready for Claude Code.

## What is Claude Habitat?

Claude Habitat creates isolated Docker containers where Claude Code can work on your projects safely. Each "habitat" is a complete development environment with:

- Your project's code and dependencies
- Required services (databases, caches, etc.)
- Development tools and configuration
- Helper files and utilities organized in a dedicated space
- No access to your host filesystem

Perfect for:
- Working on unfamiliar codebases
- Testing experimental changes
- Plugin/module development
- AI pair programming without risk

## Directory Structure

### Host Structure
```
claude-habitat/
├── habitats/              # Individual habitat configurations
│   ├── discourse/         # Example: Discourse development
│   │   ├── config.yaml    # Required: Main configuration
│   │   ├── Dockerfile     # Required: Container definition
│   │   ├── CLAUDE.md      # Optional: Claude instructions
│   │   └── files/         # Optional: Additional files
│   └── my-project/        # Your custom habitats
├── shared/                # Files shared across ALL habitats
│   ├── github-key.pem     # GitHub App private key
│   ├── common-script.sh   # Shared utilities
│   └── ssh-keys/          # SSH keys for git access
└── claude-habitat.js      # Main launcher script
```

### Container Structure (Example: Discourse)
```
/src/                          # Working directory (where Claude starts)
├── app/                       # Discourse source code
├── plugins/
│   ├── county-fence/         # Cloned plugin repositories
│   └── discourse-calendar/
├── claude-habitat/           # Helper files (organized, non-intrusive)
│   ├── shared/              # From ../shared/ directory
│   │   ├── github-key.pem   # GitHub authentication
│   │   └── setup-tools.sh   # Common utilities
│   ├── config-template.json # From habitat files/
│   └── deployment.yaml      # Habitat-specific files
├── bin/rails                 # Project tooling
└── ...                       # Rest of project structure
```

## Quick Start

### 1. Clone and Setup
```bash
git clone <repo-url>
cd claude-habitat
npm install  # Install dependencies
```

### 2. Authentication Setup (Optional but Recommended)

For private repositories and GitHub integration:

#### GitHub App Setup
1. Create a GitHub App (see `github-app.md` for detailed instructions)
2. Download the private key (.pem file)
3. Place it in `shared/your-app-name.pem`

#### SSH Keys Setup
```bash
# Generate SSH key for repository access
ssh-keygen -t ed25519 -f shared/github_deploy_key -N ""

# Add the public key to your GitHub repositories as a deploy key
cat shared/github_deploy_key.pub
# Copy this and add to GitHub repo Settings > Deploy keys
```

### 3. Run Your First Habitat
```bash
# Try the included example
./claude-habitat discourse

# Or see all available habitats
./claude-habitat --list-configs

# Interactive menu
./claude-habitat
```

## Usage

### Starting a Habitat
```bash
# Start by name
./claude-habitat discourse

# Interactive selection
./claude-habitat

# With additional repositories
./claude-habitat discourse --repo "https://github.com/user/plugin:/src/plugins/plugin"
```

### Inside the Habitat
When Claude starts, he's in the project's working directory with:

- **All project code** cloned and ready
- **Helper files** at `./claude-habitat/`
- **Shared utilities** at `./claude-habitat/shared/`
- **Project tools** available in PATH
- **Services running** (databases, etc.)

Claude can:
- Edit code and run tests
- Access helper scripts: `./claude-habitat/shared/deploy.sh`
- Use GitHub keys: `./claude-habitat/shared/github-key.pem`
- Create scratch files: `./claude-habitat/notes.txt`
- Make commits and create PRs

### Common Workflows

#### Development Workflow
```bash
# Claude starts in project directory
cd /src  # (or whatever work_dir is configured)

# Project is ready to go
./bin/rails test  # Run tests
git status        # See project status

# Use helper files
source ./claude-habitat/shared/aliases.sh
./claude-habitat/shared/setup-env.sh

# Create scratch space
mkdir ./claude-habitat/scratch
echo "Notes..." > ./claude-habitat/scratch/ideas.txt
```

#### Creating Pull Requests
```bash
# Work on a feature
git checkout -b feature/new-feature
# ... make changes ...
git commit -m "Add new feature"

# Use GitHub CLI (if GitHub App is configured)
gh pr create --title "Add new feature"
```

## Creating New Habitats

### Method 1: AI-Assisted (Recommended)
```bash
./claude-habitat add
# Follow the prompts to describe your project
# Claude will analyze the repository and create the configuration
```

### Method 2: Manual Creation

1. **Create habitat directory**
```bash
mkdir habitats/my-project
```

2. **Create config.yaml**
```yaml
name: my-project
description: My awesome project development environment

image:
  dockerfile: Dockerfile
  tag: claude-habitat-my-project:latest

repositories:
  - url: https://github.com/user/my-project
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
      - npm install
      - npm run build

claude:
  command: claude --dangerously-skip-permissions
```

3. **Create Dockerfile**
```dockerfile
FROM node:18
RUN useradd -m developer
CMD ["/sbin/init"]
```

4. **Optional: Add Claude instructions**
Create `habitats/my-project/CLAUDE.md` with project-specific guidance.

## Advanced Configuration

### Environment Variables
```yaml
environment:
  - NODE_ENV=development
  - API_KEY=your-key
  - GITHUB_APP_ID=123456
  - GITHUB_APP_PRIVATE_KEY_FILE=../your-app.pem
```

### File Copying
Files are automatically copied to containers:

- **Shared files**: `shared/` → `${work_dir}/claude-habitat/shared/`
- **Habitat files**: `habitats/name/files/` → `${work_dir}/claude-habitat/`
- **Additional files**: Any non-config files in habitat directory

### Services
Habitats can include any services via Docker:
```yaml
# In your Dockerfile
RUN apt-get install -y postgresql redis-server

# In setup commands
setup:
  root:
    - service postgresql start
    - service redis-server start
```

## Available Commands

```bash
# Basic usage
./claude-habitat <habitat-name>     # Start specific habitat
./claude-habitat                    # Interactive menu
./claude-habitat --list-configs     # List available habitats

# Management
./claude-habitat add                # Create new habitat with AI
./claude-habitat maintain           # Maintenance mode
./claude-habitat --clean            # Remove old Docker images

# Advanced
./claude-habitat <name> --repo "url:path:branch"  # Add extra repositories
./claude-habitat --config /path/to/config.yaml    # Use external config
```

## GitHub Integration

### GitHub App Authentication
1. Create GitHub App following `github-app.md`
2. Place `.pem` file in `shared/`
3. Add to habitat config:
```yaml
environment:
  - GITHUB_APP_ID=your-app-id
  - GITHUB_APP_PRIVATE_KEY_FILE=../your-app.pem
```

### SSH Key Authentication
1. Generate deploy key: `ssh-keygen -t ed25519 -f shared/deploy_key`
2. Add public key to GitHub repo settings
3. Keys are automatically available in containers

### Both Together
- **SSH keys**: For git operations (clone, push, pull)
- **GitHub App**: For API operations (creating PRs, issues)

This gives Claude full GitHub capabilities without manual authentication.

## Security

- **Complete isolation**: Containers cannot access host filesystem
- **Temporary environments**: Destroyed when you exit
- **No persistent state**: Each run gets fresh environment
- **Network isolation**: Limited external network access
- **Credential isolation**: Keys/tokens only exist in container

## Troubleshooting

### Common Issues
- **Permission errors**: Check file permissions on SSH keys (`chmod 600`)
- **Build failures**: Run `./claude-habitat --clean` to remove cached images
- **Authentication errors**: Verify GitHub App/SSH key setup

### Maintenance Mode
```bash
./claude-habitat maintain
```
Provides menu for:
- Testing configurations
- Debugging builds
- Updating dependencies
- Creating pull requests for improvements

### Getting Help
- Check `troubleshooting.md` for specific error solutions
- Run maintenance mode for interactive debugging
- Review habitat logs during build process

## Requirements

- **Docker**: For containerization
- **Node.js**: For the launcher script
- **Claude Code CLI**: For AI development
- **Git**: For repository management
- **Optional**: GitHub CLI (`gh`) for PR creation

## Examples

The `habitats/discourse/` directory contains a complete example for Discourse plugin development, including:
- PostgreSQL and Redis setup
- Ruby and Node.js environment
- Plugin repository cloning
- Test database configuration
- GitHub integration

Use it as a template for creating your own habitats!