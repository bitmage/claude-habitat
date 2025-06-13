/**
 * @module image-management
 * @description Docker image management utilities for Claude Habitat
 * 
 * Provides functions for listing, cleaning, and managing Docker images.
 * Handles habitat-specific image cleanup operations and provides image
 * summary information for maintenance operations.
 * 
 * @requires module:types - Domain model definitions
 * @requires module:container-operations - Docker execution operations
 * @see {@link claude-habitat.js} - System composition and architectural overview
 * 
 * @tests
 * - E2E tests: `npm run test:e2e -- test/e2e/rebuild-functionality.test.js`
 * - Run all tests: `npm test`
 */

const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
const { colors } = require('./utils');
const { dockerRun } = require('./container-operations');

/**
 * List all Claude Habitat Docker images
 * @returns {Promise<Array>} Array of image objects with repository, tag, imageId, created, size
 */
async function listClaudeHabitatImages() {
  try {
    const { stdout } = await execAsync('docker images --format "{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}" | grep "^claude-habitat-"');
    const images = stdout.trim().split('\n').filter(Boolean).map(line => {
      const [repoTag, imageId, created, size] = line.split('\t');
      const [repository, tag] = repoTag.split(':');
      return { repository, tag, imageId, created, size, repoTag };
    });
    return images;
  } catch (err) {
    // No images found or docker error
    return [];
  }
}

/**
 * List Claude Habitat images grouped by habitat
 * @returns {Promise<Object>} Object with habitat names as keys and arrays of images as values
 */
async function listImagesByHabitat() {
  const images = await listClaudeHabitatImages();
  const byHabitat = {};
  
  images.forEach(image => {
    // Extract habitat name from repository (claude-habitat-NAME)
    const match = image.repository.match(/^claude-habitat-(.+)$/);
    if (match) {
      const habitatName = match[1];
      if (!byHabitat[habitatName]) {
        byHabitat[habitatName] = [];
      }
      byHabitat[habitatName].push(image);
    }
  });
  
  return byHabitat;
}

/**
 * Clean all Claude Habitat Docker images
 * @returns {Promise<Object>} Result with removed count and freed space
 */
async function cleanAllImages() {
  console.log(colors.yellow('🧹 Cleaning all Claude Habitat Docker images...'));
  
  const images = await listClaudeHabitatImages();
  if (images.length === 0) {
    console.log('No Claude Habitat images found.');
    return { removed: 0, freedSpace: '0B' };
  }
  
  let removedCount = 0;
  const failures = [];
  
  for (const image of images) {
    try {
      console.log(`  Removing ${image.repoTag}...`);
      await dockerRun(['rmi', image.repoTag]);
      removedCount++;
    } catch (err) {
      console.log(colors.yellow(`  Warning: Could not remove ${image.repoTag}: ${err.message}`));
      failures.push({ image: image.repoTag, error: err.message });
    }
  }
  
  if (failures.length > 0) {
    console.log(colors.yellow(`\\n⚠️  ${failures.length} image(s) could not be removed:`));
    failures.forEach(f => {
      console.log(colors.yellow(`  - ${f.image}: ${f.error}`));
    });
  }
  
  console.log(colors.green(`\\n✅ Cleanup complete. Removed ${removedCount}/${images.length} image(s).`));
  return { removed: removedCount, total: images.length, failures };
}

/**
 * Clean images for a specific habitat
 * @param {string} habitatName - Name of the habitat
 * @returns {Promise<Object>} Result with removed count and freed space
 */
async function cleanHabitatImages(habitatName) {
  console.log(colors.yellow(`🧹 Cleaning Docker images for habitat: ${habitatName}`));
  
  const imagesByHabitat = await listImagesByHabitat();
  const habitatImages = imagesByHabitat[habitatName] || [];
  
  if (habitatImages.length === 0) {
    console.log(`No images found for habitat '${habitatName}'.`);
    return { removed: 0, freedSpace: '0B' };
  }
  
  let removedCount = 0;
  const failures = [];
  
  for (const image of habitatImages) {
    try {
      console.log(`  Removing ${image.repoTag}...`);
      await dockerRun(['rmi', image.repoTag]);
      removedCount++;
    } catch (err) {
      console.log(colors.yellow(`  Warning: Could not remove ${image.repoTag}: ${err.message}`));
      failures.push({ image: image.repoTag, error: err.message });
    }
  }
  
  if (failures.length > 0) {
    console.log(colors.yellow(`\\n⚠️  ${failures.length} image(s) could not be removed:`));
    failures.forEach(f => {
      console.log(colors.yellow(`  - ${f.image}: ${f.error}`));
    });
  }
  
  console.log(colors.green(`\\n✅ Cleanup complete for ${habitatName}. Removed ${removedCount}/${habitatImages.length} image(s).`));
  return { removed: removedCount, total: habitatImages.length, failures };
}

/**
 * Find and clean orphan images (images not referenced by any current habitat config)
 * @returns {Promise<Object>} Result with removed count
 */
async function cleanOrphanImages() {
  console.log(colors.yellow('🧹 Finding and cleaning orphan Claude Habitat images...'));
  
  // For now, implement a simple heuristic: clean images older than 7 days
  try {
    const { stdout } = await execAsync(`docker images --filter "dangling=false" --format "{{.Repository}}:{{.Tag}}\t{{.CreatedAt}}" | grep "^claude-habitat-"`);
    const lines = stdout.trim().split('\\n').filter(Boolean);
    
    const oldImages = [];
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    for (const line of lines) {
      const [repoTag, createdAt] = line.split('\\t');
      const createdDate = new Date(createdAt);
      
      if (createdDate < weekAgo) {
        oldImages.push(repoTag);
      }
    }
    
    if (oldImages.length === 0) {
      console.log('No orphan images found (images older than 7 days).');
      return { removed: 0 };
    }
    
    console.log(`Found ${oldImages.length} images older than 7 days:`);
    oldImages.forEach(img => console.log(`  - ${img}`));
    
    let removedCount = 0;
    for (const image of oldImages) {
      try {
        console.log(`  Removing ${image}...`);
        await dockerRun(['rmi', image]);
        removedCount++;
      } catch (err) {
        console.log(colors.yellow(`  Warning: Could not remove ${image}: ${err.message}`));
      }
    }
    
    console.log(colors.green(`\\n✅ Orphan cleanup complete. Removed ${removedCount}/${oldImages.length} image(s).`));
    return { removed: removedCount, total: oldImages.length };
    
  } catch (err) {
    console.log('No orphan images found.');
    return { removed: 0 };
  }
}

/**
 * Display a summary of Claude Habitat Docker images
 * @returns {Promise<void>}
 */
async function showImageSummary() {
  console.log(colors.green('\\n=== Claude Habitat Docker Images ===\\n'));
  
  const imagesByHabitat = await listImagesByHabitat();
  const totalImages = Object.values(imagesByHabitat).reduce((sum, images) => sum + images.length, 0);
  
  if (totalImages === 0) {
    console.log('No Claude Habitat images found.');
    return;
  }
  
  console.log(`Total images: ${totalImages}\\n`);
  
  for (const [habitatName, images] of Object.entries(imagesByHabitat)) {
    console.log(`${colors.yellow(habitatName)} (${images.length} image${images.length === 1 ? '' : 's'}):`);
    images.forEach(image => {
      console.log(`  ${image.repoTag} (${image.size}, ${image.created})`);
    });
    console.log('');
  }
}

module.exports = {
  listClaudeHabitatImages,
  listImagesByHabitat,
  cleanAllImages,
  cleanHabitatImages,
  cleanOrphanImages,
  showImageSummary
};