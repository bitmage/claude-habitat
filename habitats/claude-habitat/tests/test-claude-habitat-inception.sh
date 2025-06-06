#!/bin/bash
# Inception test for claude-habitat: Test claude-habitat from within claude-habitat

set -e

echo "=== Claude Habitat Inception Test ==="
echo "Testing claude-habitat functionality from within claude-habitat container"

# Verify we're in the right environment
if [ ! -f /src/claude-habitat.js ]; then
    echo "❌ ERROR: Not in claude-habitat environment - missing /src/claude-habitat.js"
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "❌ ERROR: Docker not available"
    exit 1
fi

echo "✅ Environment check passed"

# Test that claude-habitat can run from within the container
echo ""
echo "Testing claude-habitat inception: running base --system tests from within claude-habitat"

cd /src

# Run the inception test: claude-habitat test base --system
echo "Running: ./claude-habitat test base --system"
./claude-habitat test base --system

if [ $? -eq 0 ]; then
    echo "✅ Inception test passed: Successfully ran base --system tests from within claude-habitat"
else
    echo "❌ Inception test failed: Could not run base --system tests"
    exit 1
fi

echo ""
echo "=== Inception Test Complete ==="