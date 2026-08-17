# P2PFlow v1.5.18 Manual Update Guide

এই guide existing P2PFlow installation-কে `1.5.18`-এ update করার জন্য। একই unified ZIP fresh install, manual update এবং repository source update-এ ব্যবহার করা যায়। Production `.env`, `.p2pflow`, `shared/`, database, key এবং runtime release data overwrite করবেন না।

## Version and compatibility

- Target application version: `1.5.18`
- Target database schema: `32`
- Migration type: additive Payment Account, Notification Preferences এবং Offline Business data
- Minimum Node.js: `20`
- Persistent data source: MariaDB/MySQL/PostgreSQL encrypted database

## 1. Maintenance preparation

1. Maintenance window ঘোষণা করুন এবং active order, Ads, payment-account ও accounting mutation শেষ করুন।
2. Current `/ready`, application version, database revision এবং active release pointer সংরক্ষণ করুন।
3. Database full backup এবং P2PFlow encrypted backup নিন।
4. Permanent application key ও `.env`-এর secure backup যাচাই করুন।
5. Previous code/release pointer rollback-এর জন্য রাখুন।

## 2. Package verify

```bash
mkdir -p /tmp/p2pflow-1.5.18
cd /tmp/p2pflow-1.5.18
sha256sum -c P2PFlow_v1.5.18_SHA256.txt
unzip -q P2PFlow_v1.5.18_UNIFIED.zip -d source
```

SHA mismatch বা ZIP integrity error হলে update বন্ধ করুন।

## 3. Service stop

```bash
sudo systemctl stop p2pflow
```

Service বন্ধ এবং active database write নেই নিশ্চিত করুন।

## 4. Application files replace

Recommended pattern:

```bash
sudo mkdir -p /opt/p2pflow/releases/1.5.18
sudo rsync -a --delete /tmp/p2pflow-1.5.18/source/ /opt/p2pflow/releases/1.5.18/
sudo chown -R p2pflow:p2pflow /opt/p2pflow/releases/1.5.18
```

নিচের persistent path package source দিয়ে replace করবেন না:

- `.env`, `.env.local`
- `.p2pflow/`
- `shared/`
- `releases/`
- database files/dumps
- master/private key
- setup code ও runtime markers

Persistent application root-এর উপর blind `rsync --delete` চালাবেন না।

## 5. Dependencies, build এবং tests

Release directory-এ:

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
npm audit --omit=dev --audit-level=high
```

কোনো command fail করলে public service start করবেন না।

## 6. Production preflight

```bash
npm run preflight:production -- --root /opt/p2pflow --env /opt/p2pflow/shared/.env
```

বিশেষভাবে যাচাই করুন:

- `NODE_ENV=production`
- `P2PFLOW_PRODUCTION_STRICT=true`
- HTTPS public base URL এবং exact allowed host
- trusted proxy scope
- permanent application key
- database connection/TLS
- SMTP configuration
- secure cookie behavior

## 7. Start এবং migration verify

```bash
sudo systemctl start p2pflow
sudo systemctl status p2pflow --no-pager
```

তারপর নিশ্চিত করুন:

- `/ready` HTTP 200
- application version `1.5.18`
- database schema `32`
- startup/migration error নেই
- existing orders, Ads, users, credentials, payment accounts, ledger ও accounting data উপস্থিত

## 8. Browser assets refresh

এই release-এ `app.js`, Payment Accounts, Notifications, Security, Orders/P2P Information, নতুন Offline Business page এবং CSS পরিবর্তিত হয়েছে।

1. Browser hard refresh করুন।
2. Reverse proxy/CDN asset cache purge করুন।
3. Old `1.5.17` JS/CSS cache সরান।
4. Browser console-এ failed asset/JavaScript error নেই নিশ্চিত করুন।

## 9. Payment Account scope verification

### Admin/Manager

1. Admin এবং Manager দিয়ে login করুন।
2. সব Payment Account দেখা ও edit করা যায় নিশ্চিত করুন।
3. Account User পরিবর্তন এবং Agent access assign/remove পরীক্ষা করুন।

### Agent own-account scope

1. Agent-কে `accounts.manage` দিন।
2. Add Account খুললে Agent নিজে Account User হিসেবে selected আছে নিশ্চিত করুন।
3. Agent নিজের account add/edit করতে পারে নিশ্চিত করুন।
4. অন্য user-এর account ID দিয়ে direct GET/PATCH attempt 403 হয় নিশ্চিত করুন।
5. Owner বা Agent access পরিবর্তনের field Agent-এর জন্য locked/hidden থাকে নিশ্চিত করুন।
6. Agent-এর `Add Account` modal খুলে browser console-এ `ownerSelect.options is not iterable` বা অন্য JavaScript error নেই নিশ্চিত করুন।

### Custom all-account role

1. Non-Agent custom role-এ `accounts.manage_all` দিন।
2. সব account manage এবং Account User/Agent access পরিবর্তন করা যায় নিশ্চিত করুন।
3. Permission সরালে list/search/API আবার scope-limited হয় নিশ্চিত করুন।

## 10. Label, Serial এবং search

1. Payment Account-এ Label ও unique Serial Number save করুন।
2. Number, Label এবং Serial দিয়ে search করুন।
3. Duplicate non-empty Serial Number rejected হয় নিশ্চিত করুন।
4. সীমিত user-এর search result-এ forbidden account আসে না নিশ্চিত করুন।
5. Bulk Add-এ Default Label এবং Starting Serial থেকে sequential serial ঠিক তৈরি হয় নিশ্চিত করুন।

## 11. Permission eye details

Users → Add/Edit User এবং User Roles-এ:

- প্রতিটি permission-এর ডান পাশে eye button আছে।
- Click/Enter/touch-এ পূর্ণ description আসে।
- Global এবং per-Binance-account permission matrix—দুই জায়গায় কাজ করে।
- Outside click, Escape, scroll ও resize-এ tooltip বন্ধ হয়।
- Agent restriction এবং additional permission dependency description-এ সঠিকভাবে লেখা থাকে।

## 12. Security page

1. Admin, Manager, Agent এবং Auditor test user দিয়ে Security page খুলুন।
2. Page blank/crash হয় না নিশ্চিত করুন।
3. Trusted device create/last-used/expiry date render হয়।
4. Current session, password/security recovery controls permission অনুযায়ী কাজ করে।
5. Browser console-এ `formatDate is not defined` বা অন্য error নেই।

## 13. Notification Preferences

1. Notifications page খুলুন।
2. Orders/Messages/Payments ইত্যাদির In App ও Email toggle আলাদাভাবে পরিবর্তন করে Save করুন।
3. Refresh/logout-login-এর পর preference থাকে নিশ্চিত করুন।
4. Disabled category-এর নতুন notification panel/email-এ আসে না নিশ্চিত করুন।
5. Security category disabled করা যায় না এবং security alert আসে নিশ্চিত করুন।
6. Global notification email OFF থাকলে per-user Email ON থেকেও email না যাওয়ার policy যাচাই করুন।

## 14. Manual Feedback link

1. Valid counterparty userNo থাকা Binance order খুলুন।
2. P2P Information → Open Feedback Page click করুন।
3. নতুন tab-এ advertiser page খুলে URL extension task-এর `advertiserUrl`-এর সঙ্গে exact match করে নিশ্চিত করুন।
4. Invalid/non-Binance template URL server setting-এ থাকলে frontend allowlist action block করে নিশ্চিত করুন।
5. Popup blocker scenario-তে warning দেখা যায় নিশ্চিত করুন।

## 15. Offline Business workflow

Controlled test accounts ব্যবহার করুন।

1. Payment accounts-এ Label, Serial, daily/monthly receive limit দিন।
2. Test user-কে `offline.transactions.manage` দিন।
3. Requested amount `1000000`, per-number limit `50000` দিয়ে candidate search করুন।
4. Eligible numbers serial order-এ আসে এবং suggested total হিসাব সঠিক নিশ্চিত করুন।
5. Session create করে selected numbers reserved হয়েছে নিশ্চিত করুন।
6. একই number অন্য active Offline Business session-এ নির্বাচন করা যায় না নিশ্চিত করুন।
7. Reserved number normal order payment split-এ নেওয়া blocked এবং pending normal order split-এর number Offline Business candidate-এ না আসে নিশ্চিত করুন।
8. একটি account-এ full 50,000 এবং অন্যটিতে কম amount Received করুন।
9. Ledger/balance increase এবং total received সঠিক নিশ্চিত করুন।
10. Full requested amount হলে full finalize করুন।
11. অন্য session-এ partial amount নিয়ে explicit partial finalize করুন; order amount শুধু received total হয় নিশ্চিত করুন।
12. Finalized order-এর payment splits ও linked ledger entries reconcile করুন।
13. Zero-received session cancel করলে reservation release হয় নিশ্চিত করুন।

## 16. Rollback

Critical failure হলে:

1. Service stop করুন।
2. Previous code pointer/release restore করুন।
3. প্রয়োজন হলে pre-update database backup restore করুন।
4. Service start করে `/ready`, login, orders এবং accounting verify করুন।
5. Failed release public traffic-এ পুনরায় enable করবেন না।
