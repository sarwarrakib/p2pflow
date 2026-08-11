#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { computeReleaseTreeSha256 } = require('../lib/releaseIntegrity');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    if (['node_modules','.git','dist','releases','shared'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
}
walk(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio:'pipe' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

const required = [
  'server.js','app-server.js','package.json','package-lock.json','public/index.html','public/js/pages/system-update.js',
  'lib/updateManager.js','lib/releaseIntegrity.js','lib/publicAssetMirror.js','lib/databaseProvider.js','lib/hostingSetup.js','lib/statePayloadCodec.js','lib/mysqlStateStore.js','lib/postgresStateStore.js',
  'scripts/build-release.js','scripts/build-unified-package.js','scripts/set-version.js','scripts/owner-email-recovery-code.js','scripts/public-asset-mirror-self-test.js','scripts/unified-supervisor-self-test.js',
  '.github/workflows/release.yml','.github/workflows/ci.yml','SET_NEXT_VERSION.bat','SET_HOTFIX_VERSION.bat'
];
for (const relative of required) if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing unified release file: ${relative}`);
if (String(pkg.version) !== String(lock.version) || String(pkg.version) !== String(lock.packages?.['']?.version)) throw new Error('package.json and package-lock.json versions do not match.');
if (!/^\d+\.\d+\.\d+$/.test(String(pkg.version))) throw new Error('Internal version must use SemVer x.y.z.');

const supervisor = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
for (const marker of ['main-thread-restart', 'ensureRootSnapshot(', 'CURRENT_POINTER', 'release-manifest.json', 'handleApplyRelease(', 'automatic rollback', 'app-server.js']) {
  if (!supervisor.includes(marker)) throw new Error(`Unified supervisor is missing marker: ${marker}`);
}
const app = fs.readFileSync(path.join(root, 'app-server.js'), 'utf8');
for (const marker of ['createStateStore({', 'createDatabaseBackup(', 'startSystemUpdateCheckLoop(', 'repositorySourceVersion()', 'hasSupervisorChannel()', 'supervisorSend(', 'beginSystemUpdateStage(', "url.pathname === '/api/session-step'", 'decodeOwnerSessionStepEnvelope(', "action === 'stage-status'", "action === 'permit'", "action === 'commit'", 'issueSystemUpdatePermit(', 'consumeSystemUpdatePermit(', 'syncManagedPublicMirrorFrom(__dirname)']) {
  if (!app.includes(marker)) throw new Error(`Application server is missing marker: ${marker}`);
}
if (app.includes('max-age=31536000, immutable')) throw new Error('Frontend application assets must not use immutable one-year caching.');
for (const marker of ["const appCodeAsset = ['.html','.js','.css'].includes(ext)", "'no-store, no-cache, must-revalidate, max-age=0'", "'X-P2PFlow-Version': APP_VERSION"]) {
  if (!app.includes(marker)) throw new Error(`Frontend cache-safety marker is missing: ${marker}`);
}
for (const forbidden of ['CRM_DB_PROVIDER=file','CRM_DB_FILE','0.0032','shared/email-recovery-code.txt']) {
  if (app.includes(forbidden)) throw new Error(`Application server contains forbidden legacy marker: ${forbidden}`);
}
const updater = fs.readFileSync(path.join(root, 'lib', 'updateManager.js'), 'utf8');
for (const marker of ['crypto.verify', 'releases?per_page=20', 'repositorySourceVersion()', 'validateTarEntries', 'computeReleaseTreeSha256(', 'app-server.js', 'packageBytes']) {
  if (!updater.includes(marker)) throw new Error(`Update manager is missing marker: ${marker}`);
}
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
for (const marker of ['UPDATE_SIGNING_PRIVATE_KEY','contents: write','gh release create','Version $VERSION was already used','npm test']) {
  if (!workflow.includes(marker)) throw new Error(`Release workflow is missing marker: ${marker}`);
}
const updateUi = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'system-update.js'), 'utf8');
for (const marker of ['systemUpdateStageStatusRequest(', 'waitForSystemUpdateStage(', "'/api/session-step'", 'systemUpdateEncodeEnvelope(', "'Content-Type':'text/plain;charset=UTF-8'", 'systemUpdateAuthorizedCommit(', 'Verifying...']) {
  if (!updateUi.includes(marker)) throw new Error(`System Update UI is missing WAF-safe staging marker: ${marker}`);
}
for (const forbidden of ['/api/system-update/apply', '/api/system-update/permit', '/api/system-update/commit', '/api/system-update/stage-status']) {
  if (updateUi.includes(forbidden)) throw new Error(`System Update UI must not call WAF-sensitive mutation path directly: ${forbidden}`);
}
const builder = fs.readFileSync(path.join(root, 'scripts', 'build-release.js'), 'utf8');
for (const marker of ["'app-server.js'", 'treeSha256', 'packageBytes', 'UPDATE_SIGNING_PRIVATE_KEY', "verificationProfile: 'signed-ci-runtime'", 'dependenciesBundled: false', "'SET_NEXT_VERSION.bat'", "'SET_HOTFIX_VERSION.bat'"]) {
  if (!builder.includes(marker)) throw new Error(`Release builder is missing marker: ${marker}`);
}
if (/['"]node_modules['"]/.test(builder.match(/const include = \[[\s\S]*?\];/)?.[0] || '')) {
  throw new Error('Signed update package must not bundle node_modules; shared hosting uses the already-installed root dependencies.');
}
if (!updater.includes("manifest.verificationProfile === 'signed-ci-runtime'")) throw new Error('Update manager is missing the shared-hosting fast verification profile.');
const unifiedBuilder = fs.readFileSync(path.join(root, 'scripts', 'build-unified-package.js'), 'utf8');
for (const marker of ['UNIFIED.zip','sensitive','shared','releases']) {
  if (!unifiedBuilder.includes(marker)) throw new Error(`Unified package builder is missing marker: ${marker}`);
}
const versionTool = fs.readFileSync(path.join(root, 'scripts', 'set-version.js'), 'utf8');
for (const marker of ['nextMinor(', 'nextPatch(', "requested === 'minor'", 'package-lock.json']) {
  if (!versionTool.includes(marker)) throw new Error(`Version tool is missing marker: ${marker}`);
}
const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
if (!index.includes('/js/pages/system-update.js?v=' + pkg.version)) throw new Error('System Update asset version does not match package version.');
const browserApp = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
for (const marker of ["nav.dataset.navigationModel = 'grouped-control-center'", `nav.dataset.uiRelease = '${pkg.version}'`, "NAV_MENU_GROUPS"]) {
  if (!browserApp.includes(marker)) throw new Error(`Grouped navigation runtime marker is missing: ${marker}`);
}
const style = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
for (const marker of ['premium control-center navigation visual refresh', '.nav-group[data-nav-group=\"accounting\"]', '#mobileBottomNav.mobile-bottom-nav']) {
  if (!style.includes(marker)) throw new Error(`Navigation visual refresh is missing marker: ${marker}`);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2pflow-integrity-'));
try {
  fs.writeFileSync(path.join(temp, 'a.txt'), 'a');
  const one = computeReleaseTreeSha256(temp);
  fs.writeFileSync(path.join(temp, 'a.txt'), 'b');
  const two = computeReleaseTreeSha256(temp);
  if (one.sha256 === two.sha256) throw new Error('Release tree hashing did not detect a modification.');
} finally { fs.rmSync(temp, { recursive:true, force:true }); }

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  packageMode:'unified',
  javascriptFiles:files.length,
  singlePackageFreshInstall:true,
  singlePackageManualUpdate:true,
  githubSignedUpdate:true,
  mainThreadSupervisor:true,
  automaticRollback:true,
  databaseBackupBeforeSwitch:true,
  sourceVersionPendingDetection:true
}, null, 2));
