#!/bin/bash
# Test tools installation and GitHub authentication in claude-habitat

set -e

echo "=== Tools and Authentication Test ==="
echo "Testing system tools installation and GitHub App authentication"

# Check if we're in the right environment  
WORKDIR=${WORKDIR:-/workspace}
if [ ! -f "$WORKDIR/package.json" ]; then
    echo "❌ ERROR: Not in claude-habitat environment - missing $WORKDIR/package.json"
    exit 1
fi

echo "✅ Environment check passed"

# Test system tools installation
echo ""
echo "Testing system tools installation..."

SYSTEM_PATH=${SYSTEM_PATH:-/workspace/system}
TOOLS_DIR="$SYSTEM_PATH/tools/bin"
REQUIRED_TOOLS=(rg fd jq yq gh bat)

for tool in "${REQUIRED_TOOLS[@]}"; do
    if [ -f "$TOOLS_DIR/$tool" ] && [ -x "$TOOLS_DIR/$tool" ]; then
        echo "✅ $tool: installed and executable"
    else
        echo "❌ $tool: missing or not executable"
        exit 1
    fi
done

# Test that tools are in PATH
echo ""
echo "Testing tools availability in PATH..."

for tool in "${REQUIRED_TOOLS[@]}"; do
    if command -v "$tool" >/dev/null 2>&1; then
        echo "✅ $tool: available in PATH"
    else
        echo "❌ $tool: not found in PATH"
        exit 1
    fi
done

# Test GitHub App PEM key presence
echo ""
echo "Testing GitHub App PEM key..."

SHARED_PATH=${SHARED_PATH:-/workspace/shared}
PEM_FILE="$SHARED_PATH/behold-the-power-of-claude.2025-06-04.private-key.pem"
if [ -f "$PEM_FILE" ]; then
    echo "✅ GitHub App PEM key found: $PEM_FILE"
else
    echo "❌ GitHub App PEM key missing: $PEM_FILE"
    exit 1
fi

# Test GitHub App environment variable
echo ""
echo "Testing GitHub App environment..."

if [ -n "$GITHUB_APP_ID" ]; then
    echo "✅ GITHUB_APP_ID set: $GITHUB_APP_ID"
else
    echo "❌ GITHUB_APP_ID not set"
    exit 1
fi

# Test setup-github-auth script
echo ""
echo "Testing GitHub authentication setup..."

if [ -f "$SYSTEM_PATH/tools/bin/setup-github-auth" ]; then
    echo "✅ setup-github-auth script found"
    
    # Test the script (this will configure git credential helper)
    if "$SYSTEM_PATH/tools/bin/setup-github-auth"; then
        echo "✅ GitHub authentication setup succeeded"
    else
        echo "❌ GitHub authentication setup failed"
        exit 1
    fi
else
    echo "❌ setup-github-auth script missing"
    exit 1
fi

# Test git credential helper configuration
echo ""
echo "Testing git credential helper..."

if git config --global credential."https://github.com".helper | grep -q "git-credential-github-app"; then
    echo "✅ Git credential helper configured"
else
    echo "❌ Git credential helper not configured"
    exit 1
fi

# Test tool versions (basic smoke test)
echo ""
echo "Testing tool versions..."

echo "rg version: $(rg --version | head -1)"
echo "fd version: $(fd --version)"
echo "jq version: $(jq --version)"
echo "yq version: $(yq --version)"
echo "gh version: $(gh --version | head -1)"
echo "bat version: $(bat --version)"

echo ""
echo "=== Tools and Authentication Test Complete ==="
echo "✅ All tools installed and GitHub authentication configured"