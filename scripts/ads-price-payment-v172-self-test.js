'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const server = read('app-server.js');
const ads = read('public/js/pages/ads.js');
const css = read('public/style.css');
const pkg = JSON.parse(read('package.json'));
function assert(ok, message) { if (!ok) throw new Error(`v1.7.2 ads price/payment self-test failed: ${message}`); }
function block(source, start, end) {
  const a = source.indexOf(start); const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Block not found: ${start}`);
  return source.slice(a, b);
}

const refGuide = block(server, 'async function advertisementReferencePriceGuide(', 'function advertisementReferencePayType(');
assert(/const attempts = payType \? \[payType, ''\] : \[''\]/.test(refGuide), 'reference price does not retry without a payment-type filter');
assert(/timeoutMs: 15000/.test(refGuide), 'reference-price transport allowance was not restored');
assert(/stale:true/.test(refGuide) && /last known reference price/.test(refGuide), 'last-good reference fallback is missing');
const priceGuard = block(server, 'async function assertAdvertisementFixedPriceWithinLiveRange(', 'function advertisementPriceValidationErrorPayload(');
assert(/referenceUnavailable:true/.test(priceGuard), 'reference-price outage still blocks advertisement mutation');
assert(/guide\.stale !== true/.test(priceGuard), 'stale reference bounds can still reject a mutation locally');
assert(!ads.includes('The current Binance fixed-price range could not be loaded. No advertisement action was sent.'), 'old client-side no-action blocker remains');
assert(!ads.includes('Wait for the current Binance fixed-price range to load.'), 'wizard still requires the reference endpoint before continuing');
assert(/You can still submit; Binance will validate the current price/.test(ads), 'reference outage fallback message is missing');
assert(/15000\);/.test(ads), 'reference UI still refreshes at the old high-frequency interval');

assert(/function advertisementSavedPaymentOptionsForCredential/.test(server), 'exact P2P Profile saved-payment projection is missing');
const savedOptions = block(server, 'function advertisementSavedPaymentOptionsForCredential(', 'function normalizeAdvertisementRegions(');
for (const marker of ['ownerP2pProfileRecord', 'binancePayId: payId', "source: 'binance_p2p_profile'"]) assert(savedOptions.includes(marker), `saved-payment projection missing ${marker}`);
assert(/async function handleAdvertisementPaymentOptions/.test(server) && /\/api\/ads\/payment-options/.test(server), 'payment-options API is missing');
const optionsHandler = block(server, 'async function handleAdvertisementPaymentOptions(', 'async function handleAdvertisements(');
assert(/tradeType === 'SELL'/.test(optionsHandler) && /advertisementSavedPaymentOptionsForCredential/.test(optionsHandler), 'SELL options are not sourced from the exact profile list');
assert(/refreshAdvertisementGenericPaymentCatalog/.test(optionsHandler) && /binance_valid_payment_methods/.test(optionsHandler), 'BUY options are not sourced from Binance valid payment methods');

const normalize = block(server, 'function normalizeAdvertisementInput(', 'function advertisementCreateClassifyForCredential(');
assert(/paymentPayIds/.test(normalize) && /advertisementOwnerProfileTradeMethods/.test(normalize), 'SELL submission is not keyed by exact Binance payId');
const prepare = block(server, 'async function prepareAdvertisementTradeMethodsForCredential(', 'function advertisementUpdatePayload(');
assert(/requestedPayIds/.test(prepare) && /missingPaymentPayIds/.test(prepare), 'exact-account SELL payId validation is missing');
assert(/normalizeAdvertisementTradeType\(item\.tradeType\) === 'BUY'/.test(prepare) && /payId:0/.test(prepare), 'BUY generic payment method payload behavior changed');

assert(/paymentSelectionMode:'saved-payid'/.test(ads), 'SELL UI does not use Binance payId selection mode');
assert(/obj\.paymentPayIds = selectedPayIds/.test(ads), 'SELL form does not submit exact Binance payIds');
assert(/obj\.paymentMethodKeys = selectedGenericKeys/.test(ads), 'BUY form no longer submits generic Binance method keys');
assert(/data-payment-search/.test(ads) && /addEventListener\('input', applySearch\)/.test(ads) && /is-search-hidden/.test(ads), 'payment method search is not wired to live filtering');
assert(/\.ads-sheet-option\.is-search-hidden/.test(css), 'payment search hidden-row CSS override is missing');
assert(/P2P Payment Method/.test(ads), 'SELL UI no longer identifies the profile P2P Payment Method source');
assert(pkg.version === '1.7.2', `expected v1.7.2, got ${pkg.version}`);

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  referencePrice:'retry-cache-nonblocking',
  buyPayments:'binance-valid-method-catalog',
  sellPayments:'exact-profile-payid',
  paymentSearch:true
}));
