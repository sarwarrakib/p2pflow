#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const index = read('public/index.html');
const css = read('public/style.css');
const orders = read('public/js/pages/orders.js');
const market = read('public/js/pages/p2p-market.js');
const ads = read('public/js/pages/ads.js');
const pkg = JSON.parse(read('package.json'));
const assert = (condition, message) => { if (!condition) throw new Error(`Stable shell navigation self-test failed: ${message}`); };

assert(app.includes('function beginNavigationScope(route = {})') && app.includes("state.navigationController?.abort('navigation_changed')"), 'latest-navigation cancellation scope is missing');
assert(app.includes("if (location.hash === hash) {") && app.includes('if (opts.force === true) return routeFromLocation'), 're-clicking current route still starts duplicate renders');
assert(app.includes('function maybeReloadForChallenge(path, opts={})') && app.includes('Stable-shell rule:'), 'hosting challenge stable-shell policy is missing');
const challengeBlock = (app.match(/function maybeReloadForChallenge[\s\S]*?\n}/) || [''])[0];
assert(challengeBlock && !challengeBlock.includes('location.reload'), 'hosting challenge still triggers a full browser reload');
assert(app.includes("cancelled.code = 'UI_REQUEST_CANCELLED'") && app.includes('isUiRequestCancelled'), 'cancelled UI requests are not handled silently');
assert(index.includes('id="routeProgress"') && css.includes('.route-progress') && css.includes('body.route-pending .route-progress'), 'non-destructive route progress UI is missing');
assert(!app.includes("if (showLoading) $('#content').innerHTML = '<div class=\"card\">Loading order...</div>'"), 'order detail still destroys the current structure while loading');
assert(app.includes("beginPageRenderGuard('order-detail')") && app.includes("state.page !== 'orders' || Number(state.currentOrderId || 0) !== numericId"), 'order detail stale-response guard is missing');
assert(app.includes('function applyUpdatedCurrentOrder') && app.includes('patchCurrentOrderDynamicFields(previous, merged)'), 'order mutations still require a full detail re-render');
assert(app.includes('function patchCurrentOrderDynamicFields') && app.includes("$('#orderSplitsCard')") && app.includes("$('#orderChatTopActions')"), 'order dynamic panels are not patched in place');
assert(orders.includes("beginPageRenderGuard('orders-list')") && orders.includes('const canStablePatch = backgroundRefresh'), 'orders background refresh does not keep the page shell stable');
assert(market.includes('state.p2pMarketRequestSeq') && market.includes("beginPageRenderGuard('p2p-market-data')"), 'P2P Market does not enforce latest-request-wins');
assert(ads.includes('const canStablePatch = backgroundRefresh') && ads.includes("renderAds(data, { background:true })"), 'Ads realtime refresh still rebuilds the full page');
for (const marker of [
  "if (state.page !== 'settings') return;",
  "if (state.page !== 'accounts') return;",
  "if (state.page !== 'credentials') return;",
  "if (state.page !== 'chat') return;"
]) assert([app, ...['public/js/pages/settings.js','public/js/pages/accounts.js','public/js/pages/credentials.js','public/js/pages/chat.js'].map(read)].some(text => text.includes(marker)), `page-authority guard missing: ${marker}`);

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  stableShell:true,
  automaticBrowserReload:false,
  latestNavigationWins:true,
  staleActionRenderBlocked:true,
  orderDetailDynamicPatch:true,
  chatDomPersistent:true,
  marketLatestRequestWins:true,
  adsBackgroundStablePatch:true
}, null, 2));
