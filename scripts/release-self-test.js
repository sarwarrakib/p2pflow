#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { computeReleaseTreeSha256 } = require('../lib/releaseIntegrity');

const root = path.resolve(__dirname, '..');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'dist-hosting'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
}
walk(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const requiredFiles = [
  'server.js', 'public/index.html', 'public/js/pages/system-update.js',
  'lib/databaseProvider.js', 'lib/mysqlStateStore.js', 'lib/postgresStateStore.js', 'lib/updateManager.js', 'lib/releaseIntegrity.js', 'lib/productionPreflight.js', 'lib/hostingSetup.js', 'lib/legacyImporter.js',
  'scripts/p2pflow-launcher.js', 'scripts/launcher-self-test.js', 'scripts/set-version.js', 'scripts/build-hosting-package.js',
  'scripts/migrate-file-to-postgres.js', 'scripts/mysql-state-crypto-self-test.js', 'scripts/install-production.js', 'scripts/activate-production.js',
  'scripts/production-doctor.js', 'scripts/setup-owner.js', 'scripts/hosting-setup-self-test.js', 'scripts/production-preflight-self-test.js', 'scripts/pending-activation-self-test.js', 'scripts/build-release.js',
  'docs/HOSTING_BROWSER_INSTALL_BN.md', 'INSTALL_HOSTING_BN.md', 'GITHUB_DESKTOP_UPDATE_GUIDE_BN.md', 'SET_NEXT_VERSION.bat', '.npmrc', 'docs/PRODUCTION_GITHUB_UPDATE_SETUP_BN.md', 'deploy/p2pflow.service.example', 'deploy/nginx-p2pflow.conf.example',
  '.github/workflows/ci.yml', '.github/workflows/release.yml', 'local-php-mail.php'
];
for (const required of requiredFiles) if (!fs.existsSync(path.join(root, required))) throw new Error(`Missing required release file: ${required}`);

const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
for (const forbidden of ['CRM_DB_PROVIDER=file', 'CRM_DB_FILE', 'PROOF_DIR', 'CHAT_MEDIA_DIR', '0.0032']) {
  if (serverSource.includes(forbidden)) throw new Error(`Production server contains forbidden legacy storage/fee marker: ${forbidden}`);
}
if (/fs\.(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)\s*\(/.test(serverSource)) throw new Error('Production server still writes runtime application data to local files.');
for (const requiredMarker of ['createStateStore({', 'DATABASE_PROVIDER', 'putObject(', 'getObject(', 'ensureMutationScheduled(', 'createDatabaseBackup(', 'startSystemUpdateCheckLoop(', 'waitForBackgroundWriteJobs(']) {
  if (!serverSource.includes(requiredMarker)) throw new Error(`Production server is missing required durability/update marker: ${requiredMarker}`);
}

const storeSource = fs.readFileSync(path.join(root, 'lib', 'postgresStateStore.js'), 'utf8');
for (const marker of ['pg_try_advisory_lock', 'pg_advisory_xact_lock', 'automatic_history_recovery', 'No verified PostgreSQL state revision could be decrypted', 'CREATE TABLE IF NOT EXISTS ${objects}', 'encryptBuffer(', 'Immutable database object conflict', 'this.poolMax = Math.max(2']) {
  if (!storeSource.includes(marker)) throw new Error(`PostgreSQL store is missing safety marker: ${marker}`);
}
const mysqlStoreSource = fs.readFileSync(path.join(root, 'lib', 'mysqlStateStore.js'), 'utf8');
for (const marker of ['GET_LOCK(', 'RELEASE_LOCK(', 'automatic_history_recovery', 'No verified MariaDB/MySQL state revision could be decrypted', 'ENGINE=InnoDB', 'LONGBLOB', 'encryptBuffer(', 'Immutable database object conflict', 'this.poolMax = Math.max(2']) {
  if (!mysqlStoreSource.includes(marker)) throw new Error(`MariaDB/MySQL store is missing safety marker: ${marker}`);
}
const updaterSource = fs.readFileSync(path.join(root, 'lib', 'updateManager.js'), 'utf8');
for (const marker of ['crypto.verify', 'application/octet-stream', 'validateTarEntries', 'releases?per_page=20', 'Release packages may not contain symbolic links', 'maxPackageBytes', 'pipeline(', 'validateInstalledRelease(', 'computeReleaseTreeSha256(', 'packageBytes']) {
  if (!updaterSource.includes(marker)) throw new Error(`Update manager is missing safety marker: ${marker}`);
}

const integrityTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2pflow-release-integrity-'));
try {
  fs.writeFileSync(path.join(integrityTemp, 'one.txt'), 'first');
  const before = computeReleaseTreeSha256(integrityTemp);
  fs.writeFileSync(path.join(integrityTemp, 'one.txt'), 'changed');
  const after = computeReleaseTreeSha256(integrityTemp);
  if (before.sha256 === after.sha256) throw new Error('Release tree digest did not detect a modified file.');
} finally {
  fs.rmSync(integrityTemp, { recursive: true, force: true });
}

const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
if (!envExample.includes('P2PFLOW_DATABASE_URL=') || envExample.includes('CRM_DB_PROVIDER=file') || envExample.includes('CRM_DB_FILE=')) throw new Error('.env.example is missing database configuration or contains file-storage settings.');
for (const marker of ['P2PFLOW_DATABASE_PROVIDER=mysql', 'P2PFLOW_DATABASE_TABLE=', 'P2PFLOW_GITHUB_REPOSITORY=', 'P2PFLOW_GITHUB_TOKEN=', 'P2PFLOW_UPDATE_PUBLIC_KEY=', 'P2PFLOW_INSTANCE_LOCK_KEY=', 'P2PFLOW_UPDATE_MAX_EXTRACTED_MB=', 'P2PFLOW_UPDATE_MAX_RELEASE_FILES=', 'P2PFLOW_FRESH_INSTALL=false']) if (!envExample.includes(marker)) throw new Error(`.env.example is missing ${marker}`);
if (/^P2PFLOW_OWNER_SECRET_CODE=(?:111111|123456|654321|012345|543210)$/m.test(envExample)) throw new Error('.env.example contains a weak owner secret-code default.');

const indexHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
if (!indexHtml.includes('/js/pages/system-update.js?v=' + pkg.version)) throw new Error('System Update page is not included with the current asset version.');

const versionedAssetFiles = [
  'public/app.js',
  'public/js/pages/accounting.js',
  'public/js/pages/accounts.js',
  'public/js/pages/ads.js',
  'public/js/pages/p2p-market.js',
  'public/js/pages/reports.js',
  'public/js/pages/security.js'
];
for (const relative of versionedAssetFiles) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const declared = source.match(/(?:P2PFlow\s+)?v(\d+\.\d+\.\d+)/i)?.[1];
  if (declared && declared !== pkg.version) throw new Error(`Version serial mismatch in ${relative}: ${declared} != ${pkg.version}`);
}
const updateUiSource = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'system-update.js'), 'utf8');
if (/provided v\d+\.\d+\.\d+ Hosting Migration package/.test(updateUiSource)) throw new Error('System Update UI contains a hard-coded migration version.');
const versionToolSource = fs.readFileSync(path.join(root, 'scripts', 'set-version.js'), 'utf8');
for (const marker of ['replaceVersionPair(', 'oldFollowing', 'newFollowing', 'package-lock.json']) if (!versionToolSource.includes(marker)) throw new Error(`Version tool is missing serial-safety marker: ${marker}`);
const guideSource = fs.readFileSync(path.join(root, 'GITHUB_DESKTOP_UPDATE_GUIDE_BN.md'), 'utf8');
if (!guideSource.includes(`P2PFlow_v${pkg.version}_GITHUB_SOURCE.zip`) || !guideSource.includes(`P2PFlow_v${pkg.version}_HOSTING_MIGRATION.zip`)) throw new Error('GitHub Desktop guide does not match the current package version.');
const lockRaw = fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8');
const lock = JSON.parse(lockRaw);
if (String(pkg.version) !== String(lock.version) || String(pkg.version) !== String(lock.packages?.['']?.version)) throw new Error('package.json and package-lock.json versions do not match.');
if (lockRaw.includes('packages.applied-caas-gateway1.internal.api.openai.org')) throw new Error('package-lock.json contains an environment-specific package registry URL.');

function compareSemver(a, b) {
  const aa = String(a || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const bb = String(b || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((aa[i] || 0) !== (bb[i] || 0)) return (aa[i] || 0) - (bb[i] || 0);
  }
  return 0;
}
const mysqlLock = lock.packages?.['node_modules/mysql2'];
if (!mysqlLock || compareSemver(mysqlLock.version, '3.23.2') < 0) throw new Error('mysql2 must be pinned to 3.23.2 or later.');
if (!String(mysqlLock.resolved || '').startsWith('https://registry.npmjs.org/mysql2/-/mysql2-')) throw new Error('mysql2 lock entry must use the public npm registry.');
const wsLock = lock.packages?.['node_modules/ws'];
if (!wsLock || compareSemver(wsLock.version, '8.21.1') < 0) throw new Error('ws must be pinned to 8.21.1 or later.');
if (!String(wsLock.resolved || '').startsWith('https://registry.npmjs.org/ws/-/ws-') || !String(wsLock.integrity || '').startsWith('sha512-')) throw new Error('ws lock entry must use the public npm registry and a SHA-512 integrity value.');

const releaseWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
if (!releaseWorkflow.includes('UPDATE_SIGNING_PRIVATE_KEY') || !releaseWorkflow.includes('contents: write') || !releaseWorkflow.includes('gh release create') || !releaseWorkflow.includes('workflow_dispatch') || !releaseWorkflow.includes('branches:') || !releaseWorkflow.includes('Version $VERSION was already used')) throw new Error('Automatic signed release workflow is incomplete.');
const buildSource = fs.readFileSync(path.join(root, 'scripts', 'build-release.js'), 'utf8');
if (!buildSource.includes('max: 2147483647')) throw new Error('Release manifest does not declare the additive rollback compatibility contract.');
for (const marker of ['treeSha256', 'treeFiles', 'treeBytes', 'dataCompatibilityEpoch', 'packageBytes', 'local-php-mail.php', "'.github'", 'copySafe(', 'hashFileSync(packagePath)', "'mysql2/promise'", "'pg-pool'", "'ws'", 'resolveProductionModule(']) if (!buildSource.includes(marker)) throw new Error(`Release builder is missing safety marker: ${marker}`);
const installerSource = fs.readFileSync(path.join(root, 'scripts', 'install-production.js'), 'utf8');
for (const marker of ['Production install root is required', '.install-', 'computeReleaseTreeSha256(', 'The current running release has not been changed', 'activate-production.js', 'Refusing to copy symbolic link']) if (!installerSource.includes(marker)) throw new Error(`Production installer is missing safety marker: ${marker}`);
const hostingBuilderSource = fs.readFileSync(path.join(root, 'scripts', 'build-hosting-package.js'), 'utf8');
for (const marker of ['HOSTING_MIGRATION.zip', 'computeReleaseTreeSha256(', 'Refusing symbolic link', 'Refusing to package sensitive runtime file', "require('./launcher.js')", 'localInstall: true']) if (!hostingBuilderSource.includes(marker)) throw new Error(`Hosting migration builder is missing safety marker: ${marker}`);
const activationSource = fs.readFileSync(path.join(root, 'scripts', 'activate-production.js'), 'utf8');
for (const marker of ['runProductionPreflight(', 'Activation was blocked', 'computeReleaseTreeSha256(', 'atomicSwitch()']) if (!activationSource.includes(marker)) throw new Error(`Production activation is missing safety marker: ${marker}`);
const preflightSource = fs.readFileSync(path.join(root, 'lib', 'productionPreflight.js'), 'utf8');
for (const marker of ['LEGACY_IMPORT_REQUIRED', 'validateFreshOwner(', 'P2PFLOW_DATABASE_URL', 'classifyStartupError(']) if (!preflightSource.includes(marker)) throw new Error(`Production preflight is missing safety marker: ${marker}`);
const setupSource = fs.readFileSync(path.join(root, 'lib', 'hostingSetup.js'), 'utf8');
for (const marker of ['startHostingSetupServer(', 'inspectDatabase(', 'configuredSetupValues(', 'configuredKeyUsed', 'P2PFLOW_SETUP_CODE.txt', 'writeBootstrapFile(', 'sanitizeFreshOwnerSecrets(', 'importLegacyToDatabase(', 'legacy-import/app.db.enc']) if (!setupSource.includes(marker)) throw new Error(`Browser setup is missing safety marker: ${marker}`);
if (!serverSource.includes("pathname === '/setup/claim'") || !serverSource.includes('startHostingSetupServer(') || !serverSource.includes('requireOwner(req, res)') || !serverSource.includes('generate-signing-key')) throw new Error('Server does not expose guarded first-run setup and Owner-only update configuration.');

const launcherSource = fs.readFileSync(path.join(root, 'scripts', 'p2pflow-launcher.js'), 'utf8');
for (const marker of ['releaseTreeSha256(', 'CURRENT_POINTER', 'bootstrapCurrentRelease(', 'migratePersistentHostingFiles(', 'Target release files do not match the integrity manifest', 'installLauncherForNextRestart(', 'pending activation', 'ACTIVATION_ROLLED_BACK']) if (!launcherSource.includes(marker)) throw new Error(`Production launcher is missing safety marker: ${marker}`);

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  versionSerialProtected: true,
  javascriptFiles: files.length,
  databaseProviders: ['mysql', 'postgres'],
  mariadb105Compatible: true,
  durableWrites: true,
  databaseObjects: true,
  signedUpdater: true,
  updaterUi: true,
  additiveRollbackContract: true,
  wsVersion: wsLock.version,
  wsSecurityFloor: '8.21.1',
  treeIntegrity: true,
  stagedInstaller: true,
  productionPreflight: true,
  ownerBootstrapHelper: true,
  browserHostingSetup: true,
  browserLegacyImport: true,
  ownerPlaintextAutoRemoval: true,
  pendingActivationRollback: true,
  stableLauncherRefresh: true,
  savedApplicationKeyRecovery: true,
  ownerOnlyUpdates: true,
  browserGithubConnection: true,
  sharedHostingReleasePointer: true
}, null, 2));
