# Base Habitat

This is a minimal habitat used for testing system and shared components.

## Purpose

The base habitat provides a clean environment to test:
- System infrastructure (tools, authentication, file operations)
- Shared user configuration
- Core functionality without application-specific dependencies

## Environment

- Minimal Ubuntu 22.04 container
- Basic tools: git, curl, jq, openssl
- Working directory: `/workspace`
- No application code or repositories