#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const app = read('public/app.js');
const accounts = read('public/js/pages/accounts.js');
const orders = read('public/js/pages/orders.js');
const ads = read('public/js/pages/ads.js');
const css = read('public/style.css');
const fail = message => { throw new Error(`Payment rules / notification scope self-test failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

assert(pkg.version === '1.7.4', `expected v1.7.4, got ${pkg.version}`);
assert(server.includes('const APP_SCHEMA_VERSION = 37;'), 'schema 35 is missing.');
assert(server.includes("send_money: { prefix: 'sendMoneyCharge'") && server.includes("cash_out: { prefix: 'cashOutCharge'"), 'separate Personal/Merchant fee rules are missing.');
assert(server.includes("receive_money: { prefix: 'receiveMoneyCommission'") && server.includes("cash_in: { prefix: 'cashInCommission'"), 'separate Agent commission rules are missing.');
assert(!server.includes('Agent account type requires an Agent user'), 'Agent account type is still tied to Agent login role.');
assert(server.includes("accountTypes: ['agent']") && server.includes("accountTypes: ['personal','merchant']"), 'transaction types are not scoped by account type.');
assert(app.includes('data-payment-rule-group="personal"') && app.includes('data-payment-rule-group="agent"'), 'dynamic charge/commission groups are missing.');
assert(app.includes("? '<option value=\"receive_money\">Received Money (+)</option><option value=\"cash_in\">Cash In (-)</option>'"), 'Agent manual transaction list is not reduced to Received Money / Cash In.');
assert(accounts.includes("addEventListener('input', applyPaymentAccountFilters)"), 'search-as-you-type is missing.');
assert(!accounts.includes('paymentAccountSearchForm'), 'old submit/Search button workflow remains.');
assert(accounts.includes('paymentAccountTypeFilter') && accounts.includes('paymentAccountLabelFilter') && accounts.includes('paymentAccountMethodFilter'), 'Account Type / Label / Payment Method filters are missing.');
assert(accounts.includes('icon-action-btn') && accounts.includes('paymentAccountIcon('), 'compact icon actions are missing.');
assert(css.includes('.payment-account-filterbar') && css.includes('.icon-action-btn') && css.includes('.payment-rule-card'), 'new Payment Accounts styling is missing.');

assert(server.includes('function pushSubscriptionAllowsNotification') && server.includes("['orders','assignments','messages']"), 'server push account-scope filter is missing.');
assert(server.includes("action === 'scope'") && server.includes('notificationCredentialId = credentialId'), 'per-device push scope endpoint is missing.');
assert(app.includes('function setNotificationCredentialScope') && app.includes('function notificationCredentialMatches'), 'client notification account scope helpers are missing.');
assert(app.includes("notificationCredentialMatches(event.credentialId, 'orders')") && app.includes("notificationCredentialMatches(event.credentialId, 'messages')"), 'foreground order/message notification scope enforcement is missing.');
assert(orders.includes('setNotificationCredentialScope(0, { sync:true })') && !orders.includes('data-order-account='), 'Orders should keep notification scope on all accessible accounts after removing the page-level account selector.');
assert(ads.includes('setNotificationCredentialScope(selectedCredentialId') && ads.includes('setNotificationCredentialScope(state.adsCredentialId'), 'Ads account selector does not drive notification scope.');
assert(app.includes('notificationCredentialId:activeNotificationCredentialScope()'), 'new push subscription does not persist the selected account scope.');

const runtime = spawnSync(process.execPath, ['app-server.js', '--payment-notification-scope-self-test'], { cwd:root, encoding:'utf8', env:{...process.env, NODE_ENV:'test'} });
if (runtime.stdout) process.stdout.write(runtime.stdout);
if (runtime.stderr) process.stderr.write(runtime.stderr);
if (runtime.error) fail(runtime.error.message);
if (runtime.status !== 0) process.exit(runtime.status || 1);
let report;
try { report = JSON.parse(String(runtime.stdout || '').trim()); } catch { fail('runtime report is not JSON.'); }
assert(report?.ok === true && report?.allScope === true && report?.selectedOrderScope === true && report?.selectedMessageScope === true && report?.securityUnaffected === true, 'runtime notification-scope assertions failed.');

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  schemaVersion:35,
  separateSendCashOutRates:true,
  agentRoleIndependent:true,
  agentTransactionTypes:['receive_money','cash_in'],
  instantSearch:true,
  filters:['accountType','label','paymentMethod'],
  compactIconActions:true,
  ordersAdsNotificationScope:true,
  foregroundSoundScope:true,
  backgroundPushScope:true
}, null, 2));
