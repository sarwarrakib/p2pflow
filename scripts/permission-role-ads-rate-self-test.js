'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const server = read('app-server.js');
const app = read('public/app.js');
const ads = read('public/js/pages/ads.js');
function assert(condition, message) { if (!condition) throw new Error(message); }
function block(source, start, end) {
  const a = source.indexOf(start); const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Could not find block ${start}`);
  return source.slice(a, b);
}
assert(/const APP_SCHEMA_VERSION = 37;/.test(server), 'Schema 37 is required for credential-secret vault migration.');
const userPerm = block(server, 'function userHasPermission(', 'function binanceAccountGlobalPermissionSet(');
assert(!/role\s*===|role\s*!==|admin|manager|agent|auditor/i.test(userPerm), 'userHasPermission still depends on a role name.');
const clientPerm = block(app, 'function hasPerm(', 'function canOverrideOrderAssignmentClient(');
assert(!/state\.user\.role|admin|manager|agent|auditor/i.test(clientPerm), 'Client hasPerm still depends on a role name.');
const visible = block(app, 'function visiblePages()', 'function canPage(');
assert(!/state\.user\.role|p\[2\]/.test(visible), 'Page visibility still depends on a role label.');
assert(!/linkedUser\.role\s*!==\s*['"]agent['"]/.test(server), 'Agent linkage still disables work by role name.');
assert(/previousSchemaVersion < 36/.test(server) && /Role labels are\n    \/\/ intentionally ignored even during this one-time compatibility step/.test(server), 'Schema-36 permission-only legacy Binance grant migration is missing.');
assert(/previousSchemaVersion < 37/.test(server) && /releaseFundPasswordVault/.test(server) && /storeCredentialFundPassword/.test(server), 'Schema-37 Fund Password field-vault migration is missing.');
assert(/'binance\.sync': Object\.freeze\(\['orders\.view'\]\)/.test(app), 'Client binance.sync implication to orders.view is missing.');
assert(/name="minRate"/.test(ads) && /name="maxRate"/.test(ads), 'Ads Minimum/Maximum Rate fields are missing.');
assert(/Maximum Rate must be greater than or equal to Minimum Rate/.test(server), 'Server ad-rate bound validation is missing.');
assert(/Advertisement price cannot be lower than Minimum Rate/.test(server) && /Advertisement price cannot be higher than Maximum Rate/.test(server), 'Server price guard validation is incomplete.');
const payload = block(server, 'function advertisementBinancePayload(', 'const ADVERTISEMENT_UPDATE_ALLOWED_KEYS');
assert(!/\bminRate\b|\bmaxRate\b/.test(payload), 'Local Minimum/Maximum Rate leaked into Binance payload.');
const allowlist = block(server, 'const ADVERTISEMENT_UPDATE_ALLOWED_KEYS', 'function advertisementUpdatePayload');
assert(!/'minRate'|'maxRate'/.test(allowlist), 'Local Minimum/Maximum Rate leaked into Binance update allowlist.');
console.log(JSON.stringify({ ok:true, permissionAuthority:'explicit-permissions-only', schema:37, adRateGuard:true, binancePayloadLeak:false }));
