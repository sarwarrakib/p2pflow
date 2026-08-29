# P2PFlow 2.0.7 QA Record

Date: 2026-08-29
Checkpoint: `2.0.7`
Scope: Accounting business-timezone parity, carryover settlement date boundary, split-domain deployment contract, release hardening.

## Automated source QA

Final result এই file-এর শেষে recorded হবে। Source suite অন্তর্ভুক্ত করে:

| Check | Expected gate | Notes |
|---|---|---|
| Web / Extension / Scripts JavaScript `node --check` | PASS | shipped `.js` / `.mjs` syntax |
| API contract audit | PASS | frontend/backend route contract |
| Permission contract audit | PASS | seeded + account-scoped permission contract |
| Accounting contract audit | PASS | 2.0.5/2.0.6 compatibility + 2.0.7 timezone/migration contract |
| Browser role static contract audit | PASS | Owner/Admin/Manager/Agent visibility/navigation contract |
| Split-domain contract audit | PASS | app/admin/api Nginx + docs + env contract |
| migration family parity | PASS | PostgreSQL/MySQL/MariaDB identical ordered filenames |
| `go test ./...` | PASS | Go unit/regression tests |
| `go vet ./...` | PASS | Go static vet |
| five Go command default builds | PASS | API, worker, migrate, updater, keygen |
| production preflight source/build | PASS | runtime config requires production `.env` |
| browser E2E no-base safety | PASS / SKIPPED | expected when no staging base URL supplied |

## Accounting 2.0.7 boundary coverage

`internal/httpapi/accounting_timezone_v207_test.go` checks:

- UTC+06 business day starts at previous UTC date 18:00 and ends next UTC date 18:00;
- just-before / exact-midnight classification;
- UTC-05 negative offset classification;
- custom range inclusive selected end date becomes next business midnight exclusive boundary।

Additional contract checks verify:

- report SQL grouping uses `accountingOrderDateExpr(..., rg.OffsetMinutes)`;
- carryover completed BUY maps using `accountingBusinessDateAt(at, offsetMinutes)`;
- server range/close snapshot exposes configured offset model;
- migration 017 checkpoints all three DB families to `2.0.7`।

## Split-domain deployment contract

`scripts/domain-contract-audit.mjs` verifies:

- `app.example.com`, `admin.example.com`, `api.example.com` template hosts;
- browser `/api/*` and `/api/events` proxy contract;
- API-only root 404 behavior;
- domain guide folder map;
- `P2PFLOW_PUBLIC_BASE_URL` / optional `COOKIE_DOMAIN` documentation।

This is a source/config contract audit; it does **not** prove public DNS/TLS/reverse-proxy behavior until deployed on a real server.

## Live browser E2E

Live Owner/Admin/Manager/Agent Chromium run requires:

```bash
export P2PFLOW_E2E_BASE_URL='https://staging.app.example.com'
export P2PFLOW_E2E_OWNER_COOKIE='p2pflow_session=<short-lived-owner-session>'
export P2PFLOW_E2E_ADMIN_COOKIE='p2pflow_session=<short-lived-admin-session>'
export P2PFLOW_E2E_MANAGER_COOKIE='p2pflow_session=<short-lived-manager-session>'
export P2PFLOW_E2E_AGENT_COOKIE='p2pflow_session=<short-lived-agent-session>'
export P2PFLOW_REQUIRE_BROWSER_E2E=true
node scripts/browser-role-e2e.mjs
```

Token/cookie source tree, persistent shell history বা CI logs-এ রাখবেন না।

## External/live items not verified by source QA

- real PostgreSQL 15+ migration/concurrency;
- real MySQL 8+ migration/concurrency;
- real MariaDB 10.11+ migration/concurrency;
- production historical carryover/timezone reconcile;
- logged-in Binance Chrome extension real E2E;
- authorized live Binance final/destructive action;
- selected payment gateway real API/webhook contract;
- public Push Service real delivery/unsubscribe;
- live four-role browser E2E;
- NATS multi-instance/load/failover;
- backup/restore/PITR drill।

Source QA PASS মানে উপরোক্ত external item production-verified নয়।

## Final run result

2026-08-29 source checkpoint run:

- `./scripts/qa.sh` — **PASS**
- Accounting carryover/timezone/scale contract audit — **PASS**
- Browser role static contract audit — **PASS** (`30 registered pages`)
- Split-domain deployment contract audit — **PASS**
- `go test -count=1 ./...` — **PASS** (full uncached Go package suite)
- `go vet ./...` — **PASS**
- `./scripts/production-preflight.sh` source/default-build stages — **PASS**; `.env` absent, তাই runtime production config intentionally skipped
- `node scripts/browser-role-e2e.mjs` without base URL — **PASS / expected SKIP** (`P2PFLOW_E2E_BASE_URL is not set`)
- `./scripts/build.sh` production `dbdrivers` tagged binaries — **NOT VERIFIED IN THIS SANDBOX**: external Go module fetch requires network; `proxy.golang.org` DNS is blocked here. A networked production/build host must run `go mod download && ./scripts/build.sh`.

শেষ item-কে PASS বলা হচ্ছে না; real DB-driver production binary build networked host-এ launch gate হিসেবে run করতে হবে।
