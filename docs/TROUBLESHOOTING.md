# Claude Habitat Troubleshooting Guide

This document contains debugging insights and solutions for common issues with claude-habitat.

📖 **See [TERMINOLOGY.md](TERMINOLOGY.md) for domain concepts** like base images, prepared images, sessions, etc.

## Common Issues and Solutions

### 1. Script Exits Prematurely During Repository Cloning

**Symptom**: Script exits after cloning the first repository without error messages.

**Cause**: Bash arithmetic expressions in loops can cause `set -e` to trigger when the result is 0.

**Solution**: Use explicit arithmetic assignment instead of increment operators:
```bash
# Bad: causes exit when incrementing from 0
((repo_idx++))

# Good: explicit assignment
repo_idx=$((repo_idx + 1))
```

**Debug Steps**:
1. Enable debug mode: `set -x` at the top of the script
2. Look for the last executed command before exit
3. Check arithmetic expressions in loops

### 2. Multi-line Setup Commands Fail

**Symptom**: Setup commands with `if` statements or multi-line scripts fail with syntax errors.

**Cause**: YAML multi-line strings (using `|` syntax) were being split line-by-line instead of executed as complete blocks.

**Solution**: Parse YAML list items properly, collecting complete multi-line commands before execution:
```bash
# Parse list of commands (each starting with "- ")
while IFS= read -r line; do
    if [[ "$line" =~ ^-[[:space:]]+(.*) ]]; then
        # Execute previous command if any
        if [ "$in_command" = true ] && [ -n "$cmd_buffer" ]; then
            docker exec "$container" bash -c "$cmd_buffer"
        fi
        # Start new command
        cmd_buffer="${BASH_REMATCH[1]}"
        in_command=true
    elif [ "$in_command" = true ]; then
        # Continue building the command
        cmd_buffer="$cmd_buffer"$'\n'"$line"
    fi
done
```

### 3. Permission Denied Errors During Setup

**Symptom**: `bundle install`, `pnpm install`, or database operations fail with permission errors.

**Root Cause**: Repositories cloned by root but setup commands run as different user.

**Solution**: Set proper ownership after cloning:
```bash
# Set ownership to discourse user (1000:1000)
chown -R 1000:1000 $path
```

**Debug Steps**:
1. Check which user is running the setup commands
2. Verify file ownership in the container: `docker exec container ls -la /src`
3. Ensure clone operations set proper ownership

### 4. Container Exits During Service Startup

**Symptom**: Container stops running before setup completes.

**Debug Steps**:
1. Check container logs: `docker logs <container_name>`
2. Increase startup delay in YAML config
3. Verify base image has required services
4. Test service startup manually:
   ```bash
   docker exec container pg_isready -U postgres
   docker exec container redis-cli ping
   ```

### 5. Cache Not Working / Always Rebuilding

**Symptom**: Prepared images are rebuilt on every run despite no changes.

**Debug Steps**:
1. Check cache hash consistency:
   ```bash
   ./claude-habitat.sh --config discourse.yaml | head -10
   ```
2. Verify no extra whitespace or formatting changes in YAML
3. Check if `--repo` flags are being used inconsistently
4. Look for environment section changes (excluded from hash)

**Hash Calculation**: The cache hash is based on:
- YAML file content (excluding environment variables)
- Command-line repository overrides (`--repo` flags)

### 6. Build Failures During Prepared Image Creation

**Symptom**: Temporary container creation or setup commands fail during image preparation.

**Debug Steps**:
1. Check if base image exists: `docker images | grep claude-habitat`
2. Test base image manually:
   ```bash
   docker run -it claude-habitat-discourse:latest bash
   ```
3. Verify network connectivity for repository cloning
4. Check disk space: `df -h`

### 7. GitHub Authentication Issues

**Symptom**: GitHub operations fail or private repositories cannot be cloned.

**Solutions**:
- **For HTTPS cloning**: Ensure `GITHUB_TOKEN` environment variable is set
- **For SSH cloning**: Mount SSH keys into container
- **For GitHub App**: Verify private key file exists and is readable

**Debug Steps**:
1. Test GitHub connectivity:
   ```bash
   docker exec container curl -I https://github.com
   ```
2. Verify authentication:
   ```bash
   docker exec container gh auth status
   ```

### 8. Development Tools Issues

**Symptom**: Tools like `rg`, `fd`, `jq`, `yq`, or `gh` are not available or not working.

**Cause**: Tools installation failed during container build or PATH is not configured.

**Solutions**:

1. **Check if tools are installed**:
   ```bash
   # In the habitat container
   ls -la /claude-habitat/shared/tools/bin/
   which rg fd jq yq gh
   ```

2. **Check PATH configuration**:
   ```bash
   echo $PATH | grep claude-habitat
   # Should see: /claude-habitat/shared/tools/bin
   ```

3. **Reinstall tools manually**:
   ```bash
   cd /claude-habitat/shared/tools
   ./install-tools.sh clean
   ./install-tools.sh install
   ```

4. **Install optional tools**:
   ```bash
   cd /claude-habitat/shared/tools
   ./install-tools.sh install-optional
   ```

5. **Debug tool installation**:
   ```bash
   DEBUG=1 ./install-tools.sh install
   ```

**Common tool-specific issues**:
- **GitHub CLI (`gh`)**: Check if authentication is configured
- **jq/yq**: Verify JSON/YAML syntax in files being processed
- **rg/fd**: Check file permissions and search patterns

## Debugging Techniques

### Enable Debug Mode
Temporarily add `set -x` to the script for verbose output:
```bash
set -e
set -x  # Add this line
```

### Check Container State
```bash
# List running containers
docker ps

# Check container logs
docker logs <container_name>

# Execute commands in running container
docker exec -it <container_name> bash
```

### Inspect Docker Images
```bash
# List all claude-habitat images
docker images | grep claude-habitat

# Inspect image details
docker inspect <image_name>

# Check image layers
docker history <image_name>
```

### YAML Parsing Debug
Test YAML parsing independently:
```bash
yq eval '.setup.root' ./habitats/discourse/config.yaml
```

### Manual Testing
Test individual components:
```bash
# Test base image build
docker build -f dockerfiles/Dockerfile.discourse -t test-image .

# Test repository cloning
git clone --depth 1 https://github.com/discourse/discourse /tmp/test

# Test setup commands manually
docker run -it discourse/discourse_dev:release bash
```

## Performance Troubleshooting

### Slow First Builds
- **Expected**: Initial builds take 5-10 minutes for dependency installation
- **Optimization**: Ensure good network connectivity
- **Monitoring**: Watch for specific slow steps (bundle install, pnpm install, database migration)

### Container Startup Issues
- **Increase startup_delay**: Some services need more time to initialize
- **Check service dependencies**: PostgreSQL must be ready before database operations
- **Resource constraints**: Ensure adequate CPU/memory for Docker

## Environment-Specific Issues

### macOS
- **Docker Desktop**: Ensure it's running and has adequate resources
- **File permissions**: May need different UID/GID mappings

### Linux
- **SELinux**: May interfere with volume mounts
- **Docker daemon**: Ensure user is in docker group

### Windows (WSL)
- **Path conversion**: Git Bash may convert paths incorrectly
- **Line endings**: Ensure scripts use Unix line endings

## Recovery Procedures

### Complete Reset
```bash
# Stop all containers
docker stop $(docker ps -q --filter "name=claude-habitat")

# Remove all containers
docker rm $(docker ps -aq --filter "name=claude-habitat")

# Clean all images
./claude-habitat.sh --clean

# Rebuild from scratch
./claude-habitat.sh --config discourse.yaml
```

### Partial Recovery
```bash
# Remove just prepared images to force rebuild
docker rmi $(docker images -q --filter "reference=claude-habitat-*-*")

# Keep base images, rebuild prepared only
./claude-habitat.sh --config discourse.yaml
```

## Getting Help

When reporting issues, include:
1. **Command used**: Full command line with flags
2. **Output**: Complete output including error messages
3. **Environment**: OS, Docker version, available resources
4. **Configuration**: Relevant parts of YAML config
5. **Timing**: When the issue occurs (startup, cloning, setup, etc.)

**Debug info to collect**:
```bash
# System info
docker version
docker system df
uname -a

# Container state
docker ps -a | grep claude-habitat
docker images | grep claude-habitat

# Recent logs
docker logs <container_name> | tail -50
```