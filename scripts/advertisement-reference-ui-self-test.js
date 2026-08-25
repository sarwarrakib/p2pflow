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
assert(/referencePrice/.test(guide) && /binance_explicit_live_bounds/.test(guide) && /binance_reference_only/.test(guide), 'Live Binance reference-price guide/bounds normalization is missing.');
assert(/validationMessage/.test(guide) && /Fixed price must fall within the limited range of:/.test(guide), 'Exact fixed-price range message is missing.');
assert(!/referencePrice\s*\*\s*1\.(?:08|10)/.test(server) && /not_returned_by_reference_api/.test(guide), 'Undocumented percentage-derived fixed-price limits remain.');
assert(/assertAdvertisementFixedPriceWithinLiveRange/.test(server) && /ADS_FIXED_PRICE_OUT_OF_RANGE/.test(server), 'Server-side live fixed-price validation is missing.');
assert((server.match(/assertAdvertisementFixedPriceWithinLiveRange\(/g) || []).length >= 4, 'Create, edit and publish do not all enforce the live price range.');
assert(/function advertisementReferencePayType/.test(server) && /const payType = advertisementReferencePayType\(item\);/.test(server), 'Cached server price validation is not scoped to the selected payment method.');
assert(/currentReferencePayType/.test(ads) && /payType=\$\{encodeURIComponent\(payType\)\}/.test(ads), 'Editor reference-price request does not include the selected payment method.');
assert(!/name="minRate"/.test(ads) && !/name="maxRate"/.test(ads), 'Editable Minimum/Maximum Rate inputs still exist.');
assert(/Fixed price limit/.test(ads) && /adLivePriceRange/.test(ads) && /Highest Order Price/.test(ads) && /Lowest Ad Price/.test(ads), 'Live price-limit guide is incomplete.');
assert(/refreshReferencePrice\(true\)/.test(ads) && /fixedPriceWithinGuide/.test(ads) && !/No advertisement action was sent/.test(ads), 'The editor reference refresh/fallback behavior is incomplete.');
assert(/name="priceType"/.test(ads) && /Fixed/.test(ads) && /Floating/.test(ads) && /name="priceFloatingRatio"/.test(ads), 'Price Type controls are missing.');

assert(/Set Type & Price/.test(ads) && /Set Amount & Method/.test(ads) && /Set Conditions/.test(ads), 'Three-step Post Ad wizard is missing.');
assert(/isEdit \? `<div class="ads-wizard-head ads-edit-full-head">/.test(ads), 'Edit Advertisement single-page header is missing.');
assert(/form\.querySelectorAll\('\[data-ad-step\]'\).*section\.hidden = false/.test(ads), 'Edit Advertisement does not reveal every section on one page.');
assert(/ads-edit-full-modal/.test(ads) && /\.ads-editor-modal\.ads-edit-full-modal/.test(css), 'Single-page Edit Advertisement layout is missing.');
assert(/data-ad-menu/.test(ads) && /openAdvertisementActionSheet/.test(ads), 'Advertisement three-dot action menu is missing.');
assert(/data-ad-action-edit/.test(ads) && /data-ad-action-delete/.test(ads), 'Three-dot menu does not expose both Edit and Delete.');
assert(!/data-edit-ad/.test(ads), 'Three-dot button still opens Edit directly.');

const paymentScope = block(ads, 'function adsPaymentMethodsForCredential(', 'function adsPaymentDataForCredential(');
assert(/Array\.isArray\(scoped\) \? scoped : \[\]/.test(paymentScope), 'Credential payment methods still fall back to a global/other account list.');
assert(/method\.credentialId/.test(paymentScope), 'Credential ID mismatch guard is missing from payment-method filtering.');
assert(/function advertisementSavedPaymentOptionsForCredential/.test(server) && /source: 'binance_p2p_profile'/.test(server), 'Server does not source SELL payment methods from the selected Binance P2P profile.');
assert(/fetchAdvertisementAccountPaymentMethods\(credential, \{ enrich:false \}\)/.test(server) && /const genericPaymentMethods = advertisementGenericPaymentCatalogForCredential/.test(server), 'Edit action does not refresh exact-account payment methods.');
assert(/ADS_ACCOUNT_PAYMENT_METHOD_MISMATCH/.test(server), 'Account-scoped payment method mismatch protection is missing.');
assert(/function advertisementScopedPaymentMethodIds/.test(server) && /allowGlobalFallback:false/.test(server), 'Advertisement responses do not remove payment IDs that belong to another Binance account.');
assert(/ADS_CREDENTIAL_SCOPE_MISMATCH/.test(server), 'Advertisement credential reassignment guard is missing.');
assert(/exactEditorCredentialAvailable/.test(ads) && /Edit was blocked to prevent cross-account payment-method use/.test(ads), 'Edit UI can still fall back to a different Binance account.');
assert(/ADS_LIVE_DETAIL_REQUIRED/.test(server) && /ADS_ACCOUNT_PAYMENT_METHODS_REQUIRED/.test(server), 'Edit preload is not fail-closed on exact-account live detail/payment-method verification.');
const editPatch = block(server, "if (!action && req.method === 'PATCH')", "if (action === 'status'");
assert(editPatch.indexOf('prepareAdvertisementTradeMethodsForCredential') < editPatch.lastIndexOf('assertAdvertisementFixedPriceWithinLiveRange'), 'Edit validation checks price before resolving exact-account payment methods.');

assert(/compareAdvertisementsByStableCreationOrder/.test(server), 'Stable advertisement ordering comparator is missing.');
assert(/items\.sort\(compareAdvertisementsByStableCreationOrder\)/.test(server), 'Advertisement list still sorts by edit/update time.');
assert(/order: cleanStr\(opts\.order \|\| 'createTime'/.test(server), 'Binance advertisement sync does not request stable create-time order.');

assert(/Verification Request/.test(ads) && /name="additionalKyc"/.test(ads), 'Verification Request control is missing.');
assert(/Preview Ad/.test(ads) && /data-preview-post/.test(ads), 'Advertisement preview flow is missing.');
assert(/paymentSelectionMode === 'generic'/.test(ads), 'BUY generic payment-method mode is missing.');
assert(/BUY ad: select only payment methods currently returned by Binance/.test(ads), 'BUY generic payment-method guidance is missing.');
assert(/SELL ad: this is the exact saved P2P Payment Method list/.test(ads), 'SELL saved profile payment-method guidance is missing.');
assert(/obj\.paymentPayIds = selectedPayIds/.test(ads) && /obj\.paymentMethodKeys = selectedGenericKeys\.slice\(0, 5\)/.test(ads), 'BUY/SELL payment-method submission split is missing.');
assert(/slice\(0,\s*5\)/.test(ads) && /maximum of 5 payment methods/.test(ads), 'Five-payment-method cap is missing.');
const normalize = block(server, 'function normalizeAdvertisementInput(', 'function advertisementCreateClassifyForCredential(');
assert(/tradeType === 'SELL'/.test(normalize) && /paymentMethodIds/.test(normalize) && /paymentMethodKeys/.test(normalize), 'Server BUY/SELL payment selection model is incomplete.');

const releasePage = block(app, 'function openReleaseVerificationPage(', 'function openFinalActionModal(');
for (const verbose of ['Saved Fund Transfer Password ready', 'Primary/Secondary P2PFlow verification is available', 'Protected Release · P2PFlow / Binance Risk', 'Binance verification check']) {
  assert(!releasePage.includes(verbose), `Verbose Release verification text remains: ${verbose}`);
}
assert(/release-verify-minimal/.test(releasePage) && /release-verify-submit/.test(releasePage), 'Minimal Release verification shell/button is missing.');
assert(/\.release-verify-minimal/.test(css) && /\.ads-wizard-progress/.test(css) && /\.ads-ad-action-menu/.test(css), 'Responsive ads workflow CSS is missing.');
assert(pkg.version === '1.7.2', `expected v1.7.2, got ${pkg.version}`);
console.log(JSON.stringify({
  ok:true,
  createFlow:'three-step',
  editFlow:'single-page',
  actionMenu:['edit','delete'],
  fixedPrice:'live-client-and-server-validated',
  paymentScope:'credential-isolated-fail-closed',
  referencePriceScope:'account-pair-side-payment-method',
  adOrder:'stable-create-time',
  maxPaymentMethods:5,
  referenceUi:true
}));
