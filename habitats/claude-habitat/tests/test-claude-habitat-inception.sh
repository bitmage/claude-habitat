#!/bin/bash
# Habitat Test: Claude-Habitat Inception (Self-Hosting)
# @fileoverview Validates that claude-habitat can run itself from within a habitat
# @description This inception test ensures that claude-habitat can successfully execute
#              its own test suite when running in a self-hosted environment, validating
#              the complete self-hosting capability and recursive functionality.
#
# This test represents the ultimate validation of claude-habitat's self-hosting
# capabilities - the ability to run and test itself from within its own containerized
# environment, ensuring complete bootstrapping and recursive operational capability.
#
# @tests
# - Run this test: ./habitats/claude-habitat/tests/test-claude-habitat-inception.sh
# - Run all claude-habitat tests: ./claude-habitat test claude-habitat
# - Run all tests: npm test
# - Related config: habitats/claude-habitat/config.yaml

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