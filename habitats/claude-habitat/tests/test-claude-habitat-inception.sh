#!/bin/bash
# Inception test: Run claude-habitat from within claude-habitat

# Simple approach without TAP helpers for now
echo "TAP version 13"
echo "1..1"

cd /workspace

echo "# Running self-hosted claude-habitat base system tests..."

# Use script -qec for proper TTY handling
set +e  # Don't exit on command failure
inner_output=$(script -qec "./claude-habitat test base --system" /dev/null 2>&1)
exit_code=$?
set -e  # Re-enable exit on error

# Show the actual output from the inner command
echo "=== INNER COMMAND OUTPUT ==="
echo "$inner_output"
echo "=== END INNER OUTPUT ==="

if [ $exit_code -eq 0 ]; then
    echo "ok 1 - Self-hosted claude-habitat can run base system tests"
else
    echo "not ok 1 - Self-hosted claude-habitat failed to run base system tests # Inner command failed with exit code $exit_code"
fi