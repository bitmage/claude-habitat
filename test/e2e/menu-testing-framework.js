const { spawn } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

/**
 * Framework for testing interactive menus in claude-habitat
 * Provides automated input simulation and intelligent menu comparison
 */
class MenuTestFramework {
  constructor() {
    this.snapshots = new Map();
    this.projectRoot = path.join(__dirname, '..', '..');
    this.claudeHabitatScript = path.join(this.projectRoot, 'claude-habitat.js');
  }

  /**
   * Capture menu output as snapshot with automated inputs
   */
  async captureMenuSnapshot(menuType, inputs = [], options = {}) {
    const startTime = Date.now();
    
    try {
      const result = await this.runInteractiveMenu(menuType, inputs, options);
      const duration = Date.now() - startTime;
      
      return {
        output: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        structure: this.parseMenuStructure(result.stdout),
        options: this.extractMenuOptions(result.stdout),
        timing: duration,
        success: result.exitCode === 0
      };
    } catch (err) {
      return {
        output: '',
        stderr: err.message,
        exitCode: 1,
        structure: null,
        options: [],
        timing: Date.now() - startTime,
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Run menu in automated mode with simulated user inputs
   */
  async runInteractiveMenu(menuType, inputs = [], options = {}) {
    return new Promise((resolve, reject) => {
      const args = this.buildMenuArgs(menuType);
      const timeout = options.timeout || 30000; // 30 second default
      
      const child = spawn('node', [this.claudeHabitatScript, ...args], {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...options.env }
      });

      let stdout = '';
      let stderr = '';
      let inputIndex = 0;
      let timeoutId;

      // Collect output
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // Auto-respond to prompts with our inputs
        if (this.isWaitingForInput(chunk) && inputIndex < inputs.length) {
          const input = inputs[inputIndex++];
          setTimeout(() => {
            child.stdin.write(input + '\n');
          }, 100); // Small delay to ensure prompt is ready
        }
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Set timeout
      if (timeout) {
        timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Menu test timed out after ${timeout}ms`));
        }, timeout);
      }

      // Handle completion
      child.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        
        resolve({
          exitCode: code,
          stdout,
          stderr
        });
      });

      child.on('error', (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(err);
      });

      // Send 'q' to quit if no inputs provided or after all inputs
      setTimeout(() => {
        if (inputs.length === 0 || inputIndex >= inputs.length) {
          child.stdin.write('q\n');
        }
      }, 1000);
    });
  }

  /**
   * Build command line arguments for specific menu type
   */
  buildMenuArgs(menuType) {
    switch (menuType) {
      case 'main':
        return []; // Default main menu
      case 'test':
        return ['test']; // Test menu
      case 'start':
        return ['start']; // Start menu
      default:
        return [];
    }
  }

  /**
   * Detect if the menu is waiting for user input
   */
  isWaitingForInput(output) {
    const inputIndicators = [
      'choice:',
      'Choice:',
      'Enter your choice',
      'Select an option',
      '>',
      '?',
      'Press any key',
      'Continue? (y/n)',
      'Proceed? (y/n)'
    ];
    
    return inputIndicators.some(indicator => 
      output.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Parse menu structure for intelligent comparison
   */
  parseMenuStructure(output) {
    if (!output) return null;
    
    return {
      title: this.extractTitle(output),
      options: this.extractOptions(output),
      instructions: this.extractInstructions(output),
      layout: this.analyzeLayout(output),
      hasQuitOption: output.toLowerCase().includes('quit') || output.toLowerCase().includes('exit'),
      hasBackOption: output.toLowerCase().includes('back'),
      promptText: this.extractPromptText(output)
    };
  }

  /**
   * Extract menu title from output
   */
  extractTitle(output) {
    const lines = output.split('\n');
    
    // Look for lines with "Claude Habitat" or similar patterns
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes('Claude Habitat') || 
          trimmed.includes('===') || 
          trimmed.match(/^[A-Z][a-z]+ [A-Z][a-z]+/)) {
        return trimmed;
      }
    }
    
    return '';
  }

  /**
   * Extract menu options from output
   */
  extractOptions(output) {
    const lines = output.split('\n');
    const options = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Look for numbered options, letters, or bracketed options
      if (trimmed.match(/^\d+[\.\)]\s/) ||           // 1. option
          trimmed.match(/^[a-zA-Z][\.\)]\s/) ||      // a. option
          trimmed.match(/^\[[a-zA-Z0-9]+\]/) ||      // [1] option
          trimmed.match(/^\([a-zA-Z0-9]+\)/)) {      // (1) option
        options.push(trimmed);
      }
    }
    
    return options;
  }

  /**
   * Extract menu options from output (alternative approach)
   */
  extractMenuOptions(output) {
    return this.extractOptions(output);
  }

  /**
   * Extract instructions or help text
   */
  extractInstructions(output) {
    const lines = output.split('\n');
    const instructions = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Look for instruction-like text
      if (trimmed.toLowerCase().includes('enter') ||
          trimmed.toLowerCase().includes('select') ||
          trimmed.toLowerCase().includes('choose') ||
          trimmed.toLowerCase().includes('press') ||
          trimmed.toLowerCase().includes('type')) {
        instructions.push(trimmed);
      }
    }
    
    return instructions;
  }

  /**
   * Extract the prompt text where user types input
   */
  extractPromptText(output) {
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('choice:') || 
          line.includes('Choice:') ||
          line.includes('>') ||
          line.includes('?')) {
        return line.trim();
      }
    }
    
    return '';
  }

  /**
   * Analyze overall layout characteristics
   */
  analyzeLayout(output) {
    const lines = output.split('\n');
    
    return {
      totalLines: lines.length,
      nonEmptyLines: lines.filter(line => line.trim().length > 0).length,
      hasBoxDrawing: output.includes('===') || output.includes('---') || 
                    output.includes('│') || output.includes('├'),
      hasColors: output.includes('\x1b[') || output.includes('\u001b['),
      indentationPattern: this.analyzeIndentation(lines),
      averageLineLength: lines.reduce((sum, line) => sum + line.length, 0) / lines.length
    };
  }

  /**
   * Analyze indentation patterns in the menu
   */
  analyzeIndentation(lines) {
    const indents = lines
      .filter(line => line.trim().length > 0)
      .map(line => line.length - line.trimStart().length);
    
    const uniqueIndents = [...new Set(indents)].sort((a, b) => a - b);
    
    return {
      levels: uniqueIndents.length,
      values: uniqueIndents,
      mostCommon: this.findMostCommon(indents)
    };
  }

  /**
   * Find most common value in array
   */
  findMostCommon(arr) {
    const counts = {};
    let maxCount = 0;
    let mostCommon = null;
    
    for (const item of arr) {
      counts[item] = (counts[item] || 0) + 1;
      if (counts[item] > maxCount) {
        maxCount = counts[item];
        mostCommon = item;
      }
    }
    
    return mostCommon;
  }

  /**
   * Compare two menu snapshots intelligently
   */
  compareMenus(snapshot1, snapshot2) {
    if (!snapshot1 || !snapshot2) {
      return {
        structureMatches: false,
        optionsMatch: false,
        layoutSimilar: false,
        differences: ['One or both snapshots missing']
      };
    }

    const differences = [];
    
    // Compare structure
    const structureMatches = this.compareStructure(snapshot1.structure, snapshot2.structure, differences);
    
    // Compare options
    const optionsMatch = this.compareOptions(snapshot1.options, snapshot2.options, differences);
    
    // Compare layout (allow some flexibility)
    const layoutSimilar = this.compareLayout(snapshot1.structure.layout, snapshot2.structure.layout, differences);
    
    return {
      structureMatches,
      optionsMatch,
      layoutSimilar,
      overallMatch: structureMatches && optionsMatch && layoutSimilar,
      differences
    };
  }

  /**
   * Compare menu structure elements
   */
  compareStructure(struct1, struct2, differences) {
    if (!struct1 || !struct2) {
      differences.push('Structure missing');
      return false;
    }

    let matches = true;

    // Compare titles (allow minor variations)
    if (struct1.title !== struct2.title) {
      if (!this.titlesSimilar(struct1.title, struct2.title)) {
        differences.push(`Title changed: "${struct1.title}" → "${struct2.title}"`);
        matches = false;
      }
    }

    // Compare key structural elements
    if (struct1.hasQuitOption !== struct2.hasQuitOption) {
      differences.push(`Quit option changed: ${struct1.hasQuitOption} → ${struct2.hasQuitOption}`);
      matches = false;
    }

    if (struct1.hasBackOption !== struct2.hasBackOption) {
      differences.push(`Back option changed: ${struct1.hasBackOption} → ${struct2.hasBackOption}`);
      matches = false;
    }

    return matches;
  }

  /**
   * Check if two titles are similar enough
   */
  titlesSimilar(title1, title2) {
    // Remove common variations
    const normalize = (title) => title
      .toLowerCase()
      .replace(/[=\-_\s]+/g, ' ')
      .trim();
    
    return normalize(title1) === normalize(title2);
  }

  /**
   * Compare menu options
   */
  compareOptions(options1, options2, differences) {
    if (options1.length !== options2.length) {
      differences.push(`Option count changed: ${options1.length} → ${options2.length}`);
      return false;
    }

    for (let i = 0; i < options1.length; i++) {
      if (!this.optionsSimilar(options1[i], options2[i])) {
        differences.push(`Option ${i + 1} changed: "${options1[i]}" → "${options2[i]}"`);
        return false;
      }
    }

    return true;
  }

  /**
   * Check if two options are similar enough
   */
  optionsSimilar(option1, option2) {
    // Extract the meaningful content, ignoring formatting
    const extractContent = (option) => option
      .replace(/^\d+[\.\)]\s*/, '')  // Remove number prefix
      .replace(/^[a-zA-Z][\.\)]\s*/, '')  // Remove letter prefix
      .replace(/^\[[^\]]+\]\s*/, '')  // Remove bracketed prefix
      .replace(/^\([^\)]+\)\s*/, '')  // Remove parenthetical prefix
      .trim()
      .toLowerCase();
    
    return extractContent(option1) === extractContent(option2);
  }

  /**
   * Compare layout characteristics (allow reasonable flexibility)
   */
  compareLayout(layout1, layout2, differences) {
    if (!layout1 || !layout2) {
      differences.push('Layout information missing');
      return false;
    }

    // Allow some variation in line counts (±20%)
    const lineCountVariation = Math.abs(layout1.totalLines - layout2.totalLines) / layout1.totalLines;
    if (lineCountVariation > 0.2) {
      differences.push(`Significant line count change: ${layout1.totalLines} → ${layout2.totalLines}`);
      return false;
    }

    // Check for major structural changes
    if (layout1.hasBoxDrawing !== layout2.hasBoxDrawing) {
      differences.push(`Box drawing changed: ${layout1.hasBoxDrawing} → ${layout2.hasBoxDrawing}`);
      return false;
    }

    return true;
  }

  /**
   * Save snapshot for future comparison
   */
  async saveSnapshot(name, snapshot) {
    this.snapshots.set(name, snapshot);
    
    // Could also save to disk for persistent baselines
    // const snapshotDir = path.join(this.projectRoot, 'test', 'snapshots');
    // await fs.writeFile(path.join(snapshotDir, `${name}.json`), JSON.stringify(snapshot, null, 2));
  }

  /**
   * Load previously saved snapshot
   */
  async loadSnapshot(name) {
    return this.snapshots.get(name) || null;
    
    // Could also load from disk
    // const snapshotPath = path.join(this.projectRoot, 'test', 'snapshots', `${name}.json`);
    // try {
    //   const content = await fs.readFile(snapshotPath, 'utf8');
    //   return JSON.parse(content);
    // } catch (err) {
    //   return null;
    // }
  }

  /**
   * Wait for a menu to be ready (useful for timing-sensitive tests)
   */
  async waitForMenuReady(timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const snapshot = await this.captureMenuSnapshot('main', [], { timeout: 2000 });
        if (snapshot.success && snapshot.options.length > 0) {
          return true;
        }
      } catch (err) {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return false;
  }
}

module.exports = { MenuTestFramework };