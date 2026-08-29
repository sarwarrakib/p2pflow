#!/usr/bin/env node
import fs from 'node:fs';

const app = fs.readFileSync('web/app.js', 'utf8');
const server = fs.readFileSync('internal/httpapi/server.go', 'utf8');
const auth = fs.readFileSync('internal/httpapi/auth.go', 'utf8');

function sliceBetween(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`unable to locate ${start}`);
  return source.slice(a, b);
}

const pagesBlock = sliceBetween(app, 'const pages = [', '];');
const pages = [...pagesBlock.matchAll(/\['([^']+)'\s*,/g)].map(match => match[1]);
if (pages.length < 20) throw new Error(`unexpectedly small page registry: ${pages.length}`);
if (new Set(pages).size !== pages.length) throw new Error('duplicate page id in browser page registry');

const permissionsBlock = sliceBetween(app, 'const PAGE_PERMISSIONS = {', '};');
const entries = [...permissionsBlock.matchAll(/(?:^|\n)\s*(?:'([^']+)'|([a-zA-Z0-9_-]+))\s*:\s*(?:'([^']+)'|null)\s*,?/g)];
const pagePermissions = new Map(entries.map(match => [match[1] || match[2], match[3] || null]));
for (const page of pages) {
  if (!pagePermissions.has(page)) throw new Error(`PAGE_PERMISSIONS missing page ${page}`);
}

const requiredPermissions = new Map([
  ['dashboard', 'dashboard.view'],
  ['p2p-market', 'market.view'],
  ['p2p-profile', 'p2p.profile.view'],
  ['orders', 'orders.view'],
  ['ads', 'ads.view'],
  ['approvals', 'approvals.manage'],
  ['accounts', 'accounts.view'],
  ['agents', 'users.manage'],
  ['user-roles', 'roles.manage'],
  ['routing', 'routing.manage'],
  ['reports', 'reports.view'],
  ['accounting', 'accounting.view'],
  ['credentials', 'credentials.manage'],
  ['health', 'settings.manage'],
  ['system-update', 'system.update'],
  ['settings', 'settings.manage'],
  ['billing', 'billing.view'],
  ['super-admin', 'superadmin.view'],
  ['p2p-extension', 'extension.manage'],
  ['audit', 'audit.view'],
]);
for (const [page, permission] of requiredPermissions) {
  if (pagePermissions.get(page) !== permission) {
    throw new Error(`${page} expected permission ${permission}, got ${pagePermissions.get(page)}`);
  }
}

const visiblePagesBlock = sliceBetween(app, 'function visiblePages() {', '\n}');
for (const token of [
  'hasPerm(PAGE_PERMISSIONS[id])',
  "id === 'system-update'",
  'state.user?.isOwner === true',
  'state.user?.isSuperAdmin === true',
  "id === 'super-admin'",
]) {
  if (!visiblePagesBlock.includes(token)) throw new Error(`visiblePages boundary missing: ${token}`);
}

if (!server.includes('GET /api/me", s.requireUser(s.me)')) throw new Error('/api/me is not authenticated');
for (const token of ['"permissions": u.Permissions', '"isOwner": u.IsOwner', '"isSuperAdmin": u.IsSuperAdmin', '"role": u.Role']) {
  if (!auth.includes(token)) throw new Error(`/api/me user contract missing ${token}`);
}

const e2e = fs.readFileSync('scripts/browser-role-e2e.mjs', 'utf8');
for (const token of [
  'P2PFLOW_E2E_OWNER_COOKIE',
  'P2PFLOW_E2E_ADMIN_COOKIE',
  'P2PFLOW_E2E_MANAGER_COOKIE',
  'P2PFLOW_E2E_AGENT_COOKIE',
  'p2pflow_session',
  'Runtime.exceptionThrown',
  'Network.responseReceived',
]) {
  if (!e2e.includes(token)) throw new Error(`browser role E2E harness missing ${token}`);
}

console.log(`Browser role contract audit passed (${pages.length} registered pages).`);
