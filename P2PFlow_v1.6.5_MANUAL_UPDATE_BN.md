# P2PFlow v1.6.5 — Manual Update Guide

**Application:** 1.6.5  
**Database schema:** 38  
**Database migration:** automatic additive migration

## 1. Update-এর আগে

Production database backup নিন এবং `.env`, `.p2pflow/`, `shared/`, external MariaDB/MySQL/PostgreSQL data ও `P2PFLOW_SECRET_VAULT_KEY` (যদি ব্যবহার করা হয়) আলাদা নিরাপদ backup-এ রাখুন।

## 2. Source replace

`P2PFlow_v1.6.5_UNIFIED.zip` clean temporary directory-তে extract করুন। Application files production Application Root-এ copy/overwrite করুন। Runtime/persistent data overwrite করবেন না:

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

তারপর application service restart করুন। Health/System Update/Footer-এ application `1.6.5` এবং database schema `38` নিশ্চিত করুন।

## 4. Cache purge

Release-এর asset query version বদলেছে। Reverse proxy/CDN cache purge করুন এবং browser/PWA সম্পূর্ণ বন্ধ করে আবার খুলুন বা hard refresh করুন।

## 5. Realtime acceptance

Controlled live Binance account দিয়ে যাচাই করুন:

- নতুন order কয়েক সেকেন্ডের discovery cycle-এ দেখা যায়;
- Binance-এ order status বদলালে Orders list SSE delta দিয়ে দ্রুত update হয়;
- Ongoing/Fulfilled বা অন্য mounted page-এ ফিরে গেলে retained screen সঙ্গে সঙ্গে দেখা যায়;
- 10–15 মিনিট continuous navigation/order/chat/ads ব্যবহারেও API response আটকে proxy `504` আসে না;
- server CPU/memory/database connection health স্বাভাবিক থাকে।

Production proxy timeout, CPU/RAM pressure, database latency বা upstream Binance latency source package-এর বাইরে হতে পারে। 504 আবার হলে proxy/app/database logs-এর timestamp মিলিয়ে পরীক্ষা করুন।

## 6. Orders acceptance

- Payment Split OFF রেখে Mark as Paid করুন: split popup আসবে না।
- Payment Split ON হলে existing split gate আগের মতো কাজ করবে।
- Payment value/account copy button realtime update-এর আগে ও পরে বারবার test করুন; reload ছাড়াই কাজ করতে হবে।

## 7. Ads acceptance

- SELL Advertisement Edit click করলে editor সঙ্গে সঙ্গে খুলবে; live refresh background-এ হবে।
- Advertisement যে Binance account-এর, শুধু সেই account-এর saved P2P payment methods দেখাবে। Current ad-selected method selected থাকবে।
- Fixed price guide-এ unsupported percentage-derived range দেখাবে না। Binance explicit bounds দিলে সেগুলো দেখাবে; reference-only response হলে reference price দেখাবে। Invalid submit-এ Binance exact range দিলে সেই exact range surface করবে।
- Mobile Ads 3-dot action sheet-এ Edit/Delete দুটিই bottom navigation-এর ওপর দৃশ্যমান থাকবে।

## 8. Chat account controls

Chat-এ **All Accounts** খুলে প্রতিটি connected account দেখুন। Settings icon থেকে Orders/Notifications/Advertisement toggles test করুন। User permissions এখনও final authorization authority। Chat master Notifications OFF করলে per-account Notifications ON হলেও delivery বন্ধ থাকবে।

## 9. Rollback

Schema 38 additive; unknown/future fields migration code preserve করে। তবু rollback-এর আগে database backup নিন এবং validated previous release package ব্যবহার করুন। Rollback-এর পরে CDN/browser cache purge এবং service restart করুন।
