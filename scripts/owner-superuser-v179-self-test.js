#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const app = read('public/app.js');
const credentials = read('public/js/pages/credentials.js');
function assert(condition, message){ if(!condition) throw new Error(`Owner superuser v${pkg.version} self-test failed: ${message}`); }
function block(source, start, end){ const a=source.indexOf(start); const b=source.indexOf(end,a+start.length); assert(a>=0 && b>a, `block missing: ${start}`); return source.slice(a,b); }
assert(pkg.version === '1.7.9', `expected v1.7.9, got ${pkg.version}`);
const globalPerm = block(server, 'function userHasPermission(', 'function binanceAccountGlobalPermissionSet(');
assert(/user\.isOwner\s*===\s*true/.test(globalPerm), 'durable Owner global superuser boundary is missing');
assert(!/user\.role\s*===|admin|manager|agent|auditor/i.test(globalPerm), 'role label still creates a global bypass');
const accountRows = block(server, 'function binanceCredentialPermissionRowsForUser(', 'function userHasBinanceCredentialPermission(');
assert(/user\?\.isOwner\s*===\s*true/.test(accountRows) && /BINANCE_ACCOUNT_PERMISSION_CATALOG\.slice\(\)/.test(accountRows), 'Owner does not dynamically cover every Binance credential');
const safe = block(server, 'function userSafe(', 'function ledgerEffect(');
assert(/u\.isOwner\s*===\s*true\s*\?\s*PERMISSION_CATALOG\.slice\(\)/.test(safe), 'Owner bootstrap does not publish full effective global permissions');
assert(/effectiveBinancePermissions/.test(safe) && /effectiveAllowedP2pCredentialIds/.test(safe), 'Owner bootstrap does not publish effective account scope');
const paymentUse = block(server, 'function canUsePaymentAccount(', 'function userSafe(');
assert(/user\.isOwner\s*===\s*true/.test(paymentUse), 'Owner cannot use all payment accounts');
const orderCredential = block(server, 'function canUseOrderCredential(', 'function canAccessAccount(');
assert(!/advertisements|userBinanceCredentialFeatureEnabled/.test(orderCredential), 'Advertisement switch still contaminates Orders/Chat/Sync permission checks');
const sync = block(server, 'async function handleBinancePaymentMethodSync(', 'async function refreshBinanceOrderDetail(');
assert(/usableBinanceCredentialOptionsForUser\(user, 'binance\.sync'\)/.test(sync), 'global payment-method sync does not enumerate accessible Binance accounts');
assert(/accountsSynced/.test(sync) && /accountsFailed/.test(sync) && /Promise\.all/.test(sync), 'multi-account payment-method sync aggregation is missing');
const clientPerm = block(app, 'function hasPerm(', 'function canOverrideOrderAssignmentClient(');
assert(/state\.user\.isOwner\s*===\s*true/.test(clientPerm), 'frontend does not recognize Owner all-rounder authority');
assert(!/state\.user\.role|admin|manager|agent|auditor/i.test(clientPerm), 'frontend role label still creates a permission bypass');
assert(/Syncing…/.test(credentials) && /accountsSynced/.test(credentials) && /finally/.test(credentials), 'payment-method sync button does not provide safe multi-account busy/recovery UX');
console.log(JSON.stringify({ok:true,version:pkg.version,ownerAllRounder:true,roleLabelsNonAuthoritative:true,dynamicFutureCredentialAccess:true,orderChatSyncDecoupledFromAdsToggle:true,paymentMethodSyncAllAccessibleAccounts:true},null,2));
