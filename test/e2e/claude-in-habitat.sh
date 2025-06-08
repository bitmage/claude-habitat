#!/bin/bash

#prompt="Print 'hi' when you first arrive.  Then take a look at your environment. You should be in the claude-habitat project with a git remote correctly set to bitmage/claude-habitat. Can you create a new feature branch 'test-push-from-habitat', add a file, push, and submit a pull request? If you succeed, then delete the pull request and the remote branch so that this test can be run in the future without orphan artifacts."
prompt="Print 'hi' when you first arrive.  Then take a look at your environment. You should be in the claude-habitat project with a git remote correctly set to bitmage/claude-habitat. Does it look like you have tools and credentials needed to push/pull and submit pull requests?"

# All three of these approaches work, but they take a long damn time (upwards of 1 minute) and don't output anything until they're done
exec ./claude-habitat start claude-habitat --tty --cmd "claude --dangerously-skip-permissions -p '$prompt'"
#exec < /dev/tty > /dev/tty 2>&1 ./claude-habitat start claude-habitat --cmd "claude --dangerously-skip-permissions -p '$prompt'"
#script -qec "./claude-habitat start claude-habitat --cmd \"claude --dangerously-skip-permissions -p '$prompt'\"" /dev/null
