# P2PFlow v1.5.23 — Manual Update Guide

## লক্ষ্য

Existing P2PFlow installation-কে application version `1.5.23`, database schema `33`-এ update করা। এই hotfix Payment Account Bulk Add-এর false Serial conflict সংশোধন করে। Database migration প্রয়োজন নেই।

## ১. Update-এর আগে backup

Backup নিন:

- production database;
- `.env`;
- `.p2pflow/`;
- `shared/`;
- reverse-proxy/systemd/hosting configuration;
- previous application directory অথবা previous Unified ZIP।

Application ZIP দিয়ে persistent data overwrite করবেন না।

## ২. Files replace

`P2PFlow_v1.5.23_UNIFIED.zip` temporary directory-তে extract করুন। Existing application root-এ application files copy/overwrite করুন। Preserve করুন:

```text
.env
.p2pflow/
shared/
database/external database data
releases/
runtime logs
```

## ৩. Production dependencies

Node.js 20+ ব্যবহার করুন:

```bash
npm ci --omit=dev --ignore-scripts
```

Lockfile পরিবর্তন করে এমন `npm install` ব্যবহার করবেন না।

## ৪. Build ও test

```bash
npm run build
npm test
```

Production preflight configured থাকলে:

```bash
npm run preflight:production
```

কোনো command fail হলে service restart বা public traffic চালু করবেন না।

## ৫. Service restart

Systemd উদাহরণ:

```bash
sudo systemctl restart p2pflow
sudo systemctl status p2pflow --no-pager
```

Hosting panel হলে configured Node application restart action ব্যবহার করুন।

## ৬. Browser/CDN cache

- Browser hard refresh করুন।
- পুরোনো tab বন্ধ করে নতুন tab খুলুন।
- CDN/reverse-proxy static cache purge করুন।
- DevTools Network-এ `app.js?v=1.5.23` load হচ্ছে নিশ্চিত করুন।

## ৭. যে errorটি হয়েছিল সেটি পুনরায় পরীক্ষা

Payment Accounts → Bulk Add খুলুন। Test data হিসেবে একটি non-production method/number range ব্যবহার করুন।

### Test A — legacy no-Label বনাম named Label

ধরা যাক existing account:

```text
Method: Nagad
Label:  blank
Serial: 03
```

নতুন row:

```text
Method: Nagad
Label:  Mobile A
Serial: 03
```

Expected: Save হবে। Existing no-Label record named Label-কে block করবে না।

### Test B — different named Labels

```text
Nagad + Mobile A + 04
Nagad + Mobile B + 04
```

Expected: দুইটিই Save হবে।

### Test C — same normalized Label

```text
Nagad + Mobile A + 05
Nagad + mobile   a + 05
```

Expected: Save হবে না। Preview দুই row highlight করবে এবং exact duplicate row দেখাবে।

### Test D — no-Label scope

```text
Nagad + blank + 06
Nagad + blank + 06
```

Expected: দ্বিতীয় row conflict হবে।

### Test E — different Payment Method

```text
Nagad + Mobile A + 07
bKash + Mobile A + 07
```

Expected: দুইটিই Save হবে।

## ৮. আপনার Bulk Add পুনরায় চালানো

1. Payment Method হিসেবে `Nagad` নির্বাচন করুন।
2. Account Numbers paste করুন।
3. প্রতিটি preview row-এর Label ও Serial যাচাই করুন।
4. Default Label/Starting Serial ব্যবহার করলে **Apply Defaults** চাপুন।
5. Preview-তে লাল warning না থাকলে Add Accounts চাপুন।
6. Server conflict থাকলে message এখন exact Serial, Label/no-Label scope এবং conflict source দেখাবে।

একটি সত্যিকারের conflict থাকলে Bulk Add এখনও atomic থাকবে—কোনো row তৈরি হবে না। Conflict row ঠিক করে পুরো batch পুনরায় submit করুন।

## ৯. Regression verification

- Single Add Payment Account কাজ করে।
- Edit করার সময় account নিজেকে duplicate হিসেবে ধরে না।
- Payment Account search Label/Serial অনুযায়ী কাজ করে।
- Agent শুধু নিজের permitted account দেখে।
- Admin/Manager সব account access rule অক্ষত।
- Offline Business candidate list ও reservation অক্ষত।
- Ledger balance পরিবর্তিত হয়নি।
- Orders, Ads, Chat, Work Status ও Notifications regression নেই।

## ১০. Rollback

Code rollback প্রয়োজন হলে:

1. Service stop করুন।
2. Previous application files restore করুন।
3. Database schema অপরিবর্তিত (`33`), তাই migration rollback প্রয়োজন নেই।
4. Service start করুন।
5. Login, Payment Accounts, Orders, Ads ও Chat smoke test করুন।

Rollback করলে v1.5.22-এর stricter no-Label method-wide behavior আবার ফিরে আসবে।
