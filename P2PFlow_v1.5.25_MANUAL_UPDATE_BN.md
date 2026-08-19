# P2PFlow v1.5.25 — Manual Update Guide

## লক্ষ্য

Existing P2PFlow installation-কে application `1.5.25`, database schema `35`-এ update করা। এই release transaction-specific charge/commission, role-independent Agent-type wallet, instant Payment Account filters এবং Binance-account-scoped order/message notification যোগ করে।

## ১. Backup

Update-এর আগে backup নিন:

- production database;
- `.env`;
- `.p2pflow/`;
- `shared/`;
- reverse-proxy/systemd/hosting config;
- current application/previous Unified ZIP।

Persistent data application ZIP দিয়ে overwrite করবেন না।

## ২. Files replace

`P2PFlow_v1.5.25_UNIFIED.zip` temporary directory-তে extract করে application files replace করুন। Preserve করুন:

```text
.env
.p2pflow/
shared/
external database data
releases/
runtime logs
```

## ৩. Dependencies, build ও test

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

কোনো command fail হলে public traffic চালু করবেন না।

## ৪. Restart ও migration

Systemd উদাহরণ:

```bash
sudo systemctl restart p2pflow
sudo systemctl status p2pflow --no-pager
```

Startup logs/Health Check-এ schema `35` এবং কোনো migration error নেই নিশ্চিত করুন। Migration existing schema-34 single rule দুই relevant rule-এ copy করে; historical ledger/split data পরিবর্তন করে না।

## ৫. Browser/CDN cache

- Browser hard refresh করুন।
- পুরোনো tab বন্ধ করে নতুন tab খুলুন।
- CDN/reverse-proxy static cache purge করুন।
- DevTools Network-এ `app.js?v=1.5.25` এবং page modules `?v=1.5.25` load হচ্ছে দেখুন।

## ৬. Personal/Merchant charge smoke test

একটি test Personal account-এ:

```text
Send Money Charge: Fixed 5 BDT
Cash Out Charge: Fixed 12 BDT
```

তারপর:

- Send Money `1,000` → principal 1,000 + charge 5 debit হওয়া উচিত।
- Cash Out `1,000` → principal 1,000 + charge 12 debit হওয়া উচিত।
- Receive Money/Bill Pay/Payment/Mobile Recharge → automatic charge `0` হওয়া উচিত।

Merchant account-এও একই independent-rule behaviour যাচাই করুন।

## ৭. Agent account smoke test

Admin/Manager-owned test Payment Account তৈরি করে `Account Type = Agent` দিন। Save হওয়া উচিত; owner-এর Agent login role প্রয়োজন নেই।

Agent form-এ শুধু:

```text
Received Money Commission
Cash In Commission
```

দেখা উচিত। Personal/Merchant charge controls দেখানো যাবে না।

উদাহরণ:

```text
Received Money Commission: 2%
Cash In Commission: 3%
```

- Received Money `1,000` → principal +1,000, commission +20।
- Cash In `500` → principal -500, commission +15; net -485।
- Agent account-এ Send Money/Cash Out/Bill Pay/Payment/Mobile Recharge submit block হওয়া উচিত।

## ৮. Payment Account search/filter smoke test

- Search box-এ account number-এর কয়েকটি digit লিখুন; Search button ছাড়াই row সঙ্গে সঙ্গে filter হওয়া উচিত।
- Label লিখে search করুন।
- Serial লিখে search করুন।
- Account Type filter দিয়ে Personal/Merchant/Agent আলাদা করুন।
- Label filter ব্যবহার করুন।
- Payment Method filter ব্যবহার করুন।
- Permission সীমিত Agent দিয়ে test করুন; তার scope-এর বাইরের account কোনো search/filter result-এ আসা যাবে না।

## ৯. Compact actions

Desktop ও mobile-এ Add/Bulk/Refresh/Edit/Delete/Statement/Manual Transaction এবং multi-select actions icon button হিসেবে ঠিকভাবে clickable কিনা পরীক্ষা করুন। Tooltip/title accessibility বজায় আছে কিনা দেখুন।

## ১০. Notification account scope

একই bonded test device-এ Notifications ON করুন। দুইটি Binance account A এবং B থাকলে:

### Orders → Account A selected

1. Orders page-এ Account A select করুন।
2. Account A-তে controlled নতুন order/message তৈরি করুন।
3. Account B-তে controlled নতুন order/message তৈরি করুন।

Expected:

- A-এর notification/sound আসবে।
- B-এর notification/sound আসবে না।
- UI data permission অনুযায়ী sync হতে পারে; restrictionটি notification/sound scope-এর জন্য।

### Ads → Account B selected

Ads page-এ B select করলে current device notification scope B হওয়া উচিত। এরপর A suppressed এবং B audible/notified হওয়া উচিত।

### All selected

Orders বা Ads-এ `All` select করুন। A এবং B উভয়ের order/message notification/sound আসা উচিত।

### Background Push

Supported browser/device-এ tab background/closed বা mobile locked করে একই A/B/All test পুনরায় করুন। Scope current bonded-device Push subscription-এ persist হওয়া উচিত। OS/Browser notification permission, silent/Focus mode এবং platform restrictions actual lock-screen sound নিয়ন্ত্রণ করতে পারে।

### Notifications OFF

P2P Message page থেকে Notifications OFF করুন। এরপর A/B/All যাই selected থাকুক automatic P2PFlow sound এবং browser/background Push আসা যাবে না।

## ১১. Core regression

- Login/secret code/trusted-device session;
- Orders account buttons এবং fast load;
- Ads দুই-account update/publish isolation;
- P2P chat incremental message update;
- Work Status visibility;
- Payment Account add/edit/bulk/delete;
- Offline Business reservations;
- accounting reconciliation;
- database backup/encryption;
- signed update/rollback।

সব smoke test pass হওয়ার পরে public traffic চালু করুন।
