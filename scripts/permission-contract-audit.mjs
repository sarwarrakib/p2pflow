#!/usr/bin/env node
import fs from 'node:fs';

const go = fs.readFileSync('internal/httpapi/account_permissions.go','utf8');
const app = fs.readFileSync('web/app.js','utf8');
const server = fs.readFileSync('internal/httpapi/server.go','utf8');
const orders = fs.readFileSync('internal/httpapi/orders.go','utf8');
const creds = fs.readFileSync('internal/httpapi/credentials.go','utf8');

const block = go.match(/accountScopedPermissionCodes\s*=\s*\[\]string\{([\s\S]*?)\}/)?.[1] || '';
const canonical = [...block.matchAll(/"([a-z0-9_.]+)"/g)].map(m=>m[1]);
if (!canonical.length) throw new Error('canonical account permission list is empty');
if (new Set(canonical).size !== canonical.length) throw new Error('duplicate canonical account permission');
const required = ['orders.view','orders.create','orders.manage','orders.assign','orders.split','orders.final_action','orders.quick_release','binance.sync','binance.chat','ads.view','ads.manage','p2p.profile.view','p2p.profile.sync'];
for (const code of required) if (!canonical.includes(code)) throw new Error(`missing account-scoped permission ${code}`);

const labels = app.slice(app.indexOf('const PERMISSION_LABELS ='), app.indexOf('function permissionHelpHtml'));
for (const code of canonical) if (!labels.includes(`'${code}'`) && !labels.includes(`"${code}"`)) throw new Error(`frontend permission help missing ${code}`);

const descriptionBlock = app.slice(app.indexOf('const PERMISSION_DESCRIPTIONS ='), app.indexOf('function permissionDescription'));
const seeded = new Set();
for (const name of fs.readdirSync('migrations/postgres').filter(x => x.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(`migrations/postgres/${name}`,'utf8');
  for (const match of sql.matchAll(/\('([a-z][a-z0-9_.]+)'\s*,/g)) if (match[1].includes('.')) seeded.add(match[1]);
}
for (const code of seeded) {
  if (!labels.includes(`'${code}'`) && !labels.includes(`"${code}"`)) throw new Error(`frontend permission label missing ${code}`);
  if (!descriptionBlock.includes(`'${code}'`) && !descriptionBlock.includes(`"${code}"`)) throw new Error(`frontend permission description missing ${code}`);
}

const matrix = app.slice(app.indexOf('function binanceCredentialPermissionMatrix'), app.indexOf('function selectedBinanceCredentialPermissions'));
for (const code of canonical) if (!matrix.includes(`'${code}'`) && !matrix.includes(`"${code}"`)) throw new Error(`frontend Binance permission matrix missing ${code}`);

if (!orders.includes('POST /api/binance/sync/orders", s.requirePerm("binance.sync"')) throw new Error('orders sync route is not guarded by binance.sync');
if (!creds.includes('POST /api/me/p2p-profile", s.requirePerm("p2p.profile.sync"')) throw new Error('profile sync route is not guarded by p2p.profile.sync');
if (server.includes('if total == 0 {\n\t\treturn true')) throw new Error('legacy allow-all account permission fallback detected');

for (const family of ['postgres','mysql','mariadb']) {
  const migration = fs.readFileSync(`migrations/${family}/015_accounting_permission_scale.sql`,'utf8');
  for (const code of ['binance.sync','p2p.profile.sync']) if (!migration.includes(code)) throw new Error(`${family} migration does not seed ${code}`);
}
console.log(`Account permission contract audit passed (${canonical.length} account-scoped permissions).`);
