#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const app = read('public/app.js');
const accounts = read('public/js/pages/accounts.js');
const orders = read('public/js/pages/orders.js');
const ledger = read('public/js/pages/ledger.js');
const accounting = read('public/js/pages/accounting.js');
const css = read('public/style.css');

const fail = message => { throw new Error(`Payment-account bulk/manual transaction self-test failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const section = (source, start, end) => {
  const a = source.indexOf(start);
  if (a < 0) fail(`section start missing: ${start}`);
  const b = source.indexOf(end, a + start.length);
  if (b < 0) fail(`section end missing after ${start}: ${end}`);
  return source.slice(a, b);
};

assert(pkg.version === '1.5.27', `expected v1.5.27, got ${pkg.version}`);
assert(server.includes('const APP_SCHEMA_VERSION = 35;'), 'schema 34 is missing.');

const accountHelpers = section(server, 'function paymentAccountIdsFromBody', 'async function handleBulkPaymentAccounts');
assert(accountHelpers.includes('function paymentAccountDeletionBlocker') && accountHelpers.includes('Balance must be zero before deletion'), 'safe delete balance guard is missing.');
assert(accountHelpers.includes('pendingPaymentAccountReservation') && accountHelpers.includes('function softDeletePaymentAccount'), 'reservation-safe soft delete is missing.');
assert(accountHelpers.includes('function paymentAccountBulkUpdateCandidate') && accountHelpers.includes('function bulkUpdatePaymentAccounts'), 'atomic bulk edit implementation is missing.');
assert(accountHelpers.includes('function bulkDeletePaymentAccounts') && accountHelpers.includes('Bulk delete validation failed. No accounts were deleted.'), 'atomic bulk delete implementation is missing.');

const bulkRoute = section(server, 'async function handleBulkPaymentAccounts', 'async function handlePaymentAccounts');
assert(bulkRoute.includes("req.method === 'PATCH'") && bulkRoute.includes('bulkUpdatePaymentAccounts'), 'bulk PATCH route is missing.');
assert(bulkRoute.includes("req.method === 'DELETE'") && bulkRoute.includes('bulkDeletePaymentAccounts'), 'bulk DELETE route is missing.');
const byIdRoute = section(server, 'async function handlePaymentAccountById', 'async function updatePaymentAccount');
assert(byIdRoute.includes("req.method === 'DELETE'") && byIdRoute.includes('softDeletePaymentAccount'), 'individual payment-account delete route is missing.');

assert(accounts.includes('data-select-payment-account') && accounts.includes("title:'Edit Selected'") && accounts.includes("title:'Delete Selected'"), 'multi-select payment-account actions are missing.');
assert(accounts.includes('data-delete-account') && accounts.includes('viewerCanDelete'), 'individual delete UI is missing.');
assert(app.includes("method:'PATCH'") && app.includes("method:'DELETE'") && app.includes('/api/payment-accounts/bulk'), 'bulk edit/delete UI is not connected to the API.');
assert(app.includes('The update is atomic') && app.includes('Statement history will be preserved'), 'bulk safety guidance is missing.');
assert(css.includes('.payment-account-bulk-bar') && css.includes('.bulk-edit-field') && css.includes('.payment-account-select'), 'responsive bulk-management styling is missing.');

const manualCatalog = section(server, 'const MANUAL_PAYMENT_TRANSACTION_TYPES', 'function suppliedManualPaymentAdjustment');
for (const type of ['send_money','receive_money','cash_out','bill_pay','payment','mobile_recharge','cash_in']) {
  assert(manualCatalog.includes(`${type}:`), `manual transaction type missing: ${type}`);
}
assert(manualCatalog.includes("return ['send_money','cash_out'].includes(type) ? 'charge' : 'none'"), 'Personal/Merchant fee eligibility is not limited by transaction type.');
assert(manualCatalog.includes("return ['receive_money','cash_in'].includes(type) ? 'commission' : 'none'"), 'Agent Received Money / Cash In commission rule is missing.');
assert(server.includes("send_money: { prefix: 'sendMoneyCharge'") && server.includes("cash_out: { prefix: 'cashOutCharge'"), 'Separate Send Money and Cash Out charge rules are missing.');
assert(server.includes("receive_money: { prefix: 'receiveMoneyCommission'") && server.includes("cash_in: { prefix: 'cashInCommission'"), 'Separate Agent commission rules are missing.');
assert(manualCatalog.includes('function createAutomaticAgentCommissionEntry') && manualCatalog.includes('protected: true'), 'protected automatic Agent commission accounting is missing.');

const manualTransaction = section(server, 'function createManualPaymentAccountTransaction', 'function splitWalletMovementPreview');
assert(manualTransaction.includes("type: isCommission ? 'agent_transaction_commission' : 'business_transfer_charge'"), 'manual transfer adjustment ledger is missing.');
assert(manualTransaction.includes('requiredBefore = preview.adjustmentKind === \'charge\' ? preview.amount + preview.adjustmentAmount : preview.amount'), 'manual send balance validation does not distinguish fee from commission.');

const splitMovement = section(server, 'function splitWalletMovementPreview', 'function calcAccountBalance');
assert(splitMovement.includes("adjustmentKind === 'commission' ? chargeDelta : -chargeDelta"), 'Agent split commission is not credited.');
assert(splitMovement.includes("'agent_transaction_commission_reversal'"), 'Agent split commission reversal is missing.');
assert(splitMovement.includes('createAutomaticAgentCommissionEntry') && splitMovement.includes('reversal: !isPositive'), 'split commission accounting/reversal is missing.');

assert(app.includes('function openAdjustAccountModal') && app.includes('Received Money (+)') && app.includes('Cash In (-)') && app.includes('Mobile Recharge (-)'), 'manual transaction form or transaction types are missing.');
assert(app.includes('Agent accounts use only Received Money and Cash In. Each can have its own commission rate.'), 'Agent commission UI explanation is missing.');
assert(app.includes('Personal and Merchant accounts use separate configured charges for Send Money and Cash Out.'), 'Personal/Merchant separate-fee UI explanation is missing.');
assert(app.includes('data-payment-rule-group="agent"') && app.includes('Send Money Charge') && app.includes('Cash Out Charge') && app.includes('Received Money Commission') && app.includes('Cash In Commission'), 'Account-type-specific rule editor is missing.');
assert(!app.includes("option.disabled = isAgentType && option.dataset.role !== 'agent'"), 'Agent account type is still restricted to Agent-role owners in the UI.');
assert(app.includes('Actual Charge / Commission (Optional)') && orders.includes('Charge / commission:'), 'order split UI still labels every adjustment only as a charge.');
assert(ledger.includes('agent_transaction_commission') && ledger.includes('agent_transaction_commission_reversal'), 'ledger page does not expose Agent commission movements.');
assert(accounting.includes('function accountingDeleteButton(entryId, canManage, protectedEntry=false)') && accounting.includes('if (protectedEntry)') && accounting.includes('Automatic'), 'protected automatic accounting entries are not safeguarded in the UI.');

assert(server.includes('function accountingEntryIncludedInCompanyTotals') && server.includes('allAgentEntryProfitBdt'), 'Agent commission is not included in individual/company profit reconciliation.');
assert(server.includes('netContribution: round2((item.profitUsd * companyDollarRate) + item.income - item.expenses)'), 'Agent commission income is missing from per-Agent net contribution.');

const runtime = spawnSync(process.execPath, ['app-server.js', '--payment-account-bulk-manual-transaction-self-test'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, NODE_ENV: 'test' }
});
if (runtime.stdout) process.stdout.write(runtime.stdout);
if (runtime.stderr) process.stderr.write(runtime.stderr);
if (runtime.error) fail(`runtime test could not start: ${runtime.error.message}`);
if (runtime.status !== 0) process.exit(runtime.status || 1);
let report = null;
try { report = JSON.parse(String(runtime.stdout || '').trim()); }
catch { fail('runtime report is not valid JSON.'); }
assert(report?.ok === true, 'runtime report did not pass.');
assert(report?.bulk?.multiSelectEdit === true && report?.bulk?.atomicValidation === true, 'bulk edit validation was not verified.');
assert(report?.bulk?.safeSoftDelete === true && report?.bulk?.statementHistoryPreserved === true, 'safe delete/history preservation was not verified.');
assert(report?.personal?.sendMoneyFee === 5 && report?.personal?.cashOutFee === 12 && report?.personal?.billPayFee === 0, 'Separate Personal Send Money/Cash Out fee rules were not verified.');
assert(report?.merchant?.cashOutFee === 10, 'Merchant Cash Out fee was not verified.');
assert(report?.agent?.receivedMoneyCommission === 20 && report?.agent?.cashInCommission === 15, 'Agent Received Money/Cash In commission was not verified.');
assert(report?.agent?.protectedAccounting === true && report?.agent?.nonAgentOwnerAllowed === true && report?.agent?.companyAccountingIncluded === true && report?.agent?.invalidPersonalTypeRejected === true, 'Agent account role independence / commission accounting was not verified.');
assert(report?.manualRule?.missingAmountRejected === true && report?.manualRule?.suppliedCharge === 7, 'manual adjustment rule was not verified.');
assert(report?.migration?.historicalSplitPreservedAsCharge === true && report?.migration?.plannedAgentSplitUsesCommission === true && report?.migration?.legacySeparateRulesCreated === true, 'schema 35 payment-rule migration was not verified.');

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  schemaVersion: 35,
  individualDelete: true,
  bulkEditDelete: true,
  atomicValidation: true,
  personalMerchantFeeRules: true,
  agentIncomingOutgoingCommission: true,
  orderSplitCommission: true,
  protectedCommissionAccounting: true
}, null, 2));
