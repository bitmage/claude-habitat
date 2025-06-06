# File Processing Transparency - Execution Plan

## Overview
Improve file processing transparency by implementing approved structured file operations and standardizing tool installation across system, shared, and habitats.

## Approved Improvements

### 1. Tool Installation Scripts Enhancement ✅
**Current:** Hardcoded logic looking for `tools/install-tools.sh`
**Implement:** Structured setup commands in config.yaml files

**System (already exists):**
- `system/tools/install-tools.sh` ✅
- `system/tools/tools.yaml` ✅

**Shared (needs creation):**
- `shared/tools/install-tools.sh` (template)
- `shared/tools/tools.yaml` (empty, ready for user)
- `shared/tools/README.md` (instructions)

**Habitats (needs creation):**
- `habitats/base/tools/install-tools.sh` (template)
- `habitats/base/tools/tools.yaml` (empty, ready for user)
- `habitats/base/tools/README.md` (instructions)

### 2. CLAUDE.md File Assembly via Setup Script ✅
**Current:** Hardcoded concatenation logic in claude-habitat.js
**Implement:** Setup script in `system/config.yaml` to handle CLAUDE.md assembly

### 3. Static Environment Variables ✅
**Current:** Environment variables defined in habitat config.yaml
**Implement:** Document pattern, ensure no templating complexity

### 4. Docker Socket Mounting ✅
**Current:** No standardized way
**Implement:** Document pattern in base habitat, use when appropriate

## Not Implementing
- PEM Key Handling (keep current approach)
- User Aliases/Shell Config (pattern good, but not adding since not current)
- SSH Keys (pattern good, but not adding since not current)  
- Package Installation (too many variations, too much bloat)

## Implementation Tasks

### Task 1: Create Base Habitat Template
**Goal:** Standard template for new habitats with all patterns ready
**Location:** `habitats/base/`
**Files to create:**
```
habitats/base/
├── config.yaml (template with all patterns)
├── Dockerfile (generic template)
├── CLAUDE.md (template)
├── tools/
│   ├── install-tools.sh (executable template)
│   ├── tools.yaml (empty, ready for use)
│   └── README.md (instructions)
└── README.md (habitat template instructions)
```

### Task 2: Create Shared Tools Infrastructure
**Goal:** Ready-to-use tools infrastructure for user customization
**Location:** `shared/tools/`
**Files to create:**
```
shared/tools/
├── install-tools.sh (executable template)
├── tools.yaml (empty, ready for use)
└── README.md (instructions for user tools)
```

### Task 3: Update System Config for CLAUDE.md Assembly
**Goal:** Move CLAUDE.md concatenation logic to transparent setup script
**File:** `system/config.yaml`
**Action:** Add setup script that handles file assembly

### Task 4: Document Patterns in Base Habitat
**Goal:** Show examples of approved patterns
**Patterns to document:**
- Static environment variables
- Docker socket mounting (when appropriate)
- Tool installation
- File operations
- Setup commands

### Task 5: Update .habignore Files
**Goal:** Ensure tools directories aren't excluded inappropriately
**Files:** `system/.habignore`, `shared/.habignore`, `habitats/.habignore`

## File Structure After Implementation

```
claude-habitat/
├── system/
│   ├── config.yaml (enhanced with CLAUDE.md assembly)
│   ├── tools/ (existing)
│   └── ...
├── shared/
│   ├── config.yaml (existing)
│   ├── tools/ (NEW - user customization)
│   │   ├── install-tools.sh
│   │   ├── tools.yaml (empty)
│   │   └── README.md
│   └── ...
└── habitats/
    ├── base/ (NEW - template habitat)
    │   ├── config.yaml (template with all patterns)
    │   ├── Dockerfile
    │   ├── CLAUDE.md
    │   ├── tools/
    │   │   ├── install-tools.sh
    │   │   ├── tools.yaml (empty)
    │   │   └── README.md
    │   └── README.md
    ├── discourse/ (existing)
    └── ...
```

## Benefits

1. **Transparency:** All file operations visible in config.yaml files
2. **Consistency:** Same tools pattern across system/shared/habitats  
3. **User-Friendly:** Ready-to-use templates with clear instructions
4. **Maintainable:** Less hardcoded logic, more declarative configuration
5. **Extensible:** Base habitat template for easy new habitat creation

## Implementation Order

1. Create shared/tools infrastructure
2. Create base habitat template  
3. Update system/config.yaml for CLAUDE.md assembly
4. Update .habignore files
5. Test with discourse habitat
6. Document patterns and usage

## Success Criteria

- [ ] User can easily add tools to shared/tools following clear instructions
- [ ] New habitats can be created by copying habitats/base template
- [ ] CLAUDE.md assembly is transparent and configurable
- [ ] All file operations are visible in config.yaml files
- [ ] Tools installation works consistently across all levels
- [ ] Documentation is clear and self-explanatory