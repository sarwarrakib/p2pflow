#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(`Frontend architecture v1.6.0 self-test failed: ${message}`); };

const app = read('public/app.js');
const index = read('public/index.html');
const css = read('public/style.css');
const routerSource = read('public/js/core/history-router.js');
const hosts = read('public/js/core/route-host.js');
const server = read('app-server.js');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
const login = read('public/login.js');
const sw = read('public/sw.js');
const security = read('public/js/pages/security.js');
const pkg = JSON.parse(read('package.json'));

assert(pkg.version === '1.6.0', `expected v1.6.0, got ${pkg.version}`);
assert(index.includes('class="p2pflow-app-root"') && index.includes('class="p2pflow-app-shell"'), 'fixed shell root/body classes are missing');
assert(index.includes('id="routeViewport"') && index.includes('class="route-page-host"'), 'isolated route viewport/host is missing');
assert(index.includes('/js/core/history-router.js') && index.includes('/js/core/route-host.js'), 'routing/route-host cores are not loaded before the app');

assert(css.includes('html.p2pflow-app-root') && css.includes('overflow:hidden!important'), 'browser document is still allowed to scroll');
assert(css.includes('body.p2pflow-app-shell #app.app') && css.includes('height:100dvh'), 'AppShell is not viewport-bound');
assert(css.includes('body.p2pflow-app-shell .main') && css.includes('grid-template-rows:auto minmax(0,1fr)'), 'workspace is not split into fixed header + route viewport');
assert(css.includes('body.p2pflow-app-shell .route-page-host') && css.includes('overflow-y:auto!important') && css.includes('overflow-x:hidden!important'), 'route host is not the exclusive page scroller');
assert(css.includes('body.p2pflow-app-shell .sidebar') && css.includes('position:relative!important'), 'desktop sidebar is not pinned inside the fixed AppShell');
assert(css.includes('body.p2pflow-app-shell .route-progress') && css.includes('overflow:hidden!important'), 'progress animation can affect layout width');

assert(app.includes("history.pushState({ p2pflow:true, route:targetRoute }, '', target)"), 'internal navigation does not use the History API');
assert(app.includes("window.addEventListener('popstate'"), 'Back/Forward popstate routing is missing');
assert(app.includes('migrateLegacyHashLocation()'), 'legacy hash URL migration is missing');
assert(app.includes('state.routeHostManager.activate(nextRouteKey'), 'persistent per-route host activation is missing');
assert(app.includes('deactivatePageRuntime(previousPage, route.page)'), 'page lifecycle deactivation is not tied to route changes');
assert(app.includes('const PAGE_RUNTIME = Object.freeze({'), 'page runtime registry is missing');
assert(app.includes("state.navigationController?.abort('navigation_changed')"), 'previous route requests are not cancelled');
assert(app.includes('function stableMorphContent(container, html)') && app.includes('function morphStableNode(current, next)'), 'dynamic data snapshots do not morph into the mounted DOM');
assert(!/window\.scroll(?:To|By|Y)/.test(app), 'app core still uses document/window scrolling');
for (const file of fs.readdirSync(path.join(root, 'public/js/pages')).filter(name => name.endsWith('.js'))) {
  const text = read(`public/js/pages/${file}`);
  assert(!/window\.scroll(?:To|By|Y)/.test(text), `${file} still uses document/window scrolling`);
}

assert(hosts.includes('record.host.removeAttribute(\'id\')') && hosts.includes('if (record.host.parentNode === viewport) record.host.remove()'), 'inactive route hosts are not detached');
assert(hosts.includes('record.scrollTop') && hosts.includes('host.scrollTo({ top:scrollTop'), 'per-route scroll state is not preserved');

const sandbox = { window:{ location:{ pathname:'/dashboard', hash:'', search:'' } }, console };
vm.createContext(sandbox);
vm.runInContext(routerSource, sandbox, { filename:'history-router.js' });
const router = sandbox.window.P2PFlowHistoryRouter;
assert(router.routeToPath({ page:'orders', orderId:71206 }) === '/orders/71206', 'order route is not clean');
assert(router.routeToPath({ page:'system-update' }) === '/system/update', 'System Update route is not clean');
assert(router.routeToPath({ page:'accounting-expenses' }) === '/accounting/expenses', 'Accounting route is not clean');
assert(router.pathToRoute('/payments/statement/account/42').ledgerAccountId === 42, 'ledger detail route parsing is broken');
assert(router.legacyHashToRoute('#/orders/99').orderId === 99, 'legacy hash bookmark compatibility is broken');

assert(server.includes('const SPA_APPLICATION_ROUTE_PATTERNS') && server.includes("if (pathname === '/' || isSpaApplicationRoute(pathname)) pathname = '/index.html';"), 'server History-API fallback is missing');
assert(server.includes("? `/orders/${Number(order.id)}`") && server.includes(": '/notifications';"), 'push notifications still use hash routes');
assert(manifest.start_url === '/orders' && manifest.display === 'standalone', 'PWA start URL is not canonical');
assert(login.includes("return '/dashboard';") && !login.includes("return '/#/dashboard';"), 'login return path still defaults to a hash URL');
assert(sw.includes("{ url: '/notifications' }") && !sw.includes("'/#/notifications'"), 'service worker still targets hash URLs');
assert(security.includes("window.location.replace('/system/security')"), 'security route still redirects to a hash URL');

console.log(JSON.stringify({
  ok:true,
  architecture:'v1.6.0-fixed-shell-history-router',
  documentScroll:false,
  cleanHistoryRoutes:true,
  legacyHashMigration:true,
  routeScopedCancellation:true,
  persistentDetachedRouteHosts:true,
  perRouteScrollState:true,
  pageRuntimeLifecycle:true,
  serverHistoryFallback:true,
  dynamicDomMorph:true
}, null, 2));
