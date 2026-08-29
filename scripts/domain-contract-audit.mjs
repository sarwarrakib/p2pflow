#!/usr/bin/env node
import fs from 'node:fs';

const nginx = fs.readFileSync('deploy/nginx/p2pflow-split-domains.conf.example', 'utf8');
const docs = fs.readFileSync('docs/DOMAIN_DEPLOYMENT_BN.md', 'utf8');
const env = fs.readFileSync('.env.example', 'utf8');
const apiUnit = fs.readFileSync('deploy/systemd/p2pflow-api.service', 'utf8');
const workerUnit = fs.readFileSync('deploy/systemd/p2pflow-worker.service', 'utf8');

for (const token of ['app.example.com', 'admin.example.com', 'api.example.com', 'location ^~ /api/', 'location = /api/events', 'return 404']) {
  if (!nginx.includes(token)) throw new Error(`split-domain nginx token missing: ${token}`);
}
for (const token of ['Website frontend', 'Main HTTP API + Web server', 'P2PFLOW_PUBLIC_BASE_URL=https://app.example.com', 'api.example.com/api/...']) {
  if (!docs.includes(token)) throw new Error(`domain guide token missing: ${token}`);
}
for (const token of ['P2PFLOW_PUBLIC_BASE_URL=', 'P2PFLOW_LISTEN=127.0.0.1:8080', 'P2PFLOW_AUTO_MIGRATE=false', 'NATS_URL=']) {
  if (!env.includes(token)) throw new Error(`production env deployment token missing: ${token}`);
}
for (const token of ['WorkingDirectory=/opt/p2pflow/current', 'EnvironmentFile=/opt/p2pflow/data/p2pflow.env', 'Environment=P2PFLOW_WORKERS=false']) {
  if (!apiUnit.includes(token)) throw new Error(`API systemd deployment token missing: ${token}`);
}
if (!workerUnit.includes('Environment=P2PFLOW_WORKERS=true')) throw new Error('worker systemd unit must enable workers');
console.log('Split-domain deployment contract audit passed (v2.0.8).');
