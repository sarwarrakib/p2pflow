#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { computeReleaseTreeSha256, hashFileSync } = require('../lib/releaseIntegrity');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dist = path.join(root, 'dist');
const stage = path.join(dist, `p2pflow-v${pkg.version}`);

function compareSemver(a, b) {
  const aa = String(a || '').split('.').map(part => Number.parseInt(part, 10) || 0);
  const bb = String(b || '').split('.').map(part => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < 3; index += 1) {
    if ((aa[index] || 0) !== (bb[index] || 0)) return (aa[index] || 0) - (bb[index] || 0);
  }
  return 0;
}

function resolveProductionModule(request) {
  try {
    return require.resolve(request, { paths: [root] });
  } catch (error) {
    throw new Error(`Production dependency module ${request} is not resolvable. Run a clean npm ci --omit=dev. (${error.code || error.message})`);
  }
}

// Validate public module entry points instead of private package file paths.
// New pg releases expose Pool through the separate pg-pool package, so pg/lib/pool.js is not a stable file.
for (const request of ['mysql2/promise', 'pg', 'pg-pool', 'ws']) resolveProductionModule(request);
const wsPackage = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'ws', 'package.json'), 'utf8'));
if (compareSemver(wsPackage.version, '8.21.1') < 0) throw new Error(`ws ${wsPackage.version} is below the required security floor 8.21.1.`);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
const include = [
  'server.js', 'app-server.js', 'package.json', 'package-lock.json', 'README.md',
  '.env.example', '.env.local-safe.example', '.gitignore', '.npmrc', '.github', 'GITHUB_DESKTOP_UPDATE_GUIDE_BN.md', 'UNIFIED_INSTALL_BN.md', 'PACKAGE_TYPE.txt', 'SET_NEXT_VERSION.bat', 'SET_HOTFIX_VERSION.bat',
  'local-php-mail.php', 'lib', 'public', 'scripts', 'docs', 'deploy'
];

function copySafe(src, dst) {
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) throw new Error(`Release source contains a symbolic link: ${path.relative(root, src)}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (['dist', '.git', 'data', 'legacy-import'].includes(name)) continue;
      copySafe(path.join(src, name), path.join(dst, name));
    }
  } else if (stat.isFile()) {
    fs.copyFileSync(src, dst);
  } else {
    throw new Error(`Release source contains an unsupported filesystem object: ${path.relative(root, src)}`);
  }
}
for (const name of include) if (fs.existsSync(path.join(root, name))) copySafe(path.join(root, name), path.join(stage, name));

const tree = computeReleaseTreeSha256(stage);
const packageName = `p2pflow-v${pkg.version}.tar.gz`;
const packagePath = path.join(dist, packageName);
const tar = spawnSync('tar', ['-czf', packagePath, '-C', dist, path.basename(stage)], { stdio: 'inherit' });
if (tar.error) throw tar.error;
if (tar.status !== 0) process.exit(tar.status || 1);
const packageBytes = fs.statSync(packagePath).size;
const sha256 = hashFileSync(packagePath);
const privateKey = String(process.env.UPDATE_SIGNING_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
if (!privateKey) throw new Error('UPDATE_SIGNING_PRIVATE_KEY is required to build a signed production release.');
let signingPublicKey;
try { signingPublicKey = crypto.createPublicKey(privateKey); }
catch { throw new Error('UPDATE_SIGNING_PRIVATE_KEY is not a valid private signing key. Generate a fresh Ed25519 key in P2PFlow and replace the GitHub Actions secret.'); }
const signingKeyFingerprint = `sha256:${crypto.createHash('sha256').update(signingPublicKey.export({ type: 'spki', format: 'der' })).digest('hex')}`;

const manifest = {
  format: 1,
  product: 'p2pflow',
  dataCompatibilityEpoch: 1,
  version: pkg.version,
  tag: `v${pkg.version}`,
  packageAsset: packageName,
  packageBytes,
  sha256,
  treeSha256: tree.sha256,
  treeFiles: tree.fileCount,
  treeBytes: tree.totalBytes,
  node: '>=20.0.0',
  schema: { min: 25, max: 2147483647 },
  dependenciesBundled: false,
  verificationProfile: 'signed-ci-runtime',
  signingKeyFingerprint,
  createdAt: new Date().toISOString()
};
const manifestPath = path.join(dist, 'p2pflow-update-manifest.json');
const manifestRaw = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(manifestPath, manifestRaw);
const signature = crypto.sign(null, manifestRaw, privateKey).toString('base64');
fs.writeFileSync(path.join(dist, 'p2pflow-update-manifest.sig'), signature + '\n');
fs.rmSync(stage, { recursive: true, force: true });
console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  packagePath,
  packageBytes,
  sha256,
  treeSha256: tree.sha256,
  treeFiles: tree.fileCount,
  manifestPath
}, null, 2));
