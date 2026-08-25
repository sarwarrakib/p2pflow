#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const server = read('app-server.js');
const app = read('public/app.js');
const orders = read('public/js/pages/orders.js');
const ads = read('public/js/pages/ads.js');
const chat = read('public/js/pages/chat.js');
const css = read('public/style.css');
const mysql = read('lib/mysqlStateStore.js');
const postgres = read('lib/postgresStateStore.js');
const codec = read('lib/statePayloadCodec.js');
const pkg = JSON.parse(read('package.json'));

function assert(value, message) { if (!value) throw new Error(message); }
function block(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Block not found: ${start}`);
  return source.slice(a, b);
}

assert(server.includes('const APP_SCHEMA_VERSION = 39;'), 'Schema 39 per-user account-feature migration is missing.');
assert(codec.includes('async function encodeStateObjectAsync') && codec.includes('zlib.brotliCompress('), 'Async Brotli state codec is missing.');
for (const [name, source] of [['mysql', mysql], ['postgres', postgres]]) {
  const write = block(source, 'async writeState(', 'async ' + (name === 'mysql' ? 'pruneBackups' : 'pruneBackups'));
  assert(write.includes('await this.encryptObjectAsync(state)'), `${name} writeState still performs synchronous whole-state compression.`);
  const compact = block(source, 'async compactLegacyPayloads(', 'scheduleSave(');
  assert((compact.match(/await this\.encryptObjectAsync\(this\.decryptObject\(row\.payload\)\)/g) || []).length >= 2, `${name} legacy compaction can still synchronously compress large state payloads.`);
}

assert(server.includes('function orderListCompactView(') && server.includes('items: orders.map(order => orderListCompactView(order, user, context))'), 'Orders list does not use the compact payload view.');
assert(server.includes("action === 'list-view'") && server.includes('orderListCompactView(order, user, context)'), 'Single-order list hydration endpoint is missing.');
assert(orders.includes('async function applyOrderRealtimeChanges') && orders.includes('/list-view'), 'Orders realtime delta hydration is missing.');
assert(app.includes("typeof applyOrderRealtimeChanges === 'function'"), 'SSE order changes still force a full Orders refetch.');
assert(app.includes('const reusableRouteView = !activation.created') && app.includes('revalidate data in the background'), 'Mounted route stale-while-revalidate navigation is missing.');

assert(server.includes('CRM_FAST_ORDER_DISCOVERY_MS || 3000') && server.includes('fastOrderCredentialRuntime(credential)') && server.includes('timeoutMs: 20000'), 'Fast order discovery is not configured for reliable per-account polling.');
assert(server.includes('await Promise.all(credentials.map(async credential =>') && server.includes("detailMode:'changes'"), 'Multi-account order synchronization is not parallel/change-focused.');
assert(server.includes("Date.now() - binanceAutoSyncLastPersistAt > 5 * 60 * 1000"), 'Order background sync checkpoint is still write-heavy.');
assert(server.includes('advertisementMerchantStatusLastErrorSignature') && server.includes('advertisementMerchantStatusLastPersistAt > 5 * 60 * 1000'), 'Advertisement merchant loop still persists every poll/error.');
assert(server.includes('const totals = new Map(accounts.map(account => [Number(account.id), 0]))') && !server.includes('target.paymentAccounts.forEach(a => { a.currentBalance = calcAccountBalance(a.id, target); });'), 'Payment-account balance recomputation is still O(accounts * ledgers).');

assert(app.includes('async function markOrderPaidWithoutSplitPopup') && app.includes("finalAction === 'paid_mark' && !gate.enabled"), 'Payment Split OFF does not use direct Mark as Paid.');
assert(app.includes("closest?.('[data-copy-payment-value]')") && app.includes("document.addEventListener('click'"), 'Payment copy action is not delegated for morph/realtime DOM updates.');

const editOpen = block(ads, 'async function openAdvertisementEditorFromAction(', 'async function deleteAdvertisementFromAction(');
assert(editOpen.indexOf('openAdvertisementEditor(ad, scopedData)') >= 0 && editOpen.indexOf('openAdvertisementEditor(ad, scopedData)') < editOpen.indexOf("api(`/api/ads/${encodeURIComponent(ad.id)}?refresh=1`"), 'Advertisement editor still waits for live Binance I/O before opening.');
assert(editOpen.includes("p2pflow:ads-editor-live-refresh") && ads.includes("window.addEventListener('p2pflow:ads-editor-live-refresh'"), 'Live account/payment refresh is not merged into the already-open editor.');
const paymentScope = block(ads, 'function adsPaymentMethodsForCredential(', 'function adsPaymentDataForCredential(');
assert(/Number\(method\.credentialId(?: \|\| 0)?\) === id/.test(paymentScope) && !paymentScope.includes('!Number(method.credentialId)'), 'SELL payment methods can still leak across Binance credentials.');
assert(server.includes("timeoutMs: 7000") && server.includes('ensureAdvertisementPaymentMethods(methods, credential.id)'), 'Exact-account P2P payment refresh is not bounded/catalogued.');
const priceGuide = block(server, 'async function advertisementReferencePriceGuide(', 'function advertisementReferencePayType(');
assert(priceGuide.includes('timeoutMs: 7000'), 'Advertisement reference-price critical path timeout is too long.');
assert(!priceGuide.includes('callBinancePublicAdvSearch'), 'Advertisement price guide still blocks on public marketplace search.');
assert(server.includes("rangeMode: hasExplicitBounds ? 'binance_explicit_live_bounds' : 'binance_reference_only'"), 'Price guide does not distinguish reference-only from explicit Binance bounds.');
assert(!/referencePrice\s*\*\s*1\.(?:08|10)/.test(server), 'Undocumented percentage-derived fixed-price limits remain.');
assert(server.includes('advertisementFixedPriceRangeFromBinanceError') && server.includes('binance_rejection_exact_bounds'), 'Exact Binance validation bounds are not captured from rejection responses.');
assert(css.includes('body.ads-sheet-open #mobileBottomNav.mobile-bottom-nav{display:none!important}') && css.includes('100dvh'), 'Responsive Ads bottom sheets can still be covered by the fixed bottom navigation.');

assert(server.includes("url.pathname === '/api/chat-account-controls'") && server.includes('function chatAccountOptionsForUser'), 'Chat Binance-account controls API is missing.');
for (const feature of ['orders', 'notifications', 'advertisements']) {
  assert(chat.includes(`name="${feature}"`) || chat.includes(`name='${feature}'`), `Chat account ${feature} toggle is missing.`);
}
assert(server.includes('function normalizeUserBinanceCredentialFeatureControls') && server.includes('function userBinanceCredentialFeatureEnabled'), 'Per-CRM-user Binance account feature storage is missing.');
assert(server.includes('setUserBinanceCredentialFeatureControls(user, credentialId') && server.includes("'user_binance_account_feature_controls_updated'"), 'Chat account settings are not stored on the current CRM user.');
assert(server.includes('function userBinanceOrderAccountAccess') && server.includes('function orderVisibleToUserInOrdersPage') && server.includes('effectiveView: Boolean(canView && (!respectFeatureControl || featureEnabled))'), 'Orders account feature is not a deny-only layer on the current user order view.');
assert(server.includes('ordersAccessibleToUser(user, { respectFeatureControls:false })'), 'Chat no longer preserves the established order permission model independently of the Orders switch.');
assert(app.includes('function invalidateOrdersListCache') && app.includes("state.routeHostManager?.drop?.(stableRouteKey({ page:'orders'"), 'Orders route cache is not invalidated after per-account Orders changes.');
assert(chat.includes("changedFeatures.includes('orders') || result.forceOrdersReload === true") && chat.includes('invalidateOrdersListCache'), 'Chat account settings do not invalidate stale Orders data after Orders ON/OFF.');
assert(server.includes("userBinanceCredentialFeatureEnabled(user, credentialId, 'notifications')"), 'Notifications account feature is not enforced per recipient.');
assert(server.includes("userBinanceCredentialFeatureEnabled(user, id, 'advertisements')"), 'Advertisement account feature is not enforced per CRM user.');
for (const [name, source] of [
  ['fast order discovery', block(server, 'async function runBinanceFastOrderDiscovery(', 'async function runBinanceAutoOrderSync(')],
  ['order auto sync', block(server, 'async function runBinanceAutoOrderSync(', 'let binanceAdsAutoSyncBusy')],
  ['ads auto sync', block(server, 'async function runBinanceAdsAutoSync(', 'async function runAdvertisementMerchantStatusAutoSync(')],
  ['merchant status sync', block(server, 'async function runAdvertisementMerchantStatusAutoSync(', 'function startAdvertisementMerchantStatusLoop(')]
]) {
  assert(!source.includes('userBinanceCredentialFeatureEnabled'), `${name} is incorrectly controlled by a CRM user's personal switch.`);
  assert(source.includes("!item.disabled && item.apiKey && item.secretKey") || name === 'merchant status sync', `${name} no longer uses the established enabled-credential sync source.`);
}
assert(chat.includes('All Accounts') && chat.includes('data-chat-account-settings'), 'Chat All Accounts selector/settings affordance is missing.');
assert(chat.includes("renderChatInbox({ preserveFocus:true, localOnly:true })"), 'Chat account selection still waits on a network round trip.');
assert(chat.includes('These switches apply only to your CRM user'), 'Chat account settings do not explain their per-user scope.');
assert(server.includes('notificationAllowedByBinanceAccount') && server.includes("userBinanceCredentialFeatureEnabled(user, credentialId, 'notifications')"), 'Per-user account notification switch is not enforced in notification delivery.');

assert(pkg.version === '1.6.8', `expected v1.6.8 before release bump, got ${pkg.version}`);
console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  schema:39,
  asyncStatePersistence:true,
  compactOrdersPayload:true,
  realtimeOrderDelta:true,
  cachedRouteInstant:true,
  fastOrderDiscoveryMs:3000,
  directPaidWhenSplitOff:true,
  delegatedCopy:true,
  instantAdsEditor:true,
  sellPaymentScope:'exact-credential',
  priceBounds:'binance-only-no-guessed-percent',
  responsiveAdsSheet:true,
  chatAccountControls:['orders','notifications','advertisements'],
  accountControlScope:'per-crm-user-plus-existing-permissions',
  globalCredentialSyncUnaffected:true
}, null, 2));
