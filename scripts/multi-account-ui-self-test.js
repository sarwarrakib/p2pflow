#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const orders = read('public/js/pages/orders.js');
const ads = read('public/js/pages/ads.js');
const users = read('public/js/pages/users.js');
const app = read('public/app.js');
const server = read('app-server.js');
const css = read('public/style.css');
const pkg = JSON.parse(read('package.json'));

function assert(value, message) {
  if (!value) throw new Error(`Multi-account UI self-test failed: ${message}`);
}

assert(/data-order-account="0"/.test(orders), 'Orders All account button is missing.');
assert(/class="binance-account-tab/.test(orders), 'Orders account buttons are missing.');
assert(/orderAccountDisplayName/.test(orders) && /p2pUsername/.test(orders), 'Orders do not prefer the Binance P2P username.');
assert(/const tableHead = \['Order','Source','Type'/.test(orders), 'Orders Source column was not preserved.');
assert(!/const tableHead = \[[^\n]*'Binance Account'/.test(orders), 'Orders still has a separate Binance Account column.');
assert(/orderSourceAccountHtml\(o\)/.test(orders), 'Orders Source does not render the P2P account name.');
assert(!/orderCredentialFilter/.test(orders), 'Legacy Orders account selector remains.');

assert(/data-ads-account="0"/.test(ads), 'Ads All account button is missing.');
assert(/applyToAll/.test(ads) && /credentialId:\s*selectedCredentialId \|\| null/.test(ads), 'Ads All merchant action routing is missing.');
assert(/adsAccountDisplayName/.test(ads) && /p2pUsername/.test(ads), 'Ads do not prefer the Binance P2P username.');
assert(/adsMerchantControls\(data, scopedCapability\)/.test(ads), 'Business, Online and Break controls are not rendered in the account scope.');
assert(/data-mixed="1"/.test(ads), 'Aggregate mixed-state merchant controls are missing.');
assert(!/function adCapabilityNotice/.test(ads), 'Legacy explanatory Ads capability banner remains.');

assert(/<button type="button" id="addUserBtn">Add User \+ Login<\/button>/.test(users), 'Add User + Login is not an explicit action button.');
assert(/bindUserAction\('#addUserBtn', \(\) => openUserModal\(null\)\)/.test(users), 'Add User + Login is not bound to the modal.');
assert(/addEventListener\('click'/.test(users), 'User actions do not use resilient event listeners.');
assert(/defaultUserRoleProfileId/.test(app), 'Dynamic default role selection is missing.');
assert(!/roleProfileSelect\(u\.roleProfileId \|\| 3\)/.test(app), 'Add User still depends on hard-coded role ID 3.');
assert(/const userForm = \$\('#userForm'\)/.test(app), 'User form initialization guard is missing.');
assert(/const allowed = new Set/.test(app) && /allowed\.has\(permission\)/.test(app), 'Binance permission matrix must use Set.has so Add User opens correctly.');
assert(!/allowed\.includes\(permission\)/.test(app), 'Add User still calls Array.includes on a Set.');
assert(/binanceP2pAccountDisplayName\(option\)/.test(app), 'Order modal account names do not use P2P usernames.');

assert(/function binanceCredentialP2pIdentity/.test(server), 'Server P2P account identity helper is missing.');
assert(/displayName:\s*identity\.displayName/.test(server), 'Credential options do not expose the P2P display name.');
assert(/advertisementMerchantControlsAggregate/.test(server), 'Aggregate Ads merchant controls are missing.');
assert(/applyToAll/.test(server) && /manual_toggle_all/.test(server), 'Server-side Ads All batch action is missing.');
assert(/merchantControlsByCredential/.test(server), 'Per-account Ads merchant states are missing.');

for (const marker of [
  '.binance-account-switcher',
  '.binance-account-tab',
  '.binance-account-tab.active',
  '.ads-merchant-inline-item.is-mixed'
]) assert(css.includes(marker), `CSS marker missing: ${marker}`);

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  accountButtons: true,
  p2pUsernameLabels: true,
  ordersSourceMerged: true,
  adsAllMerchantBatch: true,
  addUserButton: true,
  dynamicRoleDefault: true
}, null, 2));
