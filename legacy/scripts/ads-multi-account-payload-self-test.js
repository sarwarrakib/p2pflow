'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, ['app-server.js', '--ads-multi-account-payload-self-test'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, NODE_ENV: 'test' }
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  console.error(`Unable to run Ads multi-account payload self-test: ${result.error.message}`);
  process.exit(1);
}
process.exit(Number.isInteger(result.status) ? result.status : 1);
