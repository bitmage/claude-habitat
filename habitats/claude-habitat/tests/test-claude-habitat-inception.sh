#!/bin/bash
# Inception test: Run claude-habitat from within claude-habitat

# Source TAP helpers for proper test reporting
source /workspace/system/tools/tap-helpers.sh

# Start TAP session
tap_start 1

cd /workspace

# Capture output from inner claude-habitat command 
tap_diag "Running self-hosted claude-habitat base system tests..."

# Run the command and capture both output and exit code
set +e  # Don't exit on command failure
output=$(./claude-habitat test base --system 2>&1)
exit_code=$?
set -e  # Re-enable exit on error

# Show the output for debugging
echo "$output"

if [ $exit_code -eq 0 ]; then
    tap_ok "Self-hosted claude-habitat can run base system tests"
else
    tap_not_ok "Self-hosted claude-habitat failed to run base system tests" "Inner command failed with exit code $exit_code"
fi