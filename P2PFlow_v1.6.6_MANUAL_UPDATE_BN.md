# P2PFlow v1.6.6 — Manual Update Guide

**Application:** 1.6.6  
**Database schema:** 39  
**Database migration:** automatic additive migration from schema 38

## 1. Update-এর আগে

Production database backup নিন এবং `.env`, `.p2pflow/`, `shared/`, external MariaDB/MySQL/PostgreSQL data ও `P2PFLOW_SECRET_VAULT_KEY` (যদি ব্যবহার করা হয়) আলাদা নিরাপদ backup-এ রাখুন।

## 2. Source replace

`P2PFlow_v1.6.6_UNIFIED.zip` clean temporary directory-তে extract করুন। Application files production Application Root-এ copy/overwrite করুন। Runtime/persistent data overwrite করবেন না:

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

তারপর application service restart করুন। Health/System Update/Footer-এ application `1.6.6` এবং database schema `39` নিশ্চিত করুন।

## 4. Cache purge

Release asset query version বদলেছে। Reverse proxy/CDN cache purge করুন এবং browser/PWA সম্পূর্ণ বন্ধ করে আবার খুলুন বা hard refresh করুন।

## 5. Per-user Orders acceptance

দুইটি CRM user এবং কমপক্ষে দুইটি permitted Binance API account দিয়ে test করুন:

- User A -> API A -> Orders OFF করুন। User A-এর Orders page-এ API A order থাকবে না।
- একই User A-এর API B Orders ON থাকলে API B order আগের permission/assignment logic অনুযায়ী দেখাবে।
- User B-এর API A permission থাকলে User B API A order স্বাভাবিকভাবে দেখবে। User A-এর switch User B-কে প্রভাবিত করবে না।
- API A Orders OFF থাকা অবস্থাতেও server-এর Binance background sync চলবে এবং অন্য user-এর API A order/status realtime update হবে।
- Assignment-scoped User A-কে API A-এর নতুন order auto/manual assign করা হবে না যতক্ষণ তার API A Orders OFF।
- Orders আবার ON করলে underlying permission অপরিবর্তিত থাকায় API A order পুনরায় permission/assignment scope অনুযায়ী দেখা যাবে।

## 6. Notification acceptance

- User A -> API B -> Orders ON + Notifications OFF করুন। API B order User A দেখতে/ব্যবহার করতে পারবে, কিন্তু API B-এর in-app/email/push notification User A পাবে না।
- User B-এর API B Notifications ON থাকলে User B notification পাবে।
- Chat page-এর master Notifications OFF করলে account Notifications ON হলেও সেই user-এর notification mute থাকবে।

## 7. Advertisement acceptance

- User A -> API A -> Advertisement OFF করলে শুধু User A-এর Ads scope থেকে API A বাদ যাবে।
- User B-এর API A `ads.view` / `ads.manage` permission ও Advertisement ON থাকলে User B API A Ads স্বাভাবিকভাবে ব্যবহার করবে।
- Background Ads/merchant sync বন্ধ হওয়া যাবে না।

## 8. Chat acceptance

Orders OFF থাকলেও Chat-এর established access model অক্ষত থাকবে। All Accounts selector এবং account filter ব্যবহার করে existing permitted conversation দেখা যাবে। Account Settings-এর text স্পষ্টভাবে per-CRM-user scope দেখাবে।

## 9. Rollback

Schema 39 additive। Rollback-এর আগে database backup নিন। Schema-38 release-এ ফিরে গেলে schema-39 per-user preference fields পুরোনো code ব্যবহার করবে না; production rollback করার আগে behavior যাচাই করুন। Validated previous release package ব্যবহার করে restart এবং cache purge করুন।
