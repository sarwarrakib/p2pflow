# P2PFlow v1.6.7 — Manual Update Guide

**Application:** 1.6.7  
**Database schema:** 39  
**Database migration:** none beyond the existing additive schema 39

## 1. Update-এর আগে

Production database backup নিন এবং `.env`, `.p2pflow/`, `shared/`, external MariaDB/MySQL/PostgreSQL data ও `P2PFLOW_SECRET_VAULT_KEY` (যদি ব্যবহার করা হয়) আলাদা নিরাপদ backup-এ রাখুন।

## 2. Source replace

`P2PFlow_v1.6.7_UNIFIED.zip` clean temporary directory-তে extract করুন। Application files production Application Root-এ copy/overwrite করুন। Runtime/persistent data overwrite করবেন না:

- `.env`
- `.p2pflow/`
- `shared/`
- production database
- hosting-managed persistent secret files

## 3. Install / validation / restart

```text
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

তারপর application service restart করুন। Health/System Update/Footer-এ application `1.6.7` এবং database schema `39` নিশ্চিত করুন।

## 4. Cache purge

Reverse proxy/CDN cache purge করুন এবং browser/PWA hard refresh করুন। v1.6.7-এর Orders fix persistent route cache-ও runtime-এ invalidate করে, কিন্তু release asset cache পুরোনো থাকলে পুরোনো JavaScript চলতে পারে।

## 5. Required acceptance scenario

দুইটি CRM user এবং দুইটি Binance API account নিয়ে test করুন:

1. User A-এর API A permission আছে, API A Orders OFF করুন। শুধু User A-এর API A orders লুকাবে।
2. User A-এর API B Orders ON থাকলে API B orders আগের permission/assignment logic অনুযায়ী দেখা যাবে।
3. User B-এর API A permission থাকলে User B API A orders স্বাভাবিকভাবে দেখবে।
4. User A-এর API A Orders আবার ON করুন। Admin/Manager/Live-Order scope হলে existing API A orders সঙ্গে সঙ্গে ফিরে আসবে।
5. Assignment-scoped user হলে existing assigned orders ফিরে আসবে; unassigned orders শুধু পুরোনো Live Order/assignment rules অনুযায়ী আসবে।
6. নতুন API A order এলে পুরোনো routing/auto-assignment logic অনুযায়ী eligible agent-এ assign হবে। API B toggle এই সিদ্ধান্তে প্রভাব ফেলবে না।
7. API B Orders ON + Notifications OFF রাখুন। Orders কাজ করবে, কিন্তু User A-এর API B notification আসবে না।

## 6. Stale page/filter regression

- Orders page একবার খুলে Chat-এ যান, একটি account Orders OFF করে আবার ON করুন, তারপর Orders-এ ফিরুন। Full browser reload ছাড়াই fresh permitted orders দেখা উচিত।
- আগে saved API-account filter যে account এখন OFF, সেটি আর Orders page-কে empty করে রাখতে পারবে না; filter All API Accounts-এ ফিরে যাবে।

## 7. Rollback

Schema `39` অপরিবর্তিত। প্রয়োজন হলে validated v1.6.6 package-এ rollback করা যায়, তবে v1.6.6-এর stale Orders route/filter issue আবার দেখা দিতে পারে। Rollback-এর আগে database backup নিন এবং service restart + cache purge করুন।
