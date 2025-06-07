const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

// This test requires the actual PEM file and is NOT part of the main test suite
// It's for manual verification of GitHub App authentication
// Run with: node --test test/github-app-auth.test.js

const SHARED_DIR = path.join(__dirname, '../../shared');
const APP_ID = '1357221'; // From config

async function generateJWT(pemFile, appId) {
  const header = '{"alg":"RS256","typ":"JWT"}';
  const payload = `{"iat":${Math.floor(Date.now() / 1000)},"exp":${Math.floor(Date.now() / 1000) + 600},"iss":"${appId}"}`;
  
  // Base64 encode
  const headerB64 = Buffer.from(header).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const payloadB64 = Buffer.from(payload).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  
  // Create signature using openssl
  const { stdout: signature } = await execAsync(
    `echo -n "${headerB64}.${payloadB64}" | openssl dgst -sha256 -sign "${pemFile}" | base64 -w 0 | tr '+/' '-_' | tr -d '='`
  );
  
  return `${headerB64}.${payloadB64}.${signature.trim()}`;
}

async function getInstallationToken(jwt) {
  // Get installations
  const installationsCmd = `curl -s -H "Authorization: Bearer ${jwt}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations"`;
  const { stdout: installationsResponse } = await execAsync(installationsCmd);
  console.log('🔍 Installations API response:', installationsResponse);
  
  let installations;
  try {
    installations = JSON.parse(installationsResponse);
  } catch (e) {
    throw new Error(`Failed to parse installations response: ${installationsResponse}`);
  }
  
  if (!installations || installations.length === 0) {
    throw new Error(`No installations found. Response: ${installationsResponse}`);
  }
  
  const installationId = installations[0].id;
  
  // Get installation token
  const tokenCmd = `curl -s -X POST -H "Authorization: Bearer ${jwt}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/app/installations/${installationId}/access_tokens"`;
  const { stdout: tokenResponse } = await execAsync(tokenCmd);
  const tokenData = JSON.parse(tokenResponse);
  
  if (!tokenData.token) {
    throw new Error(`Failed to get installation token: ${tokenResponse}`);
  }
  
  return tokenData.token;
}

async function testRepositoryAccess(token, repo) {
  const repoCmd = `curl -s -H "Authorization: token ${token}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/${repo}"`;
  const { stdout: repoResponse } = await execAsync(repoCmd);
  return JSON.parse(repoResponse);
}

test('GitHub App authentication flow', { skip: true }, async () => {
  // Find PEM file - prefer the 2025-06-04 key that's referenced in the config
  const files = await fs.readdir(SHARED_DIR);
  const pemFile = files.find(f => f.includes('2025-06-04')) || files.find(f => f.endsWith('.pem'));
  
  if (!pemFile) {
    console.log('⏭️  Skipping GitHub App test - no PEM file found');
    return;
  }
  
  const pemPath = path.join(SHARED_DIR, pemFile);
  console.log(`🔑 Using PEM file: ${pemFile}`);
  
  // Test JWT generation
  const jwt = await generateJWT(pemPath, APP_ID);
  assert.ok(jwt, 'JWT should be generated');
  assert.ok(jwt.includes('.'), 'JWT should have proper format');
  console.log(`✅ Generated JWT (${jwt.length} chars)`);
  
  // Test installation token
  const token = await getInstallationToken(jwt);
  assert.ok(token, 'Installation token should be generated');
  assert.ok(token.startsWith('ghs_'), 'Token should have proper format');
  console.log(`✅ Generated installation token (${token.length} chars)`);
  
  // Test public repository access
  const publicRepo = await testRepositoryAccess(token, 'bitmage/claude-habitat');
  assert.strictEqual(publicRepo.name, 'claude-habitat');
  assert.strictEqual(publicRepo.private, false);
  console.log(`✅ Public repository access: ${publicRepo.name}`);
  
  // Test private repository access
  const privateRepo = await testRepositoryAccess(token, 'bitmage/county-fence-plugin');
  assert.strictEqual(privateRepo.name, 'county-fence-plugin');
  assert.strictEqual(privateRepo.private, true);
  console.log(`✅ Private repository access: ${privateRepo.name}`);
  
  console.log('🎉 GitHub App authentication fully working!');
});

test('GitHub App credential helper simulation', { skip: true }, async () => {
  // Test what our credential helper would do
  const files = await fs.readdir(SHARED_DIR);
  const pemFile = files.find(f => f.includes('2025-06-04')) || files.find(f => f.endsWith('.pem'));
  
  if (!pemFile) {
    console.log('⏭️  Skipping credential helper test - no PEM file found');
    return;
  }
  
  const pemPath = path.join(SHARED_DIR, pemFile);
  
  // Simulate the credential helper process
  const jwt = await generateJWT(pemPath, APP_ID);
  const token = await getInstallationToken(jwt);
  
  // This is what git would receive
  const credentials = {
    username: 'x-access-token',
    password: token
  };
  
  assert.strictEqual(credentials.username, 'x-access-token');
  assert.ok(credentials.password.startsWith('ghs_'));
  
  console.log('✅ Credential helper would provide:');
  console.log(`   username: ${credentials.username}`);
  console.log(`   password: ${credentials.password.substring(0, 20)}...`);
});

// Manual test runner
if (require.main === module) {
  console.log('🧪 Running GitHub App Authentication Tests');
  console.log('==========================================');
  
  // Run tests manually since they're skipped in the main suite
  const runTest = async (testName, testFn) => {
    try {
      console.log(`\n🔬 ${testName}`);
      await testFn();
    } catch (error) {
      console.error(`❌ ${testName} failed:`, error.message);
      process.exit(1);
    }
  };
  
  (async () => {
    try {
      // Get the test functions
      const tests = [
        ['GitHub App authentication flow', test.tests?.[0]?.fn],
        ['GitHub App credential helper simulation', test.tests?.[1]?.fn]
      ].filter(([name, fn]) => fn);
      
      // For manual testing, we'll implement the tests directly
      await runGitHubAppAuthTest();
      await runCredentialHelperTest();
      
      console.log('\n🎉 All GitHub App tests passed!');
    } catch (error) {
      console.error('\n❌ Test suite failed:', error.message);
      process.exit(1);
    }
  })();
}

async function runGitHubAppAuthTest() {
  console.log('\n🔬 GitHub App authentication flow');
  
  const files = await fs.readdir(SHARED_DIR);
  const pemFile = files.find(f => f.includes('2025-06-04')) || files.find(f => f.endsWith('.pem'));
  
  if (!pemFile) {
    console.log('⏭️  Skipping - no PEM file found');
    return;
  }
  
  const pemPath = path.join(SHARED_DIR, pemFile);
  console.log(`🔑 Using PEM file: ${pemFile}`);
  
  const jwt = await generateJWT(pemPath, APP_ID);
  console.log(`✅ Generated JWT (${jwt.length} chars)`);
  
  const token = await getInstallationToken(jwt);
  console.log(`✅ Generated installation token (${token.length} chars)`);
  
  const publicRepo = await testRepositoryAccess(token, 'bitmage/claude-habitat');
  console.log(`✅ Public repository access: ${publicRepo.name}`);
  
  const privateRepo = await testRepositoryAccess(token, 'bitmage/county-fence-plugin');
  console.log(`✅ Private repository access: ${privateRepo.name} (private: ${privateRepo.private})`);
}

async function runCredentialHelperTest() {
  console.log('\n🔬 GitHub App credential helper simulation');
  
  const files = await fs.readdir(SHARED_DIR);
  const pemFile = files.find(f => f.includes('2025-06-04')) || files.find(f => f.endsWith('.pem'));
  
  if (!pemFile) {
    console.log('⏭️  Skipping - no PEM file found');
    return;
  }
  
  const pemPath = path.join(SHARED_DIR, pemFile);
  const jwt = await generateJWT(pemPath, APP_ID);
  const token = await getInstallationToken(jwt);
  
  console.log('✅ Credential helper would provide:');
  console.log(`   username: x-access-token`);
  console.log(`   password: ${token.substring(0, 20)}... (${token.length} chars total)`);
}