# Claude Code Instructions for Discourse Development

You are running in a completely isolated Docker container with a full copy of the Discourse codebase. This container is completely sandboxed from the host system.

## Environment

- **Working Directory**: `/src` (isolated copy of Discourse codebase)
- **Ruby**: Available via `ruby` and `rails`
- **Node/NPM**: Available for JavaScript development  
- **PostgreSQL**: Dedicated database instance for this container only
- **Redis**: Dedicated Redis instance for this container only
- **Git**: Configured and ready for commits
- **GitHub CLI**: Available as `gh` for creating PRs
- **Complete Isolation**: No access to host files, other containers, or shared resources

## Development Workflow

1. **Make Changes**: Edit files as needed, they're isolated from the host
2. **Run Tests**: Use `bin/rspec` for Ruby tests, `yarn test` for JS tests
3. **Commit Changes**: Use meaningful commit messages
4. **Create PR**: Use `gh pr create` to submit your changes

## Discourse-Specific Guidelines

### Running Tests
```bash
# Run all tests for a specific file
bin/rspec spec/models/user_spec.rb

# Run a specific test
bin/rspec spec/models/user_spec.rb:123

# Run JavaScript tests
yarn test
```

### Common Rails Commands
```bash
# Run Rails console
bin/rails c

# Run migrations
bin/rails db:migrate

# Start Rails server (if needed)
bin/rails s
```

### Code Style
- Follow existing patterns in the codebase
- Use RuboCop for Ruby: `bin/rubocop`
- Use ESLint for JavaScript: `yarn eslint`
- Ensure all tests pass before creating PR

### Creating Pull Requests

Always create PRs from feature branches:
```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Make your changes and commit
git add .
git commit -m "Clear description of changes"

# Create PR
gh pr create --title "Feature: Your feature" --body "Description of changes"
```

## Important Notes

- You're working in a completely isolated container with dedicated database/Redis
- Changes do NOT affect the host filesystem or other containers
- All changes should be submitted via GitHub PRs
- The container is ephemeral - it's destroyed when you exit
- GitHub authentication is configured via environment variables
- Each Claude session gets its own unique, isolated environment

## Available Tools

- **Rails**: Full Rails environment with all gems installed
- **PostgreSQL**: Database is accessible
- **Redis**: Cache and background jobs
- **Node/Yarn**: For JavaScript development
- **Git/GitHub CLI**: For version control and PR creation