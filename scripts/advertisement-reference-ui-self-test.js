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
assert(/referencePrice/.test(guide) && /binance_explicit_live_bounds/.test(guide) && /reference_ui_derived/.test(guide), 'Live Binance reference-price guide/bounds normalization is missing.');
assert(!/name="minRate"/.test(ads) && !/name="maxRate"/.test(ads), 'Editable Minimum/Maximum Rate inputs still exist.');
assert(/Price range/.test(ads) && /adLivePriceRange/.test(ads) && /Highest Order Price/.test(ads) && /Lowest Ad Price/.test(ads), 'Screenshot-style live price guide is incomplete.');
assert(/name="priceType"/.test(ads) && /Fixed/.test(ads) && /Floating/.test(ads) && /name="priceFloatingRatio"/.test(ads), 'Price Type controls are missing.');
assert(/Set Type & Price/.test(ads) && /Set Amount & Method/.test(ads) && /Set Conditions/.test(ads), 'Three-step Post Ad wizard is missing.');
assert(/Verification Request/.test(ads) && /name="additionalKyc"/.test(ads), 'Verification Request control is missing.');
assert(/Preview Ad/.test(ads) && /data-preview-post/.test(ads), 'Advertisement preview flow is missing.');
assert(/paymentSelectionMode === 'generic'/.test(ads), 'BUY generic payment-method mode is missing.');
assert(/Select up to 5 Binance-supported payment methods/.test(ads), 'BUY generic payment-method guidance is missing.');
assert(/Select up to 5 payment accounts saved on this Binance P2P account/.test(ads), 'SELL saved payment-account guidance is missing.');
assert(/obj\.paymentMethodIds = selectedMethodIds\.map\(Number\)/.test(ads) && /obj\.paymentMethodKeys = selectedGenericKeys\.slice\(0, 5\)/.test(ads), 'BUY/SELL payment-method submission split is missing.');
assert(/slice\(0,\s*5\)/.test(ads) && /maximum of 5 payment methods/.test(ads), 'Five-payment-method cap is missing.');
const normalize = block(server, 'function normalizeAdvertisementInput(', 'function advertisementCreateClassifyForCredential(');
assert(/tradeType === 'SELL'/.test(normalize) && /paymentMethodIds/.test(normalize) && /paymentMethodKeys/.test(normalize), 'Server BUY/SELL payment selection model is incomplete.');
const releasePage = block(app, 'function openReleaseVerificationPage(', 'function openFinalActionModal(');
for (const verbose of ['Saved Fund Transfer Password ready', 'Primary/Secondary P2PFlow verification is available', 'Protected Release · P2PFlow / Binance Risk', 'Binance verification check']) {
  assert(!releasePage.includes(verbose), `Verbose Release verification text remains: ${verbose}`);
}
assert(/release-verify-minimal/.test(releasePage) && /release-verify-submit/.test(releasePage), 'Minimal Release verification shell/button is missing.');
assert(/\.release-verify-minimal/.test(css) && /\.ads-wizard-progress/.test(css) && /\.screenshot-filters/.test(css), 'Responsive Binance-reference CSS overrides are missing.');
assert(pkg.version === '1.6.0', `expected v1.6.0, got ${pkg.version}`);
console.log(JSON.stringify({ ok:true, liveReferencePrice:true, editableRateBounds:false, sellSavedAccounts:true, buyGenericMethods:true, maxPaymentMethods:5, releaseVerification:'minimal-one-button', referenceUi:true }));
