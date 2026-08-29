#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseURL = String(process.env.P2PFLOW_E2E_BASE_URL || '').replace(/\/$/, '');
if (!baseURL) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: 'P2PFLOW_E2E_BASE_URL is not set' }, null, 2));
  process.exit(0);
}
const parsedBase = new URL(baseURL);
if (!['http:', 'https:'].includes(parsedBase.protocol)) throw new Error('P2PFLOW_E2E_BASE_URL must be http(s)');

const chromium = process.env.P2PFLOW_E2E_CHROMIUM || ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
if (!chromium) throw new Error('Chromium/Chrome executable not found; set P2PFLOW_E2E_CHROMIUM');

const roleInputs = [
  ['owner', 'P2PFLOW_E2E_OWNER_COOKIE'],
  ['admin', 'P2PFLOW_E2E_ADMIN_COOKIE'],
  ['manager', 'P2PFLOW_E2E_MANAGER_COOKIE'],
  ['agent', 'P2PFLOW_E2E_AGENT_COOKIE'],
];
const requireAll = /^true$/i.test(String(process.env.P2PFLOW_REQUIRE_BROWSER_E2E || 'false'));
const skipPages = new Set(String(process.env.P2PFLOW_E2E_SKIP_PAGES || '').split(',').map(x => x.trim()).filter(Boolean));
const settleMs = Math.max(250, Number(process.env.P2PFLOW_E2E_SETTLE_MS || 900));
const navigationTimeoutMs = Math.max(3000, Number(process.env.P2PFLOW_E2E_NAVIGATION_TIMEOUT_MS || 12000));

const PAGE_PERMISSIONS = {
  dashboard: 'dashboard.view', 'p2p-market': 'market.view', 'p2p-profile': 'p2p.profile.view', orders: 'orders.view', chat: null,
  ads: 'ads.view', approvals: 'approvals.manage', accounts: 'accounts.view', 'offline-transactions': 'orders.view', ledger: 'accounts.view',
  agents: 'users.manage', 'user-roles': 'roles.manage', routing: 'routing.manage', reports: 'reports.view', accounting: 'accounting.view',
  'accounting-expenses': 'accounting.view', 'accounting-income': 'accounting.view', 'accounting-capital': 'accounting.view', 'accounting-closing': 'accounting.view',
  activity: 'activity.view', credentials: 'credentials.manage', health: 'settings.manage', 'system-update': 'system.update', settings: 'settings.manage',
  billing: 'billing.view', 'super-admin': 'superadmin.view', 'p2p-extension': 'extension.manage', security: null, notifications: null, audit: 'audit.view',
};

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function cookieToken(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/(?:^|;\s*)p2pflow_session=([^;]+)/);
  return decodeURIComponent(match ? match[1] : raw);
}
function roleContract(role, user) {
  if (role === 'owner') return user?.isOwner === true;
  if (role === 'admin') return String(user?.role || '').toLowerCase() === 'admin' && user?.isOwner !== true;
  if (role === 'manager') return String(user?.role || '').toLowerCase() === 'manager';
  if (role === 'agent') return String(user?.role || '').toLowerCase() === 'agent';
  return false;
}
function expectedVisible(user, pages) {
  const permissions = new Set(Array.isArray(user?.permissions) ? user.permissions : []);
  return pages.filter(page => {
    const permission = PAGE_PERMISSIONS[page];
    if (permission && !permissions.has(permission)) return false;
    if (page === 'system-update' && !(user?.isOwner === true || user?.isSuperAdmin === true)) return false;
    if (page === 'super-admin' && user?.isSuperAdmin !== true) return false;
    return true;
  });
}

class CDP {
  constructor(wsURL) {
    this.ws = new WebSocket(wsURL);
    this.nextID = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message || 'CDP error'} (${message.error.code || '?'})`));
        else resolve(message.result || {});
        return;
      }
      const key = `${message.sessionId || ''}:${message.method || ''}`;
      for (const fn of this.listeners.get(key) || []) fn(message.params || {});
      for (const fn of this.listeners.get(`*:${message.method || ''}`) || []) fn(message.params || {}, message.sessionId || '');
    });
  }
  async send(method, params = {}, sessionId = '') {
    await this.ready;
    const id = this.nextID++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, navigationTimeoutMs);
    });
  }
  on(method, fn, sessionId = '*') {
    const key = `${sessionId}:${method}`;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(fn);
  }
  close() { try { this.ws.close(); } catch {} }
}

async function launchBrowser() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p2pflow-e2e-'));
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking',
    '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${userDataDir}`, 'about:blank',
  ];
  const child = spawn(chromium, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  const wsURL = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for Chromium DevTools endpoint')), 10000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Chromium exited before startup (${code})`)); });
  });
  return { child, userDataDir, wsURL, stderr: () => stderr };
}

async function evaluate(cdp, sessionId, expression, awaitPromise = true) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  return result.result?.value;
}

async function waitFor(cdp, sessionId, expression, timeoutMs = navigationTimeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(cdp, sessionId, expression, false)) return true;
    } catch {}
    await sleep(100);
  }
  return false;
}

async function testRole(role, envName, rawCookie) {
  const token = cookieToken(rawCookie);
  if (!token) return { role, skipped: true, reason: `${envName} is not set` };
  const browser = await launchBrowser();
  let cdp;
  try {
    cdp = new CDP(browser.wsURL);
    await cdp.ready;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await Promise.all([
      cdp.send('Page.enable', {}, sessionId),
      cdp.send('Runtime.enable', {}, sessionId),
      cdp.send('Network.enable', {}, sessionId),
      cdp.send('Log.enable', {}, sessionId),
    ]);

    const jsErrors = [];
    const http5xx = [];
    cdp.on('Runtime.exceptionThrown', params => jsErrors.push({ type: 'exception', text: params.exceptionDetails?.text || 'Runtime exception', url: params.exceptionDetails?.url || '' }), sessionId);
    cdp.on('Runtime.consoleAPICalled', params => {
      if (params.type === 'error' || params.type === 'assert') jsErrors.push({ type: `console.${params.type}`, text: (params.args || []).map(a => a.value || a.description || '').join(' ') });
    }, sessionId);
    cdp.on('Log.entryAdded', params => {
      const e = params.entry || {};
      if (e.level === 'error' && e.source !== 'network') jsErrors.push({ type: `log.${e.source || 'unknown'}`, text: e.text || '', url: e.url || '' });
    }, sessionId);
    cdp.on('Network.responseReceived', params => {
      const r = params.response || {};
      if (Number(r.status) >= 500 && String(r.url || '').startsWith(baseURL)) http5xx.push({ status: r.status, url: r.url });
    }, sessionId);

    const cookieResult = await cdp.send('Network.setCookie', {
      name: 'p2pflow_session', value: token, url: `${baseURL}/`, httpOnly: true, secure: parsedBase.protocol === 'https:', sameSite: 'Lax',
    }, sessionId);
    if (cookieResult.success === false) throw new Error('Chromium rejected p2pflow_session cookie');

    await cdp.send('Page.navigate', { url: `${baseURL}/dashboard` }, sessionId);
    const booted = await waitFor(cdp, sessionId, `document.readyState === 'complete' && (location.pathname === '/login' || (typeof state !== 'undefined' && !!state.user))`);
    if (!booted) throw new Error('application did not finish bootstrap before timeout');
    const pathname = await evaluate(cdp, sessionId, 'location.pathname', false);
    if (pathname === '/login') throw new Error(`${role} session cookie was rejected or expired`);

    const me = await evaluate(cdp, sessionId, `(async()=>{const r=await fetch('/api/me',{credentials:'include',cache:'no-store'});return {status:r.status,body:await r.json().catch(()=>({}))};})()`);
    if (me?.status !== 200) throw new Error(`/api/me returned ${me?.status}`);
    const user = me.body || {};
    if (!roleContract(role, user)) throw new Error(`${role} cookie user does not satisfy expected role boundary (role=${user.role || ''}, isOwner=${Boolean(user.isOwner)})`);

    const initial = await evaluate(cdp, sessionId, `({
      pages: (typeof pages !== 'undefined' ? pages.map(p=>p[0]) : []),
      visible: (typeof visiblePages === 'function' ? visiblePages().map(p=>p[0]) : []),
      nav: [...document.querySelectorAll('[data-nav-page]')].map(x=>x.dataset.navPage).filter(Boolean)
    })`, false);
    const allPages = Array.isArray(initial?.pages) ? initial.pages : Object.keys(PAGE_PERMISSIONS);
    const expected = expectedVisible(user, allPages);
    const actual = Array.isArray(initial?.visible) ? initial.visible : [];
    const expectedSet = new Set(expected);
    const actualSet = new Set(actual);
    const missing = expected.filter(p => !actualSet.has(p));
    const unexpected = actual.filter(p => !expectedSet.has(p));
    if (missing.length || unexpected.length) throw new Error(`visible page mismatch: missing=${missing.join(',')} unexpected=${unexpected.join(',')}`);

    const navSet = new Set(initial?.nav || []);
    const navMissing = expected.filter(p => !navSet.has(p));
    if (navMissing.length) throw new Error(`rendered navigation missing pages: ${navMissing.join(',')}`);
    if (!user.isSuperAdmin && actualSet.has('super-admin')) throw new Error('non-super-admin can see Super Admin page');
    if (!(user.isOwner || user.isSuperAdmin) && actualSet.has('system-update')) throw new Error('non-owner/non-super-admin can see System Update page');

    const routes = [];
    for (const page of expected) {
      if (skipPages.has(page)) { routes.push({ page, skipped: true }); continue; }
      const beforeErrors = jsErrors.length;
      const before5xx = http5xx.length;
      const route = await evaluate(cdp, sessionId, `(typeof window.P2PFlowHistoryRouter?.routeToPath === 'function'
        ? window.P2PFlowHistoryRouter.routeToPath({page:${JSON.stringify(page)}})
        : '/${encodeURIComponent(page)}')`, false);
      await cdp.send('Page.navigate', { url: `${baseURL}${route}` }, sessionId);
      const loaded = await waitFor(cdp, sessionId, `document.readyState === 'complete' && location.pathname !== '/login'`);
      if (!loaded) throw new Error(`${page} navigation timed out`);
      await sleep(settleMs);
      const snapshot = await evaluate(cdp, sessionId, `({path:location.pathname,title:document.title,page:(typeof state!=='undefined'?state.page:null),hasContent:!!document.querySelector('#content')})`, false);
      routes.push({ page, path: snapshot?.path || '', statePage: snapshot?.page || '', jsErrors: jsErrors.slice(beforeErrors), http5xx: http5xx.slice(before5xx) });
    }

    const failedRoutes = routes.filter(r => !r.skipped && (r.jsErrors?.length || r.http5xx?.length));
    return {
      role, skipped: false, user: { id: user.id, role: user.role, isOwner: Boolean(user.isOwner), isSuperAdmin: Boolean(user.isSuperAdmin) },
      permissions: Array.isArray(user.permissions) ? user.permissions.length : 0,
      visiblePages: actual, routesTested: routes.filter(r => !r.skipped).length, routesSkipped: routes.filter(r => r.skipped).map(r => r.page),
      failedRoutes, ok: failedRoutes.length === 0,
    };
  } finally {
    cdp?.close();
    try { browser.child.kill('SIGTERM'); } catch {}
    await sleep(150);
    try { fs.rmSync(browser.userDataDir, { recursive: true, force: true }); } catch {}
  }
}

const results = [];
for (const [role, envName] of roleInputs) {
  try { results.push(await testRole(role, envName, process.env[envName])); }
  catch (error) { results.push({ role, skipped: false, ok: false, error: error?.stack || String(error) }); }
}
const missingRoles = results.filter(r => r.skipped).map(r => r.role);
const failures = results.filter(r => !r.skipped && r.ok === false);
const output = { version: '2.0.8', baseURL, ok: failures.length === 0 && (!requireAll || missingRoles.length === 0), requireAll, missingRoles, results };
console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exit(1);
