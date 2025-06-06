#!/bin/bash
# Test Discourse environment setup
# Validates that Discourse development environment is working

set -e

# Load TAP helpers
source /claude-habitat/system/tools/tap-helpers.sh

tap_start 7

# Test basic Discourse directory structure
tap_has_dir "/src" "Discourse source directory exists"
tap_has_file "/src/Gemfile" "Discourse Gemfile exists"
tap_has_file "/src/package.json" "Discourse package.json exists"

# Test Ruby environment
if command -v ruby >/dev/null 2>&1; then
    tap_ok "Ruby is available"
else
    tap_not_ok "Ruby is available" "Ruby not found in PATH"
fi

# Test bundle command
if command -v bundle >/dev/null 2>&1; then
    tap_ok "Bundler is available"
else
    tap_not_ok "Bundler is available" "Bundle command not found"
fi

# Test Rails console accessibility (non-interactive check)
if [ -f "/src/bin/rails" ]; then
    tap_ok "Rails executable is available"
else
    tap_not_ok "Rails executable is available" "/src/bin/rails not found"
fi

# Test PostgreSQL connectivity
if command -v psql >/dev/null 2>&1; then
    if pg_isready -q 2>/dev/null; then
        tap_ok "PostgreSQL is running and accessible"
    else
        tap_not_ok "PostgreSQL is running and accessible" "pg_isready failed"
    fi
else
    tap_not_ok "PostgreSQL is running and accessible" "psql command not found"
fi

tap_diag "Discourse setup test completed"