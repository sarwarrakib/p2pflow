# P2PFlow 2.0.7 Feature / Parity Status

এই repository-টি scalable multi-tenant P2PFlow 2.x rewrite। পুরনো 1.7.7 source `legacy/`-তে reference হিসেবে আছে যাতে existing feature/design/API behavior তুলনা করা যায়।

## 2.0.0 — scalable foundation

- Go modular backend
- PostgreSQL / MySQL / MariaDB selectable driver
- normalized tenant/workspace schema
- public signup/login/session
- RBAC + exchange-account scoped permissions
- Orders / Ads / Chat / Payment Account / Accounting / Billing normalized tables
- transactional outbox + worker + NATS fan-out structure

## 2.0.1 — Binance Core / Orders / Ads / Chat

- signed Binance REST client, global/per-key scheduler, interactive reserve, 418/429 backoff
- multi-page Orders/Ads sync
- persistent Binance C2C chat WebSocket supervisor + outbound socket reuse
- Mark Paid / Release / Quick Release / Cancel core flows
- release precheck + verification challenge mapping
- Payment Split proof/final-action gate
- Ads editor/sync/status/merchant controls
- Chat inbox/unread/delta/send/read/image path
- set-based summaries to reduce N+1 query load

## 2.0.2 — Payment / Accounting / Approval / Security / Notifications core

- Personal / Merchant / Agent Payment Account rules
- row-locked runtime balance + opening-balance fallback
- daily/monthly send/receive limits
- charge/commission rule engine and compensating reversals
- immutable accounting reversal + closed-day protection/reopen
- Manager Approval state machine before risky final actions
- trusted-device/security challenge foundation
- per-user notification preference/read-state model

এই protected core 2.0.3/2.0.4/2.0.5/2.0.6 self-contained source-এ retained/reconstructed আছে।

## 2.0.3 — SaaS / Super Admin / Billing

- public multi-tenant subscription lifecycle
- one-time setup fee + monthly recurring invoice lifecycle
- renewal invoice generation, past-due, grace period, suspension, restoration
- cancel-at-period-end + resume
- plan entitlements + max users/API-account limits (`0 = unlimited`)
- tenant-specific entitlement override
- hosted-checkout provider-neutral adapter
- HMAC-signed billing webhook + duplicate/idempotency protection
- amount/currency/invoice validation + reconciliation queue
- MRR/ARR/revenue/overdue statistics
- Super Admin workspace/plan/invoice/payment/reconciliation controls
- customer Billing UI
- migration `013_saas_billing_entitlements.sql`

## 2.0.4 — Extension / Market / Push / System Update / Contract hardening

### Chrome Extension Bridge v6.1.9

- tenant-derived extension token; global master token browser-এ expose হয় না
- task claim lease, retry cap, per-task hashed result token, stale-claim recycle
- direct task grace state (`direct_pending`) দিয়ে poll/direct race remove
- result tenant/task-token validation
- failed collector result cache না করে task/order failure state + realtime event
- advertiser Trade Info/Feedback nested collector result legacy P2P Info fields-এ normalize
- P2P Info modal realtime event পেলেই refresh; long 1.5–2.5s polling loop বাদ দিয়ে bounded fallback
- adaptive idle polling (active দ্রুত, idle সর্বোচ্চ প্রায় 15s) + 30s alarm wake fallback
- static all-sites content script removed; configured CRM origin-এর optional Chrome permission Save & Connect-এর সময় explicitly নেয় এবং bridge শুধু সেই host-এ dynamic register হয়
- advertiser URL strict Binance C2C validation

### P2P Market

- existing 1.7.7 P2P Market UI module unchanged/parity-preserved
- backend documented `/sapi/v1/c2c/ads/search` ব্যবহার করে
- `rows=20`
- amount/payment/country/sort/pay-time/tradable/merchant/verified/no-verification filter contract
- rich advertiser/ad/payment/limit/verification fields normalized for legacy frontend
- undocumented public BAPI fallback reintroduced করা হয়নি

### Web Push / Notification delivery

- durable `notification_deliveries` queue
- delivery dedupe key for PostgreSQL/MySQL/MariaDB
- bounded worker concurrency, stale-processing recovery, exponential retry/backoff
- email/push category preference fan-out; mandatory Security alerts
- active trusted-device scoped push subscriptions
- optional Binance account notification scope
- RFC8291 + RFC8188 `aes128gcm` Web Push encryption
- VAPID ES256 JWT
- push endpoint HTTPS/SSRF checks + DNS resolution pinning against rebinding
- 404/410 stale subscription disable
- Notification Center last-chat N+1 lookup removed

### Signed System Update

- Super Admin-only global deployment control
- ZIP SHA-256 + safe extraction (traversal/symlink/size checks)
- release layout/version validation
- production-default Ed25519 signature verification
- staged release history + update event audit
- fixed external updater; running process নিজেকে overwrite করে না
- atomic `current` symlink switch
- explicit activate and rollback endpoint/UI
- `p2pflow-keygen` helper for VAPID / release key generation + offline ZIP signing

### Frontend/API contract

- `scripts/api-contract-audit.mjs` static frontend route vs backend route audit
- current audit: 127 frontend API paths / 157 registered backend route patterns, no unmatched frontend route
- all web/extension JS parse included in `scripts/qa.sh`
- migration `014_extension_update_delivery_hardening.sql` in all three SQL families

## 2.0.5 — Accounting / Permission / Scale / Production hardening

### Binance account scope

- canonical 13 account-scoped permission code
- non-owner access = global permission + exact account grant
- no-grant-all-accounts fallback removed
- cross-tenant credential grant validation
- account grant cannot exceed global permission
- `binance.sync` / `p2p.profile.sync` dedicated account permission
- frontend/backend permission contract audit

### Accounting / reports

- normalized order net/fee/version facts + report indexes (migration 015)
- set-based overview / by-agent / daily / payment-method aggregation
- SQL-side Accounting entry filters + pagination + whole-result totals
- Payment transfer charge, manual expense and Binance fee separated
- Agent/co-agent split amount-weighted reporting
- Agent accounting company-capital/close-history privacy gate
- Binance order-ledger balance explicitly shown as projection, not a guessed Funding Wallet balance
- full normalized daily close snapshot retained for next opening-capital flow

### Large-workspace query reduction

- Users/Agents effective permissions/preferences/security/audit/account-grants bulk loaded
- Roles permissions bulk loaded
- credential account permissions bulk loaded
- Accounting entries current page only returned while totals/categories aggregate server-side

### Launch tooling

- `scripts/permission-contract-audit.mjs`
- `scripts/accounting-contract-audit.mjs`
- `scripts/production-preflight.sh`
- `scripts/http-smoke-load.mjs`
- `docs/PRODUCTION_LAUNCH_CHECKLIST_BN.md`

## 2.0.6 — Carryover Accounting / Browser E2E / Launch hardening

### Day-locked carryover settlement

- legacy 1.7.7 close rule normalized FIFO allocator-এ port
- closed origin day operational profit immutable
- later-day completed BUY previous closed lot FIFO-তে settle করে
- allocated actual net/fee এবং close-time provisional net separately persist
- actual-vs-provisional variance settlement business date-এ `carryoverAdjustment`
- same-day BUY carryover settlement নয়
- new close-এ origin SELL Agent/co-agent share snapshot persist; later adjustment একই origin share ratio-তে allocate
- idempotent carryover reconcile endpoint/UI (`accounting.close` permission)
- `completed_at` completed-order accounting event anchor; later refresh date drift বন্ধ
- migration `016_accounting_carryover_e2e_hardening.sql` all three SQL families

### Legacy 2.0.5 close compatibility

- existing close snapshot থেকে available company-level locked lot facts backfill
- 2.0.5 exact per-agent close share persist করেনি; missing historical Agent allocation **guess করা হয় না**
- incomplete legacy Agent history API/UI-তে explicit flag/warning হিসেবে থাকে
- 2.0.6 থেকে নতুন closes exact normalized Agent share store করে

### Role/browser regression tooling

- static browser page registry + PAGE_PERMISSIONS audit
- System Update owner/super-admin visibility boundary audit
- Super Admin visibility boundary audit
- `/api/me` effective role/permission contract audit
- dependency-free Chromium/CDP live harness for Owner/Admin/Manager/Agent short-lived session cookies
- visible route navigation + JS exception/console error + application-origin HTTP 5xx collection
- `P2PFLOW_REQUIRE_BROWSER_E2E=true` production preflight gate available

## 2.0.7 — Accounting Timezone / Domain Deployment Hardening

### Business-timezone parity

- configured `accountingTimezoneOffsetMinutes` daily/monthly/yearly/custom UTC query boundaries-এ apply
- completed Binance order daily grouping configured offset দিয়ে business date derive করে
- carryover BUY settlement business date configured offset অনুযায়ী persist হয়
- Business Entry / Close / Reopen default business date configured timezone থেকে আসে
- response `range.businessDate`, business start/end dates এবং offset server-side expose হয়
- close snapshot exact timezone offset + UTC business-day range retain করে
- UTC+06 / UTC-05 / custom inclusive range regression tests
- migration `017_accounting_timezone_domain_hardening.sql` all three SQL families

### Website/API domain deployment

- `docs/DOMAIN_DEPLOYMENT_BN.md` source/folder/domain map
- `deploy/nginx/p2pflow-split-domains.conf.example`
- recommended `app.` web + same-origin API proxy
- optional `admin.` hostname; authorization application-level
- `api.` API-only hostname for Android/native/integration
- browser cross-origin CORS/session complexity intentionally avoided in current deployment contract
- split-domain static contract audit added to `scripts/qa.sh`

## Final production validation এখনও বাকি

Code checkpoint complete হলেও নিচের external/live validation এই sandbox-এ করা যায়নি বা external provider selection-এর উপর নির্ভরশীল:

- selected payment gateway-এর provider-specific real API/webhook adapter (gateway নির্বাচন হওয়ার পর)
- known production history দিয়ে 2.0.5-origin carryover backfill/settlement totals reconcile; missing old per-agent snapshot 2.0.6-ও invent করে না
- Chrome + logged-in Binance session দিয়ে extension real E2E
- public HTTPS browser subscription দিয়ে real Push Service delivery/unsubscribe E2E
- PostgreSQL 15+ / MySQL 8+ / MariaDB 10.11+ real-server migration + concurrency matrix
- authorized Binance non-destructive sync এবং controlled production/test final-action validation
- live Owner/Admin/Manager/Agent browser E2E against staging/production-like server using short-lived session cookies (harness source is included; this sandbox run is not a live environment claim)
- multi-instance NATS/load/failover test
- backup/restore/PITR drill এবং final launch checklist

কোনো live/external validation item-কে test না করে production-verified হিসেবে ধরা যাবে না।

### Accounting timezone boundary status

- 2.0.6 carryover FIFO/day-lock/settlement variance/Agent-origin ownership formula + normalized persistence retained
- 2.0.7 configured `accountingTimezoneOffsetMinutes` report/query grouping + carryover settlement business-date mapping-এ port হয়েছে
- automated UTC+06 / UTC-05 boundary tests PASS করা source contract-এর অংশ
- real production history reconcile করার আগে configured timezone দিয়ে staging midnight sample validation এখনও launch checklist item
