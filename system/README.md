# Claude Habitat System Infrastructure

This directory contains the core Claude Habitat infrastructure managed by the system:

- **Tools**: Development tools available in all containers (`rg`, `fd`, `jq`, `yq`, `gh`, etc.)
- **Base instructions**: Foundation Claude instructions (`CLAUDE.md`)
- **System scripts**: Infrastructure utilities

Tools are installed as static binaries to work across all Linux distributions.

**Note**: This is system infrastructure. For personal tools and preferences, use the `shared/` directory.

## System Tools

The `tools/` subdirectory contains the managed development toolset that gets installed in every habitat. See `tools/README.md` for details on:

- Core tools (always installed)
- Optional tools 
- Adding new tools to the system
- Tool configuration

## System CLAUDE.md

The `CLAUDE.md` file contains base instructions that Claude receives in every habitat, including:

- Environment overview
- Available tools documentation  
- Standard workflows and patterns
- File organization guidelines

This gets combined with user preferences (`shared/CLAUDE.md`) and project-specific instructions (`habitats/*/CLAUDE.md`) to create the final instructions.

## Maintenance

System infrastructure is managed by Claude Habitat itself. Users should not need to modify files in this directory directly.

For customizations, use:
- `shared/` - Personal preferences and tools
- `habitats/*/` - Project-specific configurations