# GitHub Token Authentication Setup

Claude Habitat now uses GitHub Personal Access Tokens instead of SSH deploy keys for repository authentication. This is much simpler and more secure.

## Why Token-Based Authentication?

### Problems with SSH Deploy Keys:
- Each repository needs its own unique deploy key
- Manual setup required for every repository
- Key management becomes exponential (N repos × M habitats = lots of keys)
- Deploy keys can only be used on one repository each

### Benefits of Tokens:
- ✅ One token works for all repositories you have access to
- ✅ Fine-grained permissions per repository
- ✅ Easy to rotate and manage
- ✅ Works automatically with HTTPS Git URLs
- ✅ No manual deploy key setup needed

## Setup Instructions

### Step 1: Create a Fine-Grained Personal Access Token

1. Go to https://github.com/settings/tokens?type=beta
2. Click "Generate new token"
3. Configure the token:
   - **Name**: "Claude Habitat Development"
   - **Expiration**: Choose appropriate duration (90 days recommended)
   - **Repository access**: Select repositories you want Claude to access
   - **Permissions**:
     - Contents: **Read and Write**
     - Pull requests: **Read and Write** 
     - Metadata: **Read**

4. Click "Generate token"
5. **Copy the token immediately** (starts with `github_pat_`)

### Step 2: Set Environment Variable

Add the token to your shell environment:

```bash
# Add to your shell profile (~/.bashrc, ~/.zshrc, etc.)
export GITHUB_TOKEN="github_pat_your_token_here"

# Or set for current session only
export GITHUB_TOKEN="github_pat_your_token_here"
```

### Step 3: Verify Setup

Run claude-habitat initialization:

```bash
./claude-habitat
# Select [i]nitialize to verify token is detected
```

You should see:
```
✅ GitHub Token: Set
```

## How It Works

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
- Token permissions are scoped to only the repositories you choose
- Easy to revoke and regenerate if needed

## Troubleshooting

### "No GITHUB_TOKEN found"
```bash
# Check if token is set
echo $GITHUB_TOKEN

# If empty, set it:
export GITHUB_TOKEN="your_token_here"
```

### "Repository access denied"
- Ensure your token has access to the repository
- Check token permissions (Contents: Read and Write)
- Verify token hasn't expired

### "API rate limit exceeded"
- Personal tokens have higher rate limits than anonymous access
- Fine-grained tokens have the highest limits

## Migration from SSH Keys

If you were previously using SSH deploy keys:

1. ✅ Generate your GitHub token (follow steps above)
2. ✅ Set `GITHUB_TOKEN` environment variable  
3. ✅ Remove old deploy keys from repository settings
4. ✅ Run `./claude-habitat` - it will automatically use token auth

No other changes needed! Your habitat configurations will work the same way.

## Token Management Best Practices

### Security
- Use fine-grained tokens (not classic tokens)
- Set appropriate expiration dates
- Only grant access to repositories you need
- Rotate tokens regularly

### Organization
- Use descriptive token names ("Claude Habitat - Dev Machine")
- Document token purpose and expiration
- Set calendar reminders for renewal

### Backup
- Keep tokens in a secure password manager
- Have a backup token ready before the current one expires
- Test new tokens before old ones expire