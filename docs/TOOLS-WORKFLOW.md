# System Tools Workflow

This document explains how system tools are managed in Claude Habitat.

## Design Philosophy

**Tools are downloaded on-demand, not committed to git.**

- ✅ Only configuration files (`tools.yaml`) are committed
- ✅ Binaries are downloaded during container builds
- ✅ Clean repository without binary bloat
- ✅ Easy tool updates via configuration

## For Users

### First-Time Setup
```bash
# Tools are automatically installed during habitat creation
./claude-habitat discourse
# → Tools downloaded and cached in system/tools/bin/
```

### Available Tools
All habitats include these development tools:
- **rg** (ripgrep) - Fast text search
- **fd** - Fast file finder  
- **jq** - JSON processor
- **yq** - YAML processor
- **gh** - GitHub CLI
- **bat** - Syntax-highlighted cat
- **tree** - Directory visualization
- **delta** - Enhanced git diffs
- **fzf** - Fuzzy finder

## For Maintainers

### Adding/Updating Tools

1. **Edit the configuration**:
   ```bash
   vim system/tools/tools.yaml
   ```

2. **Add new tool entry**:
   ```yaml
   tools:
     - name: new-tool
       description: "Description of the tool"
       url: "https://github.com/owner/repo/releases/latest/download/tool-{version}-linux.tar.gz"
       binary: "tool-binary-name"
       extract_path: "path/in/archive/to/binary"  # optional
   ```

3. **Test locally**:
   ```bash
   cd system/tools
   ./install-tools.sh clean    # Remove existing tools
   ./install-tools.sh         # Install fresh
   ./bin/new-tool --version   # Test it works
   ```

4. **Commit only the configuration**:
   ```bash
   git add system/tools/tools.yaml
   git commit -m "Add new-tool to system tools"
   ```

### Host-Side Tools Management

Users can manage tools through the main menu:

```bash
./claude-habitat
# → Select [t] Tools - Manage development tools
# → Choose from:
#   [1] Clean & reinstall all tools
#   [2] List tool status  
#   [3] Reinstall specific tool
```

### Updating Tool Versions

Tools are automatically updated to latest versions. To pin specific versions:

```yaml
tools:
  - name: gh
    description: "GitHub CLI"
    url: "https://github.com/cli/cli/releases/download/v2.40.1/gh_2.40.1_linux_amd64.tar.gz"
    binary: "gh"
    extract_path: "gh_2.40.1_linux_amd64/bin/gh"
```

### Testing Changes

```bash
# Clean rebuild
cd system/tools
./install-tools.sh clean && ./install-tools.sh

# Run integration tests
npm run test:integration

# Test specific fix
npm run test:github-fix
```

## Implementation Details

### Download Process
1. `install-tools.sh` reads `tools.yaml`
2. For each tool, resolves `{version}` to latest GitHub release
3. Downloads and extracts to `system/tools/bin/`
4. Sets proper permissions and PATH

### Container Integration
- Tools copied to `/workspace/claude-habitat/system/tools/bin/`
- Added to PATH automatically
- Available to "Habitat" Claude for development tasks

### Caching
- Tools persist between container builds
- Only downloaded if missing or configuration changes
- Cache invalidation via `./install-tools.sh clean`

## Troubleshooting

### Tool Won't Download
```bash
# Debug mode for detailed output
DEBUG=1 ./install-tools.sh
```

### Tool Won't Run in Container
1. Check it's executable: `ls -la system/tools/bin/tool`
2. Verify Linux compatibility: `file system/tools/bin/tool`
3. Test locally first: `./system/tools/bin/tool --version`

### Repository Access Issues
If you see "gh: command not found" during pre-flight checks:
1. Tools may not be installed yet
2. Run: `cd system/tools && ./install-tools.sh`
3. Or trigger via habitat creation which auto-installs

## Migration from Committed Binaries

Previously, binaries were committed to git. This has been changed:

1. **Removed from git**: `git rm --cached system/tools/bin/*`
2. **Updated .gitignore**: Tools directory ignored
3. **Auto-install**: Tools downloaded on first use
4. **Clean repository**: 65MB of binaries removed from git history
5. **Simplified structure**: Removed optional vs core distinction - all tools are equal

### What Changed for Users

- **Before**: Optional tools required `./install-tools.sh install-optional`
- **After**: All tools installed with `./install-tools.sh install`
- **New**: Tools management through main menu: `./claude-habitat` → `[t] Tools`
- **New**: Individual tool installation: `./install-tools.sh install tool1 tool2`

This follows industry best practices and makes the repository much cleaner.