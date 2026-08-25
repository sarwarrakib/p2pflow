#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const app = read('public/app.js');
const settings = read('public/js/pages/settings.js');
const fail = message => { throw new Error(`Agent live-order / order-only self-test failed: ${message}`); };
const assert = (value, message) => { if (!value) fail(message); };
const section = (source, start, end) => {
  const a = source.indexOf(start);
  if (a < 0) fail(`section start missing: ${start}`);
  const b = source.indexOf(end, a + start.length);
  if (b < 0) fail(`section end missing: ${end}`);
  return source.slice(a, b);
};

assert(pkg.version === '1.6.7', `expected v1.6.7, got ${pkg.version}`);
assert(server.includes('const APP_SCHEMA_VERSION = 39;'), 'schema 36 permission-authority migration is missing');
assert(server.includes("'binance.sync': Object.freeze(['orders.view'])"), 'Live Order permission does not imply Orders View');
assert(server.includes('BINANCE_ACCOUNT_PERMISSION_IMPLICATIONS'), 'account-level Live Order implication is missing');

for (const marker of [
  'requirePaymentAccountCapacityForAutoAssignment',
  'assignmentAccountingEnabled',
  'assignmentAccountingGuardEnabledForUser',
  'assignmentAccountingGuardEnabledForAgent'
]) assert(server.includes(marker), `server marker missing: ${marker}`);

const capacity = section(server, 'function routeCapacityOk', 'function eligibleAgentRoutes');
assert(capacity.includes('!assignmentAccountingGuardEnabledForAgent(agent)'), 'route capacity is not bypassed for Order-only Agents');
assert(capacity.includes('accountAssignedToAgent') && capacity.includes('sendAvailable') && capacity.includes('receiveAvailable'), 'accounting-enabled capacity protection was removed');

const available = section(server, 'function agentAvailableForAssignment', 'function rangeBounds');
assert(available.includes('userBinanceOrderAccountAccess(linkedUser, order.credentialId)') && available.includes('access.effectiveLive'), 'Account-specific Live Order Agent eligibility override is missing');
assert(available.includes("userHasPermission(linkedUser, 'orders.view')"), 'Orders View is not required for auto assignment');
assert(available.indexOf('access.effectiveLive') < available.indexOf('agent.allowNewOrders === false'), 'hidden stale Work OFF can still block Live Order Agents');

const access = section(server, 'function canAccessOrder', 'function orderFeatureEnabledForUser');
assert(access.includes("userHasBinanceCredentialPermission(user, order.credentialId, 'binance.sync')"), 'Base Agent Live Order permission does not expose an unassigned live order');
const list = section(server, 'function orderVisibleToUserInOrdersPage', 'function ordersAccessibleToUser');
assert(list.includes('accountAccess.canLiveSync') && list.includes('assigned || accountAccess.canLiveSync'), 'Orders list does not restore Live Order visibility when the per-account Orders switch is ON');

const acceptance = section(server, 'function orderAcceptanceForUser', 'function broadcastOrderAcceptanceState');
assert(acceptance.includes('liveOrderAccess || (user.workAvailable !== false'), 'Live Order Agent assignment state still depends on hidden Work status');

const coagent = section(server, 'async function requestCoAgent', 'async function addSplit');
assert(coagent.includes('!assignmentAccountingGuardEnabledForAgent(agent)'), 'co-agent selection still requires wallet capacity in Order-only mode');

assert(settings.includes('name="requirePaymentAccountCapacityForAutoAssignment"'), 'global assignment accounting guard setting is missing');
assert(settings.includes('obj.requirePaymentAccountCapacityForAutoAssignment'), 'global assignment accounting setting is not submitted');
assert(app.includes('name="assignmentAccountingEnabled"'), 'per-Agent Order-only checkbox is missing');
assert(app.includes('obj.assignmentAccountingEnabled = e.target.assignmentAccountingEnabled.checked'), 'per-Agent Order-only setting is not submitted');
assert(app.includes('roleDefaultBinanceCredentialPermissions'), 'role account-permission defaults helper is missing');
assert(app.includes('input[name="binanceCredentialPermission"]') && app.includes('perms.includes(input.value)'), 'role change does not auto-tick account-level permissions');

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  schemaVersion: 35,
  liveOrderVisibilityForAgents: true,
  liveOrderHiddenWorkStateDoesNotBlockAssignment: true,
  globalOrderOnlyAssignmentMode: true,
  perAgentOrderOnlyAssignmentMode: true,
  roleAccountPermissionAutoTick: true
}, null, 2));
