#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const app = read('public/app.js');
const orders = read('public/js/pages/orders.js');
const chat = read('public/js/pages/chat.js');
const market = read('public/js/pages/p2p-market.js');
const routeHost = read('public/js/core/route-host.js');
const versioner = read('scripts/set-version.js');
const css = read('public/style.css');
const cleanup = read('scripts/cleanup-obsolete-assets.js');

const assert = (value, message) => {
  if (!value) throw new Error(`v1.6.3 stability/order-filter/mobile-ui self-test failed: ${message}`);
};

assert(pkg.version === '1.7.8', `expected v1.7.8, got ${pkg.version}`);

for (const endpoint of [
  '/api/login',
  '/api/login/device/upgrade',
  '/api/login/device/challenge',
  '/api/login/device',
  '/api/login/recover-email'
]) assert(server.includes(`'${endpoint}'`), `pre-session CSRF exemption missing ${endpoint}`);
assert(server.includes('CSRF_PRESESSION_AUTH_PATHS') && server.includes('csrfPreSessionAuthPath(req)'), 'pre-session auth CSRF helper is missing');
const csrfSet = (server.match(/const CSRF_PRESESSION_AUTH_PATHS = new Set\(\[([\s\S]*?)\]\);/) || [])[1] || '';
assert(!csrfSet.includes('/api/logout'), 'logout must remain CSRF protected');

assert(market.includes('const viewportSnapshot = (background || append) ? captureP2pMarketViewport() : null;'), 'P2P Market does not capture viewport at DOM commit time');
const marketRestore = (market.match(/function restoreP2pMarketViewport\(snapshot\) \{([\s\S]*?)\n\}/) || [])[1] || '';
assert(!marketRestore.includes('requestAnimationFrame'), 'P2P Market restore is still deferred and can overwrite user scrolling');
assert(chat.includes("appScrollTo({ top:windowScrollY, left:0, behavior:'auto' });"), 'Chat inbox does not restore its viewport synchronously');
assert(app.includes('const userIsActivelyScrolling = Date.now() - Number(state.currentOrderChatLastUserScrollAt || 0) < 1400;'), 'Order chat active-user-scroll guard is missing');
assert(app.includes('(nearBottom && !userIsActivelyScrolling)'), 'Order chat still snaps to bottom while the user is scrolling');
assert(routeHost.includes("host.scrollTo({ top:scrollTop, left:scrollLeft, behavior:'auto' });"), 'Persistent route host scroll restoration is missing');

assert(!orders.includes('data-order-account='), 'Orders still renders the legacy API account selector');
for (const marker of [
  'id="orderFilterBtn"',
  'id="orderFilterPanel"',
  'name="credentialId"',
  'name="tradeType"',
  'name="paymentMethod"',
  'name="date"',
  'id="orderFilterApplyBtn"',
  'id="orderFilterSaveBtn"',
  'persistOrderFilters',
  'applyOrderFilters'
]) assert(orders.includes(marker), `Orders filter marker missing: ${marker}`);

const p2pFilterPath = 'M3.5 5.5h17L14 13v5.2l-4 2.3V13L3.5 5.5Z';
assert(market.includes(p2pFilterPath), 'P2P Market filter SVG path is missing');
assert(orders.includes(p2pFilterPath), 'Orders does not reuse the P2P Market filter SVG');
assert(!orders.includes('/assets/order-filter.png'), 'Orders still references the uploaded PNG filter image');
assert(!fs.existsSync(path.join(root, 'public/assets/order-filter.png')), 'Unused Orders PNG filter asset is still shipped');
assert(cleanup.includes("public/assets/order-filter.png") && cleanup.includes('fs.rmSync'), 'Obsolete Orders PNG cleanup script is missing');
assert(pkg.scripts && pkg.scripts.prebuild === 'npm run clean:obsolete' && pkg.scripts.pretest === 'npm run clean:obsolete', 'Obsolete asset cleanup is not wired to prebuild/pretest');

assert(orders.includes('const ORDER_RENDER_BATCH_SIZE = 120;'), 'Orders progressive render batch is missing');
assert(orders.includes('activeTab[2].slice(0, renderLimit)'), 'Orders still renders every row of every fulfilled tab up front');
assert(orders.includes('data-order-load-more='), 'Orders progressive load-more marker is missing');
assert(orders.includes("new IntersectionObserver(entries =>"), 'Orders progressive viewport loading is missing');
assert(orders.includes("renderOrders({ prefetchedData:data, fastCommit:true, preserveScroll:true })"), 'Order filters/tabs are not using cached client-side data');
assert(orders.includes('resetOrderRenderLimits();'), 'Order filter changes do not reset the lightweight render window');
assert(!orders.includes("form.querySelector('select,input')?.focus"), 'Opening the filter still forces synchronous focus/layout over the large list');
assert(orders.includes("panel.style.top = `${Math.max(8, Math.min(window.innerHeight - 88, rect.bottom + 7))}px`;"), 'Filter popup is not positioned as a fixed overlay');

assert(orders.includes("badge(o.type, o.type === 'BUY' ? 'ok' : 'danger')"), 'Orders list Buy/Sell badge colors are not green/red');
assert(app.includes("badge(o.type, o.type === 'BUY' ? 'ok' : 'danger')"), 'Order detail Buy/Sell badge colors are not green/red');
assert(css.includes('body.order-detail-active .order-hero-panel{') && css.includes('background:#fff!important;color:#0f172a!important'), 'Mobile order detail hero contrast fix is missing');
assert(css.includes('body.p2pflow-app-shell .sidebar{') && css.includes('z-index:1002!important'), 'Mobile sidebar is not above its backdrop');
assert(css.includes('.sidebar-backdrop{') && css.includes('z-index:1001!important') && css.includes('backdrop-filter:none!important'), 'Mobile sidebar backdrop can still blur the drawer');

assert(orders.includes("${section(ongoingTabs, 'ongoing')}") && orders.includes("${section(fulfilledTabs, 'fulfilled')}"), 'Orders does not keep both Ongoing and Fulfilled groups available');
assert(orders.includes('/api/orders?group=${encodeURIComponent(normalized)}') && orders.includes('scheduleInactiveOrderGroupHydration'), 'Orders does not use active-group first paint with background hydration');
assert(orders.includes('sectionNode.hidden = !active;'), 'Hydrated Orders group switch is not a direct visibility toggle');
const groupHandler = (orders.match(/\$\$\('\[data-order-group\]'\)\.forEach\(btn => btn\.onclick = \(\) => \{([\s\S]*?)\n  \}\);/) || [])[1] || '';
assert(groupHandler && groupHandler.includes('renderOrders({ group:nextGroup') && groupHandler.includes('sectionNode.hidden = !active;'), 'Orders hybrid lazy/fallback group switching is missing');

assert(versioner.includes('if (v.patch >= 9) return nextMinor(v);'), 'version patch carry 1.x.9 -> next minor is missing');
assert(versioner.includes('if (v.minor >= 9) return nextMajor(v);'), 'version minor carry 1.9.x -> next major is missing');

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  csrfLoginBootstrap:true,
  scrollStability:true,
  orderGroupHybridHydration:true,
  orderFilterInstantClientData:true,
  orderProgressiveRenderBatch:120,
  orderFilterUsesP2pMarketSvg:true,
  orderTradeColors:{ buy:'green', sell:'red' },
  mobileOrderContrastFixed:true,
  mobileSidebarBackdropFixed:true,
  versionDigitCarry:true
}, null, 2));
