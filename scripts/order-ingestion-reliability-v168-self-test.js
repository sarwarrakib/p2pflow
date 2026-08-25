#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const fail = message => { throw new Error(`Order ingestion reliability v1.6.8 self-test failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const section = (source, start, end) => {
  const a = source.indexOf(start);
  if (a < 0) fail(`section start missing: ${start}`);
  const b = source.indexOf(end, a + start.length);
  if (b < 0) fail(`section end missing: ${end}`);
  return source.slice(a, b);
};

assert(pkg.version === '1.6.8', `expected v1.6.8, got ${pkg.version}`);
assert(server.includes('const APP_SCHEMA_VERSION = 39;'), 'order-ingestion hotfix must not require a schema change');

const sync = section(server, 'async function syncBinanceOrdersWithCredential', 'const binanceCredentialOrderReconcileRuntime');
assert(sync.includes("endpointName: 'listOrders'"), 'Binance listOrders transport is missing');
assert(sync.includes('opts.timeoutMs || 20000'), 'listOrders did not restore the reliable 20s transport timeout');
assert(!sync.includes('opts.timeoutMs || 7000'), 'regressed 7s listOrders timeout is still present');
assert(sync.includes('opts.detailTimeoutMs || 20000'), 'order detail transport did not restore the reliable timeout');

const fast = section(server, 'async function runBinanceFastOrderDiscovery', 'async function runBinanceAutoOrderSync');
assert(fast.includes('fastOrderCredentialRuntime(credential)'), 'fast discovery does not use per-credential in-flight state');
assert(fast.includes('timeoutMs: 20000'), 'fast discovery still uses the short production-breaking timeout');
assert(!fast.includes('userBinanceCredentialFeatureEnabled') && !fast.includes('userBinanceOrderAccountAccess'), 'CRM-user feature switches leaked into Binance ingestion');
assert(fast.includes("const credentials = (db.apiCredentials || []).filter(item => !item.disabled && item.apiKey && item.secretKey)"), 'fast ingestion no longer polls every active API credential');

const auto = section(server, 'async function runBinanceAutoOrderSync', 'let binanceAdsAutoSyncBusy');
assert(auto.includes('timeoutMs:20000') && auto.includes('detailTimeoutMs:20000'), 'normal reconciliation still aborts healthy slow SAPI responses');
assert(!auto.includes('userBinanceCredentialFeatureEnabled') && !auto.includes('userBinanceOrderAccountAccess'), 'user feature switches leaked into normal background synchronization');

const reconcile = section(server, 'function scheduleBinanceCredentialOrderReconcile', 'async function handleBinanceOrderSync');
assert(reconcile.includes('systemBinanceSyncUser()'), 'Orders ON reconcile depends on the current CRM user permission instead of system ingestion');
assert(reconcile.includes('timeoutMs:20000'), 'Orders ON recovery still uses a short timeout');
assert(reconcile.includes("type:'binance.orders.reconciled'"), 'Orders ON recovery does not emit a realtime refresh event');

const controls = section(server, 'async function handleChatAccountControls', 'async function handleChatInbox');
assert(controls.includes("controls.orders === true") && controls.includes("scheduleBinanceCredentialOrderReconcile(credentialId, 'orders_feature_enabled')"), 'turning an account Orders ON does not immediately reconcile missed Binance orders');

const visibility = section(server, 'function orderVisibleToUserInOrdersPage', 'function ordersAccessibleToUser');
assert(visibility.includes('accountAccess.effectiveView'), 'per-user Orders OFF no longer hides only that user/account view');
assert(visibility.includes('assigned || accountAccess.canLiveSync'), 'existing assigned-or-Live-Order visibility model was changed');

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  schema:39,
  v164ReliableTransportRestored:true,
  shortSapiTimeoutRegressionRemoved:true,
  perCredentialFastPolling:true,
  featureControlsDoNotGateIngestion:true,
  ordersOnTriggersImmediateRecovery:true,
  oldPermissionAndAssignmentVisibilityPreserved:true
}, null, 2));
