#!/usr/bin/env node
'use strict';

// Shared-hosting entry point.
//
// Many managed/shared Node hosting platforms attach their HTTP proxy to the
// startup process. Starting the real web server inside child_process.fork()
// can therefore leave the proxy waiting forever even though the child is
// listening on a normal TCP port. This entry keeps P2PFlow in the original
// startup process while preserving signed release pointers, restart-based
// activation and automatic rollback.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

const ROOT = path.resolve(process.env.P2PFLOW_INSTALL_ROOT || process.env.CRM_INSTALL_ROOT || path.dirname(__dirname));
const RELEASES_DIR = path.join(ROOT, 'releases');
const SHARED_DIR = path.join(ROOT, 'shared');
const CURRENT_POINTER = path.join(SHARED_DIR, 'current-release.json');
const CURRENT_LINK = path.join(ROOT, 'current');
const SETUP_DIR = path.join(SHARED_DIR, '.p2pflow');
const ROOT_ENV_FILE = path.join(ROOT, '.env');
const SHARED_ENV_FILE = path.join(SHARED_DIR, '.env');
const ENV_FILE = process.env.P2PFLOW_ENV_FILE || process.env.CRM_ENV_FILE || (fs.existsSync(SHARED_ENV_FILE) ? SHARED_ENV_FILE : (fs.existsSync(ROOT_ENV_FILE) ? ROOT_ENV_FILE : SHARED_ENV_FILE));
const STARTUP_FAILURE_FILE = path.join(SHARED_DIR, 'startup-failure.json');
const PENDING_ACTIVATION_FILE = path.join(SHARED_DIR, 'pending-activation.json');
const ACTIVATION_RESULT_FILE = path.join(SHARED_DIR, 'activation-result.json');
const READY_TIMEOUT_MS = Math.max(5000, Number(process.env.CRM_UPDATE_READY_TIMEOUT_MS || 90000) || 90000);
const RELEASE_METADATA_FILES = new Set(['.release-manifest.json', '.release-manifest.sig', 'release-manifest.json', 'release-manifest.sig']);

let activeDirectory = '';
let pendingActivation = null;
let readyTimer = null;
let switchInProgress = false;
let failureServerStarted = false;

function log(...args) { console.log(new Date().toISOString(), '[hosting-entry]', ...args); }
function error(...args) { console.error(new Date().toISOString(), '[hosting-entry]', ...args); }

function cleanText(value, max = 1000) {
  return String(value == null ? '' : value).replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function writeJsonAtomic(filePath, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.next-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  fs.renameSync(temporary, filePath);
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function removeFile(filePath) {
  try { fs.unlinkSync(filePath); } catch {}
}

function writeStartupFailure(message = {}) {
  const safe = {
    code: cleanText(message.code || 'UNKNOWN_STARTUP_FAILURE', 80),
    message: cleanText(message.message || 'Application startup failed.', 500),
    detail: cleanText(message.detail || '', 1000),
    version: cleanText(message.version || '', 40),
    at: cleanText(message.at || new Date().toISOString(), 80)
  };
  try { writeJsonAtomic(STARTUP_FAILURE_FILE, safe); }
  catch (writeError) { error(`unable to save startup failure: ${writeError.message}`); }
  error(`startup failure [${safe.code}]: ${safe.detail || safe.message}`);
  return safe;
}

function clearStartupFailure() { removeFile(STARTUP_FAILURE_FILE); }

function isInside(parent, childPath) {
  const root = `${path.resolve(parent)}${path.sep}`;
  return `${path.resolve(childPath)}${path.sep}`.startsWith(root);
}

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
  } finally {
    fs.closeSync(fd);
  }
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

function releaseVersion(directory) {
  try { return String(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).version || ''); }
  catch { return ''; }
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

function validateBootstrapFiles(target, manifest) {
  const files = manifest && manifest.bootstrapFiles;
  if (!files || typeof files !== 'object' || Array.isArray(files) || !Object.keys(files).length) {
    throw new Error('Local hosting release has no bootstrap file manifest.');
  }
  for (const [relative, expected] of Object.entries(files)) {
    if (!relative || relative.includes('\\') || relative.startsWith('/') || relative.split('/').includes('..')) {
      throw new Error(`Unsafe bootstrap file path: ${relative}`);
    }
    const full = path.resolve(target, relative);
    if (!isInside(target, full)) throw new Error(`Bootstrap file is outside the release: ${relative}`);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error(`Bootstrap file is missing: ${relative}`);
    const wantedHash = String(expected && expected.sha256 || '').toLowerCase();
    const wantedSize = Number(expected && expected.size);
    if (!/^[a-f0-9]{64}$/.test(wantedHash) || !Number.isSafeInteger(wantedSize) || wantedSize < 0) {
      throw new Error(`Bootstrap file metadata is invalid: ${relative}`);
    }
    const stat = fs.statSync(full);
    if (stat.size !== wantedSize || hashFileSync(full).toLowerCase() !== wantedHash) {
      throw new Error(`Bootstrap file verification failed: ${relative}`);
    }
  }
}

function validateReleaseDir(directory, expectedVersion = '') {
  if (!fs.existsSync(RELEASES_DIR)) throw new Error('The releases directory is missing.');
  const requested = path.resolve(directory || '');
  if (!fs.existsSync(requested)) throw new Error('Target release directory does not exist.');
  const releasesRoot = fs.realpathSync(RELEASES_DIR);
  const target = fs.realpathSync(requested);
  if (!isInside(releasesRoot, target)) throw new Error('Target release is outside the releases directory.');
  const requestedStat = fs.lstatSync(requested);
  if (requestedStat.isSymbolicLink() || !fs.statSync(target).isDirectory()) throw new Error('Target release must be a real directory.');
  const packagePath = path.join(target, 'package.json');
  const hiddenManifestPath = path.join(target, '.release-manifest.json');
  const visibleManifestPath = path.join(target, 'release-manifest.json');
  const manifestPath = fs.existsSync(hiddenManifestPath) ? hiddenManifestPath : visibleManifestPath;
  const serverPath = path.join(target, 'server.js');
  if (!fs.existsSync(serverPath) || !fs.existsSync(packagePath) || !fs.existsSync(manifestPath)) throw new Error('Target release is incomplete or has no integrity manifest.');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!['p2pflow', 'manual-p2p-desk-crm'].includes(String(manifest.product || ''))) throw new Error('Target release manifest product is invalid.');
  if (String(manifest.version || '') !== String(pkg.version || '')) throw new Error('Target release package and manifest versions do not match.');
  if (expectedVersion && String(pkg.version || '') !== String(expectedVersion)) throw new Error(`Target release version ${pkg.version || 'unknown'} does not match requested version ${expectedVersion}.`);

  // The first manually deployed hosting release is verified by a visible list
  // of critical files. Shared hosting panels may legitimately omit hidden docs
  // or metadata, so a whole-tree hash made the initial release fail even when
  // all executable application files were intact. GitHub-downloaded releases
  // continue to use the complete signed tree hash.
  if (manifest.localInstall === true && manifest.bootstrapMode === 'critical-files') {
    validateBootstrapFiles(target, manifest);
  } else {
    if (!/^[a-f0-9]{64}$/i.test(String(manifest.treeSha256 || ''))) throw new Error('Target release tree digest is invalid.');
    const actualTree = releaseTreeSha256(target);
    if (actualTree.toLowerCase() !== String(manifest.treeSha256).toLowerCase()) throw new Error('Target release files do not match the integrity manifest.');
  }
  return target;
}
function pointerTarget() {
  const record = readJson(CURRENT_POINTER);
  if (!record) return '';
  const candidate = path.resolve(record.directory || path.join(RELEASES_DIR, String(record.version || '')));
  try { return fs.existsSync(candidate) ? fs.realpathSync(candidate) : ''; }
  catch { return ''; }
}

let lastReleaseValidationError = '';

function chooseLatestRelease() {
  lastReleaseValidationError = '';
  if (!fs.existsSync(RELEASES_DIR)) return '';
  const candidates = fs.readdirSync(RELEASES_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => path.join(RELEASES_DIR, entry.name))
    .filter(directory => fs.existsSync(path.join(directory, 'package.json')) && (fs.existsSync(path.join(directory, '.release-manifest.json')) || fs.existsSync(path.join(directory, 'release-manifest.json'))))
    .sort((a, b) => compareVersion(releaseVersion(b), releaseVersion(a)));
  for (const candidate of candidates) {
    try { return validateReleaseDir(candidate); }
    catch (candidateError) { lastReleaseValidationError = candidateError.message; error(`skipping invalid release ${candidate}: ${candidateError.message}`); }
  }
  return '';
}

function writeCurrentPointer(targetDir) {
  const target = validateReleaseDir(targetDir);
  const version = releaseVersion(target);
  writeJsonAtomic(CURRENT_POINTER, { format: 1, version, directory: target, switchedAt: new Date().toISOString() });
  return target;
}

function selectCurrentRelease() {
  const pointed = pointerTarget();
  if (pointed) {
    try { return validateReleaseDir(pointed); }
    catch (pointerError) { error(`current release pointer is invalid: ${pointerError.message}`); }
  }
  const latest = chooseLatestRelease();
  if (!latest) throw new Error(`No valid P2PFlow release is available in releases/.${lastReleaseValidationError ? ` Last validation error: ${lastReleaseValidationError}` : ''}`);
  return writeCurrentPointer(latest);
}

function readPendingActivation() {
  const value = readJson(PENDING_ACTIVATION_FILE);
  if (!value || Number(value.format || 0) !== 1) return null;
  return {
    previousDir: String(value.previousDir || ''),
    targetDir: String(value.targetDir || ''),
    targetVersion: String(value.targetVersion || ''),
    createdAt: String(value.createdAt || '')
  };
}

function clearPendingActivation() { removeFile(PENDING_ACTIVATION_FILE); }

function copyHostingEntryForNextRestart(targetDir) {
  const source = path.join(targetDir, 'scripts', 'p2pflow-hosting-entry.js');
  if (!fs.existsSync(source)) return false;
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Release shared-hosting entry must be a regular file.');
  const destination = path.join(ROOT, 'hosting-entry.js');
  const temporary = path.join(ROOT, `.hosting-entry-next-${process.pid}-${Date.now()}`);
  fs.copyFileSync(source, temporary);
  try { fs.chmodSync(temporary, 0o755); } catch {}
  fs.renameSync(temporary, destination);
  return true;
}

function scheduleProcessMessage(message) {
  setImmediate(() => {
    try { process.emit('message', message); }
    catch (emitError) { error(`unable to emit internal process message: ${emitError.message}`); }
  });
}

function recordActivationResult(result) {
  try { writeJsonAtomic(ACTIVATION_RESULT_FILE, { ...result, at: new Date().toISOString() }); }
  catch (resultError) { error(`unable to save activation result: ${resultError.message}`); }
}

function rollbackPendingActivation(reason) {
  const activation = pendingActivation;
  if (!activation || !activation.previousDir) {
    writeStartupFailure({
      code: 'ACTIVATION_FAILED_NO_ROLLBACK',
      message: 'The new release failed readiness and no previous release was available.',
      detail: reason,
      version: activation?.targetVersion || releaseVersion(activeDirectory)
    });
    clearPendingActivation();
    pendingActivation = null;
    return false;
  }
  try {
    const previous = validateReleaseDir(activation.previousDir);
    writeCurrentPointer(previous);
    clearPendingActivation();
    pendingActivation = null;
    recordActivationResult({
      status: 'rolled_back',
      version: activation.targetVersion,
      fromDir: activation.previousDir,
      targetDir: activation.targetDir,
      error: cleanText(reason, 1000)
    });
    writeStartupFailure({
      code: 'ACTIVATION_ROLLED_BACK',
      message: 'The new release failed readiness and the previous release was restored.',
      detail: reason,
      version: activation.targetVersion
    });
    error(`activation rolled back to ${previous}`);
    return true;
  } catch (rollbackError) {
    writeStartupFailure({
      code: 'ACTIVATION_ROLLBACK_FAILED',
      message: 'The new release failed and automatic rollback also failed.',
      detail: `${reason}; rollback: ${rollbackError.message}`,
      version: activation.targetVersion
    });
    clearPendingActivation();
    pendingActivation = null;
    return false;
  }
}

function startFailureServer(startupError) {
  if (failureServerStarted) return;
  failureServerStarted = true;
  const failure = writeStartupFailure({
    code: startupError.code || 'HOSTING_ENTRY_FAILED',
    message: 'P2PFlow could not start.',
    detail: startupError.stack || startupError.message || startupError,
    version: activeDirectory ? releaseVersion(activeDirectory) : ''
  });
  const port = Number(process.env.PORT || 3000);
  const server = http.createServer((req, res) => {
    const payload = JSON.stringify({ ok: false, status: 'startup_failed', app: 'P2PFlow', failure });
    res.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      'Cache-Control': 'no-store'
    });
    res.end(payload);
  });
  server.on('error', listenError => error(`failure server could not listen: ${listenError.message}`));
  server.listen(port, () => error(`diagnostic failure response is available on port ${port}`));
}

function handleBridgeSend(message) {
  if (!message || typeof message !== 'object') return true;

  if (message.type === 'app-ready') {
    clearStartupFailure();
    if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
    const activationResult = readJson(ACTIVATION_RESULT_FILE);
    if (pendingActivation) {
      const readyVersion = String(message.version || '');
      if (!pendingActivation.targetVersion || readyVersion === pendingActivation.targetVersion) {
        const completed = {
          status: 'applied',
          version: readyVersion || pendingActivation.targetVersion,
          fromDir: pendingActivation.previousDir,
          targetDir: pendingActivation.targetDir,
          ready: { version: readyVersion, schemaVersion: Number(message.schemaVersion || 0), pid: process.pid, at: new Date().toISOString() }
        };
        clearPendingActivation();
        pendingActivation = null;
        recordActivationResult(completed);
        log(`pending activation confirmed version=${completed.version}`);
      }
    }
    const finalResult = readJson(ACTIVATION_RESULT_FILE) || activationResult;
    if (finalResult) {
      removeFile(ACTIVATION_RESULT_FILE);
      scheduleProcessMessage({ type: 'launcher-update-result', ...finalResult });
    }
    return true;
  }

  if (message.type === 'app-startup-failed') {
    writeStartupFailure(message);
    if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
    if (pendingActivation) rollbackPendingActivation(message.detail || message.message || 'The activated release reported startup failure.');
    return true;
  }

  if (message.type === 'apply-release') {
    const requestId = String(message.requestId || '');
    if (!requestId) return true;
    if (switchInProgress) {
      scheduleProcessMessage({ type: 'launcher-ack', requestId, accepted: false, error: 'Another release switch is already in progress.' });
      return true;
    }
    try {
      const target = validateReleaseDir(message.targetDir, String(message.version || ''));
      const previous = validateReleaseDir(activeDirectory || selectCurrentRelease());
      switchInProgress = true;
      const activation = {
        format: 1,
        previousDir: previous,
        targetDir: target,
        targetVersion: String(message.version || releaseVersion(target)),
        createdAt: new Date().toISOString()
      };
      writeJsonAtomic(PENDING_ACTIVATION_FILE, activation);
      copyHostingEntryForNextRestart(target);
      writeCurrentPointer(target);
      scheduleProcessMessage({ type: 'launcher-ack', requestId, accepted: true, fromDir: previous, targetDir: target });
      // Give the API route enough time to send its 202 response, then ask the
      // application to flush data and exit. The hosting supervisor restarts the
      // same stable server.js, which loads the new pointer in this process.
      const timer = setTimeout(() => scheduleProcessMessage({ type: 'shutdown-for-switch', reason: 'release_switch' }), 1500);
      if (typeof timer.unref === 'function') timer.unref();
      log(`release switch scheduled ${releaseVersion(previous)} -> ${activation.targetVersion}`);
    } catch (switchError) {
      switchInProgress = false;
      scheduleProcessMessage({ type: 'launcher-ack', requestId, accepted: false, error: cleanText(switchError.message, 500) });
    }
    return true;
  }

  return true;
}

function installProcessBridge() {
  // Deliberately expose the same small IPC surface that the release already
  // understands. No child process is created; messages stay inside this
  // startup process.
  Object.defineProperty(process, 'send', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: handleBridgeSend
  });
}

function configureEnvironment() {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  fs.mkdirSync(SHARED_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(SETUP_DIR, { recursive: true, mode: 0o700 });
  process.env.P2PFLOW_INSTALL_ROOT = ROOT;
  process.env.CRM_INSTALL_ROOT = ROOT;
  process.env.P2PFLOW_ENV_FILE = ENV_FILE;
  process.env.CRM_ENV_FILE = ENV_FILE;
  process.env.P2PFLOW_SETUP_DIR = SETUP_DIR;
  process.env.CRM_SETUP_DIR = SETUP_DIR;
  process.env.P2PFLOW_RELEASES_DIR = RELEASES_DIR;
  process.env.CRM_RELEASES_DIR = RELEASES_DIR;
  process.env.P2PFLOW_SHARED_DIR = SHARED_DIR;
  process.env.CRM_SHARED_DIR = SHARED_DIR;
  process.env.P2PFLOW_CURRENT_LINK = CURRENT_LINK;
  process.env.CRM_CURRENT_LINK = CURRENT_LINK;
  process.env.P2PFLOW_CURRENT_POINTER = CURRENT_POINTER;
  process.env.CRM_CURRENT_POINTER = CURRENT_POINTER;
  process.env.P2PFLOW_MANAGED_INSTALL = 'true';
  process.env.CRM_MANAGED_INSTALL = 'true';
  process.env.P2PFLOW_SHARED_HOSTING_ENTRY = 'true';
  process.env.CRM_SHARED_HOSTING_ENTRY = 'true';
  process.env.P2PFLOW_LAUNCHER_PID = String(process.pid);
  process.env.CRM_LAUNCHER_PID = String(process.pid);
}

function armPendingActivationWatchdog() {
  pendingActivation = readPendingActivation();
  if (!pendingActivation) return;
  try {
    const expected = fs.realpathSync(pendingActivation.targetDir);
    if (expected !== fs.realpathSync(activeDirectory)) throw new Error('Pending activation target does not match the current release pointer.');
    validateReleaseDir(activeDirectory, pendingActivation.targetVersion);
  } catch (pendingError) {
    rollbackPendingActivation(pendingError.message);
    throw new Error('The pending release was invalid and the previous release pointer was restored. Restarting is required.');
  }
  readyTimer = setTimeout(() => {
    const rolledBack = rollbackPendingActivation(`Release ${pendingActivation?.targetVersion || ''} did not become ready within ${READY_TIMEOUT_MS}ms.`);
    if (rolledBack) process.exit(1);
  }, READY_TIMEOUT_MS);
  if (typeof readyTimer.unref === 'function') readyTimer.unref();
}

function start() {
  configureEnvironment();
  installProcessBridge();
  activeDirectory = selectCurrentRelease();
  armPendingActivationWatchdog();
  process.chdir(activeDirectory);
  const serverPath = path.join(activeDirectory, 'server.js');
  log(`starting release ${releaseVersion(activeDirectory)} in the hosting startup process`);
  require(serverPath);
}

try {
  start();
} catch (startupError) {
  if (pendingActivation) {
    const rolledBack = rollbackPendingActivation(startupError.stack || startupError.message);
    if (rolledBack) {
      const timer = setTimeout(() => process.exit(1), 100);
      if (typeof timer.unref === 'function') timer.unref();
    }
  }
  startFailureServer(startupError);
}
