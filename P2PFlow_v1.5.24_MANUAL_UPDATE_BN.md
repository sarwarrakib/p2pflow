# P2PFlow v1.5.24 — Manual Update Guide

## লক্ষ্য

Existing P2PFlow installation-কে application version `1.5.24`, database schema `34`-এ update করা। এই release Payment Account delete/bulk management, manual transaction fee এবং Agent incoming/outgoing commission accounting যোগ করে।

## ১. Update-এর আগে বাধ্যতামূলক backup

Backup নিন:

- production database;
- `.env`;
- `.p2pflow/`;
- `shared/`;
- reverse-proxy/systemd/hosting configuration;
- বর্তমান application directory অথবা previous Unified ZIP।

Database backup অন্য host/database-এ restore করে readable কিনা যাচাই করা উত্তম। Application ZIP দিয়ে persistent data overwrite করবেন না।

## ২. Maintenance window

Payment Account, order split, Offline Business receipt ও manual ledger write সাময়িকভাবে বন্ধ করুন। Active operatorদের save শেষ করতে দিন। সম্ভব হলে public traffic maintenance mode-এ নিন।

## ৩. Files replace

`P2PFlow_v1.5.24_UNIFIED.zip` temporary directory-তে extract করুন। Existing application root-এ application files copy/overwrite করুন। Preserve করুন:

```text
.env
.p2pflow/
shared/
external database data
releases/
runtime logs
```

ZIP-এর মধ্যে production secret বা database থাকার কথা নয়।

## ৪. Production dependencies

Node.js 20+ ব্যবহার করুন:

```bash
npm ci --omit=dev --ignore-scripts
```

Lockfile পরিবর্তন করে এমন unreviewed `npm install` ব্যবহার করবেন না।

## ৫. Build ও test

```bash
npm run build
npm test
```

Production preflight configured থাকলে:

```bash
npm run preflight:production
```

কোনো command fail হলে service restart বা public traffic চালু করবেন না।

## ৬. Service restart ও migration

Systemd উদাহরণ:

```bash
sudo systemctl restart p2pflow
sudo systemctl status p2pflow --no-pager
```

Hosting panel হলে configured Node application restart action ব্যবহার করুন। Startup-এর সময় schema `34` additive migration চলবে। Health Check ও logs-এ startup/migration error নেই নিশ্চিত করুন।

## ৭. Browser/CDN cache

- Browser hard refresh করুন।
- পুরোনো tab বন্ধ করে নতুন tab খুলুন।
- CDN/reverse-proxy static cache purge করুন।
- DevTools Network-এ `app.js?v=1.5.24` এবং page modules `?v=1.5.24` load হচ্ছে নিশ্চিত করুন।

## ৮. Permission smoke test

### Admin/Manager

- সব Payment Account দেখা যাচ্ছে;
- checkbox, Edit Selected ও Delete Selected দেখা যাচ্ছে;
- Account User/Agent access bulk edit করা যাচ্ছে।

### Agent

- শুধু নিজের/অনুমোদিত account দেখা যাচ্ছে;
- নিজের owned account-এ `accounts.manage` থাকলে Edit/Delete দেখা যাচ্ছে;
- অন্য user-এর account bulk selection-এ আসছে না;
- `ledger.adjust` ছাড়া Manual Transaction করা যাচ্ছে না।

## ৯. Safe Delete test

Non-production test account ব্যবহার করুন।

### Test A — zero balance

1. Balance `0` এমন account নির্বাচন করুন।
2. কোনো pending order split/Offline Business reservation নেই নিশ্চিত করুন।
3. Delete করুন।

Expected:

- active list থেকে account সরবে;
- success notification আসবে;
- historical ledger row database/audit-এ থাকবে।

### Test B — non-zero balance

Balance আছে এমন account delete করুন।

Expected: delete block হবে এবং current balance দেখাবে।

### Test C — pending reservation

Pending order split অথবা Offline Business allocation থাকা account delete করুন।

Expected: delete block হবে এবং pending reference দেখাবে।

## ১০. Bulk Edit test

1. একই scope-এর অন্তত দুইটি test account select করুন।
2. **Edit Selected** খুলুন।
3. শুধু Label বা Status checkbox enable করুন।
4. Update করুন।

Expected: নির্বাচিত accountগুলো update হবে; unchecked field অপরিবর্তিত থাকবে।

### Atomic failure test

Serial sequence এমন দিন যাতে same Payment Method + same normalized Label-এর মধ্যে conflict হয়।

Expected:

- exact account error আসবে;
- কোনো selected account update হবে না।

## ১১. Bulk Delete test

1. দুইটি zero-balance, unreserved test account select করুন।
2. Delete Selected করুন।

Expected: দুটোই list থেকে সরবে।

তারপর একটি zero-balance এবং একটি non-zero account একসঙ্গে select করে delete করুন।

Expected: পুরো batch block হবে; zero-balance accountটিও delete হবে না।

## ১২. Personal account fee test

Account rule উদাহরণ:

```text
Type: Personal
Rule: Fixed
Fixed amount: 5 BDT
```

Test করুন:

- Send Money 1,000 → main debit 1,000 + fee debit 5;
- Cash Out 1,000 → main debit 1,000 + fee debit 5;
- Receive Money 1,000 → credit 1,000, fee 0;
- Bill Pay 100 → debit 100, fee 0;
- Payment 100 → debit 100, fee 0;
- Mobile Recharge 100 → debit 100, fee 0।

Statement-এ main movement ও fee আলাদা row হিসেবে আসবে।

## ১৩. Merchant account fee test

Merchant account-এ Personal-এর একই test চালান। Send Money ও Cash Out ছাড়া অন্য type-এ fee হওয়া যাবে না।

## ১৪. Agent commission test

Agent-owned account ব্যবহার করুন। Account owner অবশ্যই linked Agent user হতে হবে। Rule উদাহরণ:

```text
Type: Agent
Rule: Percentage
Percentage: 2%
```

### Incoming

Receive Money `1,000` করুন। Expected:

```text
Main credit: 1,000
Commission credit: 20
Net increase: 1,020
```

### Outgoing

Send Money `500` করুন। Expected:

```text
Main debit: 500
Commission credit: 10
Net decrease: 490
```

Accounting → Business Income-এ commission **Automatic** হিসেবে দেখা যাবে এবং আলাদা delete button থাকবে না।

## ১৫. Manual actual charge/commission test

Rule `Manual actual amount` করুন। Applicable transaction submit করার সময় Charge/Commission box ফাঁকা রাখুন।

Expected: validation block হবে।

তারপর actual amount লিখে submit করুন। Expected: supplied amountই ledger ও accounting-এ record হবে।

## ১৬. Order payment split regression

Controlled offline/test order ব্যবহার করুন:

- Personal/Merchant split-এ charge deduction;
- Agent receive split-এ commission credit;
- Agent send split-এ commission credit;
- actual amount কমালে commission reversal;
- insufficient outgoing balance block;
- account permissions ও reservation unchanged।

## ১৭. Individual-only Agent profit

Agent editor-এ **Include this user's profit in company income and capital totals** OFF করুন। একটি Agent commission transaction দিন।

Expected:

- Agent individual income-এ commission দেখা যাবে;
- all-user profit report-এ দৃশ্যমান থাকবে;
- company-counted income/recognized asset-এ যোগ হবে না।

Setting পুনরায় ON করলে নতুন/প্রযোজ্য totals company scope-এ গণনা হবে।

## ১৮. Core regression

- Login ও trusted-device session স্থিতিশীল।
- Security page কাজ করে।
- Orders ও Ads account scope ঠিক।
- P2P chat incremental update করে।
- Notifications ON/OFF behavior ঠিক।
- Offline Business reservation ঠিক।
- Accounting totals এবং ledger balances reconcile করে।
- System Update ও rollback health ঠিক।

## ১৯. Rollback

Code rollback প্রয়োজন হলে:

1. Service stop করুন।
2. Previous application files restore করুন।
3. Database backup restore করার আগে migration compatibility review করুন। Schema `34` additive; previous code unknown fields সাধারণত preserve করলেও Agent commission ledger/accounting entries পুরোনো UI বুঝবে না।
4. Safest rollback হলো code ও pre-update database backup একসঙ্গে restore করা।
5. Service start করে Login, Payment Accounts, Ledger, Orders, Ads, Chat ও Accounting smoke test করুন।
