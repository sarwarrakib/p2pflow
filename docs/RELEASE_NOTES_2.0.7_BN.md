# P2PFlow 2.0.7 — Accounting Timezone / Split-Domain Hardening

Release date: 2026-08-29

## Scope

2.0.7 হলো 2.0.6 Carryover/E2E checkpoint-এর পরের code-side hardening batch। এই release-এর primary scope:

1. legacy/configured `accountingTimezoneOffsetMinutes`-কে normalized Accounting report/query/carryover business-date boundary-তে port করা;
2. midnight boundary-এর deterministic regression coverage যোগ করা;
3. website, browser API, native/integration API এবং optional Admin hostname-এর production deployment contract পরিষ্কার করা;
4. split-domain deployment-এর Nginx template + static QA gate যোগ করা।

## Accounting business timezone parity

2.0.6-এ FIFO carryover/day-lock/settlement variance/Agent ownership normalized SQL model-এ port হয়েছিল, কিন্তু report/query range UTC-driven ছিল। 2.0.7 সেই known code-side boundary gap বন্ধ করে।

Core behavior:

- `accountingTimezoneOffsetMinutes` daily/monthly/yearly/custom range-এর UTC start/end নির্ধারণে apply হয়;
- server business date derive করে; browser local timezone-এর উপর financial date নির্ভর করে না;
- completed Binance order daily grouping configured business timezone অনুযায়ী হয়;
- carryover BUY settlement-এর `settlement_business_date` configured timezone অনুযায়ী persist হয়;
- Business Entry, Accounting Close এবং Reopen-এর default date configured timezone অনুযায়ী হয়;
- Accounting range response business date, start date, exclusive end date এবং offset expose করে;
- close summary exact `timezoneOffsetMinutes`, business date, UTC range start/end এবং `timezoneBoundaryModel=configured_offset_v207` snapshot রাখে।

Offset safety range `-720 ... +840` minutes clamp করা হয়েছে। Production DB/session timezone UTC রাখা এখনও recommended; business-day semantics application layer-এ থাকে।

## Boundary regression tests

নতুন `internal/httpapi/accounting_timezone_v207_test.go` cover করে:

- Bangladesh / UTC+06 daily midnight boundary;
- UTC-05 negative offset boundary;
- custom date range-এর inclusive end-date → exclusive next-midnight conversion।

এর ফলে midnight-এর আগে/পরে completed order কোন business date-এ পড়বে তা source test-এ deterministic।

## Migration 017

PostgreSQL, MySQL এবং MariaDB তিন family-তে:

- `017_accounting_timezone_domain_hardening.sql`

এটি schema-breaking rewrite নয়; release checkpoint `update_state.current_version = 2.0.7` sync করে। Timezone behavior application/query layer hardening।

## Website / API / Admin domain topology

নতুন guide:

- `docs/DOMAIN_DEPLOYMENT_BN.md`
- `deploy/nginx/p2pflow-split-domains.conf.example`

Recommended production topology:

```text
app.yourdomain.com    -> Website + same-origin /api/* + /api/events
api.yourdomain.com    -> API-only for Android/native/trusted integrations
admin.yourdomain.com  -> optional Admin hostname, same backend + application role checks
```

Browser frontend বর্তমানে HttpOnly session + CSRF contract ব্যবহার করে। তাই `app.` থেকে browser request একই origin-এর `/api/...`-তে রাখা হয়েছে; Nginx backend `127.0.0.1:8080`-এ proxy করে। Browser-কে জোর করে cross-origin `api.`-তে পাঠানো হয়নি, কারণ তাতে CORS, cookie scope এবং CSRF policy আলাদাভাবে redesign করতে হয়।

`api.` hostname native Android বা trusted integration-এর জন্য রাখা যায় এবং static root 404 by design।

## Source/folder responsibility

- `web/` — Website/Dashboard frontend
- `cmd/p2pflow/` + `internal/httpapi/` — main Web/API process
- `internal/service/` — business orchestration
- `internal/binance/` — Binance REST/C2C/WebSocket integration
- `internal/db/` + `migrations/` — database layer
- `cmd/p2pflow-worker/` + `internal/worker/` — background worker
- `extension/` — Chrome Extension
- `deploy/nginx/` / `deploy/systemd/` — deployment templates
- `.env` — production environment configuration

## QA additions

- Accounting contract audit now checks configured-offset behavior, regression tests এবং migration 017;
- split-domain static contract audit `scripts/domain-contract-audit.mjs` যোগ হয়েছে;
- `scripts/qa.sh` domain contract audit run করে;
- single-server `p2pflow.service` এখন hardcoded worker-off না করে `.env`-এর `P2PFLOW_WORKERS` value respect করে; separate worker mode-এর NATS guidance document করা হয়েছে;
- native production `.env.example` localhost-only Go listener, manual migration (`P2PFLOW_AUTO_MIGRATE=false`) এবং single-process default-এ blank NATS URL ব্যবহার করে safer deployment default দেয়;
- existing API/permission/browser-role/migration-family audits retained।

## External/live validation still required

2.0.7 source QA কোনো external service-কে production-verified ঘোষণা করে না। Launch-এর আগে এখনও প্রয়োজন:

- real PostgreSQL/MySQL/MariaDB migration + concurrency matrix;
- known production history carryover/timezone reconciliation;
- live Owner/Admin/Manager/Agent browser E2E with short-lived sessions;
- logged-in Binance Chrome extension E2E;
- authorized Binance non-destructive sync এবং controlled final-action validation;
- public HTTPS Web Push delivery/unsubscribe E2E;
- selected payment gateway-এর provider-specific real API/webhook adapter + staging validation;
- multi-instance NATS/load/failover;
- backup/restore/PITR drill।

Payment gateway adapter provider নির্বাচন ছাড়া genericভাবে production-complete করা যাবে না, কারণ provider-specific signature, payload, checkout এবং webhook contract প্রয়োজন।
