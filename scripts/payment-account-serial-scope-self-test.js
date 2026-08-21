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
const css = read('public/style.css');

const fail = message => { throw new Error(`Payment-account serial scope self-test failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const section = (source, start, end) => {
  const a = source.indexOf(start);
  if (a < 0) fail(`section start missing: ${start}`);
  const b = source.indexOf(end, a + start.length);
  if (b < 0) fail(`section end missing after ${start}: ${end}`);
  return source.slice(a, b);
};

assert(pkg.version === '1.5.36', `expected v1.5.36, got ${pkg.version}`);
assert(server.includes('const APP_SCHEMA_VERSION = 36;'), 'schema 35 is required for transaction-specific payment rules.');

const helpers = section(server, 'function normalizePaymentAccountSerialScopeValue', 'function paymentAccountMatchesSearch');
assert(helpers.includes("normalize('NFKC')") && helpers.includes("replace(/\\s+/g, ' ')") && helpers.includes('.toLowerCase()'), 'case/space/Unicode normalization is missing.');
assert(helpers.includes('function paymentAccountMethodSerialNamespace') && helpers.includes('method?.name'), 'payment-method-name namespace is missing.');
assert(helpers.includes('return leftLabel === rightLabel;'), 'independent normalized Label scope rule is missing.');
assert(helpers.includes('function findPaymentAccountSerialConflict') && helpers.includes('excludeId'), 'edit-safe conflict lookup is missing.');
assert(helpers.includes('including a named Label versus no Label') && helpers.includes('function paymentAccountSerialScopeView'), 'clear exact-scope conflict explanation is missing.');

const bulk = section(server, 'async function handleBulkPaymentAccounts', 'async function handlePaymentAccounts');
assert(bulk.includes('seenSerialCandidates') && bulk.includes('paymentAccountSerialScopesConflict'), 'bulk validation does not use the composite serial scope.');
assert(!bulk.includes('seenSerials = new Set()'), 'legacy globally unique serial validation remains in bulk add.');

const list = section(server, 'async function handlePaymentAccounts', 'async function handlePaymentAccountById');
assert(list.includes('findPaymentAccountSerialConflict({ serialNumber: draft.serialNumber, paymentMethodId, label: draft.label })'), 'single account create is not method/label scoped.');
assert(list.includes("code: 'PAYMENT_ACCOUNT_SERIAL_SCOPE_CONFLICT'"), 'structured serial conflict response is missing.');

const update = section(server, 'async function updatePaymentAccount', 'async function addAccountLedger');
assert(update.includes('paymentMethodId: nextPaymentMethodId') && update.includes('label: nextLabel') && update.includes('excludeId: accountItem.id'), 'account edit does not validate the final method/label scope.');

assert(app.includes('function bulkPaymentAccountSerialConflictIndexes') && app.includes('Different Labels—including a named Label and no Label—may reuse the same serial'), 'bulk UI conflict preview is missing.');
assert(app.includes('data-bulk-serial-warning') && app.includes('has-serial-error'), 'bulk row warning state is missing.');
assert(app.includes('Unique within the same Payment Method and Label'), 'add/edit serial guidance is missing.');
assert(css.includes('.bulk-account-preview-row.has-error,.bulk-account-preview-row.has-serial-error'), 'bulk serial conflict styling is missing.');

const runtime = spawnSync(process.execPath, ['app-server.js', '--payment-account-serial-scope-self-test'], {
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
assert(report?.sameMethodSameLabelConflict === true, 'same method + same label conflict was not verified.');
assert(report?.sameMethodDifferentLabelAllowed === true, 'different non-empty labels were not verified as reusable.');
assert(report?.differentMethodAllowed === true, 'different payment methods were not verified as reusable.');
assert(report?.blankLabelSeparateScope === true, 'no-Label fallback scope was not verified.');
assert(report?.legacyBlankLabelDoesNotBlockNamedLabel === true, 'legacy no-Label rows still block named Labels.');
assert(report?.diagnosticConflictMessage === true, 'exact conflict diagnostics were not verified.');

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  schemaVersion: 35,
  paymentMethodNameScoped: true,
  sameLabelScoped: true,
  differentLabelReuse: true,
  blankLabelSeparateScope: true,
  legacyBlankLabelDoesNotBlockNamedLabel: true,
  diagnosticConflictMessage: true,
  bulkPreviewValidation: true
}, null, 2));
