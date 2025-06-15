/**
 * @module types
 * @description Domain model and type definitions for Claude Habitat
 * 
 * This file serves as the living documentation of our domain concepts.
 * Start here to understand what Claude Habitat does and how it's organized.
 * All domain terminology and concepts are documented in this file.
 * 
 * ## Design Intent
 * 
 * 1. **Classes should be kept thin** with only constructors and validation
 * 2. **Validation should be used consistently** throughout the codebase, especially 
 *    at API/CLI entry points to ensure data integrity
 * 3. **Creating validation elsewhere** within the codebase should be frowned upon 
 *    if it could instead be done here
 * 
 * @requires module:config - Configuration loading and validation
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - All unit tests: `npm test`
 * - Type validation: `npm test -- test/unit/types.test.js`
 * - Domain concepts: `npm test -- test/unit/claude-habitat.test.js`
 */

// ============================================================================
// COMPLETE DOMAIN MODEL
// ============================================================================

/*
 * Two Types of Claude
 * 
 * "Meta" Claude (mclaude)
 * - Where: Runs locally on your host machine
 * - Purpose: Manages Claude Habitat itself - maintenance, creating new habitats, troubleshooting
 * - Access: Has access to your entire Claude Habitat installation
 * - Documentation: Uses files in claude/ directory
 * - Implementation: src/scenes/maintenance.scene.js
 * - Examples: ./claude-habitat add, ./claude-habitat maintain, ./claude-habitat --clean
 * 
 * "Habitat" Claude (hclaude)
 * - Where: Runs inside the isolated Docker container  
 * - Purpose: Works on your actual development projects
 * - Access: Only sees the project code and development environment
 * - Documentation: Uses assembled CLAUDE.md from system/shared/habitat sources
 * - Implementation: Container operations in src/habitat.js, src/container-operations.js
 * - Examples: Writing code, creating PRs, debugging applications within development environment
 */

/*
 * Directory Structure & Ownership
 * Implementation: File operations in src/filesystem.js, path resolution in src/utils.js
 * 
 * claude/ - "Meta" Claude Documentation
 * - Audience: "Meta" Claude (local execution only)
 * - Content: Maintenance guides, troubleshooting, habitat creation instructions  
 * - Container: Never copied to container
 * - Implementation: src/scenes/maintenance.scene.js
 * 
 * system/ - Infrastructure
 * - Audience: "Habitat" Claude (and managed by Claude Habitat)
 * - Content: Base instructions, development tools, system configuration
 * - Container: Copied to /workspace/claude-habitat/system/
 * - Implementation: Tool management in src/scenes/tools.scene.js
 * 
 * shared/ - User Preferences  
 * - Audience: "Habitat" Claude (configured by user)
 * - Content: Personal configs, SSH keys, user tools, personal "Habitat" Claude preferences
 * - Container: Copied to /habitat/shared/
 * - Implementation: User configuration loading in src/config.js
 * 
 * habitats/ - Project Environments
 * - Audience: "Habitat" Claude (configured per project)
 * - Content: Project-specific Dockerfiles, configs, and "Habitat" Claude instructions
 * - Container: Relevant files copied to /workspace/claude-habitat/
 * - Implementation: Habitat management in src/habitat.js
 */

/*
 * Key Concepts
 * 
 * Isolation
 * - "Meta" Claude: Can see and modify your entire Claude Habitat installation
 * - "Habitat" Claude: Completely isolated in Docker, can only see project and development environment
 * - Implementation: Container isolation in src/container-operations.js
 * 
 * Instructions Assembly
 * "Habitat" Claude receives a composed CLAUDE.md that combines:
 * 1. system/CLAUDE.md - Base environment and tools
 * 2. shared/claude.md - Your personal preferences
 * 3. habitats/PROJECT/claude.md - Project-specific instructions
 * - Implementation: Configuration assembly in src/config.js
 * 
 * Tools
 * - System tools (system/tools/) - Available to "Habitat" Claude in containers
 * - Meta tools - "Meta" Claude uses system tools when available for portability  
 * - User tools (shared/tools/) - Personal tools for "Habitat" Claude
 * - Implementation: Tool management in ToolSet class below, src/scenes/tools.scene.js
 */

/*
 * Architecture Patterns
 * Implementation: See claude-habitat.js for complete architectural overview
 * 
 * Composition (Three-Layer System)
 * The layered approach to building "Habitat" Claude's environment:
 * 1. Infrastructure Layer (system/) - Managed by Claude Habitat itself
 * 2. Preferences Layer (shared/) - Managed by User (you)  
 * 3. Project Layer (habitats/[project]/) - Managed per-project basis
 * - Implementation: Layer composition in src/config.js
 * 
 * Instructions Assembly  
 * The process of combining layers into a single CLAUDE.md for "Habitat" Claude
 * - Implementation: Configuration processing in src/config.js
 * 
 * Image Lifecycle
 * Base Image: The result of building the Dockerfile
 * Prepared Image: Base Image + repositories + tools + configuration
 * Cache Hash: Unique identifier for prepared images based on configuration content
 * - Implementation: Image operations in src/image-lifecycle.js, src/image-management.js
 * 
 * Execution Contexts
 * Host Context: Where "Meta" Claude operates (local machine)
 * Container Context: Where "Habitat" Claude operates (isolated Docker container)
 * - Implementation: Context management in src/habitat.js, src/container-operations.js
 * 
 * Repository Access Patterns
 * Development Repositories: Write access (can commit and push changes)
 * Dependency Repositories: Read access (clone and pull only)
 * - Implementation: Repository operations in src/github.js
 * 
 * Authentication Scopes  
 * Host Authentication: Used by "Meta" Claude for infrastructure operations
 * Container Authentication: Used by "Habitat" Claude for development work
 * - Implementation: Authentication setup in src/github.js
 * 
 * File Organization Patterns
 * Infrastructure Files (System): Uppercase CLAUDE.md for managed infrastructure
 * User Files (Shared & Habitat): Lowercase claude.md for user-managed content
 * - Implementation: File operations in src/filesystem.js
 * 
 * Operational Patterns
 * Habitat Creation: Process of defining a new development environment
 * Session Lifecycle: Standard flow for development work
 * Maintenance Operations: "Meta" Claude infrastructure management
 * - Implementation: Habitat creation in src/scenes/add-habitat.scene.js
 * - Session management in src/habitat.js
 * - Maintenance in src/scenes/maintenance.scene.js
 */

// ============================================================================
// CONCRETE DOMAIN CLASSES
// ============================================================================

/**
 * Habitat - A complete isolated development ecosystem
 * 
 * More than just a "container" or "configuration" - includes project code,
 * services, tools, environment, and instructions for development work.
 * 
 * Lifecycle: Creation → Build → Preparation → Session → Cleanup
 * 
 * Used by:
 * - src/habitat.js: Session management and lifecycle operations
 * - src/scenes/start-habitat.scene.js: Habitat startup workflows
 * - src/container-lifecycle.js: Container creation and management
 */
class Habitat {
  constructor(config) {
    this.name = config.name;
    this.description = config.description;
    this.config = config;
    this.configPath = config._configPath;
    this.environment = config._environment || {};
  }

  /**
   * Get the workspace directory where Habitat Claude operates
   */
  getWorkspace() {
    return this.config.container?.work_dir || this.environment.WORKDIR || '/workspace';
  }

  /**
   * Get repositories for active development (write access)
   */
  getDevelopmentRepositories() {
    return (this.config.repositories || []).filter(repo => 
      !repo.access || repo.access === 'write'
    );
  }

  /**
   * Get repositories for dependencies (read access)
   */
  getDependencyRepositories() {
    return (this.config.repositories || []).filter(repo => 
      repo.access === 'read'
    );
  }

  /**
   * Check if this habitat is valid for development
   */
  validate() {
    if (!this.name) throw new Error('Habitat must have a name');
    if (!this.config.container?.user) throw new Error('Habitat must specify container user');
    if (!this.getWorkspace()) throw new Error('Habitat must specify workspace directory');
    return true;
  }
}

/**
 * Session - The active period when Habitat Claude is working inside a container
 * 
 * Represents the runtime context where development work happens.
 * Start: Container launches → Active: Claude works → End: Container stops
 * 
 * Used by:
 * - src/habitat.js: Session orchestration and tracking
 * - src/container-lifecycle.js: Container state management
 * - src/scenes/start-habitat.scene.js: Session initiation
 */
class Session {
  constructor(habitat, containerId = null) {
    this.habitat = habitat;
    this.containerId = containerId;
    this.startTime = new Date();
    this.status = 'initializing';
  }

  /**
   * Mark session as active (container running, Claude working)
   */
  activate() {
    this.status = 'active';
    this.activatedAt = new Date();
  }

  /**
   * Mark session as completed (work finished, container stopping)
   */
  complete() {
    this.status = 'completed';
    this.completedAt = new Date();
  }

  /**
   * Get session duration in seconds
   */
  getDuration() {
    const endTime = this.completedAt || new Date();
    return Math.floor((endTime - this.startTime) / 1000);
  }

  /**
   * Check if session is currently active
   */
  isActive() {
    return this.status === 'active';
  }

  /**
   * Validate session state
   */
  validate() {
    if (!this.habitat) throw new Error('Session must have a habitat');
    if (!this.habitat.validate()) return false;
    return true;
  }
}

/**
 * Workspace - The prepared development space inside containers
 * 
 * Where Habitat Claude operates with project code, tools, and configuration.
 * Location: Usually /workspace or project-specific directory
 * 
 * Used by:
 * - src/filesystem.js: Workspace preparation and file operations
 * - src/habitat.js: Workspace setup during session creation
 * - src/container-lifecycle.js: Workspace initialization
 */
class Workspace {
  constructor(habitat, repositories = [], toolConfigs = {}) {
    this.habitat = habitat;
    this.basePath = habitat.getWorkspace();
    this.repositories = repositories;
    this.tools = new ToolSet(toolConfigs);
  }

  /**
   * Get path to a repository within the workspace
   */
  getRepositoryPath(repository) {
    return repository.path || `${this.basePath}/${repository.name}`;
  }

  /**
   * Get path to Claude Habitat infrastructure within workspace
   */
  getInfrastructurePath(component) {
    const validComponents = ['system', 'shared', 'local'];
    if (!validComponents.includes(component)) {
      throw new Error(`Invalid component: ${component}`);
    }
    return `${this.basePath}/claude-habitat/${component}`;
  }

  /**
   * Get all paths that should exist in a properly prepared workspace
   */
  getRequiredPaths() {
    const paths = [
      `${this.basePath}/CLAUDE.md`,
      this.getInfrastructurePath('system'),
      this.getInfrastructurePath('shared'), 
      this.getInfrastructurePath('local')
    ];

    // Add repository paths
    this.repositories.forEach(repo => {
      paths.push(this.getRepositoryPath(repo));
    });

    return paths;
  }

  /**
   * Validate workspace configuration
   */
  validate() {
    if (!this.habitat) throw new Error('Workspace must have a habitat');
    if (!this.basePath) throw new Error('Workspace must have a base path');
    if (!this.habitat.validate()) return false;
    return true;
  }
}

/**
 * Repository - Git repositories with access patterns
 * 
 * Represents both development repositories (write access) and dependency 
 * repositories (read access) needed for the habitat.
 * 
 * Used by:
 * - src/github.js: Repository access verification and operations
 * - src/filesystem.js: Repository cloning and setup
 * - src/habitat.js: Repository configuration during session setup
 */
class Repository {
  constructor(spec) {
    if (typeof spec === 'string') {
      spec = this.parseSpec(spec);
    }
    
    this.url = spec.url;
    this.path = spec.path;
    this.branch = spec.branch || 'main';
    this.access = spec.access || 'write';
    this.shallow = spec.shallow !== false; // Default to shallow clone
  }

  /**
   * Parse repository specification from string format
   * Format: URL:PATH[:BRANCH]
   */
  parseSpec(spec) {
    const parts = spec.split(':');
    if (parts.length < 2) {
      throw new Error(`Invalid repository spec: ${spec}. Format: URL:PATH[:BRANCH]`);
    }

    return {
      url: parts[0] + ':' + parts[1], // Rejoin URL that might contain ':'
      path: parts[2] || null,
      branch: parts[3] || 'main'
    };
  }

  /**
   * Get repository name from URL
   */
  getName() {
    const match = this.url.match(/\/([^\/]+?)(?:\.git)?$/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Check if this repository supports development (write access)
   */
  isDevelopment() {
    return this.access === 'write';
  }

  /**
   * Check if this repository is read-only dependency
   */
  isDependency() {
    return this.access === 'read';
  }

  /**
   * Get git clone command arguments
   */
  getCloneArgs() {
    const args = ['clone'];
    if (this.shallow) args.push('--depth', '1');
    if (this.branch !== 'main') args.push('--branch', this.branch);
    args.push(this.url, this.path);
    return args;
  }

  /**
   * Validate repository configuration
   */
  validate() {
    if (!this.url) throw new Error('Repository must have a URL');
    if (!this.path) throw new Error('Repository must have a path');
    if (!['read', 'write'].includes(this.access)) {
      throw new Error('Repository access must be "read" or "write"');
    }
    return true;
  }
}

/**
 * ToolSet - Development tools available in containers
 * 
 * Manages the tools that Habitat Claude can use for development work.
 * Tools are defined dynamically by system, shared, habitat configs.
 * 
 * Used by:
 * - src/scenes/tools.scene.js: Tool management and installation
 * - src/container-lifecycle.js: Tool setup during container creation
 * - src/filesystem.js: Tool availability verification
 */
class ToolSet {
  constructor(toolConfigs = {}) {
    this.systemTools = toolConfigs.system || [];
    this.sharedTools = toolConfigs.shared || [];
    this.habitatTools = toolConfigs.habitat || [];
    this.systemToolsPath = '/habitat/system/tools/bin';
    this.userToolsPath = '/habitat/shared/tools/bin';
  }

  /**
   * Get all available tools from all sources
   */
  getAllTools() {
    return [
      ...this.systemTools,
      ...this.sharedTools,
      ...this.habitatTools
    ];
  }

  /**
   * Get system-level tools (managed by Claude Habitat)
   */
  getSystemTools() {
    return this.systemTools;
  }

  /**
   * Get user-level tools (personal tools)
   */
  getUserTools() {
    return [...this.sharedTools, ...this.habitatTools];
  }

  /**
   * Get path to a specific tool
   */
  getToolPath(toolName) {
    // Check system tools first, then user tools
    if (this.systemTools.includes(toolName)) {
      return `${this.systemToolsPath}/${toolName}`;
    }
    return `${this.userToolsPath}/${toolName}`;
  }

  /**
   * Check if a tool is available
   */
  async isToolAvailable(toolName) {
    const { fileExists } = require('./utils');
    return await fileExists(this.getToolPath(toolName));
  }

  /**
   * Get install command for tools
   */
  getInstallCommand() {
    return `/workspace/claude-habitat/system/tools/install-tools.sh`;
  }

  /**
   * Validate tool configuration
   */
  validate() {
    if (!Array.isArray(this.systemTools)) {
      throw new Error('System tools must be an array');
    }
    if (!Array.isArray(this.sharedTools)) {
      throw new Error('Shared tools must be an array');
    }
    if (!Array.isArray(this.habitatTools)) {
      throw new Error('Habitat tools must be an array');
    }
    return true;
  }
}

/**
 * Image - Docker images used in the habitat lifecycle
 * 
 * Base Image: Clean OS + runtime + services
 * Prepared Image: Base + repositories + tools + configuration
 * 
 * Used by:
 * - src/image-lifecycle.js: Image building and caching operations
 * - src/image-management.js: Image cleanup and management
 * - src/habitat.js: Image selection during session creation
 */
class Image {
  constructor(config, type = 'base') {
    this.config = config;
    this.type = type; // 'base' or 'prepared'
    this.dockerfile = config.image?.dockerfile;
    this.tag = config.image?.tag;
    this.buildArgs = config.image?.build_args || [];
  }

  /**
   * Get the Docker tag for this image
   */
  getTag() {
    if (this.type === 'prepared') {
      return `${this.tag}-prepared`;
    }
    return this.tag;
  }

  /**
   * Get Docker build command arguments
   */
  getBuildArgs() {
    const args = ['build'];
    
    // Add build arguments
    this.buildArgs.forEach(arg => {
      args.push('--build-arg', arg);
    });

    // Add tag
    args.push('-t', this.getTag());

    // Add dockerfile path
    if (this.dockerfile) {
      args.push('-f', this.dockerfile);
    }

    return args;
  }

  /**
   * Generate cache hash for prepared images
   */
  generateCacheHash(extraRepositories = []) {
    const { calculateCacheHash } = require('./utils');
    return calculateCacheHash(this.config, extraRepositories);
  }

  /**
   * Check if this is a base or prepared image
   */
  isBase() {
    return this.type === 'base';
  }

  isPrepared() {
    return this.type === 'prepared';
  }

  /**
   * Validate image configuration
   */
  validate() {
    if (!this.tag) throw new Error('Image must have a tag');
    if (!['base', 'prepared'].includes(this.type)) {
      throw new Error('Image type must be "base" or "prepared"');
    }
    return true;
  }
}

/**
 * Configuration - Structured habitat configuration data
 * 
 * Represents the complete configuration for a habitat including
 * metadata, image settings, repositories, environment, and scripts.
 * 
 * Used by:
 * - src/config.js: Configuration loading and processing
 * - src/config-validation.js: Configuration validation
 * - src/habitat.js: Configuration application during setup
 */
class Configuration {
  constructor(data, configPath = null) {
    this.data = data;
    this.path = configPath;
    this.name = data.name;
    this.description = data.description;
    this.environment = data._environment || {};
  }

  /**
   * Get repositories as Repository objects
   */
  getRepositories() {
    return (this.data.repositories || []).map(repo => new Repository(repo));
  }

  /**
   * Get container configuration
   */
  getContainer() {
    return this.data.container || {};
  }

  /**
   * Get image configuration as Image object
   */
  getImage() {
    return new Image(this.data, 'base');
  }

  /**
   * Get prepared image configuration
   */
  getPreparedImage() {
    return new Image(this.data, 'prepared');
  }

  /**
   * Get environment variables
   */
  getEnvironment() {
    return this.environment;
  }


  /**
   * Get startup delay in seconds
   */
  getStartupDelay() {
    return this.getContainer().startup_delay || 0;
  }

  /**
   * Validate this configuration
   */
  validate() {
    const { validateHabitatConfig } = require('./config-validation');
    return validateHabitatConfig(this.data);
  }

  /**
   * Convert to Habitat object
   */
  toHabitat() {
    return new Habitat(this.data);
  }
}

// ============================================================================
// FACTORY FUNCTIONS FOR COMMON OPERATIONS
// ============================================================================

/**
 * Create a Habitat from configuration file
 */
async function createHabitatFromConfig(configPath) {
  const { loadHabitatEnvironmentFromConfig } = require('./config');
  const config = await loadHabitatEnvironmentFromConfig(configPath);
  return new Habitat(config);
}

/**
 * Create a Session for a habitat
 */
function createSession(habitat, containerId = null) {
  return new Session(habitat, containerId);
}

/**
 * Parse repository specification into Repository object
 */
function parseRepository(spec) {
  return new Repository(spec);
}

/**
 * Create a ToolSet from configuration objects
 */
function createToolSet(systemTools, sharedTools, habitatTools) {
  return new ToolSet({
    system: systemTools || [],
    shared: sharedTools || [],
    habitat: habitatTools || []
  });
}

module.exports = {
  Habitat,
  Session,
  Workspace,
  Repository,
  ToolSet,
  Image,
  Configuration,
  createHabitatFromConfig,
  createSession,
  parseRepository,
  createToolSet
};