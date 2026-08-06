#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { computeReleaseTreeSha256 } = require('../lib/releaseIntegrity');
const { runProductionPreflight } = require('../lib/productionPreflight');

const args = process.argv.slice(2);
function value(name) {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || '') : '';
}

const root = path.resolve(value('--root') || process.env.P2PFLOW_INSTALL_ROOT || process.env.CRM_INSTALL_ROOT || '/opt/p2pflow');
const version = value('--version') || require('../package.json').version;
const target = path.resolve(value('--release') || path.join(root, 'releases', version));
const current = path.join(root, 'current');
const launcher = path.join(root, 'launcher.js');
const envFile = path.resolve(value('--env') || process.env.P2PFLOW_ENV_FILE || process.env.CRM_ENV_FILE || path.join(root, 'shared', '.env'));
const pendingActivationFile = path.join(root, 'shared', 'pending-activation.json');
const nonce = `${process.pid}-${Date.now()}`;

function isInside(parent, child) {
  const base = `${path.resolve(parent)}${path.sep}`;
  return `${path.resolve(child)}${path.sep}`.startsWith(base);
}

function validateRelease() {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error(`Release directory is missing: ${target}`);
  if (!isInside(path.join(root, 'releases'), target)) throw new Error('Release directory must be inside the managed releases directory.');
  const packageFile = path.join(target, 'package.json');
  const manifestFile = path.join(target, '.release-manifest.json');
  if (!fs.existsSync(packageFile) || !fs.existsSync(manifestFile) || !fs.existsSync(path.join(target, 'server.js'))) throw new Error('Release is incomplete.');
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (String(pkg.version || '') !== version || String(manifest.version || '') !== version) throw new Error('Release version and manifest do not match the requested version.');
  if (!['p2pflow', 'manual-p2p-desk-crm'].includes(manifest.product)) throw new Error('Release manifest product is invalid.');
  const tree = computeReleaseTreeSha256(target);
  if (String(tree.sha256).toLowerCase() !== String(manifest.treeSha256 || '').toLowerCase()) throw new Error('Release tree integrity verification failed.');
  return { pkg, manifest };
}

function atomicCopy(source, destination, mode) {
  const temporary = `${destination}.next-${nonce}`;
  fs.copyFileSync(source, temporary);
  if (mode) {
    try { fs.chmodSync(temporary, mode); } catch {}
  }
  fs.renameSync(temporary, destination);
}


function currentTarget() {
  try { return fs.realpathSync(current); } catch { return ''; }
}

function writePendingActivation(previousDir) {
  fs.mkdirSync(path.dirname(pendingActivationFile), { recursive: true });
  const record = {
    format: 1,
    previousDir: previousDir || '',
    targetDir: target,
    targetVersion: version,
    createdAt: new Date().toISOString()
  };
  const temporary = `${pendingActivationFile}.next-${nonce}`;
  fs.writeFileSync(temporary, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, pendingActivationFile);
}

function atomicSwitch() {
  let currentStat = null;
  try { currentStat = fs.lstatSync(current); } catch {}
  if (currentStat && !currentStat.isSymbolicLink()) throw new Error(`Refusing to replace non-symlink current path: ${current}`);
  const temporary = path.join(root, `.current-next-${nonce}`);
  try { fs.unlinkSync(temporary); } catch {}
  fs.symlinkSync(path.relative(root, target), temporary, process.platform === 'win32' ? 'junction' : 'dir');
  fs.renameSync(temporary, current);
}

(async () => {
  validateRelease();
  const preflight = await runProductionPreflight({ envFile, installRoot: root });
  if (!preflight.ok) {
    for (const warning of preflight.warnings) console.warn(`WARNING [${warning.code}]: ${warning.message}`);
    for (const error of preflight.errors) console.error(`ERROR [${error.code}]: ${error.message}${error.detail ? `\n  ${error.detail}` : ''}`);
    throw new Error('Activation was blocked. The existing current release was not changed.');
  }
  for (const warning of preflight.warnings) console.warn(`WARNING [${warning.code}]: ${warning.message}`);
  fs.mkdirSync(root, { recursive: true });
  const previousDir = currentTarget();
  writePendingActivation(previousDir);
  atomicCopy(path.join(target, 'scripts', 'p2pflow-launcher.js'), launcher, 0o755);
  atomicSwitch();
  console.log(`Activated release ${version}.`);
  console.log(`Current: ${current} -> ${target}`);
  console.log('Start or restart the P2PFlow application service. The launcher will clear pending activation after /ready, or roll back to the previous managed release if startup readiness fails.');
})().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
