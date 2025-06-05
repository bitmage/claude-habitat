# Usage

## Basic Commands

```bash
./claude-habitat                    # Interactive menu
./claude-habitat <name>             # Start specific habitat
./claude-habitat add                # Create new habitat
./claude-habitat --list-configs     # List available habitats
```

## What Claude Gets

When launched, Claude has:
- Project code ready in working directory
- Development tools: `rg`, `fd`, `jq`, `yq`, `gh`, etc.
- Helper files in `./claude-habitat/shared/`
- Scratch space for notes: `./claude-habitat/scratch/`
- Services running (databases, etc. as configured)

## Example Workflows

### Exploring a Project
```bash
# Get oriented
git status && git log --oneline -5
tree -L 2 -I "node_modules|.git"

# Find code patterns
rg "function.*auth" --type js
fd "test" --extension rb

# Check what's available
./claude-habitat/shared/
```

### Making Changes
```bash
# Create branch
git checkout -b feature/description

# Make changes, run tests
npm test  # or whatever the project uses

# Commit and PR
git add . && git commit -m "Description"
gh pr create --title "Feature: description"
```

## Advanced Usage

### Additional Repositories
```bash
./claude-habitat discourse --repo "https://github.com/user/plugin:/src/plugins/plugin"
```

### Maintenance
```bash
./claude-habitat maintain    # Maintenance menu
./claude-habitat --clean     # Remove old images
```

That's it! The tool is designed to be self-explanatory.