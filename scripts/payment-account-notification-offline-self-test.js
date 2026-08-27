#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const app = read('public/app.js');
const index = read('public/index.html');
const accounts = read('public/js/pages/accounts.js');
const notifications = read('public/js/pages/notifications.js');
const offline = read('public/js/pages/offline-transactions.js');
const security = read('public/js/pages/security.js');
const css = read('public/style.css');

function assert(value, message) {
  if (!value) throw new Error(`Payment account / notification / offline self-test failed: ${message}`);
}
function section(source, start, end) {
  const a = source.indexOf(start);
  assert(a >= 0, `section start missing: ${start}`);
  const b = source.indexOf(end, a + start.length);
  assert(b >= 0, `section end missing: ${end}`);
  return source.slice(a, b);
}

assert(pkg.version === '1.7.9', `expected 1.7.9, got ${pkg.version}`);
assert(server.includes('const APP_SCHEMA_VERSION = 37;'), 'schema 34 missing.');

// Payment-account identity and scope.
assert(server.includes("'accounts.manage_all'"), 'Manage All Payment Accounts permission missing.');
assert(server.includes('function canManageAllPaymentAccounts') && server.includes("userHasPermission(user, 'accounts.manage_all')"), 'Permission-based all-account scope missing.');
assert(!server.includes("toLowerCase() === 'agent') return false"), 'Payment-account scope still depends on Agent role name.');
assert(server.includes('label: cleanStr(body.label') && server.includes('serialNumber: cleanStr(body.serialNumber'), 'Label/Serial persistence missing.');
assert(server.includes('function paymentAccountMatchesSearch') && server.includes('accountItem.label') && server.includes('accountItem.serialNumber'), 'Label/Serial server search missing.');
assert(accounts.includes('Search number, label, serial or user') && accounts.includes('applyPaymentAccountFilters') && accounts.includes('paymentAccountTypeFilter') && accounts.includes('paymentAccountLabelFilter') && accounts.includes('paymentAccountMethodFilter'), 'Instant permission-scoped payment account search/filter UI missing.');
assert(app.includes('paymentAccountOwnerField(state.user?.id') && app.includes('effectiveId = Number(selectedId ?? state.user?.id'), 'Logged-in Account User default missing.');
assert(app.includes("ownerSelect?.tagName === 'SELECT'"), 'Editable owner select guard is missing for own-account users.');
assert(app.includes('bulkSerialValue') && app.includes('Starting Serial'), 'Bulk sequential serial workflow missing.');

// Permission eye details.
assert(app.includes('class="permission-help"') && app.includes('<circle cx="12" cy="12" r="2.8"'), 'Eye icon permission button missing.');
assert(app.includes("target.closest?.('[data-permission-help]')") && app.includes("event.preventDefault()"), 'Permission eye click behavior missing.');
assert(css.includes('.permission-help svg') && css.includes('[aria-expanded="true"]'), 'Permission eye CSS missing.');

// Security page regression.
assert(security.includes('fmt(device.expiresAt)') && security.includes('fmt(device.lastSeenAt)'), 'Security trusted-device dates do not use fmt.');
assert(!security.includes('formatDate('), 'Undefined formatDate remains on Security page.');

// Notification preferences: per-user channels, mandatory security, filters and UI.
assert(server.includes('const NOTIFICATION_CATEGORY_CATALOG') && server.includes("id: 'security'") && server.includes('mandatory: true'), 'Notification category catalog/mandatory security missing.');
assert(server.includes('normalizeNotificationPreferences') && server.includes('notificationEnabledForUser'), 'Notification preference normalization missing.');
const notificationApi = section(server, 'async function handleNotifications', 'async function runBinanceAutoOrderSync');
assert(notificationApi.includes("req.method === 'PATCH'") && notificationApi.includes('notification_preferences_updated'), 'Notification preference save API missing.');
assert(server.includes("notificationEnabledForUser(user, 'email', category)"), 'Email notification filtering missing.');
assert(server.includes("notificationEnabledForUser(user, 'inApp', n.category)"), 'In-app notification filtering missing.');
assert(notifications.includes('data-notification-channel="inApp"') && notifications.includes('data-notification-channel="email"'), 'In-app/email toggles missing.');
assert(notifications.includes("method:'PATCH'") && notifications.includes('Save Preferences'), 'Notification preferences UI is not connected to API.');

// Manual feedback opens the exact advertiser URL used by extension tasks.
assert(server.includes('const extensionAdvertiserUrl = extensionFeedbackUserNo ? p2pAdvertiserUrlForUserNo'), 'Order view does not expose extension advertiser URL.');
assert(server.includes('manualFeedbackUrl: extensionAdvertiserUrl'), 'Manual feedback URL alias missing.');
assert(app.includes('data-open-counterparty-feedback') && app.includes('window.open(rawUrl'), 'Feedback button does not open URL in a new tab.');
assert(app.includes("order?.extensionAdvertiserUrl || order?.manualFeedbackUrl"), 'Feedback button does not consume server extension URL.');
assert(!app.includes('data-edit-counterparty-feedback'), 'Old manual numeric feedback button remains active.');

// Offline receipt workflow, reservation, partial receive/finalize and page registration.
assert(server.includes('offlineTransactions: []'), 'Offline transaction data collection missing.');
assert(server.includes("'/api/offline-transactions'"), 'Offline transaction API route missing.');
assert(server.includes('function offlineReservedAccountIds') && server.includes('offlineTransactionActive(transaction)'), 'Pending-number reservation missing.');
assert(server.includes('function paymentSplitReservedAccountIds') && server.includes('function pendingPaymentAccountReservation'), 'Cross-order payment-number reservation missing.');
assert(section(server, 'function activeSplitAccountsForAgent', 'function chooseSplitAccountForAgent').includes('pendingPaymentAccountReservedIds'), 'Pending Offline Business/order numbers are not excluded from new order split selection.');
assert(section(server, 'function validateNewSplit', 'function syncAssignmentStatus').includes('pending Offline Business receipt session'), 'Direct order split reservation enforcement missing.');
assert(section(server, 'function offlineTransactionCandidates', 'function createOfflineCompletedOrder').includes('paymentSplitReservedAccountIds'), 'Offline candidates do not exclude numbers reserved by pending normal orders.');
assert(server.includes("type: 'offline_receive'") && server.includes('allocation.receivedAmount = round2'), 'Received balance/partial tracking missing.');
assert(server.includes('body.allowPartial !== true') && server.includes("status = isPartial ? 'finalized_partial' : 'finalized'"), 'Partial offline order finalization guard missing.');
assert(server.includes('createOfflineCompletedOrder') && server.includes("orderSource: 'offline'"), 'Offline order creation missing.');
assert(index.includes('/page-preload.js?v=1.7.9') && app.includes("'offline-transactions':'offline-transactions.js'"), 'Offline page lazy module is not registered.');
assert(app.includes("['offline-transactions', 'Offline Business'") && app.includes("'offline-transactions': 'offline.transactions.manage'"), 'Offline page navigation/permission missing.');
assert(offline.includes('/api/offline-transactions/candidates') && offline.includes('data-mark-offline-received'), 'Offline candidate/received UI missing.');
assert(offline.includes('Create Partial Order') && offline.includes('allowPartial'), 'Offline partial finalize UI missing.');
assert(css.includes('.offline-allocation-row') && css.includes('.offline-candidate-row'), 'Offline workflow responsive CSS missing.');

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  schemaVersion: 35,
  paymentAccountOwnerDefault: true,
  labelSerialSearch: true,
  permissionEye: true,
  securityPage: true,
  notificationPreferences: true,
  extensionFeedbackLink: true,
  offlineReceiptReservations: true,
  partialOfflineOrders: true
}, null, 2));
