#!/bin/bash
# System Test: File Operations and Directory Structure
# @fileoverview Validates the core habitat filesystem layout and access permissions
# @description This test ensures that the habitat file structure is set up correctly
#              and that Claude has proper access to required directories and can perform
#              basic file operations within its workspace.
#
# This test validates the foundational filesystem requirements for habitat operation,
# including proper directory structure, work area accessibility, and tool availability.
#
# @tests
# - Run this test: ./system/tests/test-file-operations.sh
# - Run all system tests: ./claude-habitat test --system
# - Run all tests: npm test
# - Related config: system/config.yaml

set -e

# Load TAP helpers from relative location
source "$(dirname "$(dirname "$(readlink -f "$0")")")/tools/tap-helpers.sh"

tap_start 6

# Use environment variables for paths
WORKDIR=${WORKDIR:-/workspace}
HABITAT_PATH=${HABITAT_PATH:-/workspace/habitat}
SYSTEM_PATH=${SYSTEM_PATH:-/workspace/habitat/system}
SHARED_PATH=${SHARED_PATH:-/workspace/habitat/shared}

# Test basic directory structure
tap_has_dir "$HABITAT_PATH" "Habitat base directory exists"
tap_has_dir "$SYSTEM_PATH" "System directory exists"
tap_has_dir "$SHARED_PATH" "Shared directory exists"

# Test work directory (should be set by environment)
tap_has_dir "$WORKDIR" "Work directory exists"

# Test system tools are accessible
tap_has_dir "$SYSTEM_PATH/tools" "System tools directory exists"

# Test that we can create files in work directory (for Claude's scratch space)
if [ -w "$WORKDIR" ]; then
    if mkdir -p "$WORKDIR/scratch" 2>/dev/null; then
        tap_ok "Can create scratch directory in work area"
        rmdir "$WORKDIR/scratch" 2>/dev/null || true
    else
        tap_not_ok "Can create scratch directory in work area" "No write permission to $WORKDIR"
    fi
else
    tap_skip "Can create scratch directory in work area" "Work directory not accessible"
fi

tap_diag "File operations test completed"