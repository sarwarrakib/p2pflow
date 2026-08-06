#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { computeReleaseTreeSha256 } = require('../lib/releaseIntegrity');

const projectRoot = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rneed-launcher-test-'));
const releases = path.join(root, 'releases');
const shared = path.join(root, 'shared');
const current = path.join(root, 'current');
fs.mkdirSync(releases, { recursive: true });
fs.mkdirSync(shared, { recursive: true });
fs.writeFileSync(path.join(root, '.env'), 'P2PFLOW_TEST_MIGRATION=yes\n');
fs.mkdirSync(path.join(root, '.p2pflow'), { recursive: true });
fs.writeFileSync(path.join(root, '.p2pflow', 'setup-complete.json'), JSON.stringify({ complete: true }));

function writeRelease(version) {
  const directory = path.join(releases, version);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'launcher-fixture', version }, null, 2));
  fs.writeFileSync(path.join(directory, 'server.js'), `
'use strict';
const fs = require('fs');
const path = require('path');
const version = require('./package.json').version;
const root = process.env.CRM_INSTALL_ROOT;
const shared = path.join(root, 'shared');
process.on('message', message => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'shutdown-for-switch') process.exit(0);
  if (message.type === 'launcher-update-result') {
    fs.writeFileSync(path.join(shared, 'launcher-result.json'), JSON.stringify(message));
  }
});
if (process.send) process.send({ type: 'app-ready', version, schemaVersion: 25 });
if (version === '1.0.159' && !fs.existsSync(path.join(shared, 'switch-requested'))) {
  fs.writeFileSync(path.join(shared, 'switch-requested'), '1');
  setTimeout(() => process.send && process.send({
    type: 'apply-release',
    requestId: 'launcher-self-test',
    version: '1.0.166',
    targetDir: path.join(root, 'releases', '1.0.166')
  }), 250);
}
setInterval(() => {}, 1000);
`);
  fs.mkdirSync(path.join(directory, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(projectRoot, 'scripts', 'p2pflow-launcher.js'), path.join(directory, 'scripts', 'p2pflow-launcher.js'));
  const tree = computeReleaseTreeSha256(directory);
  fs.writeFileSync(path.join(directory, '.release-manifest.json'), JSON.stringify({
    format: 1,
    product: 'p2pflow',
    version,
    node: '>=20.0.0',
    schema: { min: 25, max: 2147483647 },
    localInstall: true,
    treeSha256: tree.sha256
  }, null, 2));
  return directory;
}

const oldRelease = writeRelease('1.0.159');
const newRelease = writeRelease('1.0.166');
fs.symlinkSync(path.relative(root, oldRelease), current, 'dir');
const launcher = spawn(process.execPath, [path.join(projectRoot, 'scripts', 'p2pflow-launcher.js')], {
  cwd: projectRoot,
  env: {
    ...process.env,
    CRM_INSTALL_ROOT: root,
    CRM_ENV_FILE: path.join(shared, '.env'),
    CRM_UPDATE_READY_TIMEOUT_MS: '5000',
    CRM_LAUNCHER_RESTART_DELAY_MS: '500'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
launcher.stdout.on('data', chunk => { output += chunk.toString(); });
launcher.stderr.on('data', chunk => { output += chunk.toString(); });

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

(async () => {
  const deadline = Date.now() + 12000;
  const resultPath = path.join(shared, 'launcher-result.json');
  while (!fs.existsSync(resultPath) && Date.now() < deadline) await sleep(100);
  if (!fs.existsSync(resultPath)) throw new Error(`Launcher result was not created.\n${output}`);
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const active = fs.realpathSync(current);
  if (result.status !== 'applied' || result.launcherUpdated !== true) throw new Error(`Unexpected launcher result: ${JSON.stringify(result)}`);
  if (active !== fs.realpathSync(newRelease)) throw new Error(`Current release mismatch: ${active}`);
  const installedLauncher = path.join(root, 'launcher.js');
  if (!fs.existsSync(installedLauncher)) throw new Error('Stable launcher was not refreshed after a successful switch.');
  if (fs.readFileSync(installedLauncher, 'utf8') !== fs.readFileSync(path.join(newRelease, 'scripts', 'p2pflow-launcher.js'), 'utf8')) throw new Error('Stable launcher content does not match the active release.');
  if (!fs.existsSync(path.join(shared, '.env'))) throw new Error('Legacy root .env was not migrated to shared/.env.');
  if (!fs.existsSync(path.join(shared, '.p2pflow', 'setup-complete.json'))) throw new Error('Legacy root .p2pflow setup state was not merged into shared/.p2pflow.');
  launcher.kill('SIGTERM');
  await Promise.race([new Promise(resolve => launcher.once('exit', resolve)), sleep(3000)]);
  console.log(JSON.stringify({ ok: true, atomicSwitch: true, readinessHandshake: true, treeIntegrityChecked: true, stableLauncherRefreshed: true, legacyPersistentStateMigrated: true, activeVersion: '1.0.166' }, null, 2));
})().catch(async error => {
  try { launcher.kill('SIGKILL'); } catch {}
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(() => {
  setTimeout(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} }, 50);
});
