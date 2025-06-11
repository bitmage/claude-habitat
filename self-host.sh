#!/bin/bash
# Self-hosting script for claude-habitat
# Runs Claude inside claude-habitat for testing and development

set -e

# Show help if requested
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    cat << EOF
Usage: $0 [prompt]

Self-hosting script for claude-habitat - runs Claude inside claude-habitat.

Arguments:
  prompt    Optional prompt to send to Claude. If provided, runs in non-interactive mode.

Examples:
  $0                              # Interactive Claude session
  $0 "What is my environment?"    # Run with specific prompt

EOF
    exit 0
fi

if [ $# -eq 0 ]; then
    # No arguments - run interactive Claude
    echo "Starting self-hosted Claude in claude-habitat (interactive mode)..."
    script -qec "./claude-habitat start claude-habitat --cmd \"claude --dangerously-skip-permissions\""
else
    # Argument provided - treat as prompt
    prompt="$1"
    echo "Starting self-hosted Claude in claude-habitat with prompt..."
    script -qec "./claude-habitat start claude-habitat --cmd \"claude --dangerously-skip-permissions -p '$prompt'\"" /dev/null
fi