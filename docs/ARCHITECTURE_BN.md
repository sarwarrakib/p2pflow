# P2PFlow 2.0.7 Architecture

P2PFlow 2.x-কে multi-tenant realtime SaaS হিসেবে design করা হয়েছে যাতে একটি workspace থেকে শত/হাজার customer এবং বহু Binance API account পর্যন্ত scale করা যায়, কিন্তু শুরুতেই অপ্রয়োজনীয় microservice complexity না আসে।

## Core

- **Backend:** Go modular monolith; API, worker, migration, updater, key helper আলাদা entrypoint।
- **Database:** normalized relational schema; PostgreSQL / MySQL / MariaDB selectable। Giant JSON/full-state persistence নেই।
- **Tenant isolation:** operational data `tenant_id` scoped; subscription/workspace status operational access gate করে।
- **Permission:** RBAC + exchange-account scope + plan entitlement।
- **Realtime:** Binance REST scheduler + persistent Binance chat WebSocket; browser SSE; multi-instance fan-out-এ NATS।
- **Workers:** Binance sync, billing lifecycle, outbox, notification email/Web Push durable delivery worker।

## Request path

Fast local action-এর লক্ষ্য:

`Browser -> Go API -> small SQL transaction -> response -> outbox/realtime/background work`

Non-critical enrichment request thread-এ দীর্ঘ Binance fan-out হিসেবে রাখা হয় না। Persistent/normalized row update হওয়ায় একটি settings mutation-এর জন্য পুরো application state serialize/compress/write করতে হয় না।

## SaaS / billing

`Tenant -> Subscription -> Plan -> Entitlements -> Invoice -> Payment`

- setup fee এবং monthly fee independent invoice stage
- renewal invoice idempotent worker
- overdue -> grace -> suspension
- successful validated payment -> activation/restoration
- cancel-at-period-end/resume
- HMAC webhook idempotency + reconciliation mismatch queue

## Extension collector

`P2PFlow order -> tenant extension task -> Chrome extension -> hidden Binance advertiser page -> collector -> task result -> normalized order/P2P info -> realtime event`

Task claim lease এবং task-specific result token poll/direct races ও cross-tenant result injection কমায়। Extension v6.1.9 configured CRM origin-এর জন্য optional Chrome host permission নেয়; all-sites static bridge injection নেই।

## P2P Market

Browser-এর existing P2P Market UI documented Binance C2C SAPI ad search endpoint-এর normalized response consume করে। Server rows 20/page রাখে এবং local UI filters/sort contract preserve করে।

## Notification / Web Push

`Notification row -> durable notification_deliveries -> email/push worker -> provider`

- recipient selection set-based
- per-category preference
- Security mandatory
- trusted-device + optional Binance-account scope
- durable dedupe + retry/backoff
- RFC8291/RFC8188 AES-128-GCM + VAPID ES256
- push URL public HTTPS only; DNS resolution validated/pinned before connection

## Signed update pipeline

`Release ZIP -> SHA-256 -> Ed25519 verify -> safe extract -> staged release -> migrate/health check -> external updater -> atomic current symlink -> restart/rollout`

Application process নিজেকে overwrite করে না। `p2pflow-updater` fixed arguments দিয়ে symlink handoff করে; shell command execute করে না। Rollback code pointer switch করে, business database rollback করে না—schema/backward-compatibility আগে যাচাই করতে হবে।

## Scale path

### Single host

- one API process
- workers same process (`P2PFLOW_WORKERS=true`)
- one supported SQL DB

### Horizontal

- multiple stateless API instances
- dedicated worker replicas
- NATS fan-out
- managed/HA SQL
- reverse proxy/CDN
- shared/object storage for uploads
- worker leases prevent duplicate global jobs

## Version checkpoints

`2.0.0 foundation -> 2.0.1 Binance Core -> 2.0.2 protected financial/security -> 2.0.3 SaaS/Billing -> 2.0.4 Extension/Market/Push/Update -> 2.0.5 Accounting/Permission/Scale -> 2.0.6 Carryover/E2E -> 2.0.7 Timezone/Domain hardening`

## 2.0.5 permission boundary

Operational Binance access is deny-by-default for non-owner users:

`global permission -> tenant membership -> exact exchange-account grant -> route/business rule`

একটি global permission থাকা মানে সব Binance account নয়। Account grant save-ও same-tenant credential এবং same global permission verify করে। Owner/Super Admin trusted control-plane bypass আলাদা।

## 2.0.5 Accounting read model

Completed C2C order-এর raw JSON-এর পাশাপাশি normalized net/fee accounting facts persist হয়। Report query indexed relational columns ব্যবহার করে। Payment-method historical balance, Agent split allocation, business entries এবং daily aggregates set-based query-তে calculate হয়।

Funding Wallet total undocumented path দিয়ে guess করা হয় না; available C2C order facts থেকে projected asset স্পষ্টভাবে projection label-এ দেখানো হয়। Agent-scoped report company-wide capital/Binance projection/close history return করে না।


## 2.0.6 day-locked carryover accounting

2.0.6 legacy 1.7.7-এর close/carryover semantics normalized relational model-এ port করে:

`closed SELL lot -> provisional net value locked at close -> later BUY FIFO settlement -> actual-vs-provisional variance -> settlement business date adjustment`

Core tables:

- `accounting_carryover_lots`: close date, SELL fiat/asset, original carryover fiat, provisional net yield, locked operational profit এবং current outstanding state
- `accounting_carryover_settlements`: কোন later completed BUY কত fiat settle করেছে, actual net/fee, provisional net এবং resulting adjustment
- `accounting_carryover_agent_shares`: close-time origin SELL ownership/profit snapshot, যাতে later variance একই origin ownership ratio-তে distribute করা যায়

Closed origin day-এর operational profit rewrite হয় না। Later BUY-এর `adjustment_asset = actual_net_asset - provisional_net_asset` settlement date-এ report হয়। Same-day BUY carryover settlement নয়; সেটা close-time operational calculation-এর অংশ। Reconciliation idempotentভাবে normalized settlement rows rebuild করতে পারে।

Completed order chronology `COALESCE(completed_at, updated_at)` ব্যবহার করে; 2.0.6 sync completed status প্রথমবার দেখলে `completed_at` once-set করে, তাই later enrichment/update business date drift ঘটায় না।

### Legacy close upgrade rule

2.0.5 close snapshot থেকে available company-level locked carryover facts backfill করা হয়। কিন্তু 2.0.5 exact per-agent close share persist করেনি। সেই missing history অনুমান করা হয় না; lot `agent_snapshot_complete=false` থাকে এবং API/UI incomplete-history signal দেয়। 2.0.6-এ তৈরি নতুন close exact agent snapshot persist করে।

## 2.0.6 browser role regression architecture

Static QA browser page registry, `PAGE_PERMISSIONS`, Owner-only System Update boundary, Super Admin boundary এবং `/api/me` role/permission contract audit করে। Live harness `scripts/browser-role-e2e.mjs` Chromium DevTools Protocol দিয়ে চারটি isolated session চালাতে পারে:

`Owner -> Admin -> Manager -> Agent`

প্রতিটি session-এ server-returned effective permissions থেকে expected visible pages calculate করে, rendered navigation মিলায়, visible routes navigate করে এবং JavaScript exception/console error ও application-origin HTTP 5xx collect করে। OTP/password automate না করে trusted test session cookie নেয়, তাই production-like role regression secret-handling ছাড়াই repeatable থাকে।


## 2.0.7 business-timezone boundary architecture

Accounting `business_date` এবং timestamp event আলাদা semantics রাখে। 2.0.7-এ configured offset (`timezoneOffsetMinutes`, -720..+840) থেকে local business midnight-এর exact UTC instant তৈরি হয়:

`local YYYY-MM-DD 00:00 -> subtract configured offset -> UTC query boundary`

Order/event timestamp query UTC range ব্যবহার করে, কিন্তু SQL daily grouping-এর আগে একই offset যোগ করে date derive করে। `business_entries`, closings, carryover lot/settlement-এর DATE columns সরাসরি business-date string range ব্যবহার করে। Carryover BUY reconciliation-ও completed timestamp-কে configured offset দিয়ে settlement business date-এ map করে।

Daily close snapshot-এ offset এবং UTC start/end boundary রাখা হয় যাতে close-এর historical interpretation audit করা যায়।

## 2.0.7 deployment/domain boundary

Recommended browser topology:

`app.example.com -> Nginx -> P2PFlow :8080 (web + same-origin /api)`

`admin.example.com -> Nginx -> same backend (optional hostname; authorization application-level)`

`api.example.com -> Nginx -> only /api/* + health/readiness (Android/integration)`

Browser frontend cross-origin API ব্যবহার করে না; এতে current HttpOnly session + CSRF model same-origin থাকে। Database, NATS এবং internal Go port public internet-এ expose করা হয় না। Template: `deploy/nginx/p2pflow-split-domains.conf.example`।
