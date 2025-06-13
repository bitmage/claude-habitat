Remove a git worktree that was created for parallel development.

Please run: `./worktree rm $ARGUMENTS`

This will:
- Remove the worktree at `../claude-habitat-$ARGUMENTS`
- Ask for confirmation before deletion
- Optionally delete the associated branch

Make sure to exit any Claude sessions running in that worktree before removal.

Use `./worktree list` to see all current worktrees if you're unsure of the exact name.
