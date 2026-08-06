#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { computeReleaseTreeSha256 } = require('../lib/releaseIntegrity');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '');
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid package version: ${version}`);

const dist = path.join(root, 'dist-hosting');
const stage = path.join(dist, `P2PFlow_v${version}_HOSTING_MIGRATION`);
const releaseDir = path.join(stage, 'releases', version);
const archive = path.join(dist, `P2PFlow_v${version}_HOSTING_MIGRATION.zip`);
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
const manifest = {
  format: 1,
  product: 'p2pflow',
  dataCompatibilityEpoch: 1,
  version,
  tag: `v${version}`,
  node: '>=20.0.0',
  schema: { min: 25, max: 2147483647 },
  localInstall: true,
  treeSha256: tree.sha256,
  treeFiles: tree.fileCount,
  treeBytes: tree.totalBytes,
  installedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(releaseDir, '.release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });

const rootPackage = {
  name: 'p2pflow',
  version,
  private: true,
  description: 'P2PFlow stable managed-hosting launcher and shared production dependencies.',
  main: 'server.js',
  scripts: {
    start: 'node server.js',
    build: 'node --check server.js && node --check launcher.js'
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

const wrapper = `'use strict';\n\nconst path = require('path');\nprocess.env.P2PFLOW_INSTALL_ROOT = process.env.P2PFLOW_INSTALL_ROOT || __dirname;\nprocess.env.CRM_INSTALL_ROOT = process.env.CRM_INSTALL_ROOT || process.env.P2PFLOW_INSTALL_ROOT;\nprocess.env.P2PFLOW_ENV_FILE = process.env.P2PFLOW_ENV_FILE || path.join(__dirname, 'shared', '.env');\nprocess.env.CRM_ENV_FILE = process.env.CRM_ENV_FILE || process.env.P2PFLOW_ENV_FILE;\nrequire('./launcher.js');\n`;
fs.writeFileSync(path.join(stage, 'server.js'), wrapper);
fs.copyFileSync(path.join(root, 'scripts', 'p2pflow-launcher.js'), path.join(stage, 'launcher.js'));
try { fs.chmodSync(path.join(stage, 'launcher.js'), 0o755); } catch {}
fs.mkdirSync(path.join(stage, 'shared'), { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(stage, 'shared', 'README.txt'), 'Runtime .env, setup state, update cache and launcher pointers are stored here. Do not delete this folder after installation.\n');
fs.copyFileSync(path.join(root, 'GITHUB_DESKTOP_UPDATE_GUIDE_BN.md'), path.join(stage, 'GITHUB_DESKTOP_UPDATE_GUIDE_BN.md'));

const guide = `# P2PFlow v${version} Hosting Migration\n\n1. Back up the current Node Application Root and database.\n2. Do not delete the existing .env, .p2pflow or database.\n3. Extract the CONTENTS of this ZIP directly into the Node Application Root and overwrite code files.\n4. Use Node.js 20+, startup file server.js, run npm ci --omit=dev --ignore-scripts, then restart.\n5. Open /ready and confirm version ${version}.\n6. System Update should show Automatic update engine: Ready.\n\nThe launcher migrates an existing root .env and .p2pflow into shared/ without overwriting an already-migrated file.\n`;
fs.writeFileSync(path.join(stage, 'HOSTING_MIGRATION_README.md'), guide);

for (const file of [path.join(stage, 'server.js'), path.join(stage, 'launcher.js'), path.join(releaseDir, 'server.js')]) {
  const check = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (check.error) throw check.error;
  if (check.status !== 0) process.exit(check.status || 1);
}

const zip = spawnSync('zip', ['-q', '-r', archive, '.'], { cwd: stage, stdio: 'inherit' });
if (zip.error) throw zip.error;
if (zip.status !== 0) process.exit(zip.status || 1);
console.log(JSON.stringify({ ok: true, version, archive, releaseTreeSha256: tree.sha256, releaseFiles: tree.fileCount, releaseBytes: tree.totalBytes }, null, 2));
