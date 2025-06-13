# Claude Habitat Setup Guide

Complete setup instructions for Claude Habitat development environments.

> **Quick Start**: For immediate usage, see the [Quick Start](../README.md#quick-start) section in the main README.

## System Requirements

### Essential Dependencies

- **Docker**: Version 24.0+ 
  - Ensure `docker` command is available in your PATH
  - User must have Docker daemon access (add to `docker` group if needed)
- **Node.js**: Version 18.0+
  - Check: `node --version`
- **Git**: Any recent version
  - For repository cloning and version control

### Optional (Recommended)

- **Claude Code CLI**: For enhanced AI assistance
  - Install from [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code)

## Installation

### 1. Clone and Install

```bash
git clone <repository-url>
cd claude-habitat
npm install
```

### 2. Verify Installation

```bash
# Check that the main script works
./claude-habitat --help

# Run basic system tests
npm test
```

Expected output should show help information and all tests passing.

## Authentication Setup

### For Public Repositories Only

If you only need to work with public repositories, no additional setup is required. Claude Habitat will use HTTPS cloning for public repos.

### For Private Repositories

You need either SSH keys or GitHub App authentication. **SSH keys are recommended** for individual use.

#### Option A: SSH Key Setup (Recommended)

1. **Generate SSH key** (if you don't have one):
   ```bash
   ssh-keygen -t ed25519 -C "your.email@example.com"
   # Follow prompts, use default location
   ```

2. **Add key to GitHub**:
   ```bash
   # Copy public key to clipboard
   cat ~/.ssh/id_ed25519.pub
   ```
   - Go to GitHub Settings → SSH and GPG keys → New SSH key
   - Paste the public key content

3. **Copy keys to Claude Habitat**:
   ```bash
   # Create shared directory for your personal configs
   mkdir -p shared/
   
   # Copy SSH keys (Claude Habitat will use these automatically)
   cp ~/.ssh/id_ed25519 shared/
   cp ~/.ssh/id_ed25519.pub shared/
   ```

4. **Test SSH access**:
   ```bash
   ssh -T git@github.com
   # Should show: "Hi username! You've successfully authenticated..."
   ```

#### Option B: GitHub App (For Organizations)

For organization-wide deployment or advanced access control, use GitHub App authentication:

1. **Create GitHub App**:
   - Go to GitHub Settings → Developer settings → GitHub Apps → New GitHub App
   - **App name**: `claude-habitat-yourorg`
   - **Homepage URL**: Your organization's URL
   - **Repository permissions**:
     - Contents: Read
     - Metadata: Read
     - Pull requests: Read (if needed)
   - **Where can this GitHub App be installed?**: Only on this account

2. **Generate Private Key**:
   - In your GitHub App settings, scroll to "Private keys"
   - Click "Generate a private key"
   - Download the `.pem` file

3. **Install App**:
   - Go to GitHub Apps → Your app → Install App
   - Choose repositories to grant access to

4. **Configure Claude Habitat**:
   ```bash
   # Copy the private key file
   cp ~/Downloads/your-app.*.private-key.pem shared/github-app-private-key.pem
   
   # Add configuration to shared/config.yaml
   cat >> shared/config.yaml << EOF
   github:
     app_id: YOUR_APP_ID  # Found in GitHub App settings
     installation_id: YOUR_INSTALLATION_ID  # Found in install URL
     private_key_file: github-app-private-key.pem
   EOF
   ```

5. **Find Installation ID**:
   - Go to GitHub → Settings → Integrations → Configure your app
   - The installation ID is in the URL: `/settings/installations/INSTALLATION_ID`

## Configuration

### Personal Preferences

Create your personal configuration in the `shared/` directory:

```bash
# Copy example configuration
cp shared/claude.md.example shared/claude.md

# Edit with your preferences
# Add your favorite aliases, tools, or instructions for Claude
```

### Git Configuration

Copy your Git configuration for use in containers:

```bash
# Claude Habitat will automatically use your global git config
# But you can override it by creating shared/gitconfig:
cp ~/.gitconfig shared/gitconfig
```

### Optional Tools

Additional development tools can be added to `system/tools/tools.yaml`. See [Tools Workflow Documentation](TOOLS-WORKFLOW.md) for details.

## Verification

### Test Basic Functionality

```bash
# Test interactive menu
./claude-habitat

# Test habitat listing  
./claude-habitat --list-configs

# Test with example habitat
./claude-habitat discourse
```

### Test Private Repository Access

If you set up authentication, test with a private repository:

```bash
# Create a test habitat with a private repo
./claude-habitat add
# Follow prompts, use a private repository URL
```

### Run Full Test Suite

```bash
# Unit tests (should complete in under 10 seconds)
npm test

# End-to-end tests (takes 5-8 minutes)
npm run test:e2e

# Habitat-specific tests
./claude-habitat test base --system
```

## Troubleshooting

### Common Issues

#### Docker Permission Denied

**Error**: `permission denied while trying to connect to the Docker daemon`

**Solution**: Add your user to the docker group:
```bash
sudo usermod -aG docker $USER
# Log out and back in
```

#### SSH Key Not Working

**Error**: `Permission denied (publickey)` when cloning private repos

**Solution**: 
1. Verify SSH key is in `shared/` directory
2. Test SSH access: `ssh -T git@github.com`
3. Check key permissions: `chmod 600 shared/id_ed25519`

#### GitHub App Authentication Failed

**Error**: `GitHub App authentication failed`

**Solution**:
1. Verify App ID and Installation ID in `shared/config.yaml`
2. Check private key file location and permissions
3. Ensure app is installed on the target repositories

#### Container Build Failures

**Error**: Various Docker build failures

**Solution**:
1. Check Docker daemon is running: `docker info`
2. Clear Docker cache: `docker system prune`
3. Check available disk space
4. Retry with `--rebuild` flag

### Getting Help

- **Check logs**: Container logs are preserved for debugging
- **System information**: See [src/types.js](../src/types.js) for domain concepts
- **Error handling**: See [src/errors.js](../src/errors.js) for troubleshooting patterns
- **Test specific issues**: Use `npm run test:ui` to generate interaction snapshots

### File Permissions

Ensure these files have correct permissions:

```bash
# SSH keys (if used)
chmod 600 shared/id_ed25519
chmod 644 shared/id_ed25519.pub

# GitHub App private key (if used) 
chmod 600 shared/github-app-private-key.pem
```

## Next Steps

After setup is complete:

1. **Try the example**: `./claude-habitat discourse`
2. **Create your first habitat**: `./claude-habitat add`
3. **Read usage guide**: [USAGE.md](USAGE.md)
4. **Explore architecture**: [claude-habitat.js](../claude-habitat.js) and [src/types.js](../src/types.js)

---

> **Note**: This setup enables completely isolated development environments where Claude can work safely on your projects without accessing your host filesystem.