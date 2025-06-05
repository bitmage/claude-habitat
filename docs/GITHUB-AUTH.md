# Creating a GitHub App for Claude Code

This guide walks through creating a GitHub App that Claude can use to create pull requests and interact with repositories.

📖 **See [TERMINOLOGY.md](TERMINOLOGY.md)** for authentication scope concepts and "Meta" vs "Habitat" Claude contexts.

## Create a GitHub App

1. **Navigate to GitHub Settings**
   - Go to https://github.com/settings/apps
   - Click "New GitHub App"

2. **Fill in Basic Information**
   - **GitHub App name**: Choose a unique name (e.g., "Claude Code Bot")
   - **Homepage URL**: `https://github.com` (or any valid URL)
   - **Description**: "Bot for Claude Code automated development"

3. **Configure Webhook** 
   - **Uncheck** "Active" under Webhook (we don't need webhooks)

4. **Set Repository Permissions**
   - **Contents**: Read & Write (to clone and push code)
   - **Pull requests**: Read & Write (to create and update PRs)
   - **Metadata**: Read (usually auto-selected)
   - **Actions**: Read (optional, to see workflow status)
   - **Checks**: Read (optional, to see check status)

5. **Set Account Permissions**
   - None needed for basic PR creation

6. **Where can this GitHub App be installed?**
   - Choose "Only on this account" (recommended for security)
   - Or "Any account" if you want to use it across organizations

7. **Create the App**
   - Click "Create GitHub App"

## Generate Private Key

1. After creation, you'll be on the app's settings page
2. Note down:
   - **App ID** (e.g., 1357221)
   - **App Name** (e.g., "Behold the power of Claude")
3. Scroll down to "Private keys"
4. Click "Generate a private key"
5. A `.pem` file will download - **keep this secure!**

## Install the App on Repositories

1. In the left sidebar of your app settings, click "Install App"
2. Choose your account or organization
3. Select:
   - "All repositories" for full access
   - Or "Only select repositories" and choose specific repos
4. Click "Install"

## Configure Claude Habitat

### Option 1: Environment Variables

```bash
# Set the App ID
export GITHUB_APP_ID="1357221"

# Set the private key (if .pem is in claude-habitat directory)
export GITHUB_APP_PRIVATE_KEY="$(cat ./claude-habitat/*.pem)"
```

### Option 2: Update YAML Configuration

Add these to your environment section in the YAML config:
```yaml
environment:
  - GITHUB_APP_ID=1357221
  - GITHUB_APP_PRIVATE_KEY_FILE=/src/claude-habitat/*.pem
```

## Security Best Practices

1. **Never commit the .pem file to git**
   - Add `*.pem` to your `.gitignore`
   - Store it securely outside the repository

2. **Secure file permissions**
   ```bash
   chmod 600 your-app.private-key.pem
   ```

3. **Use environment variables**
   - Don't hardcode credentials in config files
   - Use a password manager or secure vault

4. **Rotate keys periodically**
   - Generate new private keys regularly
   - Remove old keys from GitHub

## How It Works

When Claude creates a PR:
1. The GitHub App authenticates using the App ID and private key
2. It generates a temporary installation token
3. PRs appear as created by "YourAppName[bot]"
4. The bot has only the permissions you granted

## Troubleshooting

### Authentication Failed
- Verify the App ID is correct
- Check the private key file exists and is readable
- Ensure the app is installed on the target repository

### Permission Denied
- Check the app has "Contents: Write" permission
- Verify the app is installed on the specific repository
- Ensure the repository allows GitHub Apps

### PR Creation Failed
- Verify "Pull requests: Write" permission is enabled
- Check if PRs are allowed from the base branch
- Ensure the target branch exists