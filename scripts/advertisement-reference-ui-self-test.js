'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const server = read('app-server.js');
const adapter = read('lib/binanceAdapter.js');
const ads = read('public/js/pages/ads.js');
const app = read('public/app.js');
const css = read('public/style.css');
const pkg = JSON.parse(read('package.json'));
function assert(ok, message) { if (!ok) throw new Error(message); }
function block(source, start, end) {
  const a = source.indexOf(start); const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Block not found: ${start}`);
  return source.slice(a, b);
}

assert(/getAdReferencePrice:\s*\['POST',\s*'\/sapi\/v1\/c2c\/ads\/getReferencePrice'\]/.test(adapter), 'Binance Ads reference-price endpoint is missing.');
assert(/async function handleAdvertisementReferencePrice/.test(server) && /\/api\/ads\/reference-price/.test(server), 'Ads reference-price API route is missing.');
const guide = block(server, 'function normalizeAdvertisementReferencePriceResponse(', 'async function advertisementReferencePriceGuide(');
assert(/referencePrice/.test(guide), 'Binance reference-price normalization is missing.');
assert(!/referencePrice\s*\*\s*1\.(?:08|10)/.test(server), 'Undocumented percentage-derived fixed-price limits remain.');
assert(!/function assertAdvertisementFixedPriceWithinLiveRange/.test(server), 'Reference Price is still used as a pre-submit mutation validator.');
const refHandler = block(server, 'async function handleAdvertisementReferencePrice(', 'async function handleAdvertisementPaymentOptions(');
assert(/displayOnly:true/.test(refHandler), 'Reference-price API is not explicitly display-only.');
for (const forbidden of ['minPrice:', 'maxPrice:', 'allowedRangeText:', 'validationMessage:', 'marketPrice:']) {
  assert(!refHandler.includes(forbidden), `Reference-price API still exposes mutation/range field ${forbidden}`);
}
assert(/Reference Price/.test(ads) && /display only/i.test(ads), 'Display-only Reference Price UI is missing.');
assert(!/Highest Order Price|Lowest Ad Price|adMarketPriceLine/.test(ads), 'Reference UI still contains market max/min guidance.');
assert(!/fixedPriceWithinGuide/.test(ads), 'Client still blocks fixed price using Reference Price.');
assert(!/priceInput\.max\s*=|setAttribute\(['"]max['"]/.test(ads), 'Reference Price still writes a client max constraint.');
assert(/refreshAndValidateFixedPrice = async \(\) => validateWizardStep\(1\)/.test(ads), 'Next/Preview/Save still waits for reference-price validation.');
assert(/name="priceType"/.test(ads) && /Fixed/.test(ads) && /Floating/.test(ads) && /name="priceFloatingRatio"/.test(ads), 'Price Type controls are missing.');

assert(/Set Type & Price/.test(ads) && /Set Amount & Method/.test(ads) && /Set Conditions/.test(ads), 'Three-step Post Ad wizard is missing.');
assert(/isEdit \? `<div class="ads-wizard-head ads-edit-full-head">/.test(ads), 'Edit Advertisement single-page header is missing.');
assert(/form\.querySelectorAll\('\[data-ad-step\]'\).*section\.hidden = false/.test(ads), 'Edit Advertisement does not reveal every section on one page.');
assert(/ads-edit-full-modal/.test(ads) && /\.ads-editor-modal\.ads-edit-full-modal/.test(css), 'Single-page Edit Advertisement layout is missing.');
assert(/data-ad-menu/.test(ads) && /openAdvertisementActionSheet/.test(ads), 'Advertisement three-dot action menu is missing.');
assert(/data-ad-action-edit/.test(ads) && /data-ad-action-delete/.test(ads), 'Three-dot menu does not expose both Edit and Delete.');

const paymentScope = block(ads, 'function adsPaymentMethodsForCredential(', 'function adsPaymentDataForCredential(');
assert(/Array\.isArray\(scoped\) \? scoped : \[\]/.test(paymentScope), 'Credential payment methods still fall back to a global/other account list.');
assert(/method\.credentialId/.test(paymentScope), 'Credential ID mismatch guard is missing from payment-method filtering.');
assert(/function advertisementSavedPaymentOptionsForCredential/.test(server) && /source: 'binance_p2p_profile'/.test(server), 'Server does not source SELL payment methods from the selected Binance P2P profile.');
assert(/ADS_ACCOUNT_PAYMENT_METHOD_MISMATCH/.test(server), 'Account-scoped payment method mismatch protection is missing.');
assert(/function advertisementScopedPaymentMethodIds/.test(server) && /allowGlobalFallback:false/.test(server), 'Advertisement responses do not remove payment IDs that belong to another Binance account.');
assert(/ADS_CREDENTIAL_SCOPE_MISMATCH/.test(server), 'Advertisement credential reassignment guard is missing.');
assert(/exactEditorCredentialAvailable/.test(ads) && /Edit was blocked to prevent cross-account payment-method use/.test(ads), 'Edit UI can still fall back to a different Binance account.');

const editPatch = block(server, "if (!action && req.method === 'PATCH')", "if (action === 'status'");
assert(editPatch.includes('advertisementCachedDetailForUpdate(item)'), 'Existing Ads update does not use the already-synced local snapshot.');
assert(editPatch.includes('refresh:false'), 'Existing Ads update still forces payment/reference network refresh before Save.');
const amountErrorPos = editPatch.indexOf('isAdvertisementAmountValidationError(error)');
const liveDetailPos = editPatch.indexOf('fetchLiveAdvertisementDetail', Math.max(0, amountErrorPos));
assert(amountErrorPos >= 0 && liveDetailPos > amountErrorPos, 'Live amount detail is not limited to Binance amount-rejection recovery.');
assert(editPatch.slice(0, amountErrorPos).indexOf('fetchLiveAdvertisementDetail') === -1, 'Ads update still reads latest Binance detail before sending the update.');
assert(!editPatch.includes('advertisementReferencePriceGuide('), 'Ads mutation still waits for Reference Price.');

assert(/compareAdvertisementsByStableCreationOrder/.test(server), 'Stable advertisement ordering comparator is missing.');
assert(/items\.sort\(compareAdvertisementsByStableCreationOrder\)/.test(server), 'Advertisement list still sorts by edit/update time.');
assert(/order: cleanStr\(opts\.order \|\| 'createTime'/.test(server), 'Binance advertisement sync does not request stable create-time order.');

assert(/paymentSelectionMode === 'generic'/.test(ads), 'BUY generic payment-method mode is missing.');
assert(/BUY ad: select only payment methods currently returned by Binance/.test(ads), 'BUY generic payment-method guidance is missing.');
assert(/SELL ad: this is the exact saved P2P Payment Method list/.test(ads), 'SELL saved profile payment-method guidance is missing.');
assert(/obj\.paymentPayIds = selectedPayIds/.test(ads) && /obj\.paymentMethodKeys = selectedGenericKeys/.test(ads), 'BUY/SELL payment-method submission split is missing.');
assert(/data-payment-search/.test(ads) && /addEventListener\('input', applySearch\)/.test(ads), 'Payment method search is not active.');
assert(/slice\(0,\s*5\)/.test(ads) && /maximum of 5 payment methods/.test(ads), 'Five-payment-method cap is missing.');

const releasePage = block(app, 'function openReleaseVerificationPage(', 'function openFinalActionModal(');
assert(/release-verify-minimal/.test(releasePage) && /release-verify-submit/.test(releasePage), 'Minimal Release verification shell/button is missing.');
assert(/\.release-verify-minimal/.test(css) && /\.ads-wizard-progress/.test(css) && /\.ads-ad-action-menu/.test(css), 'Responsive ads workflow CSS is missing.');
assert(pkg.version === '1.7.8', `expected v1.7.8, got ${pkg.version}`);
console.log(JSON.stringify({
  ok:true,
  createFlow:'three-step',
  editFlow:'single-page',
  actionMenu:['edit','delete'],
  fixedPrice:'reference-display-only-binance-mutation-authoritative',
  paymentScope:'credential-isolated-exact-payid',
  adOrder:'stable-create-time',
  maxPaymentMethods:5,
  referenceUi:'single-display-value'
}));
