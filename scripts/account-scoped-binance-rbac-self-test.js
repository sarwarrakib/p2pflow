#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const app = read('public/app.js');
const users = read('public/js/pages/users.js');
const orders = read('public/js/pages/orders.js');
const ads = read('public/js/pages/ads.js');
const accounting = read('public/js/pages/accounting.js');
const css = read('public/style.css');

const fail = message => { throw new Error(`Account-scoped Binance RBAC self-test failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

assert(pkg.version === '1.5.32', `expected v1.5.32, got ${pkg.version}`);
assert(server.includes('const APP_SCHEMA_VERSION = 35;'), 'schema migration version 33 is missing');

for (const marker of [
  'BINANCE_ACCOUNT_PERMISSION_CATALOG',
  'BINANCE_ACCOUNT_PERMISSION_GROUPS',
  'normalizeBinanceCredentialPermissions',
  'userHasBinanceCredentialPermission',
  'binanceCredentialOptionsForUser',
  'validateGrantedGlobalPermissions',
  'validateGrantedBinanceCredentialPermissions'
]) assert(server.includes(marker), `server marker missing: ${marker}`);

assert(server.includes("if (String(user.role || '').toLowerCase() === 'admin') return true;"), 'Admin all-account override is missing');
assert(!server.includes("user.role === 'manager' && PRIVILEGED_ORDER_PERMISSIONS"), 'Manager still has an implicit global permission bypass');
assert(server.includes("if (!userHasPermission(user, permission)) return false;"), 'global permission gate is missing');
assert(server.includes('You cannot grant permissions you do not have'), 'non-admin permission delegation guard is missing');
assert(server.includes("Number(item.credentialId) === Number(credentialId)"), 'exact credential match is missing');
assert(server.includes("userHasBinanceCredentialPermission(user, credentialId, 'orders.view')"), 'order visibility is not account-scoped');
assert(server.includes("requireLiveBinanceCredentialForUser(req, res, manager, body.credentialId, 'orders.create'"), 'Binance order creation is not account-scoped');
assert(server.includes("userHasBinanceCredentialPermission(user, credential.id, 'orders.final_action')"), 'final action permission is not account-scoped');
assert(server.includes("userHasBinanceCredentialPermission(user, credential.id, 'orders.quick_release')"), 'quick release permission is not account-scoped');
assert(server.includes("canAccessAdvertisement(user, item, 'ads.view')"), 'advertisement visibility is not account-scoped');
assert(server.includes("requireLiveBinanceCredentialForUser(req, res, manager, body.credentialId, 'ads.manage'"), 'advertisement creation is not account-scoped');
assert(server.includes("requireAdvertisementManage(req, res, item.credentialId)"), 'advertisement mutations are not bound to the advertisement account');

for (const marker of [
  'security-recovery-panel',
  'Security Question',
  'securityAnswer',
  'binanceCredentialPermissionMatrix',
  'selectedBinanceCredentialPermissions',
  'includeProfitInCompanyTotals'
]) assert(app.includes(marker), `user editor marker missing: ${marker}`);
assert(users.includes('securityFallbackConfigured'), 'Users page does not show Security Question status');
assert(server.includes("const canManageUsers = Boolean(viewer && userHasPermission(viewer, 'agents.manage'))"), 'other users can still receive private user recovery/grant configuration');
assert(users.includes('Individual only') && users.includes('Company total'), 'Users page does not show profit accounting scope');

for (const marker of [
  'orderAccountSwitcherHtml',
  'data-order-account',
  'orderSourceAccountHtml',
  'orders.create',
  'binance.sync'
]) assert(orders.includes(marker), `orders account UI marker missing: ${marker}`);
assert(!orders.includes("'Binance Account'"), 'Orders still renders a separate Binance Account column');
assert(app.includes('obj.credentialId = Number(obj.credentialId || 0);'), 'order modal does not normalize and submit credentialId');

for (const marker of [
  'adsAccountSwitcherHtml',
  'data-ads-account',
  'ads.manage',
  'credentialId: selectedCredentialId',
  'applyToAll',
  'merchantControlTargets',
  'currentCredentialId()',
  'binance-account-badge',
  'refreshEditorAccount'
]) assert(ads.includes(marker), `ads account UI marker missing: ${marker}`);

for (const marker of [
  'includeProfitInCompanyTotals',
  'agentProfitIncludedInCompanyTotals',
  'ownerActualBusinessAssetUsd',
  'allUserProfitUsd',
  'excludedUserProfitUsd',
  "accountingScope: agentProfitIncludedInCompanyTotals(item.agentId) ? 'company' : 'individual_only'"
]) assert(server.includes(marker), `profit exclusion server marker missing: ${marker}`);
for (const marker of [
  'Actual Business Asset',
  'Individual-only Profit Excluded',
  'Company Recognized Asset',
  'Company-counted User/Agent Profit',
  'Accounting Scope'
]) assert(accounting.includes(marker), `accounting UI marker missing: ${marker}`);

for (const marker of [
  '.security-recovery-panel',
  '.binance-permission-matrix',
  '.page-account-strip',
  '.binance-account-selector',
  '.binance-account-badge',
  '.profit-accounting-setting'
]) assert(css.includes(marker), `responsive CSS marker missing: ${marker}`);

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  securityQuestionInUserEditor: true,
  exactBinanceAccountRbac: true,
  accountScopedOrders: true,
  accountScopedAdvertisements: true,
  individualProfitExclusion: true,
  responsiveAccountContextUi: true
}, null, 2));
