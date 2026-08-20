# P2PFlow v1.5.31 — Manual Update Guide

## 1. Backup

Update-এর আগে production database, `.env`, `.p2pflow/`, `shared/` এবং uploaded runtime data backup নিন।

## 2. Application files replace

v1.5.31 Unified ZIP clean directory-তে extract করে application code replace করুন। Production `.env`, database এবং runtime directories overwrite করবেন না।

## 3. Dependencies ও tests

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

## 4. Service restart

আপনার deployment অনুযায়ী P2PFlow service restart করুন।

## 5. Browser cache পরিষ্কার

v1.5.31-এ সব public asset cache-buster পরিবর্তন হয়েছে। তারপরও deployment-এর পরে:

- browser hard refresh করুন;
- reverse proxy/CDN cache purge করুন;
- mobile browser/PWA পুরোনো page ধরে রাখলে page সম্পূর্ণ close করে পুনরায় খুলুন;
- footer/health-এ application version 1.5.31 নিশ্চিত করুন।

## 6. Release Verification controlled test

একটি ছোট SELL order ব্যবহার করুন। API credential-এর Release Verification প্রথমে **Binance Auto** রাখা সবচেয়ে নিরাপদ compatibility test।

Expected flow:

1. Release চাপুন।
2. Binance যদি Google code চায়, Authenticator App Verification page আসবে।
3. current 6-digit code দিন।
4. Verification failed হলে একই Google field থাকবে; generic “Binance verification code” field আসবে না।
5. API settings-এ Fund Password selected থাকলেও Binance concrete Google challenge দিলে Google challenge priority পাবে।

## 7. Fund Password test

Stored Fund Transfer Password auto-use ব্যবহার করলে P2PFlow Primary/Secondary local verification configure করুন। Stored password browser-এ দেখা যাবে না। Binance অন্য concrete challenge দিলে সেই challenge follow করুন।

## 8. Rollback

সমস্যা হলে code rollback করার আগে database backup অক্ষত রাখুন। v1.5.31 schema 35 ব্যবহার করে; নতুন migration নেই।
