# P2PFlow v1.5.32 — Manual Update Guide

## 1. Backup

Update-এর আগে backup নিন:

- production database;
- `.env`;
- `.p2pflow/`;
- `shared/`;
- uploaded runtime data/proofs।

## 2. Application files replace

`P2PFlow_v1.5.32_UNIFIED.zip` clean directory-তে extract করে application files replace করুন। Production `.env`, database বা runtime directories overwrite করবেন না।

## 3. Dependencies এবং tests

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

## 4. Service restart

Deployment অনুযায়ী P2PFlow service restart করুন। Health/footer-এ Application `1.5.32`, Database schema `35` নিশ্চিত করুন।

## 5. Browser/PWA cache পরিষ্কার

v1.5.32-এর public assets `?v=1.5.32` ব্যবহার করে। তারপরও পুরোনো verification UI দেখা এড়াতে:

- browser hard refresh করুন;
- reverse proxy/CDN cache purge করুন;
- PWA/mobile browser সম্পূর্ণ close করে পুনরায় খুলুন;
- প্রয়োজনে পুরোনো tab বন্ধ করে নতুন tab খুলুন।

যদি এখনও **Binance verification code** generic field দেখা যায়, browser যে build serve করছে সেটি 1.5.32 কিনা আগে যাচাই করুন। v1.5.32 current frontend এই generic field তৈরি করে না।

## 6. Controlled Release test

API Credentials → target Binance account → gear → Release Verification-এ প্রথম test-এর জন্য **Binance Auto** রাখুন।

একটি ছোট SELL order-এ:

1. Payment Split requirement OFF হলে Release চাপুন।
2. কোনো verification page আগে থেকে আসার কথা নয়।
3. P2PFlow minimal release probe চালাবে।
4. Binance যদি `Your google verification code is missing` দেয়, তখন **Authenticator App Verification** screen আসবে।
5. current 6-digit Google Authenticator code দিন।
6. একই attempt-এ Binance `Verification failed` বললে একই Google field fresh code retry-এর জন্য থাকবে; generic Binance code field হবে না।
7. SMS challenge হলে SMS/Mobile OTP field আসবে।

## 7. Configured method test

Google Authenticator preference নির্বাচন করলেও first request pre-emptively Google code চাইবে না। Binance concrete Google challenge দিলে তখন Google field দেখাবে।

Fund Transfer Password preference + Auto-use-এর ক্ষেত্রে:

- P2PFlow local verification configure করুন;
- first request Fund Password force করবে না;
- Binance FUND_PWD চাইলে local verification pass হওয়ার পর saved password server-side apply হবে।

## 8. Payment Split sanity test

- Split OFF + no split → direct Binance probe।
- Split OFF + old saved split → direct Binance probe।
- Split ON + valid saved split → no repeat split popup।
- Split ON + missing required split/proof → split flow আগে আসবে।

## 9. Rollback

সমস্যা হলে database backup অক্ষত রেখে previous application release-এ rollback করুন। v1.5.32 schema 35 ব্যবহার করে; এই release নতুন schema migration করে না।
