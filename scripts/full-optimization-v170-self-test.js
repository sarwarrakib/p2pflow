#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));
const server = read('app-server.js');
const app = read('public/app.js');
const orders = read('public/js/pages/orders.js');
const ads = read('public/js/pages/ads.js');
const chat = read('public/js/pages/chat.js');
const css = read('public/style.css');
const index = read('public/index.html');
const login = read('public/login.html');
const setup = read('public/setup.html');
const codec = read('lib/statePayloadCodec.js');
const mysql = read('lib/mysqlStateStore.js');
const postgres = read('lib/postgresStateStore.js');
const packager = read('scripts/build-unified-package.js');
const pkg = JSON.parse(read('package.json'));

function assert(value, message) {
  if (!value) throw new Error(`v${pkg.version} full optimization self-test failed: ${message}`);
}
function block(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Block not found: ${start}`);
  return source.slice(a, b).trimEnd();
}
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

assert(pkg.version === '1.8.0', `expected package 1.8.0, got ${pkg.version}`);
assert(server.includes('const APP_SCHEMA_VERSION = 38;'), 'schema 38 scalable Node migration target is missing');

// The production-proven order ingestion engine remains byte-protected. v1.8.0
// intentionally upgrades the fast/full multi-account orchestration to bounded
// account concurrency; protect those new orchestration blocks from accidental
// regressions while keeping feature switches out of the ingestion core.
const protectedOrderCore = [
  ['syncBinanceOrdersWithCredential', 'async function syncBinanceOrdersWithCredential', 'async function handleBinanceOrderSync', '9375159394762e2273699c4a88d68ced08d94d8630ddb7be56a83470e7b7151f'],
  ['runBinanceFastOrderDiscovery', 'async function runBinanceFastOrderDiscovery', 'async function runBinanceAutoOrderSync', 'ef6e89500e21132db9d538276928aae12100cd9a0bc750a1cfb2656b2b7d7c8b'],
  ['runBinanceAutoOrderSync', 'async function runBinanceAutoOrderSync', 'let binanceAutoSyncLoopStarted', '95cd0af22bddda88f175147488b74d197bf01ee3a53240af2e829e98161f23e4']
];
for (const [name, start, end, expected] of protectedOrderCore) {
  const source = block(server, start, end);
  assert(sha(source) === expected, `${name} no longer matches the protected scalable order engine`);
  assert(!/userBinanceCredentialFeature|featureControls|chatAccountControls|binanceCredentialFeatureEnabled/.test(source), `${name} is coupled to account feature switches`);
}

// User account controls are deny-only overlays after the original permission
// and assignment logic. Chat remains independent from Orders OFF.
assert(server.includes('function canAccessOrderBase(user, order)'), 'base order access function missing');
assert(server.includes('function ordersAccessibleToUserBase(user)'), 'base order list visibility missing');
assert(server.includes("userBinanceCredentialFeatureEnabled(agentLoginUser(x.agent.id), order.credentialId, 'orders')"), 'per-user Orders assignment deny overlay missing');
assert(server.includes('ordersAccessibleToUser(user, { respectFeatureControls:false })'), 'Chat is incorrectly coupled to Orders toggle');
assert(server.includes("broadcast({ type:'binance.account.features.updated', userId:Number(user.id)"), 'account-control realtime event is not user targeted');
assert(app.includes("Number(event.userId || 0) === Number(state.user?.id || 0)"), 'browser account-control refresh is not user targeted');
for (const feature of ['orders','notifications','advertisements']) {
  assert(chat.includes(`name="${feature}"`) || chat.includes(`name='${feature}'`), `Chat account ${feature} toggle missing`);
}
assert(chat.includes('All Accounts') && chat.includes('data-chat-account-settings'), 'Chat All Accounts/settings UI missing');

// 504/event-loop hardening: expensive Brotli compression must run on libuv.
assert(codec.includes('async function encodeStateObjectAsync') && codec.includes('zlib.brotliCompress('), 'async Brotli state codec missing');
for (const [name, source] of [['mysql', mysql], ['postgres', postgres]]) {
  assert(source.includes('prepareSegmentedState(state, this') && source.includes('await this.encryptObjectAsync(segmented.state)'), `${name} state write does not segment high-growth history before async compression`);
  assert((source.match(/await this\.encryptObjectAsync\(this\.decryptObject\(row\.payload\)\)/g) || []).length >= 2, `${name} legacy history compaction still synchronously compresses state`);
}
assert(server.includes('function ledgerRuntimeIndex(target = db)') && server.includes('buildLedgerIndex('), 'indexed ledger aggregation is missing');
assert(server.includes('accountItem.currentBalance = calcAccountBalance(accountItem.id);'), 'account views still trigger full-account balance recomputation');
assert(!server.includes('target.paymentAccounts.forEach(a => { a.currentBalance = calcAccountBalance(a.id, target); });'), 'old O(accounts * ledgers) balance loop remains');
assert(server.includes("advertisementMerchantStatusLastErrorSignature") && server.includes("ads_merchant_status_checkpoint"), 'repeated Ads merchant-status error saves are not deduplicated');
assert(server.includes('Date.now() - adsLastPersistAt > 5 * 60 * 1000'), 'unchanged Ads background loop still checkpoints too frequently');

// Orders: compact list payload, delta hydration and no full-list refetch for each SSE change.
assert(server.includes('function orderListCompactView(') && server.includes('items: orders.map(order => orderListCompactView(order, user, context))'), 'compact Orders list response missing');
assert(server.includes("action === 'list-view'"), 'single-order compact hydration endpoint missing');
for (const heavy of ['rawBinanceDetail','rawBinanceResult','rawCounterpartyFeedback','customerPaymentDetails','paymentSplits','chatMedia','proofFiles','auditLogs','assignments']) {
  assert(block(server, 'function orderListCompactView(', 'async function autoSyncBinanceOrderBundle').includes(`'${heavy}'`), `compact Orders payload does not remove ${heavy}`);
}
assert(orders.includes('async function applyOrderRealtimeChanges') && orders.includes('/list-view'), 'Orders realtime delta hydration missing');
assert(app.includes("typeof applyOrderRealtimeChanges === 'function'"), 'SSE order changes still force a full Orders refetch');
assert(app.includes('const reusableRouteView = !activation.created') && app.includes('revalidate data in the background'), 'instant cached-route stale-while-revalidate navigation missing');

// Final action + clipboard reliability after morph/realtime DOM replacement.
assert(app.includes('async function markOrderPaidWithoutSplitPopup') && app.includes("finalAction === 'paid_mark' && !gate.enabled"), 'Payment Split OFF does not directly Mark as Paid');
assert(app.includes("closest?.('[data-copy-payment-value]')") && app.includes('async function copyTextFromUi') && app.includes("document.addEventListener('click'"), 'delegated payment copy/fallback handler missing');

// Ads: immediate cached editor, exact-account SELL payment methods, no guessed
// price bands, exact Binance rejection bounds, and responsive bottom sheet.
const editOpen = block(ads, 'async function openAdvertisementEditorFromAction(', 'async function deleteAdvertisementFromAction(');
assert(editOpen.includes('openAdvertisementEditor(ad, scopedData)'), 'Ads editor does not open from the synchronized local snapshot');
assert(!editOpen.includes('?refresh=1') && !editOpen.includes('p2pflow:ads-editor-live-refresh'), 'Ads editor still starts live network refresh work from the Edit click path');
const paymentScope = block(ads, 'function adsPaymentMethodsForCredential(', 'function adsPaymentDataForCredential(');
assert(/Number\(method\.credentialId(?: \|\| 0)?\) === id/.test(paymentScope) && !paymentScope.includes('!Number(method.credentialId)'), 'SELL payment methods can leak across Binance accounts');
assert(server.includes('ensureAdvertisementPaymentMethods(methods, credential.id)'), 'exact-account payment methods are not catalogued safely');
const priceGuide = block(server, 'async function advertisementReferencePriceGuide(', 'function advertisementFixedPriceRangeFromBinanceError(');
assert(!priceGuide.includes('callBinancePublicAdvSearch'), 'Ads price editor still waits on public market search');
assert(!server.includes('assertAdvertisementFixedPriceWithinLiveRange'), 'Reference Price is still coupled to mutation validation');
assert(ads.includes('Reference Price') && /display only/i.test(ads), 'fixed-price Reference Price is not display-only');
assert(!/referencePrice\s*\*\s*1\.(?:08|10)/.test(server), 'undocumented guessed percentage price range remains');
assert(server.includes('advertisementFixedPriceRangeFromBinanceError') && server.includes('binance_rejection_exact_bounds'), 'exact Binance rejection bounds are not parsed');
assert(css.includes('body.ads-sheet-open #mobileBottomNav.mobile-bottom-nav{display:none!important}') && css.includes('100dvh'), 'mobile Ads sheet can still be covered by fixed navigation');

// Static delivery and initial boot: versioned JS/CSS are immutable, HTML stays
// no-store, and classic scripts download in parallel while retaining order.
assert(server.includes("'public, max-age=31536000, immutable'"), 'versioned frontend immutable cache missing');
assert(server.includes("requestedAssetVersion === APP_VERSION"), 'immutable cache is not release-version gated');
assert(server.includes("'no-store, no-cache, must-revalidate, max-age=0'"), 'HTML/unversioned app code no-store fallback missing');
for (const [name, html] of [['index',index],['login',login],['setup',setup]]) {
  const scripts = [...html.matchAll(/<script\s+([^>]*\bsrc="\/[^"]+"[^>]*)><\/script>/g)];
  assert(scripts.length > 0, `${name}.html has no local scripts`);
  for (const match of scripts) assert(/\bdefer\b/.test(match[1]), `${name}.html has a parser-blocking local script: ${match[0]}`);
}
for (const match of index.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="(\/[^"?#]+)(?:\?[^"#]*)?"[^>]*>/g)) {
  const urlPath = match[1];
  if (urlPath.startsWith('/api/')) continue;
  const rel = `public${urlPath}`;
  assert(exists(rel), `broken local index asset reference: ${urlPath}`);
}

// Fresh-package hygiene.
assert(!exists('public/assets/order-filter.png'), 'obsolete Orders PNG asset remains');
const forbiddenArtifacts = [];
(function walk(dir, rel='') {
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (['node_modules','.git','dist','dist-unified'].includes(entry.name)) continue;
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(child, childRel);
    else if (/\.(?:bak|tmp|log|map|orig)$|~$|\.DS_Store$|Thumbs\.db$/i.test(entry.name)) forbiddenArtifacts.push(childRel);
  }
})(root);
assert(forbiddenArtifacts.length === 0, `stale/temp artifacts remain: ${forbiddenArtifacts.join(', ')}`);
for (const required of ["'.env'","'.p2pflow'","'shared'","'data'","'node_modules'"]) assert(packager.includes(required), `unified packager does not exclude ${required}`);
assert(packager.includes('isTopLevelPackageClutter'), 'old version release-document cleanup is missing from unified packager');

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  schema:38,
  orderEngine:'protected-ingestion-plus-v1.8.0-bounded-multi-account-orchestration',
  perUserAccountControls:true,
  asyncStateCompression:true,
  onePassPaymentBalances:true,
  compactOrderLists:true,
  realtimeOrderDelta:true,
  staleWhileRevalidateRoutes:true,
  directPaidWhenSplitOff:true,
  delegatedCopy:true,
  instantAdsEditor:true,
  sellPaymentScope:'exact-credential',
  priceBounds:'binance-authoritative-only',
  responsiveAdsSheet:true,
  versionedAssetCache:true,
  deferredBootScripts:true,
  packageHygiene:true
}, null, 2));
