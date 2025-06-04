# Shared Directory

This directory contains files that are shared across all Claude Habitat environments. These files are automatically copied to `/tmp/claude-habitat-files/` in every container during build.

## Common Use Cases

### GitHub Authentication
Place your GitHub App private key here:
```
shared/
└── github-app-private-key.pem
```

### SSH Keys  
Place SSH keys for repository access:
```
shared/
├── id_rsa
├── id_rsa.pub
└── known_hosts
```

### Shared Scripts
Common setup or utility scripts used across environments:
```
shared/
├── setup-github-auth.sh
├── install-tools.sh
└── common-aliases.sh
```

### Configuration Templates
Shared configuration files or templates:
```
shared/
├── .gitconfig
├── .bashrc
└── tool-configs/
    ├── prettier.json
    └── eslint.json
```

## Copy Behavior

- **All files** in the shared directory are copied to `${work_dir}/claude-habitat/shared/` in every container
- **Directory structure** is preserved (subdirectories are copied recursively)
- **No exclusions** - unlike habitat directories, all files in shared/ are copied
- **Shared files are copied first**, then habitat-specific files (which can override shared files)

## Security Considerations

- Don't commit sensitive files like private keys to git
- Use `.gitignore` to exclude sensitive files
- Consider using environment variables for secrets when possible
- Set appropriate file permissions on sensitive files (e.g., `chmod 600` for private keys)

## Access from Containers

All shared files are available at `${work_dir}/claude-habitat/shared/` in containers:

```bash
# In a container (e.g., discourse with work_dir=/src):
ls ./claude-habitat/shared/
# Shows shared files

ls ./claude-habitat/
# Shows habitat-specific files

# Example: Use shared SSH key
cp ./claude-habitat/shared/id_rsa ~/.ssh/
chmod 600 ~/.ssh/id_rsa

# Example: Source shared aliases
source ./claude-habitat/shared/common-aliases.sh
```