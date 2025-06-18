/**
 * @module phases
 * @description Build phase definitions for Claude Habitat progressive pipeline
 * 
 * Defines the standard 12-phase build lifecycle with execution order,
 * descriptions, and configuration section mappings for cache invalidation.
 * 
 * @see {@link module:build-lifecycle} - Phase execution pipeline
 * @see {@link module:phase-hash} - Hash calculation using phase config sections
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - Unit tests: `npm test -- test/unit/phases.test.js`
 * - Run all tests: `npm test`
 */

/**
 * Standard build phases for all habitat builds
 * 
 * These phases run in dependency order and create snapshots at each step.
 * Phases 10-11 (verify, test) don't create snapshots as they're validation-only.
 * But if phase 12-final exists, it means that (verify, test) succeeded.
 * 
 * Each phase includes:
 * - id: Numeric phase identifier for snapshot naming
 * - name: Phase name used in code and snapshots
 * - description: Human-readable description
 * - configSections: Config sections that affect this phase (for cache invalidation)
 */
const BUILD_PHASES = [
  { id: '1', name: 'base', description: 'Set base image', configSections: ['base_image', 'image', 'name'] },
  { id: '2', name: 'users', description: 'Create users and set permissions', configSections: ['env.USER', 'env.WORKDIR'] },
  { id: '3', name: 'env', description: 'Set environment variables', configSections: ['env'] },
  { id: '4', name: 'workdir', description: 'Create project work directory', configSections: ['env.WORKDIR', 'env.HABITAT_PATH', 'env.SYSTEM_PATH', 'env.SHARED_PATH', 'env.LOCAL_PATH'] },
  { id: '5', name: 'habitat', description: 'Create habitat directory structure', configSections: ['env.HABITAT_PATH', 'env.SYSTEM_PATH', 'env.SHARED_PATH', 'env.LOCAL_PATH'] },
  { id: '6', name: 'files', description: 'Copy files and mount volumes', configSections: ['files', 'volumes'] },
  { id: '7', name: 'repos', description: 'Clone repositories', configSections: ['repos'] },
  { id: '8', name: 'tools', description: 'Install habitat tools', configSections: ['tools'] },
  { id: '9', name: 'scripts', description: 'Run user-defined scripts', configSections: ['scripts'] },
  { id: '10', name: 'verify', description: 'Verify filesystem and permissions', configSections: ['verify-fs'] },
  { id: '11', name: 'test', description: 'Run habitat tests', configSections: ['tests'] },
  { id: '12', name: 'final', description: 'Set final configuration and command', configSections: ['entry'] }
];

/**
 * Get configuration sections relevant to a build phase
 * 
 * @param {string} phaseName - Name of the phase
 * @returns {string[]} - Array of config sections relevant to this phase
 */
function getPhaseConfigSections(phaseName) {
  const phase = BUILD_PHASES.find(p => p.name === phaseName);
  return phase ? phase.configSections : [];
}

/**
 * Find phase by ID or name
 * 
 * @param {string} phaseStr - Phase ID or name
 * @returns {number} - Phase index, or -1 if not found
 */
function findPhaseIndex(phaseStr) {
  for (let i = 0; i < BUILD_PHASES.length; i++) {
    if (BUILD_PHASES[i].id === phaseStr || BUILD_PHASES[i].name === phaseStr) {
      return i;
    }
  }
  return -1;
}

module.exports = {
  BUILD_PHASES,
  getPhaseConfigSections,
  findPhaseIndex
};
