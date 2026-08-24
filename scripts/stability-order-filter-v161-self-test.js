#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
const filterIcon = fs.readFileSync(path.join(root, 'public/assets/order-filter.png'));

const assert = (value, message) => {
  if (!value) throw new Error(`v1.6.1 stability/order-filter self-test failed: ${message}`);
};

assert(pkg.version === '1.6.1', `expected v1.6.1, got ${pkg.version}`);

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
assert(orders.includes("${section(ongoingTabs, 'ongoing')}") && orders.includes("${section(fulfilledTabs, 'fulfilled')}"), 'Orders does not pre-render both Ongoing and Fulfilled groups');
assert(orders.includes("sectionNode.hidden = !active;"), 'Orders group switch is not a direct visibility toggle');
const groupHandler = (orders.match(/\$\$\('\[data-order-group\]'\)\.forEach\(btn => btn\.onclick = \(\) => \{([\s\S]*?)\n  \}\);/) || [])[1] || '';
assert(groupHandler && !groupHandler.includes('renderOrders('), 'Ongoing/Fulfilled click still re-renders the whole page');
assert(css.includes('.order-filter-panel') && css.includes('.order-filter-trigger'), 'Orders filter popup styling is missing');

const iconHash = crypto.createHash('sha256').update(filterIcon).digest('hex');
assert(iconHash === '161487f5721efdfc2e16d4ac79935bc4e88ac86fe17ce8a7f47fc99681b81f9c', 'supplied filter icon was modified instead of used as-is');

assert(versioner.includes('if (v.patch >= 9) return nextMinor(v);'), 'version patch carry 1.x.9 -> next minor is missing');
assert(versioner.includes('if (v.minor >= 9) return nextMajor(v);'), 'version minor carry 1.9.x -> next major is missing');

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  csrfLoginBootstrap:true,
  chatScrollStable:true,
  p2pMarketScrollStable:true,
  orderGroupInstant:true,
  orderFilters:['api_account','buy_sell','payment_method','date'],
  suppliedFilterIconPreserved:true,
  versionDigitCarry:true
}, null, 2));
