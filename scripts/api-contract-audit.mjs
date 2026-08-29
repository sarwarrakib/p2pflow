#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, ext, out=[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (entry.isFile() && full.endsWith(ext)) out.push(full);
  }
  return out;
}
function normalize(raw) {
  let x = String(raw || '').replace(/\$\{[^}]+\}/g, '{}');
  x = x.split('?')[0].replace(/[),;]+$/g, '').replace(/\/+$/,'');
  x = x.replace(/\{[^}]+\}/g, '{}');
  // A template variable appended directly to a complete path is normally a query string (e.g. /api/ads${query}).
  if (x.endsWith('{}') && /[A-Za-z0-9]\{\}$/.test(x)) x = x.slice(0,-2);
  return x || '/';
}
const webPaths = new Set();
for (const file of walk('web','.js')) {
  const text = fs.readFileSync(file,'utf8').replace(/\$\{[^}]+\}/g,'{}');
  const re = /(["'`])(\/(?:api|setup\/api)\/[^"'`\s<>]*)\1/g;
  let m;
  while ((m = re.exec(text))) webPaths.add(normalize(m[2]));
}
const routes = new Set();
for (const file of walk('internal/httpapi','.go')) {
  const text = fs.readFileSync(file,'utf8');
  const re = /HandleFunc\("(?:GET|POST|PUT|PATCH|DELETE) ([^" ]+)/g;
  let m;
  while ((m = re.exec(text))) routes.add(normalize(m[1]));
}
function covered(p) {
  if (routes.has(p)) return true;
  // Concatenated legacy URL strings such as '/api/splits/' + id are represented
  // by the literal prefix during static analysis.
  if ([...routes].some(r => r.startsWith(p + '/{}'))) return true;
  // A frontend template wildcard can be a conditional suffix inside one segment
  // (for example delete-${type}); accept it when at least one concrete route fits.
  if (p.includes('{}')) {
    const pattern = '^' + p.split('{}').map(x => x.replace(/[.*+?^$()|[\]\\]/g, '\\$&')).join('[^/]+') + '$';
    const re = new RegExp(pattern);
    if ([...routes].some(r => re.test(r))) return true;
  }
  return false;
}
const missing = [...webPaths].filter(p => !covered(p)).sort();
console.log(`Frontend API paths: ${webPaths.size}`);
console.log(`Registered backend route patterns: ${routes.size}`);
if (missing.length) {
  console.error('Unmatched frontend API path(s):');
  for (const p of missing) console.error(`  ${p}`);
  process.exit(1);
}
console.log('Frontend/backend API path contract audit passed.');
