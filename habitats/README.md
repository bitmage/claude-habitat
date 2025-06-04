# Habitats Directory

This directory contains Claude Habitat configurations. Each subdirectory represents a different development habitat.

## Structure

```
habitats/
├── discourse/              # Habitat name
│   ├── config.yaml         # Required: Main configuration
│   ├── Dockerfile          # Required: Container definition
│   ├── CLAUDE.md           # Optional: Claude instructions
│   └── files/              # Optional: Additional files to copy
│       ├── script.sh       # These files are copied to ${work_dir}/claude-habitat/
│       └── config.ini      # in the container during build
└── other-project/
    ├── config.yaml
    ├── Dockerfile
    └── setup.sql
```

## Required Files

- **config.yaml**: Main habitat configuration (repositories, setup commands, etc.)
- **Dockerfile**: Container definition starting from a base image

## Optional Files

- **CLAUDE.md**: Instructions that will be available to Claude inside the container
- **files/**: Directory whose contents are copied to `${work_dir}/claude-habitat/` in container
- Any other files in the habitat root (excluding *.md, .git*, config.*) are copied to `${work_dir}/claude-habitat/`

## Shared Files

Files in the `../shared/` directory are automatically copied to ALL habitats. This is useful for:
- GitHub App private keys
- SSH keys for repository access  
- Common scripts or configurations
- Shared utilities

See `../shared/README.md` for details.

## Usage

Start a habitat by name:
```bash
./claude-habitat discourse
```

List available habitats:
```bash
./claude-habitat --list-configs
```

## File Copying Behavior

During container build, the following files are copied:

1. **Shared files first**: All files from `../shared/` directory → `${work_dir}/claude-habitat/shared/` (no exclusions)
2. **Habitat files**: Files from the habitat directory → `${work_dir}/claude-habitat/`:
   - **files/ directory contents** (preserving structure)
   - **Other files in habitat root** (excluding config files and docs)

Habitat files can override shared files with the same relative path.

Where `${work_dir}` is the container's working directory (e.g., `/src` for discourse).

**Excluded from habitat copying:**
- Dockerfile
- config.yaml, config.yml  
- *.md files
- .git*, .gitignore

This allows you to include setup scripts, configuration templates, or other assets that your habitat needs, while sharing common files across all habitats.