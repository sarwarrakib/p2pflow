# P2PFlow v1.5.29 — Manual Update Guide

## ১. Backup

Update-এর আগে backup নিন:

- production database;
- `.env`;
- `.p2pflow/`;
- `shared/`;
- current application / previous Unified ZIP।

## ২. Application update

`P2PFlow_v1.5.29_UNIFIED.zip` temporary directory-তে extract করে application files replace করুন। Runtime/database/config data preserve করুন।

Node.js 20+ দিয়ে:

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

তারপর service restart, browser hard refresh এবং reverse-proxy/CDN static cache purge করুন। Database schema `35`; নতুন migration নেই।

## ৩. Release Verification configure করুন

Admin/authorized user হিসেবে:

1. **Settings → Release Verification** খুলুন।
2. যে Binance API account configure করবেন তার card নির্বাচন করুন।
3. `Binance verification` method নির্বাচন করুন।
4. চাইলে `Require P2PFlow verification before Release` ON করুন।
5. Primary method নির্বাচন করুন: User Password / 6-digit Secret Code / Email OTP।
6. Optional Secondary method নির্বাচন করুন; Primary-এর থেকে আলাদা হতে হবে।
7. Save Settings করুন।

প্রথম production rollout-এ `Binance Auto` রাখা সবচেয়ে conservative migration path; পরে controlled account/order test করে explicit method নির্বাচন করুন। Binance selected method reject করতে পারে—Settings method Binance security policy override করে না।

## ৪. Automatic Fund Transfer Password

এই feature ব্যবহার করতে:

1. Binance verification = `Fund Transfer Password` করুন।
2. `Require P2PFlow verification before Release` ON করুন।
3. Primary এবং optional Secondary local verification configure করুন।
4. `Fund Transfer Password` field-এ secret দিন।
5. `Automatic Fund Transfer Password` ON করুন।
6. Save Settings করুন।

Fund Password save/clear করতে `credentials.manage` permission লাগে। Saved password browser-এ পরে ফেরত আসবে না; field blank থাকবে এবং status `Fund password saved` দেখাবে। Password পরিবর্তন করতে নতুন value লিখে Save করুন। মুছতে `Clear saved password` ব্যবহার করুন।

## ৫. Primary → Secondary fallback test

Controlled SELL order দিয়ে:

1. Release খুলুন।
2. Primary P2PFlow verification-এ ইচ্ছাকৃত ভুল value দিন।
3. Expected: verification fail message এবং `Change Verification System` button দেখা যাবে।
4. Button click করে Secondary method-এ যান।
5. Secondary সঠিকভাবে complete করুন।
6. তারপর Binance verification complete করুন।

Email OTP Primary হলে SMTP/mail route healthy কিনা আগে Settings-এর mail test দিয়ে যাচাই করুন। Email delivery fail হলেও Secondary configured থাকলে Change Verification System ব্যবহার করা যাবে।

## ৬. Auto Fund Password live safety test

Controlled small SELL order-এ:

1. Payment Split required হলে valid split/proof complete করুন।
2. Release খুলুন।
3. Final page-এ saved Fund Password plaintext দেখা যাচ্ছে না নিশ্চিত করুন।
4. P2PFlow Primary/Secondary verification complete করুন।
5. Expected: Fund Password input manually চাইবে না; server-side saved secret ব্যবহার করবে।
6. Binance `checkIfCanReleaseCoin` allow করলে Release attempt হবে।
7. Binance অন্য verification requirement দিলে সেটা Binance security policy; explicit selected method force করে bypass করার চেষ্টা করবেন না। প্রয়োজনে Settings-এ `Binance Auto` ব্যবহার করুন।

## ৭. FIDO2 / Fingerprint নোট

Supplied C2C SAPI v7.4-এ `FIDO2` auth type আছে, কিন্তু browser WebAuthn challenge/assertion flow document করা নেই। তাই এই release arbitrary fingerprint prompt তৈরি করে না। Binance API যদি concrete FIDO2 token/code না দেয়, `Binance Auto` ব্যবহার করুন এবং Binance যে challenge দেয় সেটি অনুসরণ করুন।

Voice/phone-call verification supplied document-এর selectable authType নয়; সেটির জন্য explicit Voice option তৈরি করা হয়নি।

## ৮. Regression test

Deployment-এর পরে যাচাই করুন:

- saved Payment Split থাকলে Release retry-তে Split popup আবার আসে না;
- Proof Mandatory/Optional policy ঠিক;
- BUY Mark Paid আগের flow-এ কাজ করে;
- SELL Release exact Binance account/payId ব্যবহার করে;
- Payment Account balance/limit/charge/commission ঠিক;
- Orders/Ads account scope এবং notification scope ঠিক;
- trusted device/session stable;
- Audit Log-এ Fund Password value দেখা যায় না;
- Settings GET/full order API response-এ saved Fund Password value নেই।
