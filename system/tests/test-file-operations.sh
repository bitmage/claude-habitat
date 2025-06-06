#!/bin/bash
# Test file operations and directory structure
# Ensures the habitat file structure is set up correctly

set -e

# Load TAP helpers
source /claude-habitat/system/tools/tap-helpers.sh

tap_start 6

# Test basic directory structure
tap_has_dir "/claude-habitat" "Claude Habitat base directory exists"
tap_has_dir "/claude-habitat/system" "System directory exists"
tap_has_dir "/claude-habitat/shared" "Shared directory exists"

# Test work directory (should be set by environment)
if [ -n "$CLAUDE_HABITAT_WORKDIR" ]; then
    tap_has_dir "$CLAUDE_HABITAT_WORKDIR" "Work directory exists"
else
    tap_skip "Work directory exists" "CLAUDE_HABITAT_WORKDIR not set"
fi

# Test system tools are accessible
tap_has_dir "/claude-habitat/system/tools" "System tools directory exists"

# Test that we can create files in work directory (for Claude's scratch space)
if [ -n "$CLAUDE_HABITAT_WORKDIR" ] && [ -w "$CLAUDE_HABITAT_WORKDIR" ]; then
    if mkdir -p "$CLAUDE_HABITAT_WORKDIR/claude-habitat/scratch" 2>/dev/null; then
        tap_ok "Can create scratch directory in work area"
        rmdir "$CLAUDE_HABITAT_WORKDIR/claude-habitat/scratch" 2>/dev/null || true
    else
        tap_not_ok "Can create scratch directory in work area" "No write permission to $CLAUDE_HABITAT_WORKDIR"
    fi
else
    tap_skip "Can create scratch directory in work area" "Work directory not accessible"
fi

tap_diag "File operations test completed"