Create a new git worktree for parallel development using the project's worktree script.

Please run: `./worktree add $ARGUMENTS`

This will:
- Create a new worktree at `../claude-habitat-$ARGUMENTS`
- Create the branch if it doesn't exist
- Set up an isolated development environment

After creation, the user should be instructed to:
1. Open a new terminal tab
2. `cd ../claude-habitat-$ARGUMENTS`
3. `claude` to start a fresh Claude session in that worktree

This follows Claude Code best practices for parallel development without merge conflicts.
