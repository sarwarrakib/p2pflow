# P2PFlow v1.5.21 — Manual Update Guide

## লক্ষ্য

Existing P2PFlow installation-কে application version `1.5.21`, schema `33`-এ update করা। এই release Payment Account Serial Number-এর uniqueness-কে Payment Method/Label scope-এ পরিবর্তন করে। Database migration প্রয়োজন নেই।

## ১. Update-এর আগে backup

Backup নিন:

- Production database
- `.env`
- `.p2pflow/`
- `shared/`
- reverse-proxy/systemd/hosting configuration

Update ZIP-এর application files দিয়ে persistent data overwrite করবেন না।

## ২. Maintenance window

- Payment Account Add/Edit/Bulk Add সাময়িক বন্ধ রাখুন।
- Active user-দের maintenance জানান।
- Current application version ও database health লিখে রাখুন।
- Rollback-এর জন্য previous application directory/ZIP রাখুন।

## ৩. Files replace

`P2PFlow_v1.5.21_UNIFIED.zip` temporary directory-তে extract করুন। Existing application root-এ application files copy/overwrite করুন। Preserve করুন:

```text
.env
.p2pflow/
shared/
database/external database data
releases/
runtime logs
```

## ৪. Production dependencies

Node.js 20+ ব্যবহার করুন:

```bash
npm ci --omit=dev --ignore-scripts
```

Lockfile পরিবর্তন করে এমন `npm install` ব্যবহার করবেন না।

## ৫. Build ও test

```bash
npm run build
npm test
```

Production preflight available হলে:

```bash
npm run preflight:production
```

কোনো test fail হলে service restart বা public traffic চালু করবেন না।

## ৬. Service restart

Systemd উদাহরণ:

```bash
sudo systemctl restart p2pflow
sudo systemctl status p2pflow --no-pager
```

Hosting panel হলে configured Node application restart action ব্যবহার করুন।

## ৭. Browser cache

- Browser hard refresh করুন।
- CDN/reverse-proxy static cache purge করুন।
- DevTools Network থেকে `app.js?v=1.5.21` load হচ্ছে কিনা দেখুন।
- পুরোনো tab বন্ধ করে নতুন tab খুলুন।

## ৮. Required Serial Number verification

### A. Same method + same label

1. Payment Method `bKash` নির্বাচন করুন।
2. Label `Office Phone`, Serial `SIM-001` দিয়ে account তৈরি করুন।
3. অন্য account number দিয়ে একই Payment Method, Label ও Serial save করুন।
4. `PAYMENT_ACCOUNT_SERIAL_SCOPE_CONFLICT` error আসা নিশ্চিত করুন।

### B. Same method + different label

1. Payment Method `bKash` রাখুন।
2. Label `Backup Phone`, Serial `SIM-001` দিন।
3. Save সফল হওয়া নিশ্চিত করুন।

### C. Different payment method

1. Payment Method `Nagad` নির্বাচন করুন।
2. Label `Office Phone`, Serial `SIM-001` দিন।
3. Save সফল হওয়া নিশ্চিত করুন।

### D. Blank label

1. Payment Method `bKash`, Label blank, Serial `SIM-010` দিয়ে account তৈরি করুন।
2. একই Payment Method-এর অন্য labeled বা unlabeled account-এ `SIM-010` দিন।
3. Save block হওয়া নিশ্চিত করুন।
4. অন্য Payment Method-এ `SIM-010` save সফল হওয়া নিশ্চিত করুন।

### E. Normalization

`Office Phone`, ` office   phone ` এবং `OFFICE PHONE` দিয়ে একই serial পরীক্ষা করুন। এগুলো একই Label scope হিসেবে conflict করবে।

## ৯. Bulk Add verification

1. Bulk Add খুলুন।
2. দুইটি account row-তে একই Label ও Serial দিন। Warning দেখা ও submit block হওয়া নিশ্চিত করুন।
3. দুই row-তে ভিন্ন non-empty Label দিয়ে একই Serial দিন। Submit allowed হওয়া নিশ্চিত করুন।
4. একটি row-এর Label blank রেখে একই Serial দিন। Both row conflict হিসেবে দেখানো নিশ্চিত করুন।
5. Existing database-এর serial conflict হলে backend পুরো bulk operation atomicভাবে block করে—কোনো row create না হওয়া নিশ্চিত করুন।

## ১০. Permission regression

- Agent শুধু নিজের permitted Payment Account manage করছে।
- Admin/Manager সব account access পাচ্ছে।
- Search result permission scope-এর বাইরে account দেখাচ্ছে না।
- Offline Business reservation ও normal order account lock অক্ষত।

## ১১. Rollback

Code rollback প্রয়োজন হলে:

- Service stop করুন।
- Previous application files restore করুন।
- Database schema পরিবর্তিত হয়নি (`33`), তাই data migration rollback প্রয়োজন নেই।
- Service start করে login, Payment Accounts, Orders ও Offline Business smoke test করুন।

## সততা

এই update Label/Serial uniqueness rule পরিবর্তন করে; Binance credential বা live Binance mutation প্রয়োজন হয় না। Production data backup ছাড়া update করবেন না।
