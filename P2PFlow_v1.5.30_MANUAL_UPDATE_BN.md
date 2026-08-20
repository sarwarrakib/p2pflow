# P2PFlow v1.5.30 — Manual Update Guide

## ১. Backup

Update-এর আগে backup নিন:

- production database;
- `.env`;
- `.p2pflow/`;
- `shared/`;
- current application / previous Unified ZIP।

## ২. Application update

`P2PFlow_v1.5.30_UNIFIED.zip` temporary directory-তে extract করে application files replace করুন। Runtime database/config/persistent files preserve করুন।

Node.js 20+ দিয়ে:

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

তারপর service restart, browser hard refresh এবং reverse-proxy/CDN static cache purge করুন। Database schema `35`; নতুন migration নেই।

## ৩. নতুন API Credential connect

**System → API Credentials** খুলুন।

1. `Connect Binance API` / Add action খুলুন।
2. Client Type, API Key এবং Secret Key দিন।
3. `Connect & Save` চাপুন।
4. Save-এর আগে automatic signature/format validation এবং live Binance C2C check চলবে।
5. Live check fail হলে credential database-এ save হবে না।
6. Success হলে Payment Method/P2P profile sync চলবে।
7. P2P nickname পাওয়া গেলে table-এ সেই P2P username account identity হিসেবে দেখা যাবে।

আলাদা Validate/Live Check button আর প্রয়োজন নেই।

## ৪. প্রতি API account-এর Release Verification configure

API Credentials table-এ সংশ্লিষ্ট account-এর **gear icon** চাপুন।

Popup থেকে:

1. Binance verification method নির্বাচন করুন;
2. চাইলে `Require P2PFlow verification before Release` enable করুন;
3. Primary method নির্বাচন করুন;
4. optional Secondary নির্বাচন করুন;
5. Fund Transfer Password method হলে প্রয়োজন অনুযায়ী password save/auto-use configure করুন;
6. Save করুন।

Release Verification এখন System Settings-এর আলাদা section নয়।

## ৫. Release flow পরীক্ষা

### Payment Split requirement OFF

Controlled SELL order-এ Release চাপুন। Expected:

- Payment Split modal খুলবে না;
- পুরোনো Release Coin explanatory modal খুলবে না;
- সরাসরি dedicated Release Verification screen আসবে।

Binance Auto প্রথমে requirement check করবে। Binance Google Authenticator চাইলে screen সঙ্গে সঙ্গে **Authenticator App Verification**-এ রূপান্তর হবে এবং শুধু code field দেখাবে। Raw `-9000` missing-code error দেখানো উচিত নয়।

### Payment Split requirement ON + split already saved

Valid split/proof already থাকলে Release retry-তেও split page পুনরায় আসবে না; সরাসরি verification screen আসবে।

### Split incomplete

Split requirement ON এবং required amount/proof incomplete হলে কেবল তখন split gate আগে আসবে।

## ৬. Primary / Secondary P2PFlow verification test

যদি per-API local verification ON থাকে:

1. Release Verification screen খুলুন।
2. Primary method complete করুন।
3. ইচ্ছাকৃত ভুল দিয়ে Primary fail test করলে, Secondary configured থাকলে `Change Verification System` পাওয়া উচিত।
4. Secondary দিয়ে complete করুন।
5. তারপর Binance verification complete করুন।

Auto Fund Password configured থাকলে local P2PFlow verification successful হওয়ার আগে saved Fund Password ব্যবহার হবে না।

## ৭. Responsive UI check

কমপক্ষে নিচের viewport/device-এ Release Verification screen যাচাই করুন:

- Android phone portrait;
- iPhone/Home Screen browser equivalent if used;
- tablet;
- desktop 1366px বা বড়।

Mobile-এ screen full-height হওয়া উচিত; title/input/Submit viewport-এর বাইরে horizontal overflow করা যাবে না। Desktop-এ centered verification card দেখাবে।

## ৮. API Credentials UI check

- generic `Main Binance Account` নতুন credential-এ দেখা যাচ্ছে না;
- successful P2P profile sync-এর পরে P2P username দেখা যাচ্ছে;
- Validate/Live Check text button নেই;
- actionগুলো icon-based;
- gear icon per-API Release Verification popup খোলে;
- enable/disable/delete আগের permission অনুযায়ী কাজ করে।

## ৯. Production safety test

প্রথম live rollout-এ ছোট controlled SELL order ব্যবহার করুন। Verification preference Binance-এর risk/security challenge override করে না। Binance যে method accept করে না সেটি force করে Release করা উচিত নয়।

Audit/API/browser-এ saved Fund Transfer Password plaintext প্রকাশ পাচ্ছে না নিশ্চিত করুন।
