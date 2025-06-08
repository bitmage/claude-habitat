# PLACEHOLDER - CLAUDE.md (Not Used)

**Note: This file is ignored and not used in the claude-habitat development environment.**

The claude-habitat habitat has `bypass_habitat_construction: true` in its config.yaml,
which means this CLAUDE.md file is intentionally ignored. Instead, Claude uses the
system-wide CLAUDE.md and shared CLAUDE.md files.

## Why it's disabled:
- The file structure is different in this habitat, and all the system/shared stuff
    would be looking in the wrong places
- We have access to the full repository, so the tools are here just at different paths
- Prevents overwriting the main project's CLAUDE.md with habitat-specific instructions
- Allows multiple Claudes to work on Claude Habitat itself without file conflicts
- Maintains the standard /workspace structure without habitat-specific overrides

This file exists only as documentation and as a placeholder in the habitat structure.
