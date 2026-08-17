#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const app = read('public/app.js');
const accounts = read('public/js/pages/accounts.js');
const orders = read('public/js/pages/orders.js');
const users = read('public/js/pages/users.js');
const css = read('public/style.css');

const fail = message => { throw new Error(`Order acceptance / payment permission self-test failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const section = (source, start, end) => {
  const a = source.indexOf(start);
  if (a < 0) fail(`section start missing: ${start}`);
  const b = source.indexOf(end, a + start.length);
  if (b < 0) fail(`section end missing after ${start}: ${end}`);
  return source.slice(a, b);
};

assert(pkg.version === '1.5.17', `expected v1.5.17, got ${pkg.version}`);
assert(server.includes('const APP_SCHEMA_VERSION = 31;'), 'schema 31 is missing.');

// Payment-account authorization must be permission-driven, including Agent users.
assert(server.includes("'accounts.manage': Object.freeze(['accounts.view'])"), 'accounts.manage does not imply the page read permission.');
assert(server.includes("'ledger.adjust': Object.freeze(['accounts.view'])"), 'ledger.adjust does not imply the page read permission.');
assert(server.includes("if (userHasPermission(user, 'accounts.manage')) return true;"), 'accounts.manage cannot access all payment accounts.');

const paymentList = section(server, 'async function handlePaymentAccounts', 'async function handlePaymentAccountById');
assert(paymentList.includes("requirePermission(req, res, 'accounts.view')"), 'Payment Accounts page is not protected by accounts.view.');
assert(paymentList.includes("requirePermission(req, res, 'accounts.manage')"), 'Payment Account create is not protected by accounts.manage.');
assert(!/\['admin',\s*'manager'\]/.test(paymentList), 'Payment Account create still contains an Admin/Manager role gate.');

const bulk = section(server, 'async function handleBulkPaymentAccounts', 'async function handlePaymentAccounts');
assert(bulk.includes("requirePermission(req, res, 'accounts.manage')"), 'Bulk Payment Account add is not protected by accounts.manage.');
assert(!/\['admin',\s*'manager'\]/.test(bulk), 'Bulk Payment Account add still contains an Admin/Manager role gate.');

const update = section(server, 'async function updatePaymentAccount', 'async function addAccountLedger');
assert(update.includes("userHasPermission(user, 'accounts.manage')"), 'Payment Account edit is not protected by accounts.manage.');
assert(!/\['admin',\s*'manager'\]/.test(update), 'Payment Account edit still contains an Admin/Manager role gate.');

const ledger = section(server, 'async function addAccountLedger', 'function routeView');
assert(ledger.includes("userHasPermission(user, 'ledger.adjust')"), 'Offline transaction adjustment is not protected by ledger.adjust.');
assert(!/\['admin',\s*'manager'\]/.test(ledger), 'Ledger adjustment still contains an Admin/Manager role gate.');

assert(accounts.includes("const canManage = hasPerm('accounts.manage');"), 'Agent UI still hides Add/Edit despite accounts.manage.');
assert(accounts.includes("const canAdjust = hasPerm('ledger.adjust');"), 'Agent UI still hides Offline Txn despite ledger.adjust.');
assert(accounts.includes('id="newAccountBtn"') && accounts.includes('type="button"'), 'Add Payment Account action button is missing or implicit.');
assert(app.includes("['accounts', 'Payment Accounts', ['admin','manager','agent','auditor']]"), 'Payment Accounts page is not available to permitted Agent users.');
assert(app.includes("['ledger', 'Account Statement', ['admin','manager','agent','auditor']]"), 'Account Statement page is not available to permitted Agent users.');

// Assignment eligibility is controlled by the persistent switch, not presence.
const availability = section(server, 'function agentAvailableForAssignment', 'function rangeBounds');
assert(availability.includes('agent.allowNewOrders === false'), 'Order Acceptance OFF is not an assignment blocker.');
assert(availability.includes("linkedUser.role !== 'agent'"), 'Non-Agent users can become auto-assignment candidates.');
assert(availability.includes("userHasPermission(linkedUser, 'orders.view')"), 'Orders View is not required for assignment eligibility.');
assert(!availability.includes('userPresenceView') && !availability.includes('agentDynamicStatus'), 'Presence still controls assignment eligibility.');
assert(server.includes('agentAvailableForAssignment(x.agent)'), 'Routing does not apply the Order Acceptance gate.');

const manualAssign = section(server, 'async function managerAssign', 'async function requestCoAgent');
assert(manualAssign.includes('if (!agentAvailableForAssignment(agent))'), 'Manual assignment ignores Order Acceptance OFF.');
assert(server.includes("if (url.pathname === '/api/me/order-acceptance') return await handleMyOrderAcceptance(req, res);"), 'Order Acceptance API route is missing.');
assert(server.includes("async function handleMyOrderAcceptance"), 'Order Acceptance API handler is missing.');
assert(server.includes("broadcast({ type: 'agent.order_acceptance.updated'"), 'Order Acceptance realtime event is missing.');
assert(orders.includes('id="orderAcceptanceToggle"'), 'Orders-page Order Acceptance button is missing.');
assert(orders.includes("api('/api/me/order-acceptance'"), 'Orders-page button is not connected to the API.');
assert(orders.includes('স্যার, আপনি কি অর্ডার গ্রহণ করতে চান?'), 'Required Bengali Order Acceptance prompt is missing.');
assert(orders.includes('id="declineOrderAcceptance"') && orders.includes('id="confirmOrderAcceptance"'), 'Prompt Yes/No actions are missing.');
assert(orders.includes("When OFF, new orders will not assign even while online."), 'OFF behavior is not explained on the control.');
assert(users.includes('Order Acceptance'), 'Users page does not expose each Agent order-acceptance state.');

// Every catalog permission must have a complete hover/focus description.
const permissions = [
  'dashboard.view','orders.view','orders.create','orders.assign','orders.split','orders.final_action','orders.quick_release',
  'approvals.manage','binance.sync','binance.chat','p2p.profile.view','p2p.profile.sync','ads.view','ads.manage',
  'accounts.view','accounts.use','accounts.manage','ledger.adjust','routing.manage','agents.manage','roles.manage',
  'reports.view','accounting.view','accounting.manage','accounting.close','activity.view','audit.view','settings.manage','credentials.manage'
];
for (const permission of permissions) {
  const occurrences = (app.match(new RegExp(`'${permission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'g')) || []).length;
  assert(occurrences >= 2, `label/description missing for permission: ${permission}`);
  const entryPattern = new RegExp(`'${permission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*:\\s*\\{\\s*en:\\s*'[^']{20,}'\\s*,\\s*bn:\\s*'[^']{20,}'`);
  assert(entryPattern.test(app), `complete English/Bengali description missing for permission: ${permission}`);
}
assert(app.includes('data-permission-scope='), 'Hovering the permission row does not expose its scope.');
assert(app.includes('data-permission-help='), 'Keyboard/touch permission help control is missing.');
assert(app.includes('setupPermissionHelpTooltips()'), 'Permission tooltip setup is missing.');
assert(app.includes('binanceCredentialPermissionMatrix'), 'Per-Binance-account permission matrix is missing.');
for (const marker of ['.permission-option','.permission-help','.permission-tooltip','.order-acceptance-toggle','.order-acceptance-prompt']) {
  assert(css.includes(marker), `CSS marker missing: ${marker}`);
}

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  schemaVersion: 31,
  agentPaymentAccountManage: true,
  agentLedgerAdjust: true,
  permissionDescriptions: permissions.length,
  assignmentPresenceIndependent: true,
  orderAcceptancePrompt: true
}, null, 2));
