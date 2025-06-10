#!/bin/bash
# Inception test for claude-habitat: Test claude-habitat from within claude-habitat

set -e

echo "=== Claude Habitat Inception Test ==="
echo "Testing claude-habitat functionality from within claude-habitat container"

# Verify we're in the right environment
WORKDIR=${WORKDIR:-/workspace}
if [ ! -f "$WORKDIR/claude-habitat" ]; then
    echo "❌ ERROR: Not in claude-habitat environment - missing $WORKDIR/claude-habitat"
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "❌ ERROR: Docker not available"
    exit 1
fi

# Check Docker socket accessibility
if ! docker ps >/dev/null 2>&1; then
    echo "❌ ERROR: Docker socket not accessible - checking permissions"
    ls -la /var/run/docker.sock || echo "Docker socket not found"
    echo "Container may need Docker socket mount and proper permissions"
    exit 1
fi

echo "✅ Environment check passed"

# Test that claude-habitat can run from within the container
echo ""
echo "Testing claude-habitat inception: running base --system tests from within claude-habitat"

cd "$WORKDIR"

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