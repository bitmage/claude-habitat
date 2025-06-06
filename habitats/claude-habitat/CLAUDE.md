# PLACEHOLDER - CLAUDE.md (Not Used)

**Note: This file is ignored and not used in the claude-habitat development environment.**

The claude-habitat habitat has `disable_habitat_instructions: true` in its config.yaml, 
which means this CLAUDE.md file is intentionally ignored. Instead, Claude uses the 
system-wide CLAUDE.md and shared CLAUDE.md files.

## Why it's disabled:
- Prevents overwriting the main project's CLAUDE.md with habitat-specific instructions
- Allows developers to work on Claude Habitat itself without instruction conflicts
- Maintains the standard /workspace structure without habitat-specific overrides

## What Claude uses instead:
- `/workspace/habitat/system/CLAUDE.md` - System infrastructure instructions
- `/workspace/habitat/shared/CLAUDE.md` - User preferences and development practices  
- `/workspace/CLAUDE.md` - Main project instructions (if it exists)

This file exists only as documentation and as a placeholder in the habitat structure.