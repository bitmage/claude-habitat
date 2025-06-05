# Claude Habitat Tools

This directory contains tools that will be available to Claude in all containers. Tools are installed as static binaries to work across all Linux distributions.

## Quick Start

```bash
# Install core tools
./install-tools.sh

# List available tools
./install-tools.sh list

# Install optional tools
./install-tools.sh install-optional
```

## Core Tools (Always Available)

- **rg** - ripgrep for fast text search
- **fd** - fast file finder
- **jq** - JSON processor
- **yq** - YAML processor  
- **gh** - GitHub CLI

## Optional Tools

- **bat** - cat with syntax highlighting
- **tree** - directory structure visualization
- **delta** - enhanced git diffs
- **fzf** - fuzzy finder

## Configuration

### Adding Tools

Edit `tools.yaml` to add new tools:

```yaml
core_tools:
  - name: mytool
    description: "My custom tool"
    url: "https://github.com/user/repo/releases/latest/download/mytool-{version}-linux.tar.gz"
    binary: "mytool"
    extract_path: "mytool-{version}/mytool"
```

### User Tools

Create `user-tools.yaml` for personal tools (ignored by git):

```yaml
core_tools:
  - name: personal-tool
    description: "My personal development tool"
    url: "https://example.com/tool.tar.gz"
    binary: "tool"
    direct_binary: true
```

## Tool Properties

- **name**: Tool identifier
- **description**: Human-readable description
- **url**: Download URL (supports `{version}` placeholder)
- **binary**: Name of the executable
- **extract_path**: Path within archive to binary (optional)
- **direct_binary**: Set to `true` if URL downloads binary directly (optional)

## How It Works

1. **Static Binaries**: Tools are downloaded as pre-compiled static binaries
2. **Version Resolution**: Automatically fetches latest versions from GitHub releases
3. **Cross-Platform**: Works on any Linux distribution without package managers
4. **Containerized**: Tools are available in the container's PATH at `/claude-habitat/shared/tools/bin`

## PATH Setup

The tools directory is automatically added to PATH in containers via:

```bash
export PATH="/claude-habitat/shared/tools/bin:$PATH"
```

## Advanced Usage

```bash
# Debug mode
DEBUG=1 ./install-tools.sh

# Clean up all tools
./install-tools.sh clean

# Check what's installed
ls -la bin/
```

## Troubleshooting

### Tool Won't Download
- Check network connectivity
- Verify the GitHub repository exists
- Try with `DEBUG=1` for detailed output

### Binary Won't Run
- Check if it's marked executable: `ls -la bin/mytool`
- Verify it's a Linux binary: `file bin/mytool`
- Check for missing libraries: `ldd bin/mytool`

### Adding Custom Tools
1. Add entry to `user-tools.yaml`
2. Run `./install-tools.sh` to install
3. Test with `./bin/yourtool --version`

## Examples

### Installing Everything
```bash
# Install core tools (automatically done during container build)
./install-tools.sh

# Install optional tools for enhanced experience
./install-tools.sh install-optional
```

### Checking Status
```bash
./install-tools.sh list
```

### Custom Tool Example
```yaml
# user-tools.yaml
core_tools:
  - name: hyperfine
    description: "Command-line benchmarking tool"
    url: "https://github.com/sharkdp/hyperfine/releases/latest/download/hyperfine-{version}-x86_64-unknown-linux-musl.tar.gz"
    binary: "hyperfine"
    extract_path: "hyperfine-{version}-x86_64-unknown-linux-musl/hyperfine"
```