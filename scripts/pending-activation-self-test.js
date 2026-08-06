#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { computeReleaseTreeSha256 } = require('../lib/releaseIntegrity');

const projectRoot = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rneed-pending-activation-test-'));
const releases = path.join(root, 'releases');
const shared = path.join(root, 'shared');
const current = path.join(root, 'current');
fs.mkdirSync(releases, { recursive: true });
fs.mkdirSync(shared, { recursive: true });

function writeRelease(version, fail) {
  const directory = path.join(releases, version);
  fs.mkdirSync(path.join(directory, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'pending-activation-fixture', version }, null, 2));
  fs.writeFileSync(path.join(directory, 'server.js'), fail ? `
'use strict';
if (process.send) process.send({ type: 'app-startup-failed', code: 'FIXTURE_FAILURE', message: 'Fixture failed.', detail: 'fixture startup failure', version: require('./package.json').version });
setTimeout(() => process.exit(1), 50);
` : `
'use strict';
process.on('message', message => { if (message && message.type === 'shutdown-for-switch') process.exit(0); });
if (process.send) process.send({ type: 'app-ready', version: require('./package.json').version, schemaVersion: 25 });
setInterval(() => {}, 1000);
`);
  fs.copyFileSync(path.join(projectRoot, 'scripts', 'p2pflow-launcher.js'), path.join(directory, 'scripts', 'p2pflow-launcher.js'));
  const tree = computeReleaseTreeSha256(directory);
  fs.writeFileSync(path.join(directory, '.release-manifest.json'), JSON.stringify({
    format: 1,
    product: 'p2pflow',
    version,
    treeSha256: tree.sha256
  }, null, 2));
  return directory;
}

const previous = writeRelease('1.0.159', false);
const target = writeRelease('1.0.166', true);
fs.symlinkSync(path.relative(root, target), current, 'dir');
fs.writeFileSync(path.join(shared, 'pending-activation.json'), JSON.stringify({
  format: 1,
  previousDir: previous,
  targetDir: target,
  targetVersion: '1.0.166',
  createdAt: new Date().toISOString()
}, null, 2));

const launcher = spawn(process.execPath, [path.join(projectRoot, 'scripts', 'p2pflow-launcher.js')], {
  cwd: projectRoot,
  env: {
    ...process.env,
    CRM_INSTALL_ROOT: root,
    CRM_ENV_FILE: path.join(shared, '.env'),
    CRM_UPDATE_READY_TIMEOUT_MS: '3000',
    CRM_LAUNCHER_RESTART_DELAY_MS: '500'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
launcher.stdout.on('data', chunk => { output += chunk.toString(); });
launcher.stderr.on('data', chunk => { output += chunk.toString(); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const failureFile = path.join(shared, 'startup-failure.json');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    let code = '';
    try { code = JSON.parse(fs.readFileSync(failureFile, 'utf8')).code || ''; } catch {}
    const rolledBack = fs.realpathSync(current) === fs.realpathSync(previous);
    const pendingCleared = !fs.existsSync(path.join(shared, 'pending-activation.json'));
    if (code === 'ACTIVATION_ROLLED_BACK' && rolledBack && pendingCleared) break;
    await sleep(100);
  }
  if (!fs.existsSync(failureFile)) throw new Error(`Startup failure report was not created.\n${output}`);
  if (fs.realpathSync(current) !== fs.realpathSync(previous)) throw new Error(`Pending activation did not roll back.\n${output}`);
  const failure = JSON.parse(fs.readFileSync(failureFile, 'utf8'));
  if (failure.code !== 'ACTIVATION_ROLLED_BACK') throw new Error(`Unexpected failure code: ${JSON.stringify(failure)}`);
  if (fs.existsSync(path.join(shared, 'pending-activation.json'))) throw new Error('Pending activation marker was not cleared after rollback.');
  launcher.kill('SIGTERM');
  await Promise.race([new Promise(resolve => launcher.once('exit', resolve)), sleep(3000)]);
  console.log(JSON.stringify({ ok: true, pendingActivationRollback: true, previousReleaseRestored: true, failureRecorded: true }, null, 2));
})().catch(error => {
  try { launcher.kill('SIGKILL'); } catch {}
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(() => {
  setTimeout(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} }, 50);
});
