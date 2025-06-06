#!/bin/bash
# Test core system tools are available
# These are tools that should always be present in any habitat

set -e

# Load TAP helpers
source /claude-habitat/system/tools/tap-helpers.sh

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