#!/bin/bash
# Test GitHub App authentication functionality
# This test ensures that git authentication never gets stuck

set -e

# Load TAP helpers from relative location
source "$(dirname "$(dirname "$(readlink -f "$0")")")/tools/tap-helpers.sh"

tap_start 8

# Test 1: Environment variables are set
tap_has_env "GITHUB_APP_ID" "GitHub App ID environment variable is set"

# Test 2: Work directory environment variable is set
tap_has_env "CLAUDE_HABITAT_WORKDIR" "Claude Habitat work directory is set"

# Test 3: PEM file exists in expected location
if [ -n "$CLAUDE_HABITAT_WORKDIR" ]; then
    pem_file=$(find "$CLAUDE_HABITAT_WORKDIR/claude-habitat/shared" -name "*.pem" -type f | sort -r | head -1)
    if [ -n "$pem_file" ] && [ -f "$pem_file" ]; then
        tap_ok "GitHub App PEM file found at $(basename "$pem_file")"
    else
        tap_not_ok "GitHub App PEM file found" "No .pem files in $CLAUDE_HABITAT_WORKDIR/claude-habitat/shared"
    fi
else
    tap_skip "GitHub App PEM file found" "CLAUDE_HABITAT_WORKDIR not set"
fi

# Test 4: Git credential helper is installed
tools_dir="$(dirname "$(dirname "$(readlink -f "$0")")")/tools"
credential_helper="$tools_dir/bin/git-credential-github-app"
if [ -f "$credential_helper" ]; then
    tap_ok "Git credential helper is installed at $credential_helper"
else
    tap_not_ok "Git credential helper is installed" "Not found at $credential_helper"
fi

# Test 5: Git credential helper is executable
if [ -f "$credential_helper" ]; then
    if [ -x "$credential_helper" ]; then
        tap_ok "Git credential helper is executable"
    else
        tap_not_ok "Git credential helper is executable" "File exists but is not executable"
    fi
else
    tap_skip "Git credential helper is executable" "Credential helper not found"
fi

# Test 6: Git is configured to use credential helper
if git config --global --get credential.https://github.com.helper | grep -q "git-credential-github-app"; then
    tap_ok "Git is configured to use GitHub App credential helper"
else
    tap_not_ok "Git is configured to use GitHub App credential helper" "Git credential config not found"
fi

# Test 7: Credential helper can generate tokens
if [ -n "$GITHUB_APP_ID" ] && [ -f "$credential_helper" ]; then
    # Test token generation by running credential helper
    cred_output=$(echo | "$credential_helper" get 2>/dev/null)
    if echo "$cred_output" | grep -q "username=x-access-token" && echo "$cred_output" | grep -q "password=ghs_"; then
        tap_ok "Credential helper generates valid GitHub tokens"
    else
        tap_not_ok "Credential helper generates valid GitHub tokens" "Output: $cred_output"
    fi
else
    tap_skip "Credential helper generates valid GitHub tokens" "Required environment variables not set or credential helper not found"
fi

# Test 8: GitHub setup tool is available
setup_tool="$tools_dir/bin/setup-github-auth"
if [ -f "$setup_tool" ]; then
    tap_ok "GitHub setup tool is available at $setup_tool"
else
    tap_not_ok "GitHub setup tool is available" "Not found at $setup_tool"
fi

tap_diag "Git authentication test completed"