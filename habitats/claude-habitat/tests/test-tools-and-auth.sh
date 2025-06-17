#!/bin/bash
# Habitat Test: Claude-Habitat Tools and Authentication
# @fileoverview Validates tool installation and GitHub authentication in self-hosted environment
# @description This test ensures that the claude-habitat self-hosting environment has all
#              required development tools properly installed and that GitHub App authentication
#              is working correctly for repository access and operations.
#
# This test validates the complete toolchain required for Claude to maintain and develop
# the claude-habitat project itself, including development tools, GitHub authentication,
# and proper PATH configuration for seamless tool access.
#
# @tests
# - Run this test: ./habitats/claude-habitat/tests/test-tools-and-auth.sh
# - Run all claude-habitat tests: ./claude-habitat test claude-habitat
# - Run all tests: npm test
# - Related config: habitats/claude-habitat/config.yaml

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

# Test GitHub CLI authentication
echo ""
echo "Testing GitHub CLI authentication..."

# Test that GitHub CLI can authenticate using existing setup
if gh auth status >/dev/null 2>&1; then
    echo "✅ GitHub CLI authenticated successfully"
    
    # Test basic API access (GitHub Apps use different endpoints than user tokens)
    if gh api /installation/repositories >/dev/null 2>&1; then
        echo "✅ GitHub CLI API access working"
    else
        echo "❌ GitHub CLI API access failed"
        exit 1
    fi
    
    # Test repository access
    if gh repo list --limit 3 >/dev/null 2>&1; then
        echo "✅ GitHub CLI repository access working"
    else
        echo "❌ GitHub CLI repository access failed"
        exit 1
    fi
else
    echo "❌ GitHub CLI not authenticated"
    echo "   Run setup-github-auth to configure authentication"
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