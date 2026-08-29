# P2PFlow 2.0.7 Setup Guide (Bangla)

## 1. Server requirement

Recommended production baseline:

- Ubuntu 24.04 LTS / comparable Linux
- Go 1.23+ (source build করলে)
- Docker + Docker Compose **অথবা** native/systemd deployment
- একটি DB: PostgreSQL 15+ / MySQL 8+ / MariaDB 10.11+
- Nginx/Cloudflare TLS reverse proxy
- NATS 2.10+ horizontal realtime/worker deployment-এর জন্য
- SMTP service email OTP/security notification-এর জন্য
- public HTTPS domain browser Web Push-এর জন্য

### 1.1 Website / API domain layout

Recommended:

```text
app.yourdomain.com    = Website/Dashboard + same-origin /api proxy
api.yourdomain.com    = API-only hostname for Android/native/integrations
admin.yourdomain.com  = optional Super Admin hostname
```

Browser frontend-কে cross-origin API-তে পাঠানোর বদলে `app.` hostname-এই `/api/...` Nginx proxy রাখুন। এতে HttpOnly session cookie + CSRF same-origin থাকে এবং CORS লাগে না। Full file/folder/domain map: `docs/DOMAIN_DEPLOYMENT_BN.md`; ready Nginx template: `deploy/nginx/p2pflow-split-domains.conf.example`।

## 2. Database নির্বাচন

একই source তিনটি SQL family support করে। `.env`-এ driver + DSN বদলাবেন।

### PostgreSQL

```env
DB_DRIVER=postgres
DB_URL=postgres://p2pflow:StrongPassword@127.0.0.1:5432/p2pflow?sslmode=disable
```

### MySQL 8+

```env
DB_DRIVER=mysql
DB_URL=p2pflow:StrongPassword@tcp(127.0.0.1:3306)/p2pflow?parseTime=true&charset=utf8mb4&collation=utf8mb4_unicode_ci
```

### MariaDB 10.11+

```env
DB_DRIVER=mariadb
DB_URL=p2pflow:StrongPassword@tcp(127.0.0.1:3306)/p2pflow?parseTime=true&charset=utf8mb4&collation=utf8mb4_unicode_ci
```

High-scale SaaS-এর primary recommendation PostgreSQL; MySQL/MariaDB compatible migration/runtime path রাখা হয়েছে।
Production DB/session timezone UTC রাখা recommended; Accounting business day application-level `accountingTimezoneOffsetMinutes` দিয়ে নির্ধারিত হয়। 2.0.7 timestamp range/grouping সেই configured offset অনুযায়ী shift করে।

## 3. `.env`

```bash
cp .env.example .env
./scripts/generate-secret.sh
```

Minimum production fields:

```env
P2PFLOW_VERSION=2.0.7
P2PFLOW_ENV=production
P2PFLOW_LISTEN=127.0.0.1:8080
P2PFLOW_PUBLIC_BASE_URL=https://app.yourdomain.com
P2PFLOW_SUPERADMIN_EMAIL=owner@yourdomain.com

DB_DRIVER=postgres
DB_URL=postgres://p2pflow:StrongPassword@127.0.0.1:5432/p2pflow?sslmode=disable

APP_SECRET=at-least-32-random-production-characters
COOKIE_SECURE=true
P2PFLOW_AUTO_MIGRATE=false
P2PFLOW_WORKERS=true
```

`P2PFLOW_SUPERADMIN_EMAIL` ঐ owner signup-এর **আগে** set করবেন।
`app.yourdomain.com` + `admin.yourdomain.com` একই login session share করতে চাইলে `COOKIE_DOMAIN=.yourdomain.com` দিতে পারেন; শুধু main app hostname হলে `COOKIE_DOMAIN=` ফাঁকা রাখাই ভালো।

## 4. Build

প্রথম build machine-এ Go module download access লাগবে:

```bash
go mod download
./scripts/build.sh
```

Output:

```text
bin/p2pflow
bin/p2pflow-worker
bin/p2pflow-migrate
bin/p2pflow-updater
bin/p2pflow-keygen
```

`p2pflow-keygen` এবং `p2pflow-updater` external DB driver dependency ছাড়াই build হয়; main/worker/migrate binaries `dbdrivers` tag দিয়ে PostgreSQL/MySQL/MariaDB driver include করে।

Source/config preflight:

```bash
./scripts/production-preflight.sh
```

`.env` থাকলে command-টি production HTTPS/cookie/secret/DB/version/update-signature configuration-ও validate করবে।

### 4.1 Owner/Admin/Manager/Agent browser E2E

2.0.7-এ retained dependency-free Chromium/CDP harness আছে। OTP/password script-এ রাখার বদলে staging-এর চারটি short-lived authenticated session token ব্যবহার করুন:

```bash
export P2PFLOW_E2E_BASE_URL='https://staging.app.example.com'
export P2PFLOW_E2E_OWNER_COOKIE='p2pflow_session=<owner-session>'
export P2PFLOW_E2E_ADMIN_COOKIE='p2pflow_session=<admin-session>'
export P2PFLOW_E2E_MANAGER_COOKIE='p2pflow_session=<manager-session>'
export P2PFLOW_E2E_AGENT_COOKIE='p2pflow_session=<agent-session>'
export P2PFLOW_REQUIRE_BROWSER_E2E=true
node scripts/browser-role-e2e.mjs
```

Harness effective permission অনুযায়ী visible page matrix, rendered navigation, System Update/Super Admin boundary, visible route navigation, browser JavaScript error এবং application-origin HTTP 5xx check করে। Cookie/token console history, CI log বা committed `.env`-এ রাখবেন না; run শেষে `unset P2PFLOW_E2E_*` করুন।

## 5. Database migration

Ordered migrations `001 ... 017` apply করবেন। Random SQL file manually reorder করবেন না।

```bash
set -a
. ./.env
set +a
./bin/p2pflow-migrate
```

Latest migrations:

```text
014_extension_update_delivery_hardening.sql
015_accounting_permission_scale.sql
016_accounting_carryover_e2e_hardening.sql
017_accounting_timezone_domain_hardening.sql
```

`014` Notification delivery/Extension/System Update hardening যোগ করে। `015` normalized order Accounting facts/index এবং strict Binance account-sync/profile-sync permission seed যোগ করে। `016` day-locked carryover lot/settlement/agent-share tables, completed-order accounting event index এবং current version `2.0.6` যোগ করে। `017` configured Accounting business-timezone boundary/domain-deployment hardening release checkpoint `2.0.7` sync করে।

Controlled production deployment-এ `P2PFLOW_AUTO_MIGRATE=false` রেখে dedicated migrate step safer।

Upgrade-এর পরে Daily Closing page-এর **Reconcile Carryover** action দিয়ে normalized FIFO settlement rebuild করা যায়। Existing 2.0.5 close snapshot থেকে company-level close facts backfill হয়; পুরনো exact Agent close share snapshot source-এ না থাকলে system তা অনুমান করে না এবং incomplete-history warning রাখে। 2.0.6 থেকে নতুন close exact Agent share persist করে।
2.0.7-এ configured Business Timezone report range + order grouping + carryover settlement date-এ apply হয়। Production history reconcile-এর আগে staging-এ 23:59:59 → 00:00:00 local boundary sample দিয়ে verify করা এখনও recommended।

## 6. Browser Web Push / VAPID

Key generate:

```bash
./bin/p2pflow-keygen vapid
```

Output থেকে `.env`-এ দিন:

```env
VAPID_PRIVATE_KEY=<generated-private-key>
VAPID_PUBLIC_KEY=<generated-public-key>
VAPID_SUBJECT=mailto:ops@yourdomain.com
P2PFLOW_PUSH_TTL=5m
P2PFLOW_PUSH_DELIVERY_CONCURRENCY=8
```

`VAPID_SUBJECT` real `mailto:` বা `https:` contact URI হবে। Private key Git/source-এ commit করবেন না।

Browser-side requirements:

- HTTPS (localhost dev exception browser-specific)
- notification permission granted
- current browser must be a valid P2PFlow trusted device
- service worker `/sw.js` accessible

Push subscription optional নির্দিষ্ট Binance account scope-এ bind করা যায়। Revoked/expired trusted device-এর subscription delivery recipient হিসেবে ধরা হয় না।

## 7. Chrome Extension v6.1.9

Server master/derivation secret:

```env
P2PFLOW_EXTENSION_TOKEN=<long-random-secret>
P2PFLOW_EXTENSION_POLL_SECONDS=2
```

**Master `P2PFLOW_EXTENSION_TOKEN` Chrome-এ paste করবেন না।** P2PFlow Extension Bridge/Admin endpoint workspace-specific tenant token দেয় (`p2pv2.<tenant>...`)।

Chrome setup:

1. Chrome → `chrome://extensions`
2. Developer mode ON
3. **Load unpacked** → repository-এর `extension/` folder
4. P2PFlow Extension Bridge page থেকে Server URL + tenant token copy
5. Extension popup-এ paste করে **Save & Connect**
6. Chrome configured CRM host permission চাইলে Allow
7. Binance একই Chrome profile-এ logged-in রাখুন

6.1.9 static all-sites bridge injection করে না; configured CRM host-এর optional permission explicitly নেয়। Active task থাকলে polling দ্রুত হয়, idle হলে backoff বাড়ে; 30-second alarm wake fallback আছে।

## 8. Binance tuning

```env
BINANCE_API_BASE_URL=https://api.binance.com
P2PFLOW_BINANCE_HTTP_CONCURRENCY=12
P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY=3
P2PFLOW_BINANCE_INTERACTIVE_RESERVE=3
P2PFLOW_BINANCE_ORDER_SYNC_INTERVAL=3s
P2PFLOW_BINANCE_ADS_SYNC_INTERVAL=30s
P2PFLOW_BINANCE_SYNC_MAX_PAGES=5
P2PFLOW_BINANCE_CHAT_RECONNECT_MIN=1s
P2PFLOW_BINANCE_CHAT_RECONNECT_MAX=30s
```

বহু API account হলে concurrency blindভাবে বাড়াবেন না; Binance rate-limit/latency monitor করে tune করবেন।

## 9. Billing

Manual billing:

```env
BILLING_DEFAULT_PROVIDER=manual
BILLING_CURRENCY=BDT
BILLING_WEBHOOK_SECRET=<another-long-random-secret>
BILLING_GRACE_PERIOD=72h
BILLING_INVOICE_LEAD=168h
```

Hosted provider/adapter:

```env
BILLING_DEFAULT_PROVIDER=your-provider
BILLING_CHECKOUT_URL=https://payments.yourdomain.com/p2pflow/checkout
BILLING_CHECKOUT_API_KEY=<provider-key-if-needed>
BILLING_WEBHOOK_SECRET=<strong-shared-secret>
```

Normalized webhook endpoint:

```text
POST /api/billing/webhook/<provider>
X-P2PFlow-Signature: sha256=<HMAC-SHA256(raw-body)>
```

Actual payment gateway select করার পর provider-এর real signature/payload → P2PFlow normalized billing event adapter bind করতে হবে।

## 10. Signed System Update

Production-এ update signature default required। Signing private key **application server থেকে আলাদা/offline** রাখুন।

### 10.1 Release signing key generate

Offline/admin machine:

```bash
./bin/p2pflow-keygen release --private-out ./p2pflow-release-signing.key
```

Command private file mode `0600` করে এবং public key print করে। Server `.env`:

```env
P2PFLOW_UPDATE_RELEASE_DIR=/srv/p2pflow/releases
P2PFLOW_UPDATE_PUBLIC_KEY=<printed-public-key>
P2PFLOW_UPDATE_REQUIRE_SIGNATURE=true
P2PFLOW_UPDATE_MAX_ARTIFACT_BYTES=536870912
P2PFLOW_UPDATE_CURRENT_LINK=/srv/p2pflow/current
```

Private file server-এ copy না করাই preferred।

### 10.2 Release ZIP sign

ZIP-এর ভিতর exact `VERSION` file থাকতে হবে। Offline machine:

```bash
./bin/p2pflow-keygen sign-release \
  --file P2PFlow_v2.0.7.zip \
  --key-file ./p2pflow-release-signing.key
```

Output: `VERSION`, `SHA256`, `SIGNATURE` এবং exact canonical signing message। Super Admin → System Update page-এ ZIP select করে version/signature দিন। Browser SHA-256 independently calculate করে, server আবার hash/verify করে।

### 10.3 Atomic updater (native host deployment)

Updater fixed binary absolute path দিয়ে configure করতে পারেন:

```env
P2PFLOW_UPDATE_APPLY_PROGRAM=/usr/local/bin/p2pflow-updater
```

Install example:

```bash
sudo install -m 0755 ./bin/p2pflow-updater /usr/local/bin/p2pflow-updater
```

System Update safe sequence:

1. DB backup/PITR checkpoint
2. signed ZIP stage
3. staged release-এর migration run
4. new release health-check `/ready`
5. atomic current symlink switch
6. service restart/rolling traffic switch
7. `/ready`, logs, critical flows verify

Rollback UI/backend previous staged release pointer activate করতে পারে। **Code rollback database/business data rollback করে না**, তাই migration backward compatibility আগে যাচাই করবেন।

Docker deployment-এ container image/orchestrator rollout preferred; host symlink updater native binary/systemd layout-এর জন্য।

## 11. Run — single server

```bash
set -a
. ./.env
set +a
./bin/p2pflow
```

Health:

```bash
curl http://127.0.0.1:8080/api/health
curl http://127.0.0.1:8080/api/ready
curl http://127.0.0.1:8080/api/version
```

## 12. Scale-out

Web/API instances:

```env
P2PFLOW_WORKERS=false
NATS_URL=nats://127.0.0.1:4222
```

Dedicated worker:

```bash
./bin/p2pflow-worker
```

Multiple API/worker replicas shared DB + NATS ব্যবহার করবে। Worker leases duplicate global work avoid করে। DB connection pool (`DB_MAX_OPEN`, `DB_MAX_IDLE`, lifetime) managed DB capacity অনুযায়ী tune করুন।

## 13. Docker Compose quick start

Files:

```text
docker-compose.postgres.yml
docker-compose.mysql.yml
docker-compose.mariadb.yml
```

PostgreSQL example:

```bash
export DB_PASSWORD='StrongDatabasePassword'
export APP_SECRET='A-very-long-random-application-secret'
export BILLING_WEBHOOK_SECRET='Another-long-random-secret'
export SUPERADMIN_EMAIL='owner@yourdomain.com'
export VAPID_PRIVATE_KEY='<generated-private>'
export VAPID_PUBLIC_KEY='<generated-public>'
export VAPID_SUBJECT='mailto:ops@yourdomain.com'
export P2PFLOW_EXTENSION_TOKEN='<random-extension-master-secret>'
docker compose -f docker-compose.postgres.yml up -d --build
```

## 14. Production security / launch checklist

- DB/NATS ports public internet-এ expose করবেন না
- `APP_SECRET`, DB credentials, Binance secrets, SMTP secret, VAPID private, billing secret, release signing private key Git-এ রাখবেন না
- HTTPS + `COOKIE_SECURE=true`
- Super Admin account সীমিত/strong security
- backup + restore + PITR test
- multi-instance হলে uploads shared/object storage plan
- extension only trusted Chrome profile-এ install
- `docs/QA_2.0.7.md` এবং `docs/PRODUCTION_LAUNCH_CHECKLIST_BN.md`-এর live validation items launch-এর আগে run
