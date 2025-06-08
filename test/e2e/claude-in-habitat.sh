#!/bin/bash

prompt="Take a look at your environment. You should be in the claude-habitat project with a git remote correctly set to bitmage/claude-habitat. Can you create a new feature branch 'test-push-from-habitat', add a file, push, and submit a pull request? If you succeed, then delete the pull request and the remote branch so that this test can be run in the future without orphan artifacts."

# Use printf to properly escape the prompt
escaped_prompt=$(printf '%q' "$prompt")

./claude-habitat start claude-habitat --cmd "claude --dangerously-skip-permissions -p $escaped_prompt"
