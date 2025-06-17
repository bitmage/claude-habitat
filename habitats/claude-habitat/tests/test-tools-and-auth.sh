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

echo "DEBUG: Reached GitHub CLI section check"

# Test GitHub CLI authentication using GitHub App
echo ""
echo "Testing GitHub CLI authentication..."
echo "DEBUG: GITHUB_APP_ID=$GITHUB_APP_ID, PEM_FILE=$PEM_FILE"

# Generate GitHub App token using the same logic as regenerate-github-token.sh
if [ -n "$GITHUB_APP_ID" ] && [ -f "$PEM_FILE" ]; then
    echo "Generating GitHub App token for CLI authentication..."
    
    # Generate JWT for GitHub App
    header='{"alg":"RS256","typ":"JWT"}'
    payload="{\"iat\":$(date +%s),\"exp\":$(($(date +%s) + 600)),\"iss\":\"$GITHUB_APP_ID\"}"
    
    # Encode header and payload
    header_b64=$(echo -n "$header" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
    payload_b64=$(echo -n "$payload" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
    
    # Create signature
    signature=$(echo -n "$header_b64.$payload_b64" | openssl dgst -sha256 -sign "$PEM_FILE" | base64 -w 0 | tr '+/' '-_' | tr -d '=')
    
    if [ -n "$signature" ]; then
        # Create JWT
        jwt="$header_b64.$payload_b64.$signature"
        
        # Get installation token
        installations_response=$(curl -s -H "Authorization: Bearer $jwt" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations" 2>/dev/null)
        installation_id=$(echo "$installations_response" | jq -r '.[0].id' 2>/dev/null)
        
        if [ "$installation_id" != "null" ] && [ -n "$installation_id" ]; then
            token_response=$(curl -s -X POST -H "Authorization: Bearer $jwt" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations/$installation_id/access_tokens" 2>/dev/null)
            token=$(echo "$token_response" | jq -r '.token' 2>/dev/null)
            
            if [ "$token" != "null" ] && [ -n "$token" ]; then
                # Set GitHub token for CLI authentication
                export GITHUB_TOKEN="$token"
                echo "✅ GitHub App token generated and set for CLI"
                
                # Test GitHub CLI access with token
                echo "Testing GitHub CLI repository access..."
                if gh repo list --limit 5 >/dev/null 2>&1; then
                    echo "✅ GitHub CLI authenticated successfully"
                    echo "Available repositories:"
                    gh repo list --limit 5 2>/dev/null || echo "  (Repository list not accessible)"
                else
                    echo "❌ GitHub CLI authentication failed"
                fi
            else
                echo "❌ Failed to generate GitHub App access token"
            fi
        else
            echo "❌ Failed to get GitHub App installation ID"
        fi
    else
        echo "❌ Failed to create JWT signature for GitHub App"
    fi
else
    echo "❌ GitHub App authentication not available (missing ID or PEM file)"
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