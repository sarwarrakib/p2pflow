# P2PFlow v1.5.15 Manual Update Guide

এই guide existing P2PFlow installation-কে v1.5.15-এ update করার জন্য। একই unified ZIP fresh install, manual update এবং repository source update-এ ব্যবহার করা যায়। Application code replace হবে; production `.env`, `.p2pflow`, `shared`, database এবং runtime releases overwrite করা যাবে না।

## Version and compatibility

- Target application version: `1.5.15`
- Target database schema: `30`
- Minimum Node.js: `20`
- Persistent data source: MariaDB/MySQL/PostgreSQL encrypted database

## 1. Maintenance preparation

1. Maintenance window ঘোষণা করুন এবং active order/Ad mutation শেষ করুন।
2. Current application version, database revision এবং `/ready` output সংরক্ষণ করুন।
3. Database full backup এবং P2PFlow automatic encrypted backup নিন।
4. Permanent application key এবং `.env`-এর secure backup আছে নিশ্চিত করুন।
5. Current code directory বা release pointer rollback-এর জন্য সংরক্ষণ করুন।

## 2. Verify package

```bash
mkdir -p /tmp/p2pflow-1.5.15
cd /tmp/p2pflow-1.5.15
sha256sum -c P2PFlow_v1.5.15_SHA256.txt
unzip -q P2PFlow_v1.5.15_UNIFIED.zip -d source
```

SHA mismatch হলে update বন্ধ করুন।

## 3. Stop service

```bash
sudo systemctl stop p2pflow
```

Service পুরোপুরি বন্ধ এবং active database write নেই নিশ্চিত করুন।

## 4. Replace application files safely

Recommended পদ্ধতি হলো release directory তৈরি করে atomic/current pointer switch করা। In-place overwrite করলে persistent paths বাদ দিন। কোনো অবস্থায় package থেকে নিচের path copy করবেন না:

- `.env` বা `.env.local`
- `.p2pflow/`
- `shared/`
- `releases/`
- database files/dumps
- master/private keys
- setup code/runtime markers

Example release directory:

```bash
sudo mkdir -p /opt/p2pflow/releases/1.5.15
sudo rsync -a --delete /tmp/p2pflow-1.5.15/source/ /opt/p2pflow/releases/1.5.15/
sudo chown -R p2pflow:p2pflow /opt/p2pflow/releases/1.5.15
```

আপনার installation যদি root application mirror/pointer ব্যবহার করে, existing documented switch process অনুসরণ করুন। Blind `rsync --delete` দিয়ে `/opt/p2pflow/shared` বা persistent root মুছবেন না।

## 5. Install exact dependencies

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

## 7. Deployment template changes

v1.5.15-এ systemd template-এর entrypoint `server.js`। Existing unit-এ stale `launcher.js` থাকলে update করুন। Production doctor path `/opt/p2pflow/scripts/production-doctor.js` হওয়া উচিত। `MemoryDenyWriteExecute=true` ব্যবহার করবেন না, কারণ Node.js/V8 JIT-এর সঙ্গে এটি অসামঞ্জস্যপূর্ণ হতে পারে।

Node path যাচাই:

```bash
command -v node
```

Template-এর `/usr/bin/node` host-এর actual absolute path-এর সঙ্গে না মিললে unit file update করুন। তারপর:

```bash
sudo systemd-analyze verify /etc/systemd/system/p2pflow.service
sudo nginx -t
sudo systemctl daemon-reload
```

## 8. Start and verify

```bash
sudo systemctl start p2pflow
sudo systemctl status p2pflow --no-pager
```

তারপর যাচাই করুন:

1. `/ready` HTTP 200 এবং version `1.5.15`।
2. Database schema expected `30` বা forward-compatible newer schema।
3. Owner login, trusted device ও recovery।
4. Users/RBAC এবং account-specific Binance access।
5. Ads list/order list read-only sync।
6. Accounting totals ও individual-only profit।
7. SMTP test এবং health diagnostics।
8. Browser hard refresh; old v1.5.14 asset cache নেই।

## 9. Controlled Binance verification

প্রথমে read-only operation চালান। এরপর ছোট test Ad/order context-এ explicit mutation test করুন। Page load/GET refresh কোনো Ad status mutation পাঠাচ্ছে না নিশ্চিত করুন। প্রতিটি credential-এর merchant Business/Online/Break state আলাদা আছে যাচাই করুন।

## 10. Rollback

নিচের যেকোনোটি হলে rollback করুন:

- Preflight/startup failure
- Database decrypt/migration failure
- Owner login failure
- Cross-account data/permission leakage
- Ads/order wrong credential action
- Accounting reconciliation mismatch

Rollback steps:

1. `sudo systemctl stop p2pflow`
2. Previous release pointer/code restore করুন।
3. Database write/migration compatibility যাচাই করুন; প্রয়োজন হলে pre-update tested backup restore করুন।
4. Previous exact dependencies restore/install করুন।
5. `sudo systemctl daemon-reload` এবং service start করুন।
6. `/ready`, login, database, Orders, Ads এবং Accounting verify করুন।

Database backup restore করার আগে current failed-state database-এর forensic copy রাখুন।

## 11. Fresh install note

Fresh server-এ ZIP application root-এ extract করুন, `npm ci --omit=dev --ignore-scripts` চালান, setup code দিয়ে `/setup` সম্পন্ন করুন, তারপর production checklist অনুযায়ী domain/TLS/systemd/Nginx configure করুন। Setup শেষ হওয়ার আগে public DNS traffic enable করবেন না।
