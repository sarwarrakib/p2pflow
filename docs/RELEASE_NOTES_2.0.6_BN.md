# P2PFlow 2.0.6 — Carryover Accounting / Browser E2E / Launch Hardening

Release date: 2026-08-29

## Scope

2.0.6 হলো 2.0.5 Production Hardening checkpoint-এর পরের migration batch। এই release-এর primary scope:

1. legacy Accounting-এর day-locked carryover settlement/adjustment **formula ও ownership semantics** normalized SQL storage-এ port করা;
2. completed Binance order-এর accounting event time স্থিতিশীল করা;
3. Owner/Admin/Manager/Agent browser permission/navigation regression automation যোগ করা;
4. final production-launch QA tooling আরও কঠোর করা।

## Accounting carryover model

নতুন normalized tables:

- `accounting_carryover_lots`
- `accounting_carryover_settlements`
- `accounting_carryover_agent_shares`

Migration: `016_accounting_carryover_e2e_hardening.sql` — PostgreSQL, MySQL এবং MariaDB তিন family-তেই আছে।

Core behavior:

- business day close হলে ওই origin day-এর operational profit lock হয়;
- পরের business date-এর completed BUY পুরনো open carryover lot FIFO order-এ settle করে;
- same-day BUY carryover settlement হিসেবে ব্যবহার হয় না;
- `allocatedFiat = min(remainingBuyFiat, lotOutstandingFiat)`;
- BUY-এর actual net asset proportional allocation করা হয়;
- close-time provisional net asset এবং later actual allocated net asset আলাদা persist হয়;
- difference settlement business date-এ `carryoverAdjustment` হিসেবে post হয়;
- closed origin day operational profit পরে rewrite হয় না;
- নতুন 2.0.6 close-এ origin SELL Agent/co-agent ownership snapshot persist হয় এবং later adjustment একই origin ownership ratio-তে allocate হয়।

Legacy numeric regression test source-এ রাখা হয়েছে যাতে Day-1 locked profit এবং Day-2 settlement variance rule deterministic থাকে। Multi-lot FIFO এবং same-day exclusion-এরও tests আছে।

## Stable completed-order accounting event

Completed/released Binance order sync এখন `completed_at` populate/preserve করে। Supported upstream completion timestamps available থাকলে সেগুলো নেয়; completed state পাওয়া গেলেও explicit completion timestamp না থাকলে প্রথম completion observation timestamp lock হয়। পরের profile/order refresh `updated_at` বদলালেও accounting event date আর drift করবে না।

Accounting order queries `COALESCE(completed_at, updated_at)` compatibility path ব্যবহার করে, তাই pre-2.0.6 historical rows migration-এর পরে readable থাকে।

## Reconciliation / recovery

`POST /api/accounting/reconcile-carryover` যোগ হয়েছে এবং `accounting.close` permission ছাড়া call করা যায় না। Daily Closing UI-তেও **Reconcile Carryover** control আছে। Reconciliation deterministic/idempotent এবং asset-level rebuild row-lock (`FOR UPDATE`) দিয়ে serialize করা হয়েছে।

2.0.5 close snapshot থেকে available company-level carryover facts backfill করা হয়। 2.0.5 exact per-agent close share persist করত না, তাই missing historical Agent ownership **guess করা হয় না**; API/UI incomplete warning দেয়। 2.0.6 close snapshot-এর carryover table write মাঝপথে fail হলেও saved `closeByAgent` snapshot থেকে reconciliation recovery করা যায়।

## Browser role E2E

নতুন tooling:

- `scripts/browser-role-contract-audit.mjs`
- `scripts/browser-role-e2e.mjs`

Static audit page registry, explicit `PAGE_PERMISSIONS`, `/api/me` effective role contract, System Update owner/super-admin boundary এবং Super Admin-only boundary validate করে। `security` page এখন accidental missing-map behavior-এর বদলে explicit permission-map entry ব্যবহার করে।

Live harness Node 22 + Chromium CDP দিয়ে চারটি isolated role session চালায়:

- Owner
- Admin
- Manager
- Agent

প্রতিটি role-এর expected visible pages server-effective permissions থেকে derive হয়। Harness canonical `P2PFlowHistoryRouter.routeToPath()` ব্যবহার করে routes navigate করে এবং JavaScript exception, console error/assert ও application-origin HTTP 5xx collect করে।

## Production preflight

`production-preflight.sh` এখন browser role E2E gate support করে। `P2PFLOW_E2E_BASE_URL` ও short-lived role cookies দিলে live regression run হবে। `P2PFLOW_REQUIRE_BROWSER_E2E=true` দিলে missing live E2E configuration preflight fail করবে।

## Known parity boundary

Carryover FIFO/day-lock/settlement variance/Agent ownership **formula এবং normalized persistence semantics** 2.0.6-এ port করা হয়েছে। তবে existing normalized v2 report range এখনও UTC-driven; legacy `accountingTimezoneOffsetMinutes` অনুযায়ী business-day timestamp boundary shift পুরো report/query layer-এ port করা হয়নি। UI setting আছে, কিন্তু non-UTC midnight boundary-কে parity-verified হিসেবে দাবি করা হচ্ছে না। Production historical reconciliation-এর আগে configured timezone boundary দিয়ে staging test করা বাধ্যতামূলক।

এই limitation ইচ্ছাকৃতভাবে hidden রাখা হয়নি, কারণ midnight-এর আশেপাশের order কোন business date-এ পড়বে সেটা financial report result বদলাতে পারে।

## QA status

এই source checkpoint-এ run করা হয়েছে:

- all shipped Web/Extension/Scripts JavaScript syntax check — PASS
- Accounting v2.0.6 contract audit — PASS
- Browser role static contract audit — PASS
- `./scripts/qa.sh` — PASS
- `go test ./...` — PASS
- `go vet ./...` — PASS
- five Go command default builds — PASS
- `./scripts/production-preflight.sh` source/build stages — PASS
- browser E2E script no-base skip contract — PASS

Live browser role E2E run হয়নি, কারণ এই build environment-এ authenticated staging/production-like base URL এবং চার role-এর short-lived session cookie দেওয়া হয়নি। `.env` না থাকায় production runtime configuration checks-ও preflight-এ intentionally skipped হয়েছে।

Real PostgreSQL/MySQL/MariaDB server matrix, live Binance actions, selected payment gateway এবং public Push Service এই source QA-তে production-verified বলা হচ্ছে না।
