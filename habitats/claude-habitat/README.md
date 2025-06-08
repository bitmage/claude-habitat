# Claude-Habitat Self-Development Environment

This habitat is a special case that provides a development environment for Claude Habitat itself. It differs significantly from other habitats in its architecture and behavior.

## Special Case Behavior

### `bypass_habitat_construction: true`

This habitat uses the `bypass_habitat_construction` flag, which fundamentally changes how it operates:

**Normal Habitats:**
- Use system-wide infrastructure from `system/config.yaml`
- Use shared user preferences from `shared/config.yaml`
- Get tools, setup scripts, and configurations from the Claude Habitat infrastructure
- Have a standardized `./habitat/` directory structure inside containers

**Claude-Habitat (Bypass Mode):**
- **Ignores** `system/config.yaml` and `shared/config.yaml` completely
- Uses Meta Claude's directory structure directly (the current working directory)
- References tools and scripts from Meta Claude's actual paths like `./system/tools/bin/rg`
- Self-contains all necessary setup in `habitats/claude-habitat/config.yaml`

## Directory Structure

### Meta Claude's Structure (Host)
```
claude-habitat/
├── system/tools/bin/        # System tools (rg, fd, jq, yq, gh, etc.)
├── shared/                  # User preferences and configs
├── habitats/claude-habitat/ # This habitat's configuration
├── src/                     # Claude Habitat source code
├── test/                    # Test suites
└── docs/                    # Documentation
```

### Container Structure
```
/workspace/                  # Meta Claude's project root (cloned)
├── system/tools/bin/        # Same as Meta Claude
├── shared/                  # Same as Meta Claude  
├── habitats/claude-habitat/ # This habitat's config
├── src/                     # Claude Habitat source
├── test/                    # Test suites
└── docs/                    # Documentation
```

## Key Differences

### 1. **No Infrastructure Separation**
- Normal habitats get infrastructure copied to `./habitat/system/` and `./habitat/shared/`
- Claude-habitat uses Meta Claude's structure directly at `/workspace/`

### 2. **Self-Contained Setup** 
- All required setup is defined in `habitats/claude-habitat/config.yaml`
- Includes GitHub auth setup: `./system/tools/bin/setup-github-auth`
- Includes system tool references via Meta Claude paths

### 3. **Test Restrictions**
- **System tests**: Unavailable (manages its own infrastructure)
- **Shared tests**: Unavailable (manages its own infrastructure)  
- **Habitat tests**: Available (tests specific to claude-habitat)
- **Filesystem verification**: Available (verifies Meta Claude structure)

### 4. **Filesystem Verification**
The `verify-fs` section checks for:
- Main repository files (`/workspace/.git/config`, `/workspace/README.md`, etc.)
- System tools at Meta Claude paths (`/workspace/system/tools/bin/*`)
- Node modules and dependencies (`/workspace/node_modules/`)
- Claude credentials (`~/.claude/.credentials.json`)

## Why This Design?

### Development Efficiency
- Developers work on Claude Habitat using Claude Habitat itself
- Changes to infrastructure are immediately available
- No need to rebuild infrastructure when working on claude-habitat core

### Meta-Development Safety
- Claude can safely modify claude-habitat source code
- Container isolation prevents breaking the host Meta Claude
- Full git workflow available (branches, PRs, testing)

### Consistency Testing
- Tests claude-habitat's ability to self-host
- Validates that bypass mode works correctly
- Ensures the tool can be used to develop itself

## Usage

### Starting the Environment
```bash
./claude-habitat start claude-habitat
```

### Running Tests
```bash
# Only habitat-specific tests available
./claude-habitat test claude-habitat --habitat

# Filesystem verification  
./claude-habitat test claude-habitat --verify-fs

# System/shared tests are unavailable:
./claude-habitat test claude-habitat --system  # ❌ Not available
./claude-habitat test claude-habitat --shared  # ❌ Not available
```

### Development Workflow
1. Start claude-habitat environment: `./claude-habitat start claude-habitat`
2. Claude launches with access to the full source code
3. Make changes, run tests, create branches and PRs
4. Changes are isolated in the container but can be pushed to remote

## Maintenance Notes

### When Adding System Tools
- Add tools to `system/tools/bin/` (Meta Claude structure)
- Update `verify-fs` in `habitats/claude-habitat/config.yaml`
- No need to update `system/config.yaml` (ignored by bypass mode)

### When Modifying Infrastructure
- Update `habitats/claude-habitat/config.yaml` directly
- Test with `./claude-habitat test claude-habitat --verify-fs`
- Regular habitats will continue using `system/` and `shared/` configs

### Path References
- **Inside containers**: Use `./habitat/` for normal habitats
- **Claude-habitat container**: Use `./system/`, `./shared/` (Meta Claude paths)
- **Host system**: Always use actual directory names (`system/`, `shared/`)

This design enables Claude Habitat to be developed using itself while maintaining clean separation from regular habitat workflows.