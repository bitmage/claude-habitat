# GitHub Token Authentication

Claude Habitat uses GitHub Personal Access Tokens for repository authentication. **Authentication happens automatically when needed** - no manual setup required!

## Why Token-Based Authentication?

### Problems with SSH Deploy Keys:
- Each repository needs its own unique deploy key
- Manual setup required for every repository
- Key management becomes exponential (N repos × M habitats = lots of keys)
- Deploy keys can only be used on one repository each

### Benefits of Automatic Token Auth:
- ✅ **Automatic authentication** when needed
- ✅ One token works for all repositories you have access to
- ✅ Zero manual setup - just follow the prompts
- ✅ Uses GitHub's secure device flow
- ✅ Works automatically with HTTPS Git URLs
- ✅ Easy to rotate and manage

## How It Works

### Automatic Authentication Flow

When you try to use a habitat that needs private repository access:

1. **Claude Habitat detects the need** for GitHub authentication
2. **Prompts you**: "Authenticate with GitHub now? [Y/n]"
3. **Shows you a code** (e.g., "AB12-CD34")
4. **Opens GitHub** in your browser automatically
5. **You paste the code** and authorize "GitHub CLI"
6. **Authentication completes** automatically
7. **Claude Habitat continues** with full repository access

### When Authentication Happens

Authentication is triggered when:
- ✅ Accessing private repositories
- ✅ Repositories requiring write access (for PRs)
- ✅ Any repository operation that needs authentication

Public repositories (like `discourse/discourse`) work without authentication.

### Example Flow

```bash
$ ./claude-habitat
[1] discourse

# You select discourse habitat
Pre-flight check...
🔐 GitHub authentication required for repository access
Authenticate with GitHub now? [Y/n]: y

=== GitHub Authentication ===
1. Copy this code: AB12-CD34
2. Visit: https://github.com/login/device
3. Paste the code and authorize "GitHub CLI"

Waiting for authorization...........
✅ Authentication successful!

# Habitat starts normally with full access
```

## Manual Setup (Optional)

If you prefer to set up authentication ahead of time:

```bash
# Run initialization
./claude-habitat
# Select [i]nitialize

# Or set GITHUB_TOKEN environment variable manually
export GITHUB_TOKEN="your_token_here"
```

## Technical Details

### Repository Cloning
- Claude Habitat automatically detects your `GITHUB_TOKEN`
- Repositories are cloned using HTTPS URLs with token authentication
- Git credentials are automatically configured in containers

### Inside Containers
- The token is passed as `GITHUB_TOKEN` environment variable
- Git is configured to use the token for GitHub authentication
- All git operations (clone, push, pull) work automatically

### Security
- Token is never stored in files or committed to git
- Uses GitHub's secure OAuth device flow
- Token permissions are scoped to only the repositories you authorize
- Easy to revoke and regenerate if needed

## Troubleshooting

### "Authentication failed"
- Check your internet connection
- Ensure you completed the browser authorization
- Try the authentication flow again

### "Repository access denied" 
- The token may not have access to that specific repository
- Re-run authentication to get fresh permissions
- For organization repositories, ensure you have proper access

### "API rate limit exceeded"
- Personal tokens have higher rate limits than anonymous access
- Wait for the rate limit to reset (usually 1 hour)

## Migration from SSH Keys

If you were previously using SSH deploy keys:

1. ✅ Remove old deploy keys from repository settings
2. ✅ Run `./claude-habitat` - it will prompt for authentication automatically
3. ✅ Follow the automatic authentication flow

No configuration changes needed! Your habitat configurations work the same way.

## Advanced Usage

### Pre-authenticate
```bash
# Set token manually (optional)
export GITHUB_TOKEN="your_token_here"

# Or use the initialization flow
./claude-habitat
# Select [i]nitialize
```

### Token Management
- Tokens are stored in your environment for the session
- Add to shell profile (`~/.bashrc`, `~/.zshrc`) for persistence
- Use GitHub's token management page to revoke if needed