#!/usr/bin/env node
'use strict';

// P2PFlow unified shared-hosting supervisor.
// The application server runs in the MAIN Node thread for maximum shared-hosting
// compatibility. Updates are staged in releases/, selected by a signed pointer,
// and activated by a normal hosting process restart. No worker-thread or child
// HTTP server is used.

const fs = require('fs');
const path = require('path');
const { computeReleaseTreeSha256 } = require('./lib/releaseIntegrity');
const { syncPublicMirror } = require('./lib/publicAssetMirror');

const ROOT = path.resolve(__dirname);
const RELEASES_DIR = path.join(ROOT, 'releases');
const SHARED_DIR = path.join(ROOT, 'shared');
const CURRENT_POINTER = path.join(SHARED_DIR, 'current-release.json');
const STARTUP_FAILURE_FILE = path.join(SHARED_DIR, 'startup-failure.json');
const PENDING_ACTIVATION_FILE = path.join(SHARED_DIR, 'pending-activation.json');
const ROOT_STATE_FILE = path.join(SHARED_DIR, 'root-package-state.json');
const ENV_FILE = process.env.P2PFLOW_ENV_FILE || process.env.CRM_ENV_FILE || path.join(ROOT, '.env');
const SETUP_DIR = process.env.P2PFLOW_SETUP_DIR || process.env.CRM_SETUP_DIR || path.join(ROOT, '.p2pflow');
const ROOT_PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const ROOT_VERSION = String(ROOT_PACKAGE.version || '0.0.0');

let activeTarget = '';
let activeVersion = '';
let shutdownRequested = false;
const appMessageHandlers = new Set();

function log(...args) { console.log(new Date().toISOString(), '[p2pflow-supervisor]', ...args); }
function logError(...args) { console.error(new Date().toISOString(), '[p2pflow-supervisor]', ...args); }

function parseSemver(value) {
  const match = String(value || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return { major:Number(match[1]), minor:Number(match[2]), patch:Number(match[3]), pre:match[4] || '' };
}
function compareSemver(a, b) {
  const av = parseSemver(a); const bv = parseSemver(b);
  if (!av || !bv) return String(a || '').localeCompare(String(b || ''));
  for (const key of ['major','minor','patch']) if (av[key] !== bv[key]) return av[key] > bv[key] ? 1 : -1;
  if (av.pre === bv.pre) return 0;
  if (!av.pre) return 1;
  if (!bv.pre) return -1;
  return av.pre.localeCompare(bv.pre);
}
function atomicJson(file, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive:true, mode:0o700 });
  const temp = `${file}.next-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode });
  fs.renameSync(temp, file);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function safeUnlink(file) { try { fs.unlinkSync(file); } catch {} }
function writeStartupFailure(code, message, detail = '', version = '') {
  try {
    atomicJson(STARTUP_FAILURE_FILE, {
      code:String(code || 'STARTUP_FAILED').slice(0,80),
      message:String(message || 'P2PFlow could not start.').slice(0,500),
      detail:String(detail || '').slice(0,4000),
      version:String(version || '').slice(0,40),
      at:new Date().toISOString()
    });
  } catch {}
}
function clearStartupFailure() { safeUnlink(STARTUP_FAILURE_FILE); }
function releaseVersion(directory) {
  try { return String(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).version || ''); } catch { return ''; }
}
function inside(parent, child) {
  const root = path.resolve(parent) + path.sep;
  return `${path.resolve(child)}${path.sep}`.startsWith(root);
}
function pointerTarget() {
  try {
    const record = readJson(CURRENT_POINTER);
    if (!record || (!record.directory && !record.version)) return '';
    const candidate = path.resolve(record.directory || path.join(RELEASES_DIR, String(record.version || '')));
    if (candidate === path.resolve(RELEASES_DIR)) return '';
    if (fs.existsSync(candidate) && inside(RELEASES_DIR, candidate)) return fs.realpathSync(candidate);
  } catch {}
  return '';
}
function validateReleaseDir(directory, expectedVersion = '') {
  const target = fs.realpathSync(path.resolve(directory));
  const releasesRoot = fs.realpathSync(RELEASES_DIR);
  if (!inside(releasesRoot, target)) throw new Error('Release is outside the managed releases directory.');
  for (const required of ['app-server.js','server.js','package.json','lib','public']) {
    if (!fs.existsSync(path.join(target, required))) throw new Error(`Release is missing ${required}.`);
  }
  const hiddenManifest = path.join(target, '.release-manifest.json');
  const visibleManifest = path.join(target, 'release-manifest.json');
  const manifestPath = fs.existsSync(hiddenManifest) ? hiddenManifest : visibleManifest;
  if (!fs.existsSync(manifestPath)) throw new Error('Release has no integrity manifest.');
  const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (String(pkg.version || '') !== String(manifest.version || '')) throw new Error('Release package and manifest versions do not match.');
  if (expectedVersion && String(pkg.version || '') !== String(expectedVersion)) throw new Error(`Release version ${pkg.version || 'unknown'} does not match ${expectedVersion}.`);
  if (!/^[a-f0-9]{64}$/i.test(String(manifest.treeSha256 || ''))) throw new Error('Release tree hash is invalid.');
  const tree = computeReleaseTreeSha256(target);
  if (tree.sha256.toLowerCase() !== String(manifest.treeSha256).toLowerCase()) throw new Error('Release tree verification failed.');
  if (Number(manifest.treeFiles) !== tree.fileCount || Number(manifest.treeBytes) !== tree.totalBytes) throw new Error('Release tree size verification failed.');
  return target;
}

const SNAPSHOT_EXCLUDES = new Set([
  '.git','node_modules','releases','shared','dist','dist-unified','data','legacy-import','.p2pflow',
  '.env','.env.local','P2PFLOW_SETUP_CODE.txt','startup-failure.json'
]);
function copySnapshotTree(source, destination, relative = '') {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Snapshot contains a symbolic link: ${relative || source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive:true, mode:0o755 });
    for (const name of fs.readdirSync(source)) {
      if (!relative && SNAPSHOT_EXCLUDES.has(name)) continue;
      const childRelative = relative ? `${relative}/${name}` : name;
      copySnapshotTree(path.join(source, name), path.join(destination, name), childRelative);
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`Unsupported snapshot object: ${relative || source}`);
  fs.mkdirSync(path.dirname(destination), { recursive:true });
  fs.copyFileSync(source, destination);
}
function ensureRootSnapshot() {
  if (!parseSemver(ROOT_VERSION)) throw new Error(`Invalid package version ${ROOT_VERSION}.`);
  fs.mkdirSync(RELEASES_DIR, { recursive:true, mode:0o755 });
  fs.mkdirSync(SHARED_DIR, { recursive:true, mode:0o700 });
  const finalDir = path.join(RELEASES_DIR, ROOT_VERSION);
  if (fs.existsSync(finalDir)) {
    try { return validateReleaseDir(finalDir, ROOT_VERSION); }
    catch (error) {
      log(`rebuilding local ${ROOT_VERSION} snapshot: ${error.message}`);
      fs.rmSync(finalDir, { recursive:true, force:true });
    }
  }
  const stage = path.join(RELEASES_DIR, `.bootstrap-${ROOT_VERSION}-${process.pid}-${Date.now()}`);
  fs.rmSync(stage, { recursive:true, force:true });
  try {
    copySnapshotTree(ROOT, stage);
    const tree = computeReleaseTreeSha256(stage);
    const manifest = {
      format:2,
      product:'p2pflow',
      dataCompatibilityEpoch:1,
      version:ROOT_VERSION,
      tag:`v${ROOT_VERSION}`,
      node:'>=20.0.0',
      schema:{ min:26, max:2147483647 },
      localInstall:true,
      treeSha256:tree.sha256,
      treeFiles:tree.fileCount,
      treeBytes:tree.totalBytes,
      installedAt:new Date().toISOString(),
      source:'unified-package-main-thread'
    };
    fs.writeFileSync(path.join(stage, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.renameSync(stage, finalDir);
    return validateReleaseDir(finalDir, ROOT_VERSION);
  } catch (error) {
    fs.rmSync(stage, { recursive:true, force:true });
    throw error;
  }
}
function switchPointer(target) {
  const valid = validateReleaseDir(target);
  const version = releaseVersion(valid);
  // Some shared-hosting stacks serve files under <application-root>/public
  // directly through Apache/LiteSpeed before the Node process sees the request.
  // Keep that public mirror synchronized with the selected managed release so
  // server/API version and browser UI can never drift apart after an update.
  syncPublicMirror(valid, ROOT);
  atomicJson(CURRENT_POINTER, {
    format:3,
    version,
    directory:valid,
    switchedAt:new Date().toISOString(),
    supervisor:'main-thread-restart'
  });
  return valid;
}
function readPending() { return readJson(PENDING_ACTIVATION_FILE); }
function writePending(value) { atomicJson(PENDING_ACTIVATION_FILE, value); }
function clearPending() { safeUnlink(PENDING_ACTIVATION_FILE); }
function writeRootState(extra = {}) {
  atomicJson(ROOT_STATE_FILE, {
    format:1,
    rootVersion:ROOT_VERSION,
    recordedAt:new Date().toISOString(),
    ...extra
  });
}
function rootStateVersion() { return String((readJson(ROOT_STATE_FILE) || {}).rootVersion || ''); }
function pendingTargetIfValid(pending) {
  if (!pending || !pending.targetDir) return '';
  try { return validateReleaseDir(pending.targetDir, pending.toVersion || ''); } catch { return ''; }
}
function pendingPreviousIfValid(pending) {
  if (!pending || !pending.previousDir) return '';
  try { return validateReleaseDir(pending.previousDir, pending.fromVersion || ''); } catch { return ''; }
}
function chooseInitialTarget() {
  let local = '';
  try { local = ensureRootSnapshot(); }
  catch (error) { logError(`local snapshot failed: ${error.message}`); }

  let pointed = pointerTarget();
  if (pointed) {
    try { pointed = validateReleaseDir(pointed); }
    catch (error) { log(`ignoring invalid current release: ${error.message}`); pointed = ''; }
  }

  const pending = readPending();
  if (pending && pending.status === 'activating') {
    const target = pendingTargetIfValid(pending);
    if (target) {
      if (!pointed || path.resolve(pointed) !== path.resolve(target)) switchPointer(target);
      return target;
    }
  }
  if (pending && pending.status === 'recovering') {
    const previous = pendingPreviousIfValid(pending);
    if (previous) {
      if (!pointed || path.resolve(pointed) !== path.resolve(previous)) switchPointer(previous);
      return previous;
    }
  }

  if (!pointed && local) {
    writeRootState({ action:'fresh_or_recovered' });
    return switchPointer(local);
  }

  const knownRoot = rootStateVersion();
  if (local && pointed && knownRoot !== ROOT_VERSION && compareSemver(ROOT_VERSION, releaseVersion(pointed)) > 0) {
    const previousVersion = releaseVersion(pointed);
    writeRootState({ action:'manual_package_seen', previousVersion });
    writePending({
      format:1,
      status:'activating',
      mode:'manual_package',
      fromVersion:previousVersion,
      previousDir:pointed,
      toVersion:ROOT_VERSION,
      targetDir:local,
      requestedAt:new Date().toISOString()
    });
    return switchPointer(local);
  }

  if (knownRoot !== ROOT_VERSION) writeRootState({ action:'root_recorded', pointerVersion:pointed ? releaseVersion(pointed) : '' });
  if (pointed) return pointed;
  if (local) return switchPointer(local);
  if (fs.existsSync(path.join(ROOT, 'app-server.js'))) return ROOT;
  throw new Error('No runnable P2PFlow application is available.');
}

function sendToApp(message) {
  for (const handler of Array.from(appMessageHandlers)) {
    try { handler(message); } catch (error) { logError(`app message handler failed: ${error.message}`); }
  }
}
function registerAppHandler(handler) {
  if (typeof handler !== 'function') return () => {};
  appMessageHandlers.add(handler);
  return () => appMessageHandlers.delete(handler);
}
function scheduleProcessRestart() {
  if (shutdownRequested) return;
  shutdownRequested = true;
  setTimeout(() => sendToApp({ type:'shutdown-for-switch', reason:'release_switch' }), 1200);
}
function handleActivationSuccess(message) {
  clearStartupFailure();
  const pending = readPending();
  if (!pending) return;
  const currentVersion = String(message.version || activeVersion || '');
  if (pending.status === 'activating' && currentVersion === String(pending.toVersion || '')) {
    const resultStatus = pending.mode === 'rollback' ? 'rolled_back' : 'applied';
    clearPending();
    sendToApp({
      type:'launcher-update-result',
      status:resultStatus,
      version:currentVersion,
      fromVersion:String(pending.fromVersion || ''),
      targetDir:activeTarget,
      receivedAfterRestart:true
    });
    log(`release activation completed ${pending.fromVersion || '-'} -> ${currentVersion}`);
    return;
  }
  if (pending.status === 'recovering' && currentVersion === String(pending.fromVersion || '')) {
    clearPending();
    sendToApp({
      type:'launcher-update-result',
      status:'rolled_back',
      version:String(pending.toVersion || ''),
      fromVersion:currentVersion,
      error:String(pending.error || 'The new release failed to start and the previous release was restored.'),
      automatic:true,
      receivedAfterRestart:true
    });
    log(`automatic rollback completed to ${currentVersion}`);
  }
}
function handleStartupFailure(message) {
  const failedVersion = String(message.version || activeVersion || '');
  const detail = String(message.detail || message.message || 'Application startup failed.');
  writeStartupFailure(message.code || 'APP_STARTUP_FAILED', message.message || 'P2PFlow could not start.', detail, failedVersion);
  const pending = readPending();
  if (pending && pending.status === 'activating' && failedVersion === String(pending.toVersion || '')) {
    const previous = pendingPreviousIfValid(pending);
    if (previous) {
      try {
        switchPointer(previous);
        writePending({ ...pending, status:'recovering', error:detail, failedAt:new Date().toISOString() });
        logError(`release ${failedVersion} failed; previous release ${pending.fromVersion || ''} restored for next restart`);
      } catch (error) {
        logError(`automatic rollback pointer restore failed: ${error.message}`);
      }
    }
  }
}
function handleApplyRelease(message) {
  const requestId = String(message.requestId || '');
  try {
    const target = validateReleaseDir(message.targetDir, String(message.version || ''));
    const previous = pointerTarget() || activeTarget;
    if (!previous) throw new Error('Current release could not be resolved.');
    const previousValid = validateReleaseDir(previous);
    const targetVersion = releaseVersion(target);
    const previousVersion = releaseVersion(previousValid);
    writePending({
      format:1,
      status:'activating',
      mode:String(message.mode || 'update'),
      fromVersion:previousVersion,
      previousDir:previousValid,
      toVersion:targetVersion,
      targetDir:target,
      requestedAt:new Date().toISOString()
    });
    switchPointer(target);
    sendToApp({ type:'launcher-ack', requestId, accepted:true, fromDir:previousValid, targetDir:target });
    log(`release restart requested ${previousVersion} -> ${targetVersion}`);
    scheduleProcessRestart();
  } catch (error) {
    sendToApp({ type:'launcher-ack', requestId, accepted:false, error:error.message });
  }
}
function receiveFromApp(message) {
  if (!message || typeof message !== 'object') return false;
  if (message.type === 'app-ready') { handleActivationSuccess(message); return true; }
  if (message.type === 'app-startup-failed') { handleStartupFailure(message); return true; }
  if (message.type === 'apply-release') { handleApplyRelease(message); return true; }
  return false;
}

global.__P2PFLOW_SUPERVISOR__ = {
  mode:'main-thread-restart',
  send:receiveFromApp,
  register:registerAppHandler,
  installRoot:ROOT,
  releasesDir:RELEASES_DIR,
  sharedDir:SHARED_DIR,
  currentPointer:CURRENT_POINTER
};

process.env.P2PFLOW_INSTALL_ROOT = ROOT;
process.env.P2PFLOW_ENV_FILE = ENV_FILE;
process.env.P2PFLOW_SETUP_DIR = SETUP_DIR;
process.env.P2PFLOW_RELEASES_DIR = RELEASES_DIR;
process.env.P2PFLOW_SHARED_DIR = SHARED_DIR;
process.env.P2PFLOW_CURRENT_POINTER = CURRENT_POINTER;
process.env.P2PFLOW_SUPERVISOR_CONNECTED = 'true';
process.env.P2PFLOW_SHARED_HOSTING_ENTRY = 'true';
process.env.P2PFLOW_MANAGED_INSTALL = 'true';
process.env.CRM_INSTALL_ROOT = ROOT;
process.env.CRM_ENV_FILE = ENV_FILE;
process.env.CRM_SETUP_DIR = SETUP_DIR;
process.env.CRM_RELEASES_DIR = RELEASES_DIR;
process.env.CRM_SHARED_DIR = SHARED_DIR;
process.env.CRM_CURRENT_POINTER = CURRENT_POINTER;
process.env.CRM_MANAGED_INSTALL = 'true';

process.on('uncaughtException', error => {
  logError(error.stack || error.message);
  writeStartupFailure('SUPERVISOR_UNCAUGHT', 'P2PFlow supervisor failed.', error.stack || error.message, activeVersion || ROOT_VERSION);
  process.exitCode = 1;
});
process.on('unhandledRejection', error => {
  logError(error && (error.stack || error.message) || error);
});

try {
  fs.mkdirSync(RELEASES_DIR, { recursive:true, mode:0o755 });
  fs.mkdirSync(SHARED_DIR, { recursive:true, mode:0o700 });
  activeTarget = chooseInitialTarget();
  activeVersion = releaseVersion(activeTarget) || ROOT_VERSION;
  const appPath = path.join(activeTarget, 'app-server.js');
  if (!fs.existsSync(appPath)) throw new Error(`Application entry is missing: ${appPath}`);
  log(`starting application in main thread release=${activeVersion} target=${activeTarget}`);
  require(appPath);
} catch (error) {
  logError(error.stack || error.message);
  writeStartupFailure('SUPERVISOR_BOOT_FAILED', 'P2PFlow could not start.', error.stack || error.message, activeVersion || ROOT_VERSION);
  const pending = readPending();
  if (pending && pending.status === 'activating') {
    const previous = pendingPreviousIfValid(pending);
    if (previous) {
      try {
        switchPointer(previous);
        writePending({ ...pending, status:'recovering', error:error.stack || error.message, failedAt:new Date().toISOString() });
      } catch {}
    }
  }
  process.exitCode = 1;
}
