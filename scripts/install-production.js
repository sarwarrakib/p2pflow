#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { computeReleaseTreeSha256 } = require('../lib/releaseIntegrity');

const source = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const value = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};
const configuredRoot = value('--root') || process.env.P2PFLOW_INSTALL_ROOT || process.env.CRM_INSTALL_ROOT || '';
const activateRequested = args.includes('--activate');
if (!configuredRoot) {
  console.error('Production install root is required. Use --root /opt/p2pflow or set P2PFLOW_INSTALL_ROOT.');
  process.exit(1);
}
const root = path.resolve(configuredRoot);
const releases = path.join(root, 'releases');
const shared = path.join(root, 'shared');
const target = path.join(releases, pkg.version);
const current = path.join(root, 'current');
const nonce = `${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const stage = path.join(releases, `.install-${pkg.version}-${nonce}`);
const nodeMajor = Number(process.versions.node.split('.')[0] || 0);
if (nodeMajor < 20) { console.error('Node.js 20 or newer is required.'); process.exit(1); }

function isInside(parent, child) {
  const parentPath = path.resolve(parent) + path.sep;
  return `${path.resolve(child)}${path.sep}`.startsWith(parentPath);
}

if (root === source || isInside(source, root)) {
  console.error(`Refusing to install inside the source tree. Choose a separate root such as /opt/p2pflow. Source: ${source}`);
  process.exit(1);
}

const excludedRootNames = new Set(['.git', '.env', 'data', 'legacy-import', 'dist', 'releases', 'shared', 'current']);
function copyTree(from, to, depth = 0) {
  const sourceStat = fs.lstatSync(from);
  if (sourceStat.isSymbolicLink()) throw new Error(`Refusing to copy symbolic link: ${from}`);
  if (!sourceStat.isDirectory()) throw new Error(`Copy source is not a directory: ${from}`);
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (depth === 0 && excludedRootNames.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    const stat = fs.lstatSync(src);
    if (stat.isSymbolicLink()) throw new Error(`Refusing to copy symbolic link: ${src}`);
    if (stat.isDirectory()) copyTree(src, dst, depth + 1);
    else if (stat.isFile()) fs.copyFileSync(src, dst);
    else throw new Error(`Refusing to copy unsupported filesystem object: ${src}`);
  }
}

function runChecked(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}.`);
}

function productionDependenciesReady(directory) {
  return ['mysql2', 'pg', 'ws'].every(name => fs.existsSync(path.join(directory, 'node_modules', name, 'package.json')));
}

function atomicWriteFromFile(sourceFile, destination, mode) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.next-${nonce}`;
  fs.copyFileSync(sourceFile, temporary);
  if (mode) {
    try { fs.chmodSync(temporary, mode); } catch {}
  }
  fs.renameSync(temporary, destination);
}

function atomicCurrentSwitch(targetDirectory) {
  let currentStat = null;
  try { currentStat = fs.lstatSync(current); } catch {}
  if (currentStat && !currentStat.isSymbolicLink()) throw new Error(`Refusing to replace non-symlink current path: ${current}`);
  const temporary = path.join(root, `.current-next-${nonce}`);
  try { fs.unlinkSync(temporary); } catch {}
  fs.symlinkSync(path.relative(root, targetDirectory), temporary, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    fs.renameSync(temporary, current);
  } catch (error) {
    if (process.platform !== 'win32') throw error;
    if (currentStat) fs.unlinkSync(current);
    fs.renameSync(temporary, current);
  }
}

if (fs.existsSync(target)) {
  if (activateRequested) {
    console.log(`Release ${pkg.version} is already staged. Running production preflight before activation...`);
    runChecked(process.execPath, [path.join(target, 'scripts', 'activate-production.js'), '--root', root, '--version', pkg.version], target);
    process.exit(0);
  }
  console.error(`Release directory already exists: ${target}`);
  console.error(`Run: node ${path.join(target, 'scripts', 'activate-production.js')} --root ${root} --version ${pkg.version}`);
  process.exit(1);
}
fs.mkdirSync(releases, { recursive: true });
fs.mkdirSync(shared, { recursive: true });

let targetCommitted = false;
let currentSwitched = false;
try {
  copyTree(source, stage);
  if (!productionDependenciesReady(stage)) {
    console.log('Installing production dependencies from package-lock.json...');
    const npmRegistry = String(process.env.P2PFLOW_NPM_REGISTRY || process.env.CRM_NPM_REGISTRY || 'https://registry.npmjs.org').trim();
    runChecked(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--ignore-scripts', '--registry', npmRegistry], stage);
  }
  if (!productionDependenciesReady(stage)) throw new Error('Production dependencies mysql2, pg and ws are required but were not installed.');

  console.log('Running production release self-tests...');
  runChecked(process.execPath, ['scripts/release-self-test.js'], stage);
  runChecked(process.execPath, ['scripts/hosting-setup-self-test.js'], stage);
  runChecked(process.execPath, ['scripts/production-preflight-self-test.js'], stage);
  runChecked(process.execPath, ['scripts/postgres-state-crypto-self-test.js'], stage);
  runChecked(process.execPath, ['scripts/mysql-state-crypto-self-test.js'], stage);
  runChecked(process.execPath, ['scripts/update-manager-self-test.js'], stage);
  runChecked(process.execPath, ['scripts/launcher-self-test.js'], stage);
  runChecked(process.execPath, ['scripts/pending-activation-self-test.js'], stage);
  runChecked(process.execPath, ['server.js', '--accounting-self-test'], stage);

  const tree = computeReleaseTreeSha256(stage);
  const manifest = {
    format: 1,
    product: 'p2pflow',
    dataCompatibilityEpoch: 1,
    version: pkg.version,
    tag: `v${pkg.version}`,
    node: '>=20.0.0',
    schema: { min: 25, max: 2147483647 },
    localInstall: true,
    treeSha256: tree.sha256,
    treeFiles: tree.fileCount,
    treeBytes: tree.totalBytes,
    installedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(stage, '.release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });

  fs.renameSync(stage, target);
  targetCommitted = true;

  const envTarget = path.join(shared, '.env');
  if (!fs.existsSync(envTarget)) {
    const temporaryEnv = `${envTarget}.next-${nonce}`;
    fs.copyFileSync(path.join(target, '.env.example'), temporaryEnv);
    try { fs.chmodSync(temporaryEnv, 0o600); } catch {}
    fs.renameSync(temporaryEnv, envTarget);
  }
  try { fs.chmodSync(envTarget, 0o600); } catch {}

  const legacySource = path.join(source, 'legacy-import');
  const legacyTarget = path.join(root, 'legacy-import');
  if (fs.existsSync(legacySource) && !fs.existsSync(legacyTarget)) {
    copyTree(legacySource, legacyTarget, 1);
    for (const name of fs.readdirSync(legacyTarget)) {
      try { fs.chmodSync(path.join(legacyTarget, name), 0o600); } catch {}
    }
  }

  // Keep the existing working release active until environment, PostgreSQL,
  // owner/import requirements and release integrity pass production preflight.
  // This prevents a half-configured release from causing a reverse-proxy 503.
  console.log(`\nStaged release ${pkg.version}`);
  console.log(`Root: ${root}`);
  console.log(`Environment: ${envTarget}`);
  console.log('The current running release has not been changed.');
  console.log(`Configure ${envTarget}, import legacy data when required, then run:`);
  console.log(`  node ${path.join(target, 'scripts', 'production-doctor.js')} --root ${root} --env ${envTarget}`);
  console.log(`  node ${path.join(target, 'scripts', 'activate-production.js')} --root ${root} --version ${pkg.version}`);
  if (activateRequested) {
    console.log('\n--activate was requested. Running production preflight now...');
    runChecked(process.execPath, [path.join(target, 'scripts', 'activate-production.js'), '--root', root, '--version', pkg.version], target);
    currentSwitched = true;
  }
} catch (error) {
  try { if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true }); } catch {}
  // A fully staged release is intentionally retained after activation failure.
  // The current symlink remains unchanged while configuration is corrected.
  console.error(error.stack || error.message || error);
  process.exit(1);
}
