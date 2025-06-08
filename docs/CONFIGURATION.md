# Configuration System

Claude Habitat uses a layered configuration system with environment variables as the coordination mechanism between system, shared, and habitat configurations.

## Configuration Loading Order

Configurations are processed in this sequence, with each layer able to reference variables from previous layers:

1. **System** (`system/config.yaml`) - Sets foundational infrastructure variables
2. **Shared** (`shared/config.yaml`) - Adds user-specific preferences and paths  
3. **Habitat** (`habitats/PROJECT/config.yaml`) - Project-specific configuration

Environment variables accumulate across all layers, with later configs able to reference earlier ones.

## Environment Variable Syntax

Two syntaxes are supported for referencing environment variables:

### Bash-Style Syntax: `${VAR}`
```yaml
environment:
  - WORKSPACE_PATH=${WORKDIR}/projects
  - PROJECT_PATH=${WORKSPACE_PATH}/myproject
```

### Claude Habitat Syntax: `{env.VAR}`
```yaml
files:
  - src: config.json
    dest: "{env.WORKSPACE_PATH}/config.json"
    
setup:
  user:
    commands:
      - cd "{env.PROJECT_PATH}" && npm install
```

## Required Environment Variables

These environment variables form the foundation of the Claude Habitat configuration system:

### Core Path Variables

**`WORKDIR`** - Main working directory for the habitat
- **Default**: `/workspace`
- **Purpose**: Primary container working directory where projects are located
- **Usage**: Base path for all other path variables
- **Override**: Each habitat can override with its own `WORKDIR` value

**`HABITAT_PATH`** - Claude Habitat infrastructure location  
- **Default**: `${WORKDIR}/claude-habitat`
- **Purpose**: Root directory for all Claude Habitat infrastructure within containers
- **Contains**: System tools, shared configs, and habitat-specific files

**`SYSTEM_PATH`** - System infrastructure directory
- **Default**: `${HABITAT_PATH}/system`  
- **Purpose**: Location of managed system tools and base configurations
- **Contains**: Development tools (`rg`, `fd`, `jq`, `yq`, `gh`), base configs

**`SHARED_PATH`** - User configuration directory
- **Default**: `${HABITAT_PATH}/shared`
- **Purpose**: Location of user-specific preferences and configurations
- **Contains**: Git configs, SSH keys, personal tools, user CLAUDE.md

**`LOCAL_PATH`** - Habitat-specific directory  
- **Default**: `${HABITAT_PATH}/local`
- **Purpose**: Location for habitat-specific temporary files and configs
- **Contains**: Session-specific files, temporary configurations

## Configuration Examples

### System Configuration
```yaml
# system/config.yaml
environment:
  - WORKDIR=/workspace
  - HABITAT_PATH=${WORKDIR}/claude-habitat
  - SYSTEM_PATH=${HABITAT_PATH}/system
  - SHARED_PATH=${HABITAT_PATH}/shared
  - LOCAL_PATH=${HABITAT_PATH}/local

container:
  work_dir: ${WORKDIR}
  user: root
```

### Habitat Configuration Override
```yaml
# habitats/discourse/config.yaml  
environment:
  - WORKDIR=/discourse  # Override system default
  - APP_PATH=${WORKDIR}/app
  - LOG_PATH=${WORKDIR}/logs

repositories:
  - url: https://github.com/discourse/discourse
    path: "{env.WORKDIR}"
    branch: main

setup:
  user:
    commands:
      - cd "{env.APP_PATH}" && bundle install
      - mkdir -p "{env.LOG_PATH}"
```

## Variable Reference Rules

1. **Sequential Processing**: Variables are processed in the order they appear within each config file
2. **Cross-Config References**: Variables from system and shared configs are available in habitat configs
3. **Self-Reference**: Variables can reference other variables defined earlier in the same config
4. **Override Capability**: Later configs can override variables from earlier configs

## Container Settings

The `container.work_dir` setting is automatically populated from the `WORKDIR` environment variable if not explicitly set. This ensures consistency between environment variables and container configuration.

## Best Practices

### Variable Naming
- Use `SCREAMING_SNAKE_CASE` for environment variables
- Use descriptive names that indicate purpose (`PROJECT_PATH` not `PATH1`)
- Prefix project-specific variables appropriately (`DISCOURSE_CONFIG_PATH`)

### Path Organization
- Always use absolute paths for container destinations
- Build complex paths from simpler base paths
- Use `WORKDIR` as the foundation for all project paths

### Configuration Structure
- Set foundational paths in system config
- Add user-specific paths in shared config  
- Define project-specific paths in habitat config
- Keep variable dependencies clear and minimal

## Troubleshooting

### Common Issues

**Missing `WORKDIR` Error**: Habitat configs that bypass system loading must define their own `WORKDIR`
```yaml
environment:
  - WORKDIR=/workspace  # Required for bypass mode
```

**Undefined Variable References**: Ensure referenced variables are defined in the same config or earlier configs
```yaml
environment:
  - BASE_PATH=/app
  - CONFIG_PATH=${BASE_PATH}/config  # BASE_PATH must be defined first
```

**Path Resolution Issues**: All container paths must be absolute
```yaml
# Wrong
container:
  work_dir: workspace  # Relative path

# Correct  
container:
  work_dir: /workspace  # Absolute path
```

### Variable Expansion Testing

Test variable expansion by examining the processed configuration:
```bash
# Run with debug output to see expanded variables
./claude-habitat --test-sequence="q" --preserve-colors
```

This comprehensive environment variable system ensures consistent, flexible configuration management across all Claude Habitat environments while maintaining clear separation of concerns between system infrastructure, user preferences, and project-specific requirements.