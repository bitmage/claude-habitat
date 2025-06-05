# Claude Habitat - AI Assistant Instructions

## Your Environment

You're running in a Claude Habitat - an isolated Docker development environment designed for safe, productive AI-assisted development.

## File Organization

- **Project code**: Your current working directory contains the main project
- **System infrastructure**: `./claude-habitat/system/` - tools, base configuration (managed by Claude Habitat)
- **User preferences**: `./claude-habitat/shared/` - your personal configs, keys, scripts
- **Scratch space**: `./claude-habitat/scratch/` - create this for your temporary files and notes
- **Development tools**: Available in PATH from both system and user tool installations

## Available Development Tools

These tools are pre-installed and ready to use:

### Core Tools (Always Available)
- **rg** (ripgrep) - Lightning-fast text search
  ```bash
  rg "function.*auth" --type js    # Search for auth functions in JS files
  rg "TODO|FIXME" --type rb        # Find todos in Ruby files
  rg -i "error" logs/              # Case-insensitive search in logs
  ```

- **fd** - Fast file finder (better than find)
  ```bash
  fd "test" --extension js         # Find JS test files
  fd "config" --type f             # Find config files
  fd ".*\.rb$" --exec wc -l        # Count lines in Ruby files
  ```

- **jq** - JSON processor
  ```bash
  cat package.json | jq '.dependencies'
  curl -s api.com/data | jq '.results[] | .name'
  ```

- **yq** - YAML processor
  ```bash
  yq eval '.database.host' config.yaml
  yq eval '.scripts | keys' package.json
  ```

- **gh** - GitHub CLI (if authentication configured)
  ```bash
  gh pr create --title "Fix: issue description"
  gh pr view --web
  gh issue list --assignee @me
  ```

### Optional Tools (May Be Available)
- **bat** - Syntax-highlighted cat: `bat src/main.js`
- **tree** - Directory visualization: `tree -L 3 -I node_modules`
- **delta** - Enhanced git diffs: `git diff | delta`
- **fzf** - Fuzzy finder: `git log --oneline | fzf`

## Development Workflow Patterns

### Initial Project Assessment
```bash
# Get oriented
pwd && ls -la
git status && git log --oneline -5
tree -L 2 -I "node_modules|.git"

# Understand the project
fd "README|package\.json|Gemfile|requirements\.txt" --type f
rg "scripts|test|build" package.json || rg "tasks" Rakefile
```

### Code Exploration
```bash
# Find entry points
fd "main|index|app" --type f --extension js,rb,py

# Understand structure
rg "class|function|def" --type rb -A 1 | head -20
rg "import|require" --type js | head -10

# Find tests
fd "test|spec" --type d
fd ".*test.*|.*spec.*" --type f
```

### Working with Git
```bash
# Check status and recent changes
git status
git log --oneline -10
git diff HEAD~1

# Create feature branch
git checkout -b feature/description
# ... make changes ...
git add . && git commit -m "Clear description"

# Create PR (if gh configured)
gh pr create --title "Feature: description" --body "Details..."
```

## System and User Resources

### System Infrastructure (`./claude-habitat/system/`)
Managed by Claude Habitat:
- **Tools**: Core development tools (rg, fd, jq, yq, gh, etc.)
- **Scripts**: System utilities and setup scripts
- **Base config**: Default environment configuration

### User Preferences (`./claude-habitat/shared/`)
Your personal customizations:
- **Scripts**: Your personal utility scripts
- **Keys**: SSH keys, GitHub App keys (if configured)
- **Config**: Your git config, aliases, preferences
- **Tools**: Your additional personal tools (if any)

### Scratch Space
Create `./claude-habitat/scratch/` for:
- **Notes**: Your thoughts, findings, todo lists
- **Experiments**: Test scripts, prototypes
- **Analysis**: Code analysis, dependency maps
- **Planning**: Implementation plans, designs

Example:
```bash
mkdir -p ./claude-habitat/scratch
echo "# Project Analysis" > ./claude-habitat/scratch/notes.md
echo "Found these main components:" >> ./claude-habitat/scratch/notes.md
fd ".*\.(rb|js|py)$" --exec wc -l | sort -nr > ./claude-habitat/scratch/file-sizes.txt
```

## Important Guidelines

### Code Quality
- **Always run existing tests** before and after changes
- **Follow project conventions**: Check existing code style, naming patterns
- **Use project tools**: Look for package.json scripts, Makefiles, Rakefile tasks
- **Respect gitignore**: Don't commit temporary files or secrets

### Security & Best Practices
- **No secrets in code**: Use environment variables and config files
- **Use helper scripts**: Check `./claude-habitat/shared/` before writing new utilities
- **Organize work**: Keep temporary files in `./claude-habitat/scratch/`
- **Clean commits**: Make atomic, well-described commits

### Communication
- **Be specific**: Mention file paths like `src/components/Auth.js:45`
- **Show context**: Include relevant code snippets and error messages
- **Explain reasoning**: Why you chose a particular approach
- **Document discoveries**: Add important findings to scratch notes

## Getting Started Checklist

1. **Orient yourself**: `pwd`, `ls -la`, `git status`
2. **Understand the project**: Find README, check package.json/Gemfile
3. **Run tests**: Find and execute the test suite
4. **Check helper files**: Explore `./claude-habitat/shared/`
5. **Create scratch space**: `mkdir -p ./claude-habitat/scratch`
6. **Plan your work**: Document your approach in scratch notes

## Need Help?

- **Tool usage**: Use `--help` flag: `rg --help`, `fd --help`
- **Git workflows**: `git status`, `git log`, `gh --help`
- **Project tools**: Check `package.json`, `Makefile`, `Rakefile` for available commands
- **Shared utilities**: Explore `./claude-habitat/shared/` for project-specific helpers

---
