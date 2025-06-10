#!/bin/bash
# Habitat initialization script for claude-habitat
# This runs when the container starts, AFTER volume mounts are available

echo "Running habitat initialization..."

# Configure git for all locations (system, root, and current user)
if [ -f /workspace/shared/gitconfig ]; then
  # Copy to system-wide location (requires sudo)
  sudo cp /workspace/shared/gitconfig /etc/gitconfig
  # Copy to root user location (requires sudo)
  sudo cp /workspace/shared/gitconfig /root/.gitconfig
  # Copy to current user location (node user)
  cp /workspace/shared/gitconfig ~/.gitconfig
  echo "✅ Git configuration applied to all locations (/etc, /root, ~/.gitconfig)"
else
  echo "⚠️  No gitconfig found at /workspace/shared/gitconfig"
fi

# Ensure Claude credentials are available for current user (node)
if [ -f /home/node/.claude/.credentials.json ]; then
  # If running as node user, credentials should already be in the right place
  if [ "$(whoami)" = "node" ]; then
    echo "✅ Claude credentials available for node user"
  else
    # If running as different user, copy to current home
    mkdir -p ~/.claude
    cp /home/node/.claude/.credentials.json ~/.claude/.credentials.json
    chmod 600 ~/.claude/.credentials.json
    echo "✅ Claude credentials copied to $(whoami) user"
  fi
else
  echo "⚠️  No Claude credentials found at /home/node/.claude/.credentials.json"
fi

echo "Habitat initialization complete"

# Keep container running
while true; do 
  sleep 3600
done