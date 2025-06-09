#!/bin/bash

#prompt="Print 'hi' when you first arrive.  Then take a look at your environment. You should be in the claude-habitat project with a git remote correctly set to bitmage/claude-habitat. Can you create a new feature branch 'test-push-from-habitat', add a file, push, and submit a pull request? If you succeed, then delete the pull request and the remote branch so that this test can be run in the future without orphan artifacts."
prompt="Print 'hi' when you first arrive.  Then take a look at your environment. You should be in the claude-habitat project with a git remote correctly set to bitmage/claude-habitat. Does it look like you have tools and credentials needed to push/pull and submit pull requests?"

# Alternative execution methods - try multiple approaches
# Method 1: Direct exec with --no-tty
#exec ./claude-habitat start claude-habitat --no-tty --cmd "claude --dangerously-skip-permissions -p '$prompt'"

# Method 2: Using docker exec directly (uncomment to try)
# ./claude-habitat start claude-habitat --cmd "docker exec -i \$(docker ps --filter name=claude-habitat --format '{{.Names}}' | head -1) /bin/bash -c 'cd /workspace && claude --dangerously-skip-permissions -p \"$prompt\"'"

# Method 3: Using script command for TTY emulation (uncomment to try)  
script -qec "./claude-habitat start claude-habitat --cmd \"claude --dangerously-skip-permissions -p '$prompt'\"" /dev/null
