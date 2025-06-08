#!/bin/bash
# Test user configuration is properly set up
# Validates shared user preferences and tools

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
tap_has_dir "/claude-habitat/shared" "Shared directory is accessible"

# Test CLAUDE.md instructions are available
if [ -f "/claude-habitat/shared/CLAUDE.md" ] || [ -f "CLAUDE.md" ]; then
    tap_ok "Claude instructions are available"
else
    tap_not_ok "Claude instructions are available" "CLAUDE.md not found in work dir or shared"
fi

tap_diag "User configuration test completed"