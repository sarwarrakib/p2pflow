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
const orders = read('public/js/pages/orders.js');
const css = read('public/style.css');
const fail = message => { throw new Error(`Payment split / final action self-test failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

assert(server.includes("if (type === 'refund_in') return { send: -amount, receive: 0 }"), 'refund_in does not restore send-limit usage.');
assert(server.includes("if (type === 'refund_out') return { send: 0, receive: -amount }"), 'refund_out does not restore receive-limit usage.');
assert(server.includes("if (req.method === 'DELETE')") && server.includes("payment_split_deleted"), 'Payment Split DELETE route is missing.');
assert(server.includes('viewerCanEdit: writable') && server.includes('viewerCanDelete: writable'), 'Split edit/delete permission flags are missing.');
assert(orders.includes('data-delete-split') && orders.includes('data-update-split'), 'Split edit/delete UI actions are missing.');
assert(app.includes("method:'DELETE'") && app.includes('deletePaymentSplit'), 'Frontend split delete action is missing.');
assert(app.includes('Transaction ID') && app.includes('transactionReference'), 'Split Transaction ID editing is missing.');
assert(server.includes("endpointName: 'getPaymentMethodById', query: { id: payId }"), 'Get Payment Method by ID still sends the wrong query key.');
assert(!server.includes("['selectedPayId','payId','id']"), 'Generic recursive id is still accepted as a final-action payId.');
assert(server.includes('refreshBinanceOrderForFinalAction') && server.includes("endpointName: 'getUserOrderDetail'"), 'Final action does not refresh exact Binance order detail.');
assert(!server.includes('Release is locked until the customer marks the Binance order as paid.'), 'Stale local release blocker still exists.');
assert(app.includes('Check Paid & Release') && !app.includes('Waiting for Buyer Paid</button>'), 'Release remains disabled by stale cached status.');
assert(server.includes('UNPAID|NOT[_\\s-]*PAID') && app.includes('orderTextExplicitlyUnpaid'), 'UNPAID status regression guard is missing.');
assert(css.includes('.split-icon-btn'), 'Compact split action styling is missing.');


assert(server.includes("if (direction === 'receive') return 'none'"), 'Personal/Merchant receive split can still inherit a Send Money charge.');
assert(server.includes('requirePaymentSplitForFinalAction') && server.includes('paymentSplitProofRequired'), 'Payment Split gate/proof settings are missing.');
assert(server.includes("action === 'splits-batch'") && server.includes('addSplitBatch'), 'Atomic multi-account Payment Split endpoint is missing.');
assert(app.includes('paymentAccountIds') && app.includes('Send Selected') && app.includes('window.confirm'), 'Confirmed multi-select payment-number send UI is missing.');
assert(app.includes('splitBatchRowsHtml') && app.includes('collectSplitBatchItems'), 'Multi-number split amount rows are missing.');
assert(app.includes("o.settings?.requirePaymentSplitForFinalAction !== false") && app.includes("openFinalActionModal(o, finalAction)"), 'Final action UI does not bypass the split popup when disabled.');
assert(orders.includes('Serial:') && orders.includes('Label:'), 'Split rows do not show payment-account Label and Serial.');
const runtime = spawnSync(process.execPath, ['app-server.js', '--payment-split-final-action-self-test'], { cwd:root, encoding:'utf8', env:{...process.env, NODE_ENV:'test'} });
if (runtime.stdout) process.stdout.write(runtime.stdout);
if (runtime.stderr) process.stderr.write(runtime.stderr);
if (runtime.error) fail(runtime.error.message);
if (runtime.status !== 0) process.exit(runtime.status || 1);
let report;
try { report = JSON.parse(String(runtime.stdout || '').trim()); } catch { fail('runtime report is not JSON.'); }
assert(report?.ok === true, 'runtime self-test did not report ok.');
assert(report?.splitEdit?.send1000To500RestoresLimit === true && report?.splitEdit?.receive1000To500RestoresLimit === true, 'split edit limit restoration assertions failed.');
assert(report?.splitEdit?.receiveDoesNotApplySendMoneyCharge === true, 'SELL/receive split still applies the Send Money charge.');
assert(report?.splitDelete?.balanceRestored === true && report?.splitDelete?.sendLimitRestored === true && report?.splitDelete?.receiveLimitRestored === true, 'split delete restoration assertions failed.');
assert(report?.finalAction?.genericIdRejectedAsPayId === true && report?.finalAction?.unpaidStatusNotMisclassified === true, 'final-action payId/status assertions failed.');
assert(report?.finalAction?.splitGateToggle === true && report?.finalAction?.proofMandatoryOptional === true, 'Payment Split gate/proof mode runtime assertions failed.');

console.log(JSON.stringify({
  ok:true,
  packageVersion:pkg.version,
  splitEditDelete:true,
  limitRestoration:true,
  configuredChargeRecalculation:true,
  receiveSplitChargeFree:true,
  splitGateToggle:true,
  proofMandatoryOptional:true,
  multiNumberSelection:true,
  safePayIdResolution:true,
  liveFinalActionRefresh:true,
  unpaidStatusGuard:true
}, null, 2));
