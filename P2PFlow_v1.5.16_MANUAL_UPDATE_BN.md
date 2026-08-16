# P2PFlow v1.5.16 Manual Update Guide

এই guide existing P2PFlow installation-কে v1.5.16-এ update করার জন্য। একই unified ZIP fresh install, manual update এবং repository source update-এ ব্যবহার করা যায়। Application code replace হবে; production `.env`, `.p2pflow`, `shared`, database এবং runtime release data overwrite করা যাবে না।

## Version and compatibility

- Target application version: `1.5.16`
- Target database schema: `30`
- Database migration: নতুন schema migration নেই
- Minimum Node.js: `20`
- Persistent data source: MariaDB/MySQL/PostgreSQL encrypted database

## 1. Maintenance preparation

1. Maintenance window ঘোষণা করুন এবং active order/Ad mutation শেষ করুন।
2. Current application version, database revision এবং `/ready` output সংরক্ষণ করুন।
3. Database full backup এবং P2PFlow automatic encrypted backup নিন।
4. Permanent application key এবং `.env`-এর secure backup আছে নিশ্চিত করুন।
5. Current code/release pointer rollback-এর জন্য সংরক্ষণ করুন।

## 2. Verify package

```bash
mkdir -p /tmp/p2pflow-1.5.16
cd /tmp/p2pflow-1.5.16
sha256sum -c P2PFlow_v1.5.16_SHA256.txt
unzip -q P2PFlow_v1.5.16_UNIFIED.zip -d source
```

SHA mismatch হলে update বন্ধ করুন।

## 3. Stop service

```bash
sudo systemctl stop p2pflow
```

Service পুরোপুরি বন্ধ এবং active database write নেই নিশ্চিত করুন।

## 4. Replace application files safely

Recommended পদ্ধতি হলো নতুন release directory তৈরি করে atomic/current pointer switch করা। কোনো অবস্থায় package থেকে নিচের persistent path replace করবেন না:

- `.env` বা `.env.local`
- `.p2pflow/`
- `shared/`
- `releases/`
- database files/dumps
- master/private keys
- setup code/runtime markers

Example:

```bash
sudo mkdir -p /opt/p2pflow/releases/1.5.16
sudo rsync -a --delete /tmp/p2pflow-1.5.16/source/ /opt/p2pflow/releases/1.5.16/
sudo chown -R p2pflow:p2pflow /opt/p2pflow/releases/1.5.16
```

আপনার installation root mirror/current pointer ব্যবহার করলে existing documented release-switch process অনুসরণ করুন। Persistent root-এর উপর blind `rsync --delete` চালাবেন না।

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

## 7. Start service

```bash
sudo systemctl start p2pflow
sudo systemctl status p2pflow --no-pager
```

তারপর `/ready` HTTP 200, application version `1.5.16` এবং schema `30` যাচাই করুন।

## 8. Browser cache refresh

এই release-এ `public/app.js`, Orders, Ads, Users এবং CSS পরিবর্তিত হয়েছে। Deployment-এর পরে:

1. Browser hard refresh করুন।
2. Reverse proxy/CDN asset cache purge করুন।
3. Service worker/custom cache থাকলে old `1.5.15` assets সরান।
4. Browser console-এ failed asset বা JavaScript error নেই নিশ্চিত করুন।

## 9. P2P username প্রস্তুত করুন

Orders ও Ads account button synced Binance P2P username ব্যবহার করে। Upgrade-এর পরে configured API account name দেখা গেলে:

1. **P2P Profile** খুলুন।
2. প্রতিটি Binance account আলাদাভাবে নির্বাচন করুন।
3. Profile Sync চালান।
4. Orders ও Ads page hard refresh করুন।
5. Button-এ account-এর P2P username এসেছে নিশ্চিত করুন।

Username না পাওয়া গেলে configured account name নিরাপদ fallback হিসেবে থাকবে; permission behavior পরিবর্তিত হবে না।

## 10. Required UI verification

### Users

- `Users & Permissions` খুলুন।
- `Add User + Login` click করুন।
- Modal খোলে, default Agent role selected হয় এবং account permission matrix render হয় নিশ্চিত করুন।
- একটি test user create/edit করে login ও assigned permission যাচাই করুন।

### Orders

- `All` click করলে permitted সব account-এর order আসে।
- প্রতিটি P2P username button click করলে শুধু সেই account-এর order আসে।
- আলাদা `Binance Account` column নেই নিশ্চিত করুন।
- `Source`-এ P2P username বা `Local` দেখা যায় নিশ্চিত করুন।
- Account-A-only user Account B দেখতে বা action চালাতে পারে না নিশ্চিত করুন।

### Ads

- `All` click করলে permitted সব account-এর Ads আসে।
- Account button click করলে exact account filter হয়।
- Business, Online ও Break control `All` view-তে দৃশ্যমান থাকে।
- Read-only user-এর controls disabled থাকে।
- `ads.manage` থাকা accountগুলোই All batch target হয়।
- Create এবং manual Sync-এর আগে exact account নির্বাচন করতে হয় নিশ্চিত করুন।

## 11. Controlled Binance verification

প্রথমে read-only operation চালান:

1. প্রতিটি account-এর P2P Profile sync।
2. প্রতিটি account-এর Ads list sync।
3. প্রতিটি account-এর Orders sync।
4. Cross-account visibility ও permission যাচাই।

তারপর low-risk controlled test:

1. নির্দিষ্ট account selected রেখে Business/Online/Break action।
2. `All` view থেকে একটি reversible merchant control action শুধু intended `ads.manage` accountগুলোতে চলছে কিনা পরীক্ষা।
3. একটি ছোট test Ad create/update/offline/online।
4. একটি test order-এর detail/chat flow।

Break active থাকলে Business/Online পরিবর্তনের আগে Break বন্ধ করুন। Production capital বা বড় active Ad দিয়ে প্রথম test করবেন না।

## 12. Rollback

নিচের যেকোনোটি হলে rollback করুন:

- Preflight/startup failure
- Owner login failure
- `Add User + Login` modal error
- Cross-account data/permission leakage
- Ads/order wrong credential action
- Accounting reconciliation mismatch

Rollback steps:

1. `sudo systemctl stop p2pflow`
2. Previous release pointer/code restore করুন।
3. Database compatibility যাচাই করুন; schema পরিবর্তন না হওয়ায় সাধারণ code rollback সম্ভব, তবু failed-state forensic copy রাখুন।
4. Previous exact dependencies restore/install করুন।
5. Service start করুন।
6. `/ready`, login, Users, Orders, Ads ও Accounting verify করুন।

## 13. Fresh install note

Fresh server-এ ZIP application root-এ extract করুন, `npm ci --omit=dev --ignore-scripts`, `npm run build`, `npm test` এবং production preflight চালান। `/setup` সম্পন্ন, domain/TLS/systemd/Nginx configured এবং launch checklist pass হওয়ার আগে public traffic enable করবেন না।
