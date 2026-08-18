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
const security = read('public/js/pages/security.js');
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

assert(pkg.version === '1.5.20', `expected v1.5.20, got ${pkg.version}`);
assert(server.includes('const APP_SCHEMA_VERSION = 33;'), 'schema 33 is missing.');

// Payment-account authorization: Admin/Manager all, Agent own only, optional all-account permission for non-Agent roles.
assert(server.includes("'accounts.manage_all': Object.freeze(['accounts.view', 'accounts.manage'])"), 'accounts.manage_all implications are missing.');
assert(server.includes("'offline.transactions.manage': Object.freeze(['accounts.view'])"), 'offline transaction page implication is missing.');
const manageAll = section(server, 'function canManageAllPaymentAccounts', 'function canManagePaymentAccount');
assert(manageAll.includes("['admin', 'manager'].includes"), 'Admin/Manager all-account access is missing.');
assert(manageAll.includes("role || '').toLowerCase() === 'agent') return false"), 'Agent is not hard-limited away from all-account scope.');
assert(manageAll.includes("userHasPermission(user, 'accounts.manage_all')"), 'Manage All Payment Accounts permission is not implemented.');
const manageOwn = section(server, 'function canManagePaymentAccount', 'function canManagePaymentAccountAccess');
assert(manageOwn.includes("userHasPermission(user, 'accounts.manage')"), 'accounts.manage is not required.');
assert(manageOwn.includes('paymentAccountOwnedByUser(accountItem, user)'), 'Own-account boundary is missing.');
const draft = section(server, 'function paymentAccountDraftFromBody', 'function paymentAccountSerialConflict');
assert(draft.includes('actor?.id'), 'Logged-in user is not the default Account User.');
assert(draft.includes('if (restrictedToOwnAccount) resolvedOwner = { user: actor'), 'Own-only users can override Account User.');
assert(draft.includes('label:') && draft.includes('serialNumber:'), 'Label/Serial fields are missing from account draft.');

const paymentList = section(server, 'async function handlePaymentAccounts', 'async function handlePaymentAccountById');
assert(paymentList.includes('canOpenPaymentAccounts(user)'), 'Payment Accounts page gate is missing.');
assert(paymentList.includes('canCreatePaymentAccounts(user)'), 'Payment account creation permission gate is missing.');
assert(paymentList.includes("url.searchParams.get('search')") && paymentList.includes('paymentAccountMatchesSearch'), 'Server-side number/label/serial search is missing.');
const update = section(server, 'async function updatePaymentAccount', 'async function addAccountLedger');
assert(update.includes('canManagePaymentAccount(user, accountItem)'), 'Edit does not enforce account ownership/scope.');
assert(update.includes('canManagePaymentAccountAccess'), 'Owner/access editing scope is missing.');
assert(update.includes('nextLabel') && update.includes('nextSerialNumber'), 'Edit does not persist Label/Serial.');
const ledger = section(server, 'async function addAccountLedger', 'function offlineTransactionActive');
assert(ledger.includes('canAdjustPaymentAccount(user, accountItem)'), 'Ledger adjustment does not enforce own/all scope.');

assert(accounts.includes("const canCreate = hasPerm('accounts.manage');"), 'Permitted users cannot see Add Account.');
assert(accounts.includes('account.viewerCanManage') && accounts.includes('account.viewerCanAdjust'), 'Per-account action flags are not used by the UI.');
assert(accounts.includes('Search number, label or serial'), 'Payment account search UI is missing.');
assert(accounts.includes('paymentAccountIdentityHtml'), 'Label/Serial identity display is missing.');
assert(app.includes('paymentAccountOwnerField(state.user?.id'), 'Add/Bulk Account User does not default to the logged-in user.');
assert(app.includes('name="label"') && app.includes('name="serialNumber"'), 'Add/Edit Label and Serial fields are missing.');
assert(app.includes('Starting Serial') && app.includes('bulkSerialValue'), 'Sequential bulk serial workflow is missing.');
assert(app.includes("['accounts', 'Payment Accounts', ['admin','manager','agent','auditor']]"), 'Payment Accounts page is not available to permitted users.');

// Assignment eligibility remains controlled by the persistent switch, not presence.
const availability = section(server, 'function agentAvailableForAssignment', 'function rangeBounds');
assert(availability.includes('agent.allowNewOrders === false'), 'Order Acceptance OFF is not an assignment blocker.');
assert(availability.includes("linkedUser.role !== 'agent'"), 'Non-Agent users can become auto-assignment candidates.');
assert(availability.includes("userHasPermission(linkedUser, 'orders.view')"), 'Orders View is not required for assignment eligibility.');
assert(!availability.includes('userPresenceView') && !availability.includes('agentDynamicStatus'), 'Presence still controls assignment eligibility.');
const manualAssign = section(server, 'async function managerAssign', 'async function requestCoAgent');
assert(manualAssign.includes('if (!agentAvailableForAssignment(agent))'), 'Manual assignment ignores Order Acceptance OFF.');
assert(orders.includes("options.id || 'orderAcceptanceToggle'") && orders.includes('data-order-acceptance-toggle'), 'Orders-page Work Status button is missing.');
assert(orders.includes('স্যার, আপনি কি এখন কাজ করতে চান?'), 'Required Bengali Work Status prompt is missing.');
assert(users.includes('Work Status'), 'Users page does not expose work status.');

// Every catalog permission has bilingual details and a right-side eye button opened by click.
const permissions = [
  'dashboard.view','orders.view','orders.create','orders.assign','orders.split','orders.final_action','orders.quick_release',
  'approvals.manage','binance.sync','binance.chat','p2p.profile.view','p2p.profile.sync','ads.view','ads.manage',
  'accounts.view','accounts.use','accounts.manage','accounts.manage_all','ledger.adjust','offline.transactions.manage',
  'routing.manage','agents.manage','roles.manage','reports.view','accounting.view','accounting.manage','accounting.close',
  'activity.view','audit.view','settings.manage','credentials.manage'
];
for (const permission of permissions) {
  const occurrences = (app.match(new RegExp(`'${permission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'g')) || []).length;
  assert(occurrences >= 2, `label/description missing for permission: ${permission}`);
  const entryPattern = new RegExp(`'${permission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*:\\s*\\{\\s*en:\\s*'[^']{20,}'\\s*,\\s*bn:\\s*'[^']{20,}'`);
  assert(entryPattern.test(app), `complete English/Bengali description missing for permission: ${permission}`);
}
assert(app.includes('<button type="button" class="permission-help"'), 'Permission eye is not a real button.');
assert(app.includes('<svg viewBox="0 0 24 24"') && app.includes('data-permission-help='), 'Eye icon/details data is missing.');
assert(app.includes("document.addEventListener('click'") && app.includes("target.closest?.('[data-permission-help]')"), 'Permission details are not opened by click.');
assert(!app.includes('data-permission-scope='), 'Whole-row hover details should not replace the right-side eye action.');
assert(css.includes('.permission-help svg') && css.includes('.permission-help[aria-expanded="true"]'), 'Permission eye visual/expanded state is missing.');

// Security page regression: it must use the global date formatter that actually exists.
assert(security.includes('fmt(device.expiresAt)') && security.includes('fmt(device.lastSeenAt)'), 'Trusted-device rows still call an undefined date formatter.');
assert(!security.includes('formatDate('), 'Security page still references undefined formatDate.');

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  schemaVersion: 33,
  agentOwnAccountManage: true,
  managerAllAccountManage: true,
  permissionDescriptions: permissions.length,
  permissionEyeButton: true,
  assignmentPresenceIndependent: true,
  securityPageRegressionFixed: true
}, null, 2));
