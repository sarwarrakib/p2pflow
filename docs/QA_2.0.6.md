# P2PFlow 2.0.6 QA Record

Date: 2026-08-29
Checkpoint: `2.0.6`
Scope: Accounting carryover normalization, completed-order event stability, browser-role regression harness, launch hardening.

## Automated source QA

| Check | Result | Notes |
|---|---|---|
| Web / Extension / Scripts JavaScript `node --check` | PASS | shipped `.js` / `.mjs` files syntax checked |
| Accounting contract audit | PASS | `normalized_fifo_carryover_v206`, migration 016, reconcile route/UI, regression tests |
| Browser role static contract audit | PASS | 30 registered pages; permission/role visibility contract |
| `./scripts/qa.sh` | PASS | static source QA suite |
| `go test ./...` | PASS | all Go packages |
| `go vet ./...` | PASS | all Go packages |
| `go build ./cmd/p2pflow` | PASS | default build |
| `go build ./cmd/p2pflow-worker` | PASS | default build |
| `go build ./cmd/p2pflow-migrate` | PASS | default build |
| `go build ./cmd/p2pflow-updater` | PASS | default build |
| `go build ./cmd/p2pflow-keygen` | PASS | default build |
| `./scripts/production-preflight.sh` | PASS | source/build stages; `.env` absent so runtime config intentionally skipped |
| `node scripts/browser-role-e2e.mjs` without base URL | PASS / SKIPPED | expected safe skip: `P2PFLOW_E2E_BASE_URL is not set` |

## Accounting regression coverage

`internal/httpapi/accounting_carryover_v206_test.go` covers:

- legacy day-lock numeric regression: origin operational profit stays locked; later actual-vs-provisional difference posts on settlement day;
- FIFO allocation across multiple prior lots;
- same-day BUY is never consumed as carryover settlement.

Additional source hardening reviewed in this checkpoint:

- `completed_at` accounting anchor with `updated_at` compatibility fallback;
- PostgreSQL/MySQL/MariaDB placeholder ordering in carryover backfill;
- `FOR UPDATE` serialization during carryover reconciliation;
- query iteration error checks;
- v2.0.6 close snapshot recovery using persisted `closeByAgent`;
- v2.0.5 historical Agent share is not fabricated when unavailable;
- carryover reconciliation failure falls back transparently rather than silently presenting stale v2.0.6 report state.

## Browser regression harness status

Static contract: PASS.

Live Owner/Admin/Manager/Agent Chromium run: **NOT EXECUTED in this environment**.

Required staging inputs:

```bash
export P2PFLOW_E2E_BASE_URL='https://staging.example.com'
export P2PFLOW_E2E_OWNER_COOKIE='p2pflow_session=<short-lived-owner-session>'
export P2PFLOW_E2E_ADMIN_COOKIE='p2pflow_session=<short-lived-admin-session>'
export P2PFLOW_E2E_MANAGER_COOKIE='p2pflow_session=<short-lived-manager-session>'
export P2PFLOW_E2E_AGENT_COOKIE='p2pflow_session=<short-lived-agent-session>'
export P2PFLOW_REQUIRE_BROWSER_E2E=true
node scripts/browser-role-e2e.mjs
```

Harness canonical frontend route mapping ব্যবহার করে এবং each visible page-এ JS exception/console error ও application-origin HTTP 5xx detect করে। Session token log/commit করা যাবে না।

## Known limitation / not parity-verified

Legacy Accounting configured `accountingTimezoneOffsetMinutes` দিয়ে local business-day boundary তৈরি করে। 2.0.6 carryover FIFO/day-lock/settlement variance ও ownership formula normalized database-এ port করেছে, কিন্তু normalized report/query range এখনও UTC-driven। তাই configured non-UTC midnight-এর দুই পাশে order classification **এখনও parity-verified নয়**।

Final production approval-এর আগে chosen business timezone দিয়ে boundary test যোগ/run করতে হবে।

## External/live items not verified here

- real PostgreSQL 15+ migration/concurrency run;
- real MySQL 8+ migration/concurrency run;
- real MariaDB 10.11+ migration/concurrency run;
- logged-in Binance Chrome extension E2E;
- authorized live Binance destructive/final actions;
- selected payment gateway real API/webhook;
- public Web Push service delivery;
- live four-role browser E2E;
- NATS multi-instance/load/failover;
- backup/restore/PITR drill.

Source QA PASS মানে উপরোক্ত external item production-verified নয়।
