# Discourse Development Environment

## Project Structure

- **Main application**: `/src/app/` - Discourse core
- **Plugins**: `/src/plugins/` - Plugin development area  
- **Admin**: `/src/app/assets/javascripts/admin/` - Admin interface
- **Tests**: `/src/spec/` (Ruby), `/src/test/javascripts/` (JS)
- **Database**: PostgreSQL with Redis for caching
- **Working Directory**: `/src` - Main Discourse codebase

## Discourse-Specific Tools

### Rails Commands
```bash
# Rails console (most important for debugging)
bin/rails c

# Run migrations
bin/rails db:migrate

# Generate migration
bin/rails generate migration AddFieldToModel field:type

# Start Rails server (usually not needed in development container)
bin/rails s
```

### Testing
```bash
# Run all tests for a file
bin/rspec spec/models/user_spec.rb

# Run specific test by line number
bin/rspec spec/models/user_spec.rb:123

# Run plugin tests
bin/rspec plugins/plugin-name/spec/

# JavaScript tests
yarn test

# Run specific JS test file
yarn test test/javascripts/acceptance/login-test.js
```

### Code Quality
```bash
# Ruby linting
bin/rubocop

# JavaScript linting  
yarn eslint

# Fix Ruby style issues automatically
bin/rubocop --auto-correct
```

## Plugin Development

### Plugin Structure
```
plugins/your-plugin/
├── plugin.rb              # Main plugin file
├── config/
│   └── locales/           # Translations
├── app/
│   ├── controllers/       # Controllers
│   ├── models/           # Models
│   └── serializers/      # API serializers
├── assets/
│   └── javascripts/      # Frontend code
└── spec/                 # Tests
```

### Common Plugin Tasks
```bash
# Create new plugin
bin/rails generate plugin plugin_name

# Enable plugin in development
echo "plugin_name" >> config/discourse.conf

# Plugin console access
bin/rails c
# Then: Plugin.find('plugin-name')

# Run plugin-specific tests
bin/rspec plugins/plugin-name/spec/
```

## Database Operations

### Common Queries
```bash
# Access PostgreSQL directly
psql discourse_development

# In Rails console
bin/rails c
User.count
Topic.where(created_at: 1.day.ago..).count
```

### Migrations
```bash
# Check migration status
bin/rails db:migrate:status

# Rollback last migration
bin/rails db:rollback

# Reset database (careful!)
bin/rails db:drop db:create db:migrate
```

## Development Tips

### Finding Code
```bash
# Find specific functionality (examples)
rg "def.*login" --type rb
rg "class.*Controller" app/controllers/
fd ".*user.*" app/models/

# Find frontend components
rg "@Component" assets/javascripts/
fd ".*component.*" assets/javascripts/
```

### Debugging
- Use `binding.pry` in Ruby code for breakpoints
- Check `log/development.log` for Rails logs
- Use browser dev tools for JavaScript debugging
- Rails console is your best friend: `bin/rails c`

### Common Patterns
- Controllers inherit from `ApplicationController`
- Models often use `ActiveRecord::Base`
- Use `current_user` for authentication context
- Check `app/serializers/` for API response formats