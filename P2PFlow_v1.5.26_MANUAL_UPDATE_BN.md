# P2PFlow v1.5.26 — Manual Update Guide

## লক্ষ্য

Existing P2PFlow installation-কে application `1.5.26`, schema `35`-এ update করা। এই release Payment Split edit/delete, daily/monthly limit reconciliation এবং Binance Mark as Paid/Release flow ঠিক করে।

## ১. Backup

Update-এর আগে backup নিন:

- production database;
- `.env`;
- `.p2pflow/`;
- `shared/`;
- current application/previous Unified ZIP।

## ২. Application files replace

`P2PFlow_v1.5.26_UNIFIED.zip` temporary directory-তে extract করে application files replace করুন। Preserve করুন:

```text
.env
.p2pflow/
shared/
external database data
releases/
runtime logs
```

## ৩. Build ও test

Node.js 20+ ব্যবহার করুন:

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

Production preflight configured থাকলে:

```bash
npm run preflight:production
```

Schema `35` অপরিবর্তিত; নতুন database migration প্রয়োজন নেই।

## ৪. Restart ও cache

```bash
sudo systemctl restart p2pflow
sudo systemctl status p2pflow --no-pager
```

তারপর browser hard refresh এবং CDN/reverse-proxy static cache purge করুন। DevTools-এ `?v=1.5.26` assets load হচ্ছে নিশ্চিত করুন।

## ৫. Payment Split edit smoke test

একটি test Payment Account-এ daily send limit 10,000 এবং balance পর্যাপ্ত রাখুন। BUY/order payment split:

1. Split Amount 1,000 save করুন।
2. Payment Account statement/usage-এ send used 1,000 যাচাই করুন।
3. Split Edit করে 500 করুন।
4. Balance 500 principal (এবং configured charge difference) অনুযায়ী ফেরত এসেছে যাচাই করুন।
5. Daily send used এখন 500 হয়েছে নিশ্চিত করুন।
6. Monthly send usage-ও net 500 হওয়া উচিত।

SELL/receive split-এ একইভাবে 1,000 → 500 করে receive usage 500 নিশ্চিত করুন।

## ৬. Payment Split delete smoke test

Final action-এর আগে একটি test split Delete করুন। Expected:

- split active list থেকে যাবে;
- principal balance reverse হবে;
- automatic charge/commission reverse হবে;
- daily/monthly usage restore হবে;
- statement/audit history থাকবে;
- finalized order-এর split delete block হবে।

Agent user দিয়ে তার own assigned split-এর Edit/Delete action পাওয়া যাচ্ছে এবং অন্য Agent-এর split modify করতে পারছে না যাচাই করুন।

## ৭. Evidence smoke test

Split form থেকে Transaction ID অথবা Proof দিন। Existing full split evidence ছাড়া থাকলে final-action modal-এ Transaction ID/Proof দিয়ে evidence update করা যায় কিনা পরীক্ষা করুন। Remaining 0 অবস্থায় duplicate split তৈরি হওয়া উচিত নয়।

## ৮. Mark as Paid live smoke test

Controlled BUY order ব্যবহার করুন:

1. Exact Binance account select/sync করুন।
2. Payment Split + Transaction ID/Proof save করুন।
3. Order status `UNPAID` থাকলে Mark as Paid button visible কিনা দেখুন।
4. Mark as Paid চাপুন।
5. Server exact Binance order detail refresh করে selected payId resolve করবে।
6. Binance success হলে CRM external status paid-marked হবে।

Failure হলে returned Binance message/audit request ID সংরক্ষণ করুন; local final status success হিসেবে save হওয়া উচিত নয়।

## ৯. Release live smoke test

Controlled SELL order ব্যবহার করুন:

1. Receive split + evidence save করুন।
2. Counterparty Binance-এ paid mark করার পরে Release Coin চাপুন।
3. Local cache stale হলে `Check Paid & Release` দেখা যেতে পারে; click করলে server live detail refresh করবে।
4. `checkIfCanReleaseCoin` allow করার পরেই `releaseCoin` call হবে।
5. Binance অতিরিক্ত verification চাইলে UI-তে প্রয়োজনীয় field দেখাবে।

`Quick Release` permission rules অপরিবর্তিত।

## ১০. Core regression

- Login/secret/trusted-device;
- Orders/Ads account isolation;
- P2P chat;
- Payment Account charge/commission;
- Offline Business reservation;
- accounting reconciliation;
- database encryption/backup;
- signed update/rollback।
