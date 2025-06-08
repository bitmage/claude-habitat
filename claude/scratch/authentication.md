# Claude Habitat Authentication & Workspace Fix Plan

## Issues Discovered and Fixed

### 1. ✅ Workspace Population Issue
**Problem**: The workspace was empty when booting into claude-habitat.
**Root Cause**: After `rm -rf workspace`, Docker couldn't execute commands due to missing WORKDIR.
**Fix**: Changed to `rm -rf ${repoInfo.path} && mkdir -p ${repoInfo.path}` then clone with `git clone URL .`

### 2. ✅ Claude API Authentication
**Problem**: Claude couldn't authenticate - "Invalid API key"
**Root Cause**: Credentials are mounted but the symlink in setup wasn't persisting
**Fix**: The symlink IS created during setup. The issue was TTY allocation.

### 3. ✅ TTY Allocation Issue
**Problem**: "the input device is not a TTY" error when running commands
**Root Cause**: Magic string detection in habitat.js was checking for '-p' in command to decide TTY mode
**Fix**: Removed magic detection, always use `-i` flag for docker exec

### 4. ⚠️ Bypass Mode Infrastructure Issue
**Problem**: verify-fs script not found for bypass habitats
**Root Cause**: Bypass mode skips infrastructure copying, but binary tools aren't in the git repo
**Current State**: Infrastructure copying is now properly skipped for bypass mode
**Remaining Issue**: Binary tools (rg, fd, gh, etc.) need different handling for bypass mode

## Investigation Strategy

### 1. Filesystem Verification First
```bash
./claude-habitat test claude-habitat --verify-fs
```
This should reveal what files are missing and why.

### 2. Workspace Population Analysis
- Check how files are supposed to be copied to the container
- Investigate bypass_habitat_construction mode
- Verify repository cloning process
- Check volume mounting

### 3. Authentication Setup
After fixing workspace:
1. Claude API credentials at `~/.claude/.credentials.json`
2. GitHub authentication for pushing code

## Root Cause Hypotheses

### Workspace Empty Issue
1. **Repository not cloning** - The main claude-habitat repo isn't being cloned to /workspace
2. **Volume mounting issues** - Files aren't being properly mounted/copied
3. **Bypass mode confusion** - Maybe bypass mode expects different behavior
4. **Working directory mismatch** - Container might be looking in wrong location

### Authentication Issues
1. **Credentials not copied** - ~/.claude/.credentials.json not being transferred
2. **Path issues** - Claude looking for credentials in wrong location
3. **GitHub token** - Not properly set up for PR creation

## Investigation Steps

### Phase 1: Debug Filesystem
1. Run verify-fs to see what's missing
2. Check container during startup to see file state
3. Review config.yaml for claude-habitat habitat
4. Check if repository cloning is happening
5. Verify volume mounts and file copying

### Phase 2: Fix Workspace Population
Based on findings:
- Fix repository cloning if broken
- Ensure proper file copying/mounting
- Verify bypass_habitat_construction behavior
- Test that files appear in /workspace

### Phase 3: Fix Authentication
1. Verify credentials file exists on host
2. Ensure it's copied to container
3. Check Claude can find it
4. Test with simple prompt
5. Verify GitHub authentication

### Phase 4: Full E2E Test
Run the full test suite to ensure everything works.

## Key Files to Investigate

### Configuration
- `habitats/claude-habitat/config.yaml` - Main config
- `src/habitat.js` - Habitat startup logic
- `src/docker.js` - Container management
- `src/filesystem.js` - File operations

### Repository Handling
- Look for repository cloning logic
- Check how bypass mode affects repos
- Verify volume mounting

### Authentication
- Find credential copying logic
- Check GitHub token setup
- Verify paths in container

## Success Criteria
1. ✅ Filesystem verification passes
2. ✅ Workspace contains all project files
3. ✅ Claude responds to prompts (API auth works)
4. ✅ GitHub PR test succeeds (GitHub auth works)
5. ✅ All three commands work as expected

## Debug Commands
```bash
# Check what's in the container
docker exec -it <container> ls -la /workspace

# Check credentials
docker exec -it <container> ls -la ~/.claude/

# Check environment
docker exec -it <container> env | grep -E "(CLAUDE|GITHUB)"
```

Let's start investigating!