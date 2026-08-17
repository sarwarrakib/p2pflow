# P2PFlow v1.5.17 Manual Update Guide

এই guide existing P2PFlow installation-কে v1.5.17-এ update করার জন্য। একই unified ZIP fresh install, manual update এবং repository source update-এ ব্যবহার করা যায়। Application code replace হবে; production `.env`, `.p2pflow`, `shared`, database এবং runtime release data overwrite করবেন না।

## Version and compatibility

- Target application version: `1.5.17`
- Target database schema: `31`
- Migration type: additive Agent Order Acceptance metadata
- Minimum Node.js: `20`
- Persistent data source: MariaDB/MySQL/PostgreSQL encrypted database

## 1. Maintenance preparation

1. Maintenance window ঘোষণা করুন এবং active order/Ad/payment-account mutation শেষ করুন।
2. Current application version, database revision এবং `/ready` output সংরক্ষণ করুন।
3. Database full backup এবং P2PFlow automatic encrypted backup নিন।
4. Permanent application key এবং `.env`-এর secure backup আছে নিশ্চিত করুন।
5. Current code/release pointer rollback-এর জন্য সংরক্ষণ করুন।

## 2. Verify package

```bash
mkdir -p /tmp/p2pflow-1.5.17
cd /tmp/p2pflow-1.5.17
sha256sum -c P2PFlow_v1.5.17_SHA256.txt
unzip -q P2PFlow_v1.5.17_UNIFIED.zip -d source
```

SHA mismatch হলে update বন্ধ করুন।

## 3. Stop service

```bash
sudo systemctl stop p2pflow
```

Service পুরোপুরি বন্ধ এবং active database write নেই নিশ্চিত করুন।

## 4. Replace application files safely

Recommended পদ্ধতি হলো নতুন release directory তৈরি করে atomic/current pointer switch করা। Package থেকে নিচের persistent path replace করবেন না:

- `.env` বা `.env.local`
- `.p2pflow/`
- `shared/`
- `releases/`
- database files/dumps
- master/private keys
- setup code/runtime markers

Example:

```bash
sudo mkdir -p /opt/p2pflow/releases/1.5.17
sudo rsync -a --delete /tmp/p2pflow-1.5.17/source/ /opt/p2pflow/releases/1.5.17/
sudo chown -R p2pflow:p2pflow /opt/p2pflow/releases/1.5.17
```

Persistent root-এর উপর blind `rsync --delete` চালাবেন না।

## 5. Install and verify dependencies

Release directory-এ:

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
npm audit --omit=dev --audit-level=high
```

কোনো command fail করলে service start করবেন না।

## 6. Run production preflight

```bash
npm run preflight:production -- --root /opt/p2pflow --env /opt/p2pflow/shared/.env
```

বিশেষভাবে যাচাই করুন:

- `NODE_ENV=production`
- `P2PFLOW_PRODUCTION_STRICT=true`
- HTTPS public base URL
- exact allowed host
- safe trusted proxy
- database driver/connection
- permanent application key
- SMTP configuration
- secure cookie behavior

## 7. Start service and migration

```bash
sudo systemctl start p2pflow
sudo systemctl status p2pflow --no-pager
```

তারপর:

- `/ready` HTTP 200
- application version `1.5.17`
- schema `31`
- database revision incremented
- startup/migration error নেই

নিশ্চিত করুন। Migration additive; existing `allowNewOrders` value Order Acceptance state হিসেবে থাকবে।

## 8. Browser and asset refresh

এই release-এ `public/app.js`, Orders, Users, Payment Accounts এবং CSS পরিবর্তিত হয়েছে।

1. Browser hard refresh করুন।
2. Reverse proxy/CDN asset cache purge করুন।
3. Service worker/custom cache থাকলে old `1.5.16` assets সরান।
4. Browser console-এ failed asset বা JavaScript error নেই নিশ্চিত করুন।

## 9. Payment Account permission verification

একটি test Agent user ব্যবহার করুন।

### শুধু View

1. `accounts.view` দিন।
2. Agent login করুন।
3. Payment Accounts page খুলতে পারে নিশ্চিত করুন।
4. শুধু assigned accounts দেখায় এবং Add/Edit/Offline Txn action নেই নিশ্চিত করুন।

### Add/Edit

1. `accounts.manage` দিন; আলাদা `accounts.view` না দিলেও page দেখা উচিত।
2. Agent login করে `Add Account`, `Bulk Add` এবং `Edit / Access` দেখতে পায় নিশ্চিত করুন।
3. Test payment account create ও edit করুন।
4. Owner, type, status ও allowed Agent access save হচ্ছে নিশ্চিত করুন।
5. Permission সরানোর পর action button disappear এবং direct API mutation 403 হয় নিশ্চিত করুন।

### Offline transaction

1. `ledger.adjust` দিন।
2. `Offline Txn` action এবং Account Statement page দেখা যায় নিশ্চিত করুন।
3. Test top-up/correction চালিয়ে before/after balance ও audit entry যাচাই করুন।
4. `accounts.use` আলাদাভাবে order split-এ assigned account ব্যবহারের scope নিয়ন্ত্রণ করছে নিশ্চিত করুন।

## 10. Permission hover verification

Users → Add/Edit User এবং User Roles—দুই জায়গায় পরীক্ষা করুন।

- প্রতিটি global permission row-এর label/empty area hover করলে পূর্ণ scope tooltip আসে।
- `?` control mouse click, keyboard Tab/Enter এবং touch-এ কাজ করে।
- Tooltip modal edge/scroll container-এ কাটা পড়ে না।
- English/Bangla language switch করলে description ভাষা বদলায়।
- প্রতিটি Binance account permission matrix-এও একই help দেখা যায়।
- Checkbox click tooltip-এর কারণে block হয় না।

## 11. Order Acceptance verification

একটি enabled Agent user-এর global `orders.view`, প্রয়োজনীয় exact Binance account `orders.view` এবং matching routing rule প্রস্তুত করুন।

### OFF behavior

1. Agent Orders page খুলুন।
2. `অর্ডার গ্রহণ: বন্ধ` করুন।
3. Agent online থাকা অবস্থায় controlled new order create/sync করুন।
4. Order ওই Agent-কে auto-assign না হয়ে অন্য eligible Agent বা Manager Queue-তে যায় নিশ্চিত করুন।
5. Manager manual assign চেষ্টা করলে OFF Agent rejected হয় নিশ্চিত করুন।

### Prompt behavior

1. Agent OFF রেখে logout/login বা browser refresh করুন।
2. Orders list খুলুন।
3. `স্যার, আপনি কি অর্ডার গ্রহণ করতে চান?` popup আসে নিশ্চিত করুন।
4. `না` দিলে OFF থাকে।
5. নতুন session-এ `হ্যাঁ` দিলে ON হয় এবং button update হয় নিশ্চিত করুন।

### Offline ON behavior

1. Agent Order Acceptance ON করুন।
2. Agent logout করুন বা presence offline হওয়া পর্যন্ত অপেক্ষা করুন।
3. Controlled test order create/sync করুন।
4. Routing, capacity এবং exact account permission match করলে offline Agent candidate/assignee হয় নিশ্চিত করুন।
5. Assigned notification/SMS/email policy অনুযায়ী পৌঁছায় নিশ্চিত করুন।

Order Acceptance routing rule, exact account permission, payment method, amount range বা capacity guard bypass করে না।

## 12. Existing multi-account regression

- Orders/Ads-এ `All` ও P2P username account buttons ঠিক আছে।
- Orders `Source`-এ P2P username/Local দেখা যায়; আলাদা Binance Account column নেই।
- Account-A-only user Account B দেখতে বা action চালাতে পারে না।
- Ads `All` Business/Online/Break action শুধু `ads.manage` granted account-এ চলে।
- Add User + Login modal, Security Question এবং per-account matrix কাজ করে।
- Individual-only profit company total/capital-এ যোগ হয় না।

## 13. Controlled Binance verification

প্রথমে read-only operation চালান:

1. প্রতিটি account-এর P2P Profile sync।
2. প্রতিটি account-এর Ads list sync।
3. প্রতিটি account-এর Orders sync।
4. Cross-account visibility ও permission যাচাই।

তারপর low-risk controlled Ad/order/chat test চালান। Production capital বা বড় active Ad দিয়ে প্রথম test করবেন না।

## 14. Rollback

নিচের যেকোনোটি হলে rollback করুন:

- migration/startup failure
- Owner login failure
- Agent payment-account permission leakage বা action failure
- Order Acceptance OFF থাকা Agent-কে নতুন assignment
- ON/offline Agent routing-eligible হওয়া সত্ত্বেও unexplained assignment failure
- cross-account data/action leakage
- accounting reconciliation mismatch

Rollback steps:

1. `sudo systemctl stop p2pflow`
2. Previous release pointer/application files restore করুন।
3. প্রয়োজন হলে update-এর আগে নেওয়া database backup restore করুন।
4. `sudo systemctl start p2pflow`
5. `/ready`, owner login, orders, payment accounts, ledger এবং accounting যাচাই করুন।

Schema migration additive হওয়ায় previous release সাধারণত newer fields ignore/preserve করতে পারে, তবু production rollback-এর আগে staging drill বাধ্যতামূলক।
