#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const server = read('app-server.js');
const ads = read('public/js/pages/ads.js');
const app = read('public/app.js');
const users = read('public/js/pages/users.js');
const ledger = read('public/js/pages/ledger.js');
const updates = read('lib/updateManager.js');
const pkg = JSON.parse(read('package.json'));
function assert(value, message) { if (!value) throw new Error(`v${pkg.version} direct-update/performance self-test failed: ${message}`); }
function block(source, start, end) {
  const a = source.indexOf(start); const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Block not found: ${start}`);
  return source.slice(a, b);
}

assert(pkg.version === '1.7.4', `expected 1.7.4, got ${pkg.version}`);
assert(!server.includes('The latest Binance advertisement amount could not be read, so no update was sent'), 'old live-read-before-write blocker remains');
assert(!server.includes('assertAdvertisementFixedPriceWithinLiveRange'), 'Reference Price still validates mutations');

const patch = block(server, "if (!action && req.method === 'PATCH')", "if (action === 'status'");
assert(patch.includes('advertisementCachedDetailForUpdate(item)'), 'existing ad update does not start from the synced local snapshot');
assert(patch.includes('refresh:false'), 'existing ad update still forces network refresh before Save');
assert(!patch.includes('advertisementReferencePriceGuide('), 'Save/Update still waits for Reference Price');
const amountBranch = patch.indexOf('isAdvertisementAmountValidationError(error)');
const detailFetch = patch.indexOf('fetchLiveAdvertisementDetail', Math.max(0, amountBranch));
assert(amountBranch >= 0 && detailFetch > amountBranch, 'amount-error recovery live-detail fetch missing');
assert(patch.slice(0, amountBranch).indexOf('fetchLiveAdvertisementDetail') === -1, 'live detail is fetched before the first Binance update attempt');

const refHandler = block(server, 'async function handleAdvertisementReferencePrice(', 'async function handleAdvertisementPaymentOptions(');
assert(refHandler.includes('displayOnly:true'), 'Reference Price endpoint is not marked display-only');
for (const key of ['minPrice:', 'maxPrice:', 'allowedRangeText:', 'validationMessage:', 'marketPrice:']) assert(!refHandler.includes(key), `display-only Reference Price leaks ${key}`);
assert(ads.includes('<span>Reference Price</span>') && ads.includes('Display only · never blocks Save/Update'), 'single-value display-only Reference Price UI missing');
assert(!/Highest Order Price|Lowest Ad Price|adMarketPriceLine/.test(ads), 'fixed-price UI still shows high/low market guidance');
assert(!ads.includes('fixedPriceWithinGuide'), 'fixed-price guide blocker remains');

assert(server.includes("source: 'binance_p2p_profile'") && server.includes('binancePayId: payId'), 'SELL exact Binance Profile payId source missing');
assert(server.includes("source:'binance_valid_payment_methods'") || server.includes("source: 'binance_valid_payment_methods'"), 'BUY Binance valid-method catalog missing');
assert(ads.includes('data-payment-search') && ads.includes("addEventListener('input', applySearch)") && ads.includes("addEventListener('search', applySearch)"), 'payment search input/clear behavior missing');

const init = block(app, 'async function init()', 'async function bootApp(');
assert(init.includes("api('/api/bootstrap'"), 'initial app boot does not use the combined bootstrap endpoint');
assert(!init.includes("api('/api/me'"), 'initial app boot still performs duplicate /api/me request');
assert(server.includes('zlib.gzip(body, { level: 1 }') && server.includes("'Content-Encoding': 'gzip'") && server.includes('body.length >= 8192'), 'large JSON API gzip response path missing');
assert(users.includes('const [agents, accounts] = await Promise.all(['), 'Users page still loads independent APIs sequentially');
assert(ledger.includes('const [data, accounts] = await Promise.all(['), 'Ledger page still loads independent APIs sequentially');

assert(updates.includes('await this.validateReleaseDirectory(stageDir, manifest, { runtimeChecks:false });'), 'fresh signed update still runs slow runtime self-tests on production staging');
assert(updates.includes('await this.validateReleaseDirectory(finalDir, manifest, { runtimeChecks:false });'), 'reused signed update still runs runtime self-tests');
assert(updates.includes('computeReleaseTreeSha256'), 'signed release tree integrity check was removed');
assert(server.includes('await updateManager.validateInstalledRelease(target, { runtimeChecks:false });'), 'prepared-release activation still reruns runtime tests');

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  adsUpdate:'optimistic-direct-first',
  liveDetailRetry:'amount-rejection-only',
  referencePrice:'single-value-display-only',
  buyPayments:'binance-valid-catalog',
  sellPayments:'exact-profile-payid',
  initialBootRequests:1,
  apiCompression:'gzip-level-1',
  routeWaterfallsReduced:true,
  updateStaging:'signed-tree-no-runtime-spawn'
}, null, 2));
