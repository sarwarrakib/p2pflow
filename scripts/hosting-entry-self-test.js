#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { computeReleaseTreeSha256 } = require('../lib/releaseIntegrity');

const sourceRoot = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2pflow-hosting-entry-'));
const releases = path.join(temp, 'releases');
const shared = path.join(temp, 'shared');
fs.mkdirSync(releases, { recursive: true });
fs.mkdirSync(shared, { recursive: true });
fs.copyFileSync(path.join(sourceRoot, 'scripts', 'p2pflow-hosting-entry.js'), path.join(temp, 'hosting-entry.js'));
fs.writeFileSync(path.join(temp, 'server.js'), `'use strict';\nconst path = require('path');\nprocess.env.P2PFLOW_INSTALL_ROOT = __dirname;\nprocess.env.P2PFLOW_ENV_FILE = path.join(__dirname, 'shared', '.env');\nrequire('./hosting-entry.js');\n`);

function writeRelease(version, options = {}) {
  const directory = path.join(releases, version);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'p2pflow', version }, null, 2) + '\n');
  const code = `'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const version = ${JSON.stringify(version)};
const port = Number(process.env.PORT || 3000);
const server = http.createServer((req, res) => { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true, version})); });
process.on('message', message => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'launcher-ack' && message.requestId === 'fixture-switch') {
    fs.writeFileSync(process.env.TEST_ACK_FILE, JSON.stringify(message));
  }
  if (message.type === 'shutdown-for-switch') server.close(() => process.exit(0));
});
server.listen(port, () => {
  if (process.send) process.send({ type: 'app-ready', version, schemaVersion: 26 });
  if (process.env.TEST_READY_FILE) fs.writeFileSync(process.env.TEST_READY_FILE, version);
  if (process.env.TEST_SWITCH_TARGET) {
    setTimeout(() => process.send({ type: 'apply-release', requestId: 'fixture-switch', version: '1.0.2', targetDir: process.env.TEST_SWITCH_TARGET }), 100);
  } else if (process.env.TEST_EXIT_AFTER_READY === 'true') {
    setTimeout(() => server.close(() => process.exit(0)), 300);
  }
});
`;
  fs.writeFileSync(path.join(directory, 'server.js'), code);
  if (options.includeEntry) {
    fs.mkdirSync(path.join(directory, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, 'scripts', 'p2pflow-hosting-entry.js'), path.join(directory, 'scripts', 'p2pflow-hosting-entry.js'));
  }
  const tree = computeReleaseTreeSha256(directory);
  const manifest = {
    format: options.bootstrapCritical ? 2 : 1,
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
  if (options.bootstrapCritical) {
    manifest.bootstrapMode = 'critical-files';
    manifest.bootstrapFiles = {};
    for (const relative of ['package.json', 'server.js']) {
      const content = fs.readFileSync(path.join(directory, relative));
      manifest.bootstrapFiles[relative] = { size: content.length, sha256: require('crypto').createHash('sha256').update(content).digest('hex') };
    }
    fs.writeFileSync(path.join(directory, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  } else {
    fs.writeFileSync(path.join(directory, '.release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
  return directory;
}

const first = writeRelease('1.0.1', { bootstrapCritical: true });
const second = writeRelease('1.0.2', { includeEntry: true });
fs.writeFileSync(path.join(shared, 'current-release.json'), JSON.stringify({ format: 1, version: '1.0.1', directory: first }, null, 2) + '\n');
const ackFile = path.join(temp, 'ack.json');
const readyFile = path.join(temp, 'ready.txt');
const port = String(33000 + Math.floor(Math.random() * 2000));

const firstRun = spawnSync(process.execPath, ['server.js'], {
  cwd: temp,
  env: { ...process.env, PORT: port, TEST_SWITCH_TARGET: second, TEST_ACK_FILE: ackFile },
  encoding: 'utf8',
  timeout: 15000
});
if (firstRun.error) throw firstRun.error;
if (firstRun.status !== 0) throw new Error(`First hosting-entry run failed: ${firstRun.stderr || firstRun.stdout}`);
if (!fs.existsSync(ackFile)) throw new Error('Same-process hosting entry did not acknowledge the release switch.');
const ack = JSON.parse(fs.readFileSync(ackFile, 'utf8'));
if (ack.accepted !== true) throw new Error(`Release switch was rejected: ${ack.error || 'unknown error'}`);
const pointerAfterSwitch = JSON.parse(fs.readFileSync(path.join(shared, 'current-release.json'), 'utf8'));
if (pointerAfterSwitch.version !== '1.0.2') throw new Error('Current release pointer was not updated to 1.0.2.');
if (!fs.existsSync(path.join(shared, 'pending-activation.json'))) throw new Error('Pending activation record was not created.');

const secondRun = spawnSync(process.execPath, ['server.js'], {
  cwd: temp,
  env: { ...process.env, PORT: port, TEST_READY_FILE: readyFile, TEST_EXIT_AFTER_READY: 'true' },
  encoding: 'utf8',
  timeout: 15000
});
if (secondRun.error) throw secondRun.error;
if (secondRun.status !== 0) throw new Error(`Second hosting-entry run failed: ${secondRun.stderr || secondRun.stdout}`);
if (fs.readFileSync(readyFile, 'utf8') !== '1.0.2') throw new Error('The restarted hosting entry did not start release 1.0.2.');
if (fs.existsSync(path.join(shared, 'pending-activation.json'))) throw new Error('Pending activation was not cleared after app-ready.');

console.log(JSON.stringify({
  ok: true,
  sameProcessHosting: true,
  switchAcknowledged: true,
  restartActivationConfirmed: true,
  pendingActivationCleared: true,
  version: '1.0.2'
}, null, 2));

fs.rmSync(temp, { recursive: true, force: true });
