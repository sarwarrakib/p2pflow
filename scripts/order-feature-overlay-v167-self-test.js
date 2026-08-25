#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const app = read('public/app.js');
const orders = read('public/js/pages/orders.js');
const chat = read('public/js/pages/chat.js');

const fail = message => { throw new Error(`Order feature overlay v1.6.7 self-test failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const section = (source, start, end) => {
  const a = source.indexOf(start);
  if (a < 0) fail(`section start missing: ${start}`);
  const b = source.indexOf(end, a + start.length);
  if (b < 0) fail(`section end missing: ${end}`);
  return source.slice(a, b);
};

assert(pkg.version === '1.6.7', `expected v1.6.7 before release bump, got ${pkg.version}`);
assert(server.includes('const APP_SCHEMA_VERSION = 39;'), 'behavior-only fix unexpectedly requires a schema change');

const accountAccess = section(server, 'function userBinanceOrderAccountAccess', 'function setUserBinanceCredentialFeatureControls');
assert(accountAccess.includes("userHasBinanceCredentialPermission(user, credentialId, 'orders.view'"), 'exact-account Orders View permission is not preserved');
assert(accountAccess.includes("userHasBinanceCredentialPermission(user, credentialId, 'binance.sync'"), 'exact-account Live Order permission is not preserved');
assert(accountAccess.includes("userBinanceCredentialFeatureEnabled(user, credentialId, 'orders'"), 'per-user account Orders switch is not applied');
assert(accountAccess.includes('effectiveView: Boolean(canView && (!respectFeatureControl || featureEnabled))'), 'Orders switch is not a deny-only visibility overlay');
assert(accountAccess.includes('effectiveLive: Boolean(canLiveSync && (!respectFeatureControl || featureEnabled))'), 'Orders switch is not a deny-only Live Order overlay');

const visible = section(server, 'function orderVisibleToUserInOrdersPage', 'function ordersAccessibleToUser');
assert(visible.includes('if (!userIsAssignmentScoped(user)) return true;'), 'admin/manager/non-assignment visibility no longer restores immediately when Orders is ON');
assert(visible.includes('assigned || accountAccess.canLiveSync'), 'assignment-scoped visibility no longer preserves assigned-or-Live-Order behavior');
assert(server.includes('return (db.orders || []).filter(order => orderVisibleToUserInOrdersPage(user, order, options));'), 'Orders list does not use the compatibility visibility helper');

const routes = section(server, 'function eligibleAgentRoutes', 'function eligibleAgents');
assert(routes.includes('agentAvailableForAssignment(x.agent, order)'), 'auto assignment is not account-aware');
assert(routes.includes('userBinanceOrderAccountAccess(agentUser, order.credentialId).effectiveView'), 'Orders OFF user can still receive that account through auto assignment');
const availability = section(server, 'function agentAvailableForAssignment', 'function rangeBounds');
assert(availability.includes('userBinanceOrderAccountAccess(linkedUser, order.credentialId)') && availability.includes('access.effectiveLive'), 'Live Order Work-status bypass is not scoped to the current account');

const controlApi = section(server, 'async function handleChatAccountControls', 'async function handleChatInbox');
assert(controlApi.includes('changedFeatures') && controlApi.includes('orderVisibility'), 'account control API does not report effective order visibility');
assert(controlApi.includes("const forceOrdersReload = changedFeatures.includes('orders')") && controlApi.includes('controls.orders === true'), 'Orders ON/OFF does not force the current CRM user to reconcile Orders');

const orderApi = section(server, 'async function handleOrders', 'function orderListView');
assert(orderApi.includes(".filter(option => userBinanceCredentialFeatureEnabled(user, option.id, 'orders'))"), 'Orders-OFF accounts still leak into Orders account selectors');
assert(orders.includes('if (filters.credentialId && !credentialOptions.some'), 'stale saved API-account filter is not reset when its account is unavailable');

const invalidator = section(app, 'function invalidateOrdersListCache', 'function mountRouteStaticShell');
assert(invalidator.includes('state.ordersListData = null') && invalidator.includes('state.orderSnapshot = null'), 'Orders data cache is not invalidated');
assert(invalidator.includes('state.routeHostManager?.drop?.(stableRouteKey({ page:\'orders\''), 'detached stale Orders route is not discarded');
assert(app.includes("if (event.type === 'binance.account.features.updated')") && app.includes("changedFeatures.includes('orders')") && app.includes('invalidateOrdersListCache'), 'realtime account-control event does not invalidate Orders');
assert(chat.includes("changedFeatures.includes('orders') || result.forceOrdersReload === true") && chat.includes('invalidateOrdersListCache'), 'local Chat settings save does not invalidate Orders before navigation');

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  schema:39,
  overlay:'existing-permissions-plus-per-user-per-account-deny',
  ordersOnRestoresExistingPermittedOrders:true,
  liveOrderRestoredPerAccount:true,
  assignmentBehaviorPreserved:true,
  autoAssignmentRespectsOnlyTargetAccountSwitch:true,
  staleOrdersRouteInvalidated:true,
  staleAccountFilterReconciled:true
}, null, 2));
