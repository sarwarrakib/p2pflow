#!/usr/bin/env node
import fs from 'node:fs';

const report205 = fs.readFileSync('internal/httpapi/accounting_report_v205.go', 'utf8');
const report206 = fs.readFileSync('internal/httpapi/accounting_report_v206.go', 'utf8');
const carry206 = fs.readFileSync('internal/httpapi/accounting_carryover_v206.go', 'utf8');
const carryTests = fs.readFileSync('internal/httpapi/accounting_carryover_v206_test.go', 'utf8');
const timezoneTests = fs.readFileSync('internal/httpapi/accounting_timezone_v207_test.go', 'utf8');
const accounting = fs.readFileSync('internal/httpapi/accounting.go', 'utf8');
const orders = fs.readFileSync('internal/httpapi/orders.go', 'utf8');
const page = fs.readFileSync('web/js/pages/accounting.js', 'utf8');

for (const token of [
  'accountingOrderAssetFacts(trade, assetAmt, m)',
  'completed_at=COALESCE(completed_at,',
  'accountingReconcileAllCarryover',
]) {
  if (!orders.includes(token)) throw new Error(`orders accounting contract token missing: ${token}`);
}
for (const token of ['accountingDailyReplacementForAgent', 'normalized_order_ledger', 'hidden_company_balance', 'paymentTransferChargesBdt']) {
  if (!report205.includes(token)) throw new Error(`2.0.5 compatibility accounting token missing: ${token}`);
}
for (const token of [
  'normalized_fifo_carryover_v206',
  'accountingOrderEventSQL',
  'accountingSettlementDaysV206',
  'accountingSettlementAgentAdjustmentsV206',
  'carryoverAdjustmentUsd',
  'carryoverAgentAllocationIncomplete',
]) {
  if (!report206.includes(token)) throw new Error(`2.0.6 accounting report token missing: ${token}`);
}
for (const token of [
  'allocateAccountingCarryoverFIFO',
  'accounting_carryover_lots',
  'accounting_carryover_settlements',
  'accounting_carryover_agent_shares',
  'legacy_close_snapshot_v205',
  'settlement_business_date',
  'COALESCE(o.completed_at,o.updated_at)',
]) {
  if (!carry206.includes(token)) throw new Error(`2.0.6 carryover contract token missing: ${token}`);
}
for (const token of ['TestAccountingCarryoverV206LocksOriginProfitAndPostsSettlementVariance', 'TestAccountingCarryoverV206FIFOAcrossLots', 'same-day BUY']) {
  if (!carryTests.includes(token)) throw new Error(`carryover regression test missing: ${token}`);
}

for (const token of [
  'accountingRangeAt',
  'accountingBusinessDateAt',
  'accountingBusinessMidnightUTC',
  'accountingRangeView',
  'configured_offset_v207',
]) {
  if (!accounting.includes(token)) throw new Error(`2.0.7 timezone accounting token missing: ${token}`);
}
for (const token of ['TestAccountingTimezoneV207BangladeshDailyBoundary', 'TestAccountingTimezoneV207NegativeOffsetBoundary', 'TestAccountingTimezoneV207CustomInclusiveEndDate']) {
  if (!timezoneTests.includes(token)) throw new Error(`2.0.7 timezone regression test missing: ${token}`);
}
if (!report205.includes('accountingOrderDateExpr("o", rg.OffsetMinutes)')) throw new Error('2.0.7 order business-date grouping is not timezone-aware');
if (!carry206.includes('accountingBusinessDateAt(at, offsetMinutes)')) throw new Error('2.0.7 carryover BUY settlement business date is not timezone-aware');
if (!accounting.includes('POST /api/accounting/reconcile-carryover", s.requirePerm("accounting.close"')) throw new Error('carryover reconcile route is not accounting.close guarded');
if (!accounting.includes('accountingSummaryV206')) throw new Error('GET accounting is not using v2.0.6 report model');
if (page.includes('All Binance Actual USDT')) throw new Error('frontend still labels projected order-ledger balance as actual Binance asset');
if (!page.includes('Binance Asset (Order Projection)')) throw new Error('frontend projection label missing');
if (!page.includes('Reconcile Carryover')) throw new Error('frontend carryover reconciliation control missing');

for (const family of ['postgres', 'mysql', 'mariadb']) {
  const sql015 = fs.readFileSync(`migrations/${family}/015_accounting_permission_scale.sql`, 'utf8');
  for (const token of ['accounting_net_asset', 'accounting_fee_asset', 'accounting_fact_version', 'binance.sync', 'p2p.profile.sync']) {
    if (!sql015.includes(token)) throw new Error(`${family} migration 015 missing ${token}`);
  }
  const sql016 = fs.readFileSync(`migrations/${family}/016_accounting_carryover_e2e_hardening.sql`, 'utf8');
  for (const token of ['accounting_carryover_lots', 'accounting_carryover_settlements', 'accounting_carryover_agent_shares', 'orders_accounting_event_idx', 'completed_at', '2.0.6']) {
    if (!sql016.includes(token)) throw new Error(`${family} migration 016 missing ${token}`);
  }
  const sql017 = fs.readFileSync(`migrations/${family}/017_accounting_timezone_domain_hardening.sql`, 'utf8');
  if (!sql017.includes("current_version='2.0.7'")) throw new Error(`${family} migration 017 version checkpoint missing`);
}
console.log('Accounting carryover/timezone/scale contract audit passed (v2.0.7).');
