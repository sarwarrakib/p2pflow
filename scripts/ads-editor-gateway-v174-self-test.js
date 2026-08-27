#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const server = read('app-server.js');
const ads = read('public/js/pages/ads.js');
const app = read('public/app.js');
const pkg = JSON.parse(read('package.json'));
function assert(ok, message) { if (!ok) throw new Error(`v${pkg.version} ads editor gateway self-test failed: ${message}`); }
function block(source, start, end) {
  const a = source.indexOf(start); const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Block not found: ${start}`);
  return source.slice(a, b);
}
assert(pkg.version === '1.7.9', `expected 1.7.9, got ${pkg.version}`);
const editor = block(ads, 'async function openAdvertisementEditorFromAction(', 'async function deleteAdvertisementFromAction(');
assert(!editor.includes('?refresh=1'), 'Edit click still triggers live /api/ads/:id refresh');
assert(!editor.includes("api(`/api/ads/"), 'Edit click still makes a per-ad network request');
assert(editor.includes('openAdvertisementEditor(ad, scopedData)'), 'Edit no longer opens from synchronized local snapshot');

const getBlock = block(server, "if (!action && req.method === 'GET')", "if (!action && req.method === 'DELETE')");
for (const forbidden of ['await fetchLiveAdvertisementDetail', 'await fetchAdvertisementAccountPaymentMethods', 'await syncAdvertisementCatalogWithCredential', 'Promise.all([liveDetailTask']) {
  assert(!getBlock.includes(forbidden), `/api/ads/:id GET still blocks on ${forbidden}`);
}
assert(getBlock.includes('advertisementSavedPaymentOptionsForCredential'), 'SELL cached exact-account payment projection missing');
assert(getBlock.includes('advertisementGenericPaymentCatalogForCredential'), 'BUY cached Binance method catalog missing');
assert(getBlock.includes('returned immediately'), 'local-only refresh contract is not documented in response path');

const apiBlock = block(app, 'async function api(path, opts={}, attempt=0)', 'let loginVerificationActive');
assert(!/\[0, 403, 429, 500, 502, 503, 504\]/.test(apiBlock), 'HTML 504 is still automatically retried');
assert(/\[0, 403, 429, 500, 502, 503\]/.test(apiBlock), 'transient non-504 retry policy changed unexpectedly');


const paymentOptions = block(server, 'async function handleAdvertisementPaymentOptions(', 'async function handleAdvertisements(');
assert(paymentOptions.includes('if (force)'), 'payment-options endpoint no longer has explicit refresh path');
assert(!paymentOptions.includes('force || !paymentMethods.length'), 'SELL payment-options still auto-refreshes stale/empty cache');
assert(!paymentOptions.includes('force || !paymentMethods.length || !last'), 'BUY payment-options still auto-refreshes stale/empty cache');
assert(paymentOptions.includes('{ enrich:false, fast:true }'), 'explicit SELL refresh is not bounded to the fast SAPI path');
assert(paymentOptions.includes("{ fast:true }"), 'explicit BUY refresh is not bounded to the fast SAPI path');
assert(server.includes('Math.min(6000'), 'fast payment refresh does not enforce a short per-attempt timeout');
console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  adsEditor:'local-snapshot-no-live-request',
  adDetailGet:'no-external-sapi-wait',
  gateway504AutoRetry:false,
  paymentSources:'cached-exact-account'
}, null, 2));
