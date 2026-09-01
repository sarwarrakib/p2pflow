'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, ['app-server.js', '--ads-merchant-account-self-test'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, NODE_ENV: 'test' }
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
