# P2PFlow v1.6.8 — Manual Update Guide

**Application:** 1.6.8  
**Database schema:** 39  
**Database migration:** none

## 1. Backup

Production database, `.env`, `.p2pflow/`, `shared/`, and any external secret/vault configuration back up করুন।

## 2. Replace application files

`P2PFlow_v1.6.8_UNIFIED.zip` clean temporary directory-তে extract করে application files overwrite করুন। Persistent runtime files overwrite করবেন না।

## 3. Validate

```text
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

তারপর application service restart করুন। Health/System Update/Footer-এ application `1.6.8` এবং schema `39` দেখুন।

## 4. Cache

Reverse proxy/CDN cache purge এবং browser/PWA hard refresh করুন।

## 5. Required live acceptance

1. অন্তত দুইটি Binance API account active রাখুন।
2. API A এবং API B-এর recent/new order Binance page-এ দেখা গেলে CRM-এ discovery confirm করুন।
3. API A Orders OFF করুন একজন CRM user-এর জন্য; অন্য permitted user API A order দেখতে থাকবে।
4. একই user-এর API A Orders আবার ON করুন; existing permitted order ফিরে আসবে এবং immediate exact-account reconciliation শুরু হবে।
5. Live Order (`binance.sync`) permission থাকা user API A Orders ON অবস্থায় unassigned permitted live order দেখতে পাচ্ছে কিনা দেখুন।
6. Assignment-only user-এর ক্ষেত্রে old routing/auto-assignment behavior confirm করুন।
7. API B Notifications OFF রেখে Orders ON করুন; order আসবে কিন্তু ওই user-এর notification mute থাকবে।
8. Server log-এ repeated `Binance SAPI timeout after 4500ms` বা `7000ms` আর থাকা উচিত নয়।

## 6. Rollback

Schema 39 অপরিবর্তিত। প্রয়োজন হলে validated earlier package-এ rollback করা যায়, তবে v1.6.5-v1.6.7 short-timeout order-ingestion regression এড়াতে v1.6.8 ব্যবহার করা উচিত।
