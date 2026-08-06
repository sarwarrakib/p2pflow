#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fork } = require('child_process');

const ROOT = path.resolve(process.env.P2PFLOW_INSTALL_ROOT || process.env.CRM_INSTALL_ROOT || path.dirname(__dirname));
const CURRENT_LINK = path.join(ROOT, 'current');
const RELEASES_DIR = path.join(ROOT, 'releases');
const SHARED_DIR = path.join(ROOT, 'shared');
const CURRENT_POINTER = path.join(SHARED_DIR, 'current-release.json');
const SETUP_DIR = path.join(SHARED_DIR, '.p2pflow');
const ENV_FILE = process.env.P2PFLOW_ENV_FILE || process.env.CRM_ENV_FILE || path.join(SHARED_DIR, '.env');
const STARTUP_FAILURE_FILE = path.join(SHARED_DIR, 'startup-failure.json');
const PENDING_ACTIVATION_FILE = path.join(SHARED_DIR, 'pending-activation.json');
const READY_TIMEOUT_MS = Math.max(5000, Number(process.env.CRM_UPDATE_READY_TIMEOUT_MS || 90000) || 90000);
const RESTART_DELAY_MS = Math.max(500, Number(process.env.CRM_LAUNCHER_RESTART_DELAY_MS || 1500) || 1500);

let child = null;
let shuttingDown = false;
let switching = false;
let readyWaiter = null;
let lastReady = null;
let spawnTimer = null;

function log(...args) { console.log(new Date().toISOString(), '[launcher]', ...args); }
function error(...args) { console.error(new Date().toISOString(), '[launcher]', ...args); }


function writeStartupFailure(message) {
  const safe = {
    code: String(message.code || 'UNKNOWN_STARTUP_FAILURE').slice(0, 80),
    message: String(message.message || 'Application startup failed.').slice(0, 500),
    detail: String(message.detail || '').slice(0, 1000),
    version: String(message.version || '').slice(0, 40),
    at: String(message.at || new Date().toISOString())
  };
  const temporary = `${STARTUP_FAILURE_FILE}.next-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(safe, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, STARTUP_FAILURE_FILE);
  } catch (err) {
    try { fs.unlinkSync(temporary); } catch {}
    error(`unable to save startup failure report: ${err.message}`);
  }
  error(`startup failure [${safe.code}]: ${safe.detail || safe.message}`);
}

function clearStartupFailure() {
  try { fs.unlinkSync(STARTUP_FAILURE_FILE); } catch {}
}


function readPendingActivation() {
  try {
    const value = JSON.parse(fs.readFileSync(PENDING_ACTIVATION_FILE, 'utf8'));
    if (!value || Number(value.format || 0) !== 1) return null;
    return {
      previousDir: String(value.previousDir || ''),
      targetDir: String(value.targetDir || ''),
      targetVersion: String(value.targetVersion || ''),
      createdAt: String(value.createdAt || '')
    };
  } catch {
    return null;
  }
}

function clearPendingActivation() {
  try { fs.unlinkSync(PENDING_ACTIVATION_FILE); } catch {}
}

function isInside(parent, childPath) {
  const root = path.resolve(parent) + path.sep;
  return `${path.resolve(childPath)}${path.sep}`.startsWith(root);
}

function writeJsonAtomic(filePath, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.next-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode });
  fs.renameSync(temporary, filePath);
}

function pointerTarget() {
  try {
    const record = JSON.parse(fs.readFileSync(CURRENT_POINTER, 'utf8'));
    const candidate = path.resolve(record.directory || path.join(RELEASES_DIR, String(record.version || '')));
    if (fs.existsSync(candidate)) return fs.realpathSync(candidate);
  } catch {}
  return null;
}

function currentTarget() {
  const pointed = pointerTarget();
  if (pointed) return pointed;
  try { return fs.realpathSync(CURRENT_LINK); } catch { return null; }
}

function releaseVersionFromDirectory(directory) {
  try { return String(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).version || ''); } catch { return ''; }
}

function compareVersion(a, b) {
  const aa = String(a || '').replace(/^v/i, '').split(/[.-]/).slice(0, 3).map(Number);
  const bb = String(b || '').replace(/^v/i, '').split(/[.-]/).slice(0, 3).map(Number);
  for (let index = 0; index < 3; index += 1) {
    const diff = (aa[index] || 0) - (bb[index] || 0);
    if (diff) return diff;
  }
  return String(a || '').localeCompare(String(b || ''));
}

function bootstrapCurrentRelease() {
  const existing = currentTarget();
  if (existing) return existing;
  const candidates = fs.readdirSync(RELEASES_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => path.join(RELEASES_DIR, entry.name))
    .filter(directory => fs.existsSync(path.join(directory, 'package.json')) && (fs.existsSync(path.join(directory, '.release-manifest.json')) || fs.existsSync(path.join(directory, 'release-manifest.json'))))
    .sort((a, b) => compareVersion(releaseVersionFromDirectory(b), releaseVersionFromDirectory(a)));
  if (!candidates.length) throw new Error('No P2PFlow release is available in the releases directory.');
  return atomicSwitch(candidates[0]);
}

function copyTreeIfMissing(source, destination) {
  if (!fs.existsSync(source)) return false;
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to migrate symbolic link: ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    let copied = false;
    for (const name of fs.readdirSync(source)) {
      copied = copyTreeIfMissing(path.join(source, name), path.join(destination, name)) || copied;
    }
    return copied;
  }
  if (stat.isFile()) {
    if (fs.existsSync(destination)) return false;
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.copyFileSync(source, destination);
    try { fs.chmodSync(destination, 0o600); } catch {}
    return true;
  }
  return false;
}

function migratePersistentHostingFiles() {
  fs.mkdirSync(SHARED_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(SETUP_DIR, { recursive: true, mode: 0o700 });
  copyTreeIfMissing(path.join(ROOT, '.env'), ENV_FILE);
  copyTreeIfMissing(path.join(ROOT, '.p2pflow'), SETUP_DIR);
}

const RELEASE_METADATA_FILES = new Set(['.release-manifest.json', '.release-manifest.sig', 'release-manifest.json', 'release-manifest.sig']);
function hashFileSync(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

function releaseTreeSha256(directory) {
  const root = path.resolve(directory);
  const files = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const stat = fs.lstatSync(full);
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`Unsafe release path: ${full}`);
      if (stat.isSymbolicLink()) throw new Error(`Release contains a symbolic link: ${relative}`);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) files.push({ full, relative, size: stat.size });
      else throw new Error(`Release contains an unsupported filesystem object: ${relative}`);
    }
  };
  walk(root);
  files.sort((a, b) => a.relative < b.relative ? -1 : (a.relative > b.relative ? 1 : 0));
  const tree = crypto.createHash('sha256');
  for (const file of files) {
    if (RELEASE_METADATA_FILES.has(file.relative)) continue;
    tree.update(file.relative, 'utf8');
    tree.update('\0');
    tree.update(String(file.size), 'utf8');
    tree.update('\0');
    tree.update(hashFileSync(file.full), 'ascii');
    tree.update('\n');
  }
  return tree.digest('hex');
}

function validateReleaseDir(directory, expectedVersion = '') {
  const requested = path.resolve(directory || '');
  if (!fs.existsSync(requested)) throw new Error('Target release directory does not exist.');
  const releasesRoot = fs.realpathSync(RELEASES_DIR);
  const target = fs.realpathSync(requested);
  if (!isInside(releasesRoot, target)) throw new Error('Target release is outside the releases directory.');
  const releaseStat = fs.lstatSync(requested);
  if (releaseStat.isSymbolicLink() || !fs.statSync(target).isDirectory()) throw new Error('Target release must be a real directory, not a symbolic link.');
  const packagePath = path.join(target, 'package.json');
  const hiddenManifestPath = path.join(target, '.release-manifest.json');
  const visibleManifestPath = path.join(target, 'release-manifest.json');
  const manifestPath = fs.existsSync(hiddenManifestPath) ? hiddenManifestPath : visibleManifestPath;
  if (!fs.existsSync(path.join(target, 'server.js')) || !fs.existsSync(packagePath) || !fs.existsSync(manifestPath)) throw new Error('Target release is incomplete or has no integrity manifest.');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!['p2pflow', 'manual-p2p-desk-crm'].includes(String(manifest.product || ''))) throw new Error('Target release manifest product is invalid.');
  if (!/^[a-f0-9]{64}$/i.test(String(manifest.treeSha256 || ''))) throw new Error('Target release tree digest is invalid.');
  if (String(manifest.version || '') !== String(pkg.version || '')) throw new Error('Target release package and manifest versions do not match.');
  if (expectedVersion && String(pkg.version || '') !== String(expectedVersion)) throw new Error(`Target release version ${pkg.version || 'unknown'} does not match requested version ${expectedVersion}.`);
  const actualTree = releaseTreeSha256(target);
  if (actualTree.toLowerCase() !== String(manifest.treeSha256).toLowerCase()) throw new Error('Target release files do not match the integrity manifest.');
  return target;
}

function atomicSwitch(targetDir) {
  const target = validateReleaseDir(targetDir);
  fs.mkdirSync(ROOT, { recursive: true });
  fs.mkdirSync(SHARED_DIR, { recursive: true, mode: 0o700 });
  const version = releaseVersionFromDirectory(target);
  writeJsonAtomic(CURRENT_POINTER, { format: 1, version, directory: target, switchedAt: new Date().toISOString() });
  // A symlink is a convenience on VPS hosting. Shared hosting often blocks
  // symlink creation, so the durable pointer above is the source of truth.
  const tempLink = path.join(ROOT, `.current-next-${process.pid}-${Date.now()}`);
  try {
    try { fs.unlinkSync(tempLink); } catch {}
    const relative = path.relative(ROOT, target) || target;
    fs.symlinkSync(relative, tempLink, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      const currentStat = fs.lstatSync(CURRENT_LINK);
      if (!currentStat.isSymbolicLink()) throw new Error('current exists and is not a symlink');
      fs.unlinkSync(CURRENT_LINK);
    } catch (err) {
      if (err.code !== 'ENOENT' && !String(err.message).includes('not a symlink')) throw err;
    }
    fs.renameSync(tempLink, CURRENT_LINK);
  } catch (err) {
    try { fs.unlinkSync(tempLink); } catch {}
    log(`symlink switch unavailable; using shared current-release pointer (${err.message})`);
  }
  return target;
}

function installLauncherForNextRestart(targetDir) {
  const source = fs.existsSync(path.join(targetDir, 'scripts', 'p2pflow-launcher.js')) ? path.join(targetDir, 'scripts', 'p2pflow-launcher.js') : path.join(targetDir, 'scripts', 'rneed-launcher.js');
  const sourceStat = fs.lstatSync(source);
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) throw new Error('Release launcher must be a regular file.');
  const destination = path.join(ROOT, 'launcher.js');
  const temporary = path.join(ROOT, `.launcher-next-${process.pid}-${Date.now()}`);
  fs.copyFileSync(source, temporary);
  try { fs.chmodSync(temporary, 0o755); } catch {}
  fs.renameSync(temporary, destination);
  return destination;
}

function spawnChild() {
  const current = currentTarget() || bootstrapCurrentRelease();
  if (!current) throw new Error('Current P2PFlow release is missing.');
  const target = validateReleaseDir(current);
  const serverPath = path.join(target, 'server.js');
  if (!fs.existsSync(serverPath)) throw new Error(`Current release has no server.js: ${target}`);
  lastReady = null;
  child = fork(serverPath, [], {
    cwd: target,
    env: {
      ...process.env,
      P2PFLOW_INSTALL_ROOT: ROOT,
      P2PFLOW_ENV_FILE: ENV_FILE,
      P2PFLOW_SETUP_DIR: SETUP_DIR,
      P2PFLOW_RELEASES_DIR: RELEASES_DIR,
      P2PFLOW_SHARED_DIR: SHARED_DIR,
      P2PFLOW_CURRENT_LINK: CURRENT_LINK,
      P2PFLOW_CURRENT_POINTER: CURRENT_POINTER,
      P2PFLOW_MANAGED_INSTALL: 'true',
      P2PFLOW_LAUNCHER_PID: String(process.pid),
      CRM_INSTALL_ROOT: ROOT,
      CRM_ENV_FILE: ENV_FILE,
      CRM_SETUP_DIR: SETUP_DIR,
      CRM_RELEASES_DIR: RELEASES_DIR,
      CRM_SHARED_DIR: SHARED_DIR,
      CRM_CURRENT_LINK: CURRENT_LINK,
      CRM_MANAGED_INSTALL: 'true',
      CRM_LAUNCHER_PID: String(process.pid)
    },
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
  });
  log(`started child pid=${child.pid} release=${target}`);
  child.on('message', message => handleChildMessage(message));
  child.on('exit', (code, signal) => {
    const exited = child;
    child = null;
    log(`child exited pid=${exited.pid} code=${code} signal=${signal || ''}`);
    if (readyWaiter && !readyWaiter.done) readyWaiter.onExit(code, signal);
    if (!shuttingDown && !switching) scheduleSpawn(RESTART_DELAY_MS);
  });
}

function scheduleSpawn(delayMs = 0) {
  if (shuttingDown || switching || child || spawnTimer) return;
  spawnTimer = setTimeout(() => {
    spawnTimer = null;
    if (shuttingDown || switching || child) return;
    try {
      spawnChild();
    } catch (err) {
      error(`unable to start current release: ${err.stack || err.message}`);
      scheduleSpawn(5000);
    }
  }, Math.max(0, Number(delayMs) || 0));
}

function waitForReady(version, timeoutMs = READY_TIMEOUT_MS) {
  if (lastReady && (!version || lastReady.version === version)) return Promise.resolve(lastReady);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (readyWaiter) readyWaiter.done = true;
      readyWaiter = null;
      reject(new Error(`Release ${version || ''} did not become ready within ${timeoutMs}ms.`));
    }, timeoutMs);
    readyWaiter = {
      done: false,
      version,
      resolve(value) { if (this.done) return; this.done = true; clearTimeout(timer); readyWaiter = null; resolve(value); },
      reject(err) { if (this.done) return; this.done = true; clearTimeout(timer); readyWaiter = null; reject(err); },
      onExit(code, signal) { this.reject(new Error(`Child exited before ready (code ${code}, signal ${signal || 'none'}).`)); }
    };
  });
}

function sendToChild(message) {
  if (!child || !child.connected) return false;
  try { child.send(message); return true; } catch { return false; }
}

async function stopChild(reason = 'restart') {
  if (!child) return;
  const target = child;
  sendToChild({ type: 'shutdown-for-switch', reason });
  await new Promise(resolve => {
    const timer = setTimeout(() => {
      try { target.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { target.kill('SIGKILL'); } catch {} resolve(); }, 5000).unref();
    }, 15000);
    target.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

async function applyRelease(message) {
  if (switching) return sendToChild({ type: 'launcher-ack', requestId: message.requestId, accepted: false, error: 'Another release switch is already in progress.' });
  let target;
  try { target = validateReleaseDir(message.targetDir, String(message.version || '')); }
  catch (err) { return sendToChild({ type: 'launcher-ack', requestId: message.requestId, accepted: false, error: err.message }); }
  const previous = currentTarget();
  const targetVersion = String(message.version || '');
  switching = true;
  sendToChild({ type: 'launcher-ack', requestId: message.requestId, accepted: true, fromDir: previous, targetDir: target });
  await new Promise(resolve => setTimeout(resolve, 1400));
  try {
    await stopChild('release_switch');
    atomicSwitch(target);
    spawnChild();
    const ready = await waitForReady(targetVersion);
    const launcherPath = installLauncherForNextRestart(target);
    log(`release switch successful ${targetVersion}; stable launcher refreshed at ${launcherPath}`);
    sendToChild({ type: 'launcher-update-result', status: 'applied', version: targetVersion, fromDir: previous, targetDir: target, ready, launcherUpdated: true });
  } catch (err) {
    error(`release switch failed: ${err.message}`);
    try { if (child) await stopChild('automatic_rollback'); } catch {}
    if (previous) {
      try {
        atomicSwitch(previous);
        spawnChild();
        await waitForReady('', READY_TIMEOUT_MS);
        sendToChild({ type: 'launcher-update-result', status: 'rolled_back', version: targetVersion, fromDir: previous, targetDir: target, error: err.message });
        log(`automatic rollback completed to ${previous}`);
      } catch (rollbackError) {
        error(`automatic rollback failed: ${rollbackError.message}`);
      }
    }
  } finally {
    switching = false;
    if (!shuttingDown && !child) scheduleSpawn(5000);
  }
}

function handleChildMessage(message) {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'app-ready') {
    lastReady = { version: String(message.version || ''), schemaVersion: Number(message.schemaVersion || 0), pid: child && child.pid, at: new Date().toISOString() };
    clearStartupFailure();
    if (readyWaiter && (!readyWaiter.version || readyWaiter.version === lastReady.version)) readyWaiter.resolve(lastReady);
    return;
  }
  if (message.type === 'app-startup-failed') {
    writeStartupFailure(message);
    return;
  }
  if (message.type === 'apply-release') applyRelease(message).catch(err => error(err.stack || err.message));
}


async function startInitial() {
  const pending = readPendingActivation();
  if (!pending) {
    scheduleSpawn(0);
    return;
  }
  switching = true;
  log(`validating pending activation target=${pending.targetVersion || pending.targetDir}`);
  try {
    const active = currentTarget();
    const expected = pending.targetDir ? fs.realpathSync(pending.targetDir) : '';
    if (!active || !expected || active !== expected) throw new Error('Pending activation target does not match the current release.');
    validateReleaseDir(active, pending.targetVersion);
    spawnChild();
    await waitForReady(pending.targetVersion, READY_TIMEOUT_MS);
    clearPendingActivation();
    log(`pending activation confirmed version=${pending.targetVersion}`);
  } catch (activationError) {
    error(`pending activation failed: ${activationError.message}`);
    try { if (child) await stopChild('initial_activation_rollback'); } catch {}
    let rolledBack = false;
    if (pending.previousDir) {
      try {
        const previous = validateReleaseDir(pending.previousDir);
        atomicSwitch(previous);
        spawnChild();
        await waitForReady('', READY_TIMEOUT_MS);
        rolledBack = true;
        clearPendingActivation();
        writeStartupFailure({
          code: 'ACTIVATION_ROLLED_BACK',
          message: 'The new release failed readiness and the previous managed release was restored.',
          detail: activationError.message,
          version: pending.targetVersion,
          at: new Date().toISOString()
        });
        log(`initial activation rolled back to ${previous}`);
      } catch (rollbackError) {
        error(`initial activation rollback failed: ${rollbackError.message}`);
      }
    }
    if (!rolledBack) {
      clearPendingActivation();
      writeStartupFailure({
        code: 'ACTIVATION_FAILED_NO_ROLLBACK',
        message: 'The activated release failed readiness and no valid previous managed release was available.',
        detail: activationError.message,
        version: pending.targetVersion,
        at: new Date().toISOString()
      });
    }
  } finally {
    switching = false;
    if (!shuttingDown && !child) scheduleSpawn(5000);
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (spawnTimer) {
    clearTimeout(spawnTimer);
    spawnTimer = null;
  }
  log(`received ${signal}; stopping child`);
  try { await stopChild(signal); } catch {}
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', err => {
  error(err.stack || err.message);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 100).unref();
});
process.on('unhandledRejection', err => {
  error(err && (err.stack || err.message) || err);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 100).unref();
});

fs.mkdirSync(RELEASES_DIR, { recursive: true });
fs.mkdirSync(SHARED_DIR, { recursive: true, mode: 0o700 });
migratePersistentHostingFiles();
bootstrapCurrentRelease();
startInitial().catch(err => {
  error(err.stack || err.message);
  scheduleSpawn(5000);
});
