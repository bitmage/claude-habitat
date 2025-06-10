# Self-Documenting Codebase Execution Plan

## Overview

Transform claude-habitat into a self-documenting codebase where each file contains or links to all necessary context for developers (human or AI) to work effectively.

## Core Principles

1. **Domain-Driven Documentation** - `src/types.js` becomes the canonical domain reference
2. **Locality of Reference** - Documentation lives with or is linked from the code
3. **Progressive Disclosure** - Start with purpose, link to details as needed
4. **Standards as Code** - Cross-cutting concerns in dedicated modules
5. **Test Linkage** - Every module links to its relevant tests

## Phase 1: Domain Foundation

### 1.1 Refactor claude-habitat.js Into Thin Router

**Current State**: 1000+ line file mixing routing, feature implementation, and interactive logic
**Target State**: ~100 line thin router that delegates to existing modules

**Work Required**:
- Move `loadConfigWithEnvironmentChain()` → `src/config.js`
- Move `addNewConfiguration()` → `src/scenes/add-habitat.scene.js` 
- Move `runToolsManagement()` + tool functions → `src/scenes/tools.scene.js`
- Move `runMaintenanceMode()` → `src/scenes/maintenance.scene.js`
- Remove inline interactive menu logic (already exists in `src/scenes/main-menu.scene.js`)
- Remove repository access checking (move to appropriate scene/module)
- Simplify `main()` to pure routing logic

**Responsibilities Remaining in claude-habitat.js**:
1. Process invocation detection (CLI vs interactive)
2. Top-level routing to `command-executor.js` or `scene-runner.js`
3. Fatal error handling and exit codes
4. Module entry point and exports

### 1.2 Create Comprehensive types.js

Create `src/types.js` as the living domain documentation:

```javascript
/**
 * @module types
 * @description Domain model and type definitions for claude-habitat
 * 
 * This file serves as the living documentation of our domain concepts.
 * Start here to understand what claude-habitat does and how it's organized.
 * 
 * @tests
 * - All unit tests: `npm test`
 * - Type validation: `npm test -- test/unit/types.test.js`
 */

// Domain classes with lightweight validation
export class Habitat { ... }
export class Session { ... }
export class Workspace { ... }
export class Repository { ... }
export class ToolSet { ... }
export class Image { ... }
```

### 1.3 Create Standards Modules

Establish cross-cutting concerns:
- `src/standards/path-resolution.js` - Host vs container path handling
- `src/standards/error-handling.js` - Error philosophy and patterns
- `src/standards/testing.js` - Testing approach and conventions
- `src/standards/ui-architecture.js` - Scene-based UI patterns

## Phase 2: Complete Module Documentation

### 2.1 Preamble Structure

Every module gets a JSDoc header with test links:

```javascript
/**
 * @module module-name
 * @description One-line purpose statement
 * 
 * Extended description if needed, explaining the module's role
 * in the system and any important design decisions.
 * 
 * @requires module:types - Domain model definitions
 * @requires module:standards/path-resolution - Path handling conventions
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/module-name.test.js`
 * - Integration tests: `npm run test:e2e -- test/e2e/module-feature.test.js`
 * - Run all tests: `npm test`
 */

// @see {@link module:standards/path-resolution}
const { rel } = require('./utils');
// @see {@link module:types#Habitat}
const { Habitat, Session } = require('./types');
```

### 2.2 Complete Module Coverage

**All modules will be documented** with proper preambles and test links:

#### Core Infrastructure (`src/`)
   - `cli.js` → `test/unit/main-entry-point.test.js`
   - `scenes/add-habitat.scene.js` → New scene for habitat creation
   - `scenes/tools.scene.js` → New scene for tools management  
   - `scenes/maintenance.scene.js` → New scene for maintenance mode
   - `cli-parser.js` → `test/unit/cli-commands.test.js`
   - `command-executor.js` → `test/unit/command-builders.test.js`
   - `config.js` → `test/unit/config-validation.test.js`
   - `config-validation.js` → `test/unit/config-validation.test.js`
   - `constants.js` → All unit tests (`npm test`)
   - `container-operations.js` → `test/e2e/claude-in-habitat.test.js`
   - `docker.js` → `test/e2e/build-failures.test.js`
   - `errors.js` → All tests (`npm test`)
   - `filesystem.js` → `test/unit/filesystem-verification.test.js`
   - `github.js` → `test/unit/github-pure.test.js`, `test/e2e/github-functions.test.js`
   - `habitat.js` → `test/unit/claude-habitat.test.js`
   - `image-lifecycle.js` → `test/e2e/rebuild-functionality.test.js`
   - `image-management.js` → `test/e2e/rebuild-functionality.test.js`
   - `init.js` → E2E tests (`npm run test:e2e`)
   - `menu.js` → `test/unit/menu.test.js`, `test/unit/tilde-menu.test.js`
   - `path-helpers.js` → `test/unit/path-helpers.test.js`
   - `testing.js` → All tests (`npm test`)
   - `utils.js` → `test/unit/verify-fs.test.js`

#### Scene System (`src/scenes/`)
   - `scene-runner.js` → UI tests (`npm run test:ui`)
   - `scene-context.js` → UI tests (`npm run test:ui`)
   - `add-habitat.scene.js` → UI tests (`npm run test:ui`)
   - `clean.scene.js` → `test/e2e/ui-verification.test.js`
   - `help.scene.js` → `test/e2e/ui-verification.test.js`
   - `initialize.scene.js` → E2E tests (`npm run test:e2e`)
   - `main-menu.scene.js` → `test/e2e/ui-verification.test.js`
   - `maintenance.scene.js` → UI tests (`npm run test:ui`)
   - `start-habitat.scene.js` → `test/e2e/claude-in-habitat.test.js`
   - `test-menu.scene.js` → `test/e2e/ui-verification.test.js`
   - `test-type.scene.js` → `test/e2e/ui-verification.test.js`
   - `tools.scene.js` → UI tests (`npm run test:ui`)

#### Test Files (`test/`)
   - All test files get preambles explaining what they test
   - Link to the modules they verify
   - Include commands to run specific test suites

## Phase 3: Documentation Migration

### 3.1 Content Mapping

Map existing documentation to new locations:

| Current Location | New Location | Action |
|-----------------|--------------|---------|
| `docs/TERMINOLOGY.md` | `src/types.js` | Merge into domain classes |
| `CLAUDE.md` path standards | `src/standards/path-resolution.js` | Extract and formalize |
| `CLAUDE.md` error philosophy | `src/standards/error-handling.js` | Extract and formalize |
| `CLAUDE.md` testing lifecycle | `src/standards/testing.js` | Extract and formalize |
| `claude/BEST_PRACTICES.md` | Various module preambles | Distribute to relevant files |
| `docs/ARCHITECTURE_REVIEW.md` | Module preambles + `src/standards/` | Distribute appropriately |

### 3.2 Complete Test Documentation

Add preambles to **all test files** explaining:
- What aspect of the system is being tested
- Testing approach used
- Links to relevant standards
- Commands to run the specific tests

#### Unit Test Files (`test/unit/`)
All files get documentation explaining their testing scope and commands.

#### E2E Test Files (`test/e2e/`)
All files get documentation explaining workflows tested and execution commands.

#### Habitat Test Files
- `habitats/*/tests/` files get preambles linking to habitat configs
- System tests in `system/tests/` get documentation

### 3.3 Create Navigation Aids

- Update `README.md` with "Where to Start" section
- Create `src/README.md` explaining module organization
- Create `src/standards/README.md` as index of standards
- Create `test/README.md` explaining test organization

## Phase 4: Tooling and Validation

### 4.1 JSDoc Generation

Add to `package.json`:
```json
{
  "scripts": {
    "docs": "jsdoc -c jsdoc.json",
    "docs:serve": "jsdoc -c jsdoc.json && http-server ./docs-output",
    "docs:check": "jsdoc -c jsdoc.json -t templates/silent"
  }
}
```

### 4.2 Documentation Linting

Create validation script to ensure:
- All modules have proper preambles
- All requires have @see comments where appropriate
- Domain references use proper JSDoc links

### 4.3 Archive Old Docs

Move superseded documentation to `docs/archive/` with a README explaining the new structure.

## Phase 5: Continuous Improvement

### 5.1 Developer Workflow

1. New modules must include proper preamble
2. Domain changes start in `types.js`
3. New standards go in `src/standards/`
4. PR template includes "Documentation updated?" checkbox

### 5.2 Success Metrics

- Developer can understand any module's purpose from its preamble
- Domain concepts are discoverable from types.js
- Standards are findable and linked from relevant code
- Generated docs provide useful navigation

## Implementation Checklist

### Phase 1: Foundation
- [ ] Refactor claude-habitat.js into thin router (~100 lines)
- [ ] Move feature implementations to appropriate scene files
- [ ] Move config logic to src/config.js
- [ ] Create comprehensive types.js with all domain classes
- [ ] Create standards modules (path-resolution, error-handling, testing, ui-architecture)
- [ ] Establish JSDoc patterns and test linkage format

### Phase 2: Complete Module Documentation
- [ ] Document all core infrastructure modules (19+ files in src/)
- [ ] Document all scene system modules (10+ files in src/scenes/)
- [ ] Add preambles with proper test links to every source file

### Phase 3: Migration and Test Documentation
- [ ] Migrate existing documentation content to new locations
- [ ] Document all unit test files (15+ files in test/unit/)
- [ ] Document all E2E test files (10+ files in test/e2e/)
- [ ] Document all habitat test files (system/tests/, habitats/*/tests/)
- [ ] Create navigation README files

### Phase 4: Tooling and Validation
- [ ] Set up JSDoc generation
- [ ] Create documentation validation scripts
- [ ] Archive superseded documentation
- [ ] Update developer workflow and PR templates
- [ ] Verify all modules have proper documentation

## Example Transformation

### Before
```javascript
const path = require('path');
const { execSync } = require('child_process');

function startHabitat(name) {
  // Implementation
}
```

### After
```javascript
/**
 * @module habitat-lifecycle
 * @description Manages habitat container lifecycle operations
 * 
 * Handles starting, stopping, and managing habitat sessions.
 * Ensures proper cleanup and state management.
 * 
 * @requires module:types - Domain model definitions
 * @requires module:standards/error-handling - Error recovery patterns
 */

const path = require('path');
const { execSync } = require('child_process');
// @see {@link module:types#Habitat}
const { Habitat, Session } = require('./types');
// @see {@link module:standards/path-resolution}
const { rel } = require('./utils');

/**
 * Starts a new habitat session
 * @param {string} name - Habitat identifier
 * @returns {Promise<Session>} Active session instance
 */
async function startHabitat(name) {
  // Implementation
}
```

## Timeline

- **Phase 1**: Foundation (router refactor + types.js + standards modules)
- **Phase 2**: Complete module documentation (all src/ files)
- **Phase 3**: Migration and complete test documentation
- **Phase 4**: Tooling and validation
- **Ongoing**: Maintain standards for new code

## Router Refactor Impact

The claude-habitat.js refactor will actually **reduce** total codebase size while improving organization:
- **Current**: 1000+ line monolithic file
- **New**: ~100 line router + 3 focused scene files (~200 lines each)
- **Net Effect**: -300 lines while separating concerns properly

This refactor enables the self-documenting approach by making each module's purpose clear and focused.