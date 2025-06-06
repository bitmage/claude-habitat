#!/bin/bash
# Test user configuration is properly set up
# Validates shared user preferences and tools

set -e

# Load TAP helpers
source /claude-habitat/system/tools/tap-helpers.sh

tap_start 4

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

# Test shared directory structure
tap_has_dir "/claude-habitat/shared" "Shared directory is accessible"

# Test CLAUDE.md instructions are available
if [ -f "/claude-habitat/shared/CLAUDE.md" ] || [ -f "CLAUDE.md" ]; then
    tap_ok "Claude instructions are available"
else
    tap_not_ok "Claude instructions are available" "CLAUDE.md not found in work dir or shared"
fi

tap_diag "User configuration test completed"