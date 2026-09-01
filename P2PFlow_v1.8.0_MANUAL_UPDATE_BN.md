# P2PFlow v1.8.0 — Manual Update Guide (Node.js)

এই guide existing v1.7.9 Node.js installation-কে v1.8.0-এ update করার জন্য। Existing `.env`, runtime metadata এবং database replace করবেন না।

## 1. Update-এর আগে

1. Application maintenance/quiet window নিন।
2. MariaDB/MySQL/PostgreSQL-এর **full database backup** নিন।
3. Current application source folder-এর copy রাখুন।
4. `.env`, `.p2pflow/`, `shared/`, current release metadata এবং runtime secrets আলাদা backup রাখুন।
5. নিশ্চিত করুন Node.js 20+ আছে।

### কেন DB backup বাধ্যতামূলক

Schema 38 segmented state write করার পর v1.7.9 code ওই representation বুঝবে না। তাই rollback-এর সময় old code + old database backup pair রাখতে হবে।

## 2. Application files replace

v1.8.0 ZIP extract করুন এবং existing application code replace করুন, কিন্তু নিচের runtime data overwrite/delete করবেন না:

```text
.env
.env.local
.p2pflow/
shared/
releases/
P2PFLOW_SETUP_CODE.txt
production database
```

GitHub/Coolify deployment হলে runtime secret repository-তে commit করবেন না।

## 3. Dependencies

Application root-এ:

```bash
npm ci --omit=dev --ignore-scripts
```

Production server-এ `npm install` দিয়ে lockfile drift তৈরি না করাই ভালো।

## 4. Configuration

পুরনো valid environment variables preserve করুন। Optional/new defaults:

```env
P2PFLOW_STATE_SEGMENT_CHUNK_ROWS=500
P2PFLOW_BINANCE_ACCOUNT_SYNC_CONCURRENCY=3
P2PFLOW_BINANCE_FAST_ACCOUNT_SYNC_CONCURRENCY=4
```

Existing Binance scheduler values (`P2PFLOW_BINANCE_HTTP_CONCURRENCY`, `P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY`, queue/budget) নিজের production observation ছাড়া aggressiveভাবে বাড়াবেন না। 429 বাড়লে concurrency কমান।

## 5. Pre-deploy validation

```bash
npm run build
npm test
npm run preflight:production
```

`preflight:production` environment-specific requirement check করতে পারে। যদি intentional staging/local value-এর জন্য warning আসে, production deploy-এর আগে ঠিক করুন।

## 6. Restart

আপনার existing deployment method দিয়েই restart করুন। নতুন deployment system বাধ্যতামূলক নয়। Coolify হলে existing Node/Docker application resource, systemd হলে existing service, PM2 হলে existing PM2 process—যেটি আগে stable ছিল সেটি রাখুন।

## 7. First boot

প্রথম boot/প্রথম durable save সাধারণ restart-এর চেয়ে কিছুটা বেশি সময় নিতে পারে, কারণ legacy history থেকে completed `chats`, `ledgers`, `auditLogs` chunks encrypted object store-এ seal হতে পারে। এই সময় process force-kill করবেন না।

Application healthy হওয়ার পর:

- login
- dashboard navigation
- users/roles/permissions
- Binance account list
- Orders list/detail
- Ads list
- Chat inbox + realtime message receive
- Payment Accounts
- Accounting report
- Notifications read/unread
- Health Check

পরীক্ষা করুন।

## 8. Multiple Binance account smoke test

প্রথমে 1–2 account দিয়ে read/sync stable কিনা দেখুন। তারপর ধীরে account বাড়ান। `429`, queue overflow, timeout, event-loop lag বা DB-save latency monitor করুন। Default account-level concurrency `3/4` থেকে benchmark ছাড়া বেশি বাড়াবেন না।

## 9. Rollback

যদি v1.8.0 migration-এর পরে rollback দরকার হয়:

1. v1.8.0 app stop করুন।
2. Pre-upgrade v1.7.9 application source restore করুন।
3. **Pre-upgrade database backup restore করুন।**
4. পুরনো matching `.env`/runtime metadata restore করুন।
5. Start করে login/health test করুন।

শুধু code v1.7.9-এ ফেরত দিয়ে schema-38/segmented database রেখে start করবেন না।
