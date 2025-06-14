#!/bin/bash
# Shared Test: User Configuration Validation
# @fileoverview Validates user configuration and shared environment setup
# @description This test ensures that shared user preferences and tools are properly
#              configured across all habitats, including git identity, development tools
#              accessibility, and Claude instruction availability.
#
# This test validates the shared configuration layer that provides consistent user
# identity and tool access across different habitat environments, ensuring Claude
# has access to necessary development tools and user-specific settings.
#
# @tests
# - Run this test: ./shared/tests/test-user-config.sh
# - Run all shared tests: ./claude-habitat test --shared
# - Run all tests: npm test
# - Related config: shared/config.yaml, shared/CLAUDE.md

set -e

# Load TAP helpers from relative location  
source "$(dirname "$(dirname "$(dirname "$(readlink -f "$0")")")")/system/tools/tap-helpers.sh"

tap_start 8

# Test git configuration
if git config --global user.name >/dev/null 2>&1; then
    tap_ok "Git user name is configured"
else
    tap_not_ok "Git user name is configured" "Run: git config --global user.name 'Your Name'"
fi

if git config --global user.email >/dev/null 2>&1; then
    tap_ok "Git user email is configured"  
else
    tap_not_ok "Git user email is configured" "Run: git config --global user.email 'your@email.com'"
fi

# Test PATH includes system tools
if command -v gh >/dev/null 2>&1; then
    tap_ok "GitHub CLI (gh) is accessible via PATH"
else
    tap_not_ok "GitHub CLI (gh) is accessible via PATH" "System tools not in PATH"
fi

if command -v rg >/dev/null 2>&1; then
    tap_ok "Ripgrep (rg) is accessible via PATH"
else
    tap_not_ok "Ripgrep (rg) is accessible via PATH" "System tools not in PATH"
fi

# Test GitHub CLI functionality (if available)
if command -v gh >/dev/null 2>&1; then
    if gh auth status >/dev/null 2>&1; then
        tap_ok "GitHub CLI is authenticated"
    else
        tap_not_ok "GitHub CLI is authenticated" "Run: gh auth login or set up GitHub App"
    fi
else
    tap_not_ok "GitHub CLI is authenticated" "gh command not available"
fi

# Test git repository access (if this is a git repo)
if [ -d ".git" ]; then
    if git ls-remote origin >/dev/null 2>&1; then
        tap_ok "Git repository access is working"
    else
        tap_not_ok "Git repository access is working" "Cannot access remote repository"
    fi
else
    tap_ok "Git repository access is working (not in git repository)"
fi

# Test shared directory structure
SHARED_PATH=${SHARED_PATH:-/habitat/shared}
tap_has_dir "$SHARED_PATH" "Shared directory is accessible"

# Test CLAUDE.md instructions are available
if [ -f "/CLAUDE.md" ] || [ -f "CLAUDE.md" ]; then
    tap_ok "Claude instructions are available"
else
    tap_not_ok "Claude instructions are available" "CLAUDE.md not found at root or work dir"
fi

tap_diag "User configuration test completed"