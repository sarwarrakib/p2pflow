#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const major = Number.parseInt(process.versions.node.split('.')[0], 10);
if (!Number.isFinite(major) || major < 20) {
  throw new Error(`P2PFlow requires Node.js 20 or newer. Current: ${process.version}`);
}

for (const requiredPath of [
  'server.js',
  'package.json',
  'package-lock.json',
  'lib/hostingSetup.js',
  'lib/mysqlStateStore.js',
  'public/index.html',
  'public/setup.html'
]) {
  if (!fs.existsSync(path.join(root, requiredPath))) {
    throw new Error(`Deployment source is incomplete. Missing: ${requiredPath}`);
  }
}

function resolveProductionModule(request) {
  try {
    return require.resolve(request, { paths: [root] });
  } catch (error) {
    throw new Error(`Production dependency module is not resolvable: ${request}. Run npm ci --omit=dev before npm run build. (${error.code || error.message})`);
  }
}

for (const request of ['mysql2/promise', 'pg', 'pg-pool', 'ws']) resolveProductionModule(request);

console.log(JSON.stringify({
  ok: true,
  product: 'P2PFlow',
  version: pkg.version,
  node: process.version,
  message: 'Hosting deployment source is ready. Start with npm start or node server.js.'
}, null, 2));
