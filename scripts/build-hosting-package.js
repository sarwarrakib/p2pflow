#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { computeReleaseTreeSha256 } = require('../lib/releaseIntegrity');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '');
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid package version: ${version}`);

const dist = path.join(root, 'dist-hosting');
const stage = path.join(dist, `P2PFlow_v${version}_HOSTING_READY`);
const releaseDir = path.join(stage, 'releases', version);
const archive = path.join(dist, `P2PFlow_v${version}_HOSTING_READY.zip`);
const excludes = new Set(['.git', 'node_modules', 'dist', 'dist-hosting', 'data', 'legacy-import', 'releases', 'shared', 'current', '.p2pflow', 'uploads', 'tmp', 'coverage']);
const forbiddenRuntimeFiles = new Set(['.env', 'P2PFLOW_SETUP_CODE.txt']);
const transientFilePattern = /(?:^\.DS_Store$|\.(?:log|pid|tmp)$)/i;

function assertNotSensitive(source, relative) {
  const name = path.basename(source);
  if (forbiddenRuntimeFiles.has(name) || /^\.env\..*\.local$/i.test(name) || /\.(?:pem|key)$/i.test(name)) {
    throw new Error(`Refusing to package sensitive runtime file: ${relative || name}`);
  }
}

function copySafe(source, destination, depth = 0, relative = '') {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${source}`);
  assertNotSensitive(source, relative);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(source)) {
      if ((depth === 0 && excludes.has(name)) || transientFilePattern.test(name)) continue;
      const childRelative = relative ? path.join(relative, name) : name;
      copySafe(path.join(source, name), path.join(destination, name), depth + 1, childRelative);
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`Unsupported file object: ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });
copySafe(root, releaseDir);

const tree = computeReleaseTreeSha256(releaseDir);
const criticalFiles = [
  'server.js',
  'package.json',
  'public/index.html',
  'public/app.js',
  'public/style.css',
  'public/js/pages/system-update.js',
  'lib/updateManager.js',
  'lib/databaseProvider.js',
  'lib/hostingSetup.js',
  'scripts/p2pflow-hosting-entry.js'
];
const bootstrapFiles = {};
for (const relative of criticalFiles) {
  const file = path.join(releaseDir, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Critical hosting file is missing: ${relative}`);
  const content = fs.readFileSync(file);
  bootstrapFiles[relative] = { size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') };
}
const manifest = {
  format: 2,
  product: 'p2pflow',
  dataCompatibilityEpoch: 1,
  version,
  tag: `v${version}`,
  node: '>=20.0.0',
  schema: { min: 25, max: 2147483647 },
  localInstall: true,
  bootstrapMode: 'critical-files',
  bootstrapFiles,
  treeSha256: tree.sha256,
  treeFiles: tree.fileCount,
  treeBytes: tree.totalBytes,
  installedAt: new Date().toISOString()
};
const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
fs.writeFileSync(path.join(releaseDir, '.release-manifest.json'), manifestJson, { mode: 0o600 });
fs.writeFileSync(path.join(releaseDir, 'release-manifest.json'), manifestJson, { mode: 0o600 });

const rootPackage = {
  name: 'p2pflow',
  version,
  private: true,
  description: 'P2PFlow shared-hosting same-process entry and production dependencies.',
  main: 'server.js',
  scripts: {
    start: 'node server.js',
    build: 'node --check server.js && node --check hosting-entry.js'
  },
  dependencies: pkg.dependencies,
  engines: pkg.engines
};
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(rootPackage, null, 2) + '\n');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
lock.name = 'p2pflow';
lock.version = version;
if (lock.packages && lock.packages['']) {
  lock.packages[''].name = 'p2pflow';
  lock.packages[''].version = version;
  lock.packages[''].description = rootPackage.description;
  lock.packages[''].dependencies = pkg.dependencies;
  lock.packages[''].engines = pkg.engines;
}
fs.writeFileSync(path.join(stage, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');

const wrapper = `'use strict';

const fs = require('fs');
const path = require('path');
process.env.P2PFLOW_INSTALL_ROOT = process.env.P2PFLOW_INSTALL_ROOT || __dirname;
process.env.CRM_INSTALL_ROOT = process.env.CRM_INSTALL_ROOT || process.env.P2PFLOW_INSTALL_ROOT;
const sharedEnv = path.join(__dirname, 'shared', '.env');
const rootEnv = path.join(__dirname, '.env');
process.env.P2PFLOW_ENV_FILE = process.env.P2PFLOW_ENV_FILE || (fs.existsSync(sharedEnv) ? sharedEnv : (fs.existsSync(rootEnv) ? rootEnv : sharedEnv));
process.env.CRM_ENV_FILE = process.env.CRM_ENV_FILE || process.env.P2PFLOW_ENV_FILE;
require('./hosting-entry.js');
`;
fs.writeFileSync(path.join(stage, 'server.js'), wrapper);
fs.copyFileSync(path.join(root, 'scripts', 'p2pflow-hosting-entry.js'), path.join(stage, 'hosting-entry.js'));
try { fs.chmodSync(path.join(stage, 'hosting-entry.js'), 0o755); } catch {}
// Keep the child-process launcher for VPS/backwards compatibility. Shared
// hosting starts through hosting-entry.js in the original startup process.
fs.copyFileSync(path.join(root, 'scripts', 'p2pflow-launcher.js'), path.join(stage, 'launcher.js'));
try { fs.chmodSync(path.join(stage, 'launcher.js'), 0o755); } catch {}
fs.mkdirSync(path.join(stage, 'shared'), { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(stage, 'shared', 'README.txt'), 'Runtime .env, setup state, update cache and launcher pointers are stored here. Do not delete this folder after installation.\n');
fs.copyFileSync(path.join(root, 'GITHUB_DESKTOP_UPDATE_GUIDE_BN.md'), path.join(stage, 'GITHUB_DESKTOP_UPDATE_GUIDE_BN.md'));

const guide = `# P2PFlow v${version} Hosting Ready

এই ZIP একবার Node Application Root-এ extract করুন। Existing .env, shared/ এবং database মুছবেন না।

Hosting settings:
- Node.js 20+
- Install: npm ci --omit=dev --ignore-scripts
- Build: npm run build
- Startup: server.js
- Start: npm start

Restart-এর পরে /ready খুলে version ${version} নিশ্চিত করুন। এরপর System Update page থেকে GitHub release Check Now -> Update Now ব্যবহার করুন। Update-এর আগে database backup স্বয়ংক্রিয়ভাবে তৈরি হবে।
`;
fs.writeFileSync(path.join(stage, 'HOSTING_READY_README_BN.md'), guide);
fs.writeFileSync(path.join(stage, 'DEPLOY_NOW_BN.txt'), `P2PFlow v${version}

1. ZIP content Node Application Root-এ extract করুন।
2. Existing .env, shared/ এবং database মুছবেন না।
3. npm ci --omit=dev --ignore-scripts
4. npm run build
5. Startup: server.js / Start: npm start
6. Restart করে /ready পরীক্ষা করুন।
7. ভবিষ্যৎ update: GitHub Desktop Push -> System Update -> Check Now -> Update Now.
`);
fs.writeFileSync(path.join(stage, 'PACKAGE_TYPE.txt'), `P2PFlow SHARED HOSTING READY\nVersion: ${version}\nStartup: server.js\nNode: 20+\n`);

for (const file of [path.join(stage, 'server.js'), path.join(stage, 'hosting-entry.js'), path.join(stage, 'launcher.js'), path.join(releaseDir, 'server.js')]) {
  const check = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (check.error) throw check.error;
  if (check.status !== 0) process.exit(check.status || 1);
}

const zip = spawnSync('zip', ['-q', '-r', archive, '.'], { cwd: stage, stdio: 'inherit' });
if (zip.error) throw zip.error;
if (zip.status !== 0) process.exit(zip.status || 1);
console.log(JSON.stringify({ ok: true, version, archive, releaseTreeSha256: tree.sha256, releaseFiles: tree.fileCount, releaseBytes: tree.totalBytes }, null, 2));
