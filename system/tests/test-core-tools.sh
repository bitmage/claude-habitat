#!/bin/bash
# System Test: Core Tools Availability
# @fileoverview Tests for core system tools that should be available in all habitats
# @description Validates that essential development tools (rg, fd, jq, yq, gh) are properly
#              installed and accessible in the container environment.
#
# This test ensures the foundational toolset is available for Claude's development work
# across all habitat configurations.
#
# @tests
# - Run this test: ./system/tests/test-core-tools.sh
# - Run all system tests: ./claude-habitat test --system
# - Run all tests: npm test
# - Related config: system/config.yaml - System tool definitions

set -e

# Load TAP helpers from relative location
source "$(dirname "$(dirname "$(readlink -f "$0")")")/tools/tap-helpers.sh"

tap_start 8

# Test core development tools
tap_has_command "rg" "ripgrep (rg) is available"
tap_has_command "fd" "fd file finder is available" 
tap_has_command "jq" "jq JSON processor is available"
tap_has_command "yq" "yq YAML processor is available"

# Test git and related tools
tap_has_command "git" "git is available"
tap_has_command "curl" "curl is available"
tap_has_command "openssl" "openssl is available"

# Test GitHub CLI if installed
if command -v gh >/dev/null 2>&1; then
    tap_ok "GitHub CLI (gh) is available"
else
    tap_skip "GitHub CLI (gh) is available" "gh not installed (optional)"
fi

tap_diag "Core tools test completed"