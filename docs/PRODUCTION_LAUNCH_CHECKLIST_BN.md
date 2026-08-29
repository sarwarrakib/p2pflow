# P2PFlow 2.0.7 Production Launch Checklist

এই checklist source QA pass-এর বিকল্প নয়; production environment-এ final validation-এর জন্য।

## 1. Release integrity

- trusted source থেকে ZIP নিন এবং published SHA-256 মিলান
- `VERSION` = `2.0.7`
- release ZIP-এর ভেতরে `.env`, private key, DB dump বা production secret নেই
- `./scripts/production-preflight.sh` pass

## 2. Database

একটি driver নির্বাচন করুন: PostgreSQL 15+ / MySQL 8+ / MariaDB 10.11+।

- production DB public internet-এ expose নয়
- dedicated least-privilege DB user
- pre-deploy backup নিন
- dedicated migration command দিয়ে 001..017 apply
- migration-এর পরে app `ready` probe pass
- row-lock Payment Account concurrency test staging-এ run

PostgreSQL backup example:

```bash
pg_dump "$DB_URL" --format=custom --file=p2pflow-pre-2.0.7.dump
```

Restore **production-এর উপর নয়**, আলাদা staging database-এ drill করুন:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$STAGING_DB_URL" p2pflow-pre-2.0.7.dump
```

MySQL/MariaDB-তে environment অনুযায়ী `mysqldump --single-transaction` এবং আলাদা staging restore ব্যবহার করুন। Password command history-তে লিখবেন না।

## 3. Secrets / TLS

- HTTPS enforced
- `COOKIE_SECURE=true`
- APP_SECRET minimum 32 random characters
- DB/Binance/SMTP/Billing/VAPID secrets Git বা release ZIP-এ নেই
- release signing private key application server-এ রাখা হয়নি; offline/CI signing path ব্যবহার করুন
- Super Admin account-এ strong authentication

## 3.1 Domain / reverse proxy

- `app.yourdomain.com` → Web UI + same-origin `/api/*`
- `api.yourdomain.com` → API-only for Android/integrations
- optional `admin.yourdomain.com` → same backend, role-gated Super Admin UI
- `/api/events` proxy buffering/cache disabled
- `api.` root/static path 404 by design
- Go `:8080`, DB `5432/3306`, NATS `4222` public internet-এ expose নয়
- Nginx config `deploy/nginx/p2pflow-split-domains.conf.example` থেকে environment অনুযায়ী তৈরি

## 4. Permission isolation

চারটি test user নিন: Owner, Admin, Manager, Agent। অন্তত দুইটি Binance account connect করে verify করুন:

- Agent account A permission পেলে account B দেখতে/operate করতে পারে না
- global permission remove করলে account-level grant থাকলেও access বন্ধ
- account-level grant remove করলে global permission থাকলেও সেই Binance account বন্ধ
- Orders / Sync / Chat / Ads / P2P Profile scopes independent
- cross-tenant account ID দিয়ে grant তৈরি reject হয়

## 4.1 Browser role E2E

Staging/production-like HTTPS server-এ short-lived test sessions দিয়ে run করুন:

```bash
export P2PFLOW_E2E_BASE_URL='https://staging.app.example.com'
export P2PFLOW_E2E_OWNER_COOKIE='p2pflow_session=<owner-session>'
export P2PFLOW_E2E_ADMIN_COOKIE='p2pflow_session=<admin-session>'
export P2PFLOW_E2E_MANAGER_COOKIE='p2pflow_session=<manager-session>'
export P2PFLOW_E2E_AGENT_COOKIE='p2pflow_session=<agent-session>'
export P2PFLOW_REQUIRE_BROWSER_E2E=true
node scripts/browser-role-e2e.mjs
```

- চার role result `ok: true`
- missing role নেই
- visible permission matrix mismatch নেই
- non-owner/non-super-admin System Update দেখতে পায় না
- non-super-admin Super Admin দেখতে পায় না
- visible route load-এ JavaScript exception/console error নেই
- application-origin HTTP 5xx নেই

Session tokens persistent shell history/CI log-এ রাখবেন না এবং test শেষে revoke/unset করুন।

## 5. Binance

প্রথমে read-only/non-destructive flow:

- credential validation
- order sync
- ad read/search
- P2P profile read/sync
- chat receive/send only on authorized test order
- 418/429 backoff log healthy

Mark Paid / Release-এর মতো irreversible action শুধু explicit authorized test account/order-এ করুন।

## 6. Accounting

Known historical sample দিয়ে verify করুন:

- BUY net/fee fact
- SELL outflow/fee fact
- payment split agent/co-agent allocation
- manual income/expense/capital entries
- Payment Account transfer charge/refund
- daily close/reopen
- Agent cannot see company close history/capital/Binance projection
- projected Binance order-ledger value Funding Wallet balance হিসেবে ভুল label হয় না
- Day-1 close operational profit lock হওয়ার পরে Day-2 BUY settlement করলে Day-1 profit unchanged থাকে
- settlement variance শুধু Day-2 `carryoverAdjustment`-এ আসে
- FIFO multiple prior close lot order verify করুন; same-day BUY carryover settlement হিসেবে ধরা হয় না
- **Reconcile Carryover** repeat করলে result idempotent থাকে
- 2.0.5-origin old close-এ exact Agent snapshot না থাকলে incomplete warning থাকে; missing Agent history fabricate হয় না
- configured Business Timezone অনুযায়ী 23:59:59 → 00:00:00 boundary-র দুই পাশে completed order expected business date-এ পড়ে কিনা staging-এ verify করুন; 2.0.7 source tests non-UTC boundary cover করে; production data দিয়ে staging verification তবুও required

## 7. SaaS / Billing

- public signup -> workspace
- setup-fee invoice
- setup payment validation
- monthly invoice generation
- grace -> suspend -> successful payment restore
- plan max user/API account limits
- tenant entitlement override
- webhook duplicate/replay/out-of-order handling

Provider-specific gateway adapter production credentials দিয়ে staging-এ validate না করা পর্যন্ত public payment enable করবেন না।

## 8. Extension / Push / Email

- extension v6.1.9 শুধু configured P2PFlow origin permission নেয়
- logged-in Binance advertiser P2P Info real flow
- Push subscribe/delivery/click/unsubscribe
- expired 404/410 subscription disable
- SMTP retry/delivery

## 9. Multi-instance / performance

- API instances stateless
- NATS private network
- dedicated worker deployment হলে API-তে duplicate worker disabled
- shared/object storage strategy final
- reverse proxy health check `/healthz` and `/ready`

Basic unauthenticated smoke:

```bash
node scripts/http-smoke-load.mjs https://app.example.com 200 20
```

এর পরে authenticated staging load test-এ representative Orders/Chat/Accounting workload চালান। লক্ষ্য: local/cached endpoints low hundreds of milliseconds; Binance-bound latency আলাদা করে observe করুন।

## 10. Rollback

- previous application release available
- signed System Update rollback tested staging-এ
- schema migration backward compatibility reviewed
- application rollback কখনো database restore-এর সমান নয়
- DB restore/PITR আলাদা documented emergency procedure

উপরের live checks complete না হলে source-ready build-কে production-verified হিসেবে চিহ্নিত করবেন না।
