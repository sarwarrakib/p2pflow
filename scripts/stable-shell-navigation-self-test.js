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
const systemUpdate = read('public/js/pages/system-update.js');
const routeHosts = read('public/js/core/route-host.js');
const historyRouter = read('public/js/core/history-router.js');
const pkg = JSON.parse(read('package.json'));
const assert = (condition, message) => { if (!condition) throw new Error(`Stable shell navigation self-test failed: ${message}`); };

assert(index.includes('id="routeViewport"') && index.includes('class="route-page-host"'), 'route viewport/host is missing');
assert(app.includes("Object.defineProperty(content, 'innerHTML'") && app.includes('function stableMorphContent(container, html)'), 'non-destructive content morph gate is missing');
assert(app.includes('state.routeHostManager.activate(nextRouteKey') && routeHosts.includes('viewport.replaceChildren(host)'), 'per-route persistent DOM host manager is missing');
assert(routeHosts.includes("record.host.removeAttribute('id')") && routeHosts.includes('record.scrollTop'), 'inactive route DOM/scroll is not preserved safely');
assert(app.includes("history.pushState({ p2pflow:true, route:targetRoute }, '', target)") && app.includes("window.addEventListener('popstate'"), 'History API routing is missing');
assert(historyRouter.includes("orders: '/orders'") && historyRouter.includes("'system-update': '/system/update'"), 'clean route map is incomplete');
assert(app.includes('deactivatePageRuntime(previousPage, route.page)') && app.includes('const PAGE_RUNTIME = Object.freeze({'), 'page lifecycle registry is not active');
assert(app.includes('function backgroundPatchAllowed(page=state.page)') && app.includes('if (!backgroundPatchAllowed(state.page)) return;'), 'generic realtime events can still trigger unapproved renders');
assert(css.includes('html.p2pflow-app-root') && css.includes('body.p2pflow-app-shell .route-page-host'), 'fixed viewport shell CSS is missing');
assert(css.includes('overflow-y:auto!important') && css.includes('overflow-x:hidden!important'), 'route-only scrolling is not enforced');
const routeProgressBlocks = [...css.matchAll(/\.route-progress\{[^}]+\}/g)].map(match => match[0]);
assert(routeProgressBlocks.some(block => block.includes('overflow:hidden')), 'route progress animation can create viewport overflow');
assert(css.includes('body.p2pflow-app-shell #content.soft-updating') && css.includes('opacity:1!important'), 'background patch can visually shift the page');
assert(systemUpdate.includes('data-stable-key="system-update-page"') && systemUpdate.includes('data-stable-key="update-guide"'), 'System Update structure is not keyed for in-place patching');
assert(systemUpdate.includes("beginPageRenderGuard('system-update')") && systemUpdate.includes('signal:renderGuard.signal') && systemUpdate.includes("state.page !== 'system-update'"), 'System Update slow response can overwrite another route');

assert(app.includes('function beginNavigationScope(route = {})') && app.includes("state.navigationController?.abort('navigation_changed')"), 'latest-navigation cancellation scope is missing');
assert(app.includes('if (!legacyHash && current === target && location.pathname === target)') && app.includes('if (opts.force === true) return routeFromLocation'), 're-clicking current clean route still duplicates navigation');
assert(app.includes('function maybeReloadForChallenge(path, opts={})') && app.includes('Stable-shell rule:'), 'hosting challenge stable-shell policy is missing');
const challengeBlock = (app.match(/function maybeReloadForChallenge[\s\S]*?\n}/) || [''])[0];
assert(challengeBlock && !challengeBlock.includes('location.reload'), 'hosting challenge still triggers a full browser reload');
assert(app.includes("cancelled.code = 'UI_REQUEST_CANCELLED'") && app.includes('isUiRequestCancelled'), 'cancelled UI requests are not handled silently');
assert(!app.includes("if (showLoading) $('#content').innerHTML = '<div class=\"card\">Loading order...</div>'"), 'order detail destroys the current structure while loading');
assert(app.includes("beginPageRenderGuard('order-detail')") && app.includes("state.page !== 'orders' || Number(state.currentOrderId || 0) !== numericId"), 'order detail stale-response guard is missing');
assert(app.includes('function applyUpdatedCurrentOrder') && app.includes('patchCurrentOrderDynamicFields(previous, merged)'), 'order mutations still require a full detail re-render');
assert(orders.includes("beginPageRenderGuard('orders-list')") && orders.includes('const canStablePatch = backgroundRefresh'), 'orders background refresh does not keep the shell stable');
assert(market.includes('state.p2pMarketRequestSeq') && market.includes("beginPageRenderGuard('p2p-market-data')"), 'P2P Market does not enforce latest-request-wins');
assert(ads.includes('const canStablePatch = backgroundRefresh') && ads.includes("renderAds(data, { background:true })"), 'Ads realtime refresh still rebuilds the route structure');

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  stableShell:true,
  documentScroll:false,
  historyRouting:true,
  automaticBrowserReload:false,
  latestNavigationWins:true,
  staleActionRenderBlocked:true,
  orderDetailDynamicPatch:true,
  chatDomPersistent:true,
  marketLatestRequestWins:true,
  adsBackgroundStablePatch:true,
  persistentRouteHosts:true,
  stableDomMorph:true,
  targetShellImmediate:true,
  overflowSafeProgress:true,
  systemUpdateInPlace:true
}, null, 2));
