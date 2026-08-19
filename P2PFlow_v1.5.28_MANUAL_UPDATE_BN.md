# P2PFlow v1.5.28 — Manual Update Guide

## ১. Backup

Update-এর আগে backup নিন:

- production database;
- `.env`;
- `.p2pflow/`;
- `shared/`;
- current application/previous Unified ZIP।

## ২. Application update

`P2PFlow_v1.5.28_UNIFIED.zip` temporary directory-তে extract করে application files replace করুন। Runtime/database/config data preserve করুন।

Node.js 20+ দিয়ে:

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

তারপর service restart, browser hard refresh এবং reverse-proxy/CDN static cache purge করুন। Database schema `35`; migration নেই।

## ৩. Saved Split direct retry test

Settings > General-এ:

- `Require Payment Split before Mark Paid / Release` = ON
- `Payment Split Proof` = Optional অথবা Mandatory অনুযায়ী test করুন।

Controlled order-এ:

1. Mark Paid/Release click করুন।
2. Split না থাকলে Payment Split modal আসবে।
3. Valid split save করুন। Mandatory হলে proof attach করুন।
4. Continue চাপলে dedicated Mark Paid/Release verification modal আসবে।
5. Final Binance action intentionally fail হওয়ার মতো controlled condition থাকলে failure দেখুন।
6. Modal close করে আবার Mark Paid/Release click করুন।
7. Expected: Payment Split modal আর আসবে না; সরাসরি final-action/verification modal আসবে।

## ৪. Proof incomplete test

Proof Mandatory mode-এ existing split-এর proof সরিয়ে/নতুন proof-less split দিয়ে final action click করুন। Expected: split gate satisfied নয়, তাই Payment Split workflow proof সম্পূর্ণ করার জন্য খুলবে।

Proof Optional mode-এ একই saved actual split থাকলে direct final-action modal খুলবে।

## ৫. Release verification retry

Controlled SELL order-এ Binance যদি additional release verification চায়:

1. Release click করুন।
2. Binance error-এর concrete required field থাকলে final-action modal-এ field দেখা উচিত।
3. Modal close করে আবার Release click করুন।
4. Expected: saved Payment Split পুনরায় চাইবে না এবং আগের required verification field সরাসরি দেখা যাবে।
5. সঠিক verification value দিয়ে retry করুন।

## ৬. Live safety

- BUY Mark Paid exact linked Binance credential ব্যবহার করছে কিনা দেখুন।
- SELL Release-এর আগে exact order refresh এবং `checkIfCanReleaseCoin` চলছে কিনা Audit Log/controlled response দিয়ে যাচাই করুন।
- eligibility check fail হলে `releaseCoin` call হওয়া উচিত নয়।
- Binance action fail হলে local order `paid_marked`/`released` success state-এ যাওয়া উচিত নয়।
- Split already saved থাকলে balance/limit movement দ্বিতীয়বার হওয়া উচিত নয়।
