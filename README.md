# P2PFlow 1.5 - Unified Package

এই সংস্করণে Hostinger, GitHub এবং manual update-এর জন্য আলাদা package নেই। **একটাই ZIP সব কাজে ব্যবহার হবে।**

## একই ZIP কোথায় ব্যবহার করবেন

- **নতুন সার্ভার:** ZIP extract -> `npm ci --omit=dev --ignore-scripts` -> `npm start` -> `/setup`
- **আগে P2PFlow ইনস্টল আছে:** persistent `.env`, `.p2pflow`, `shared/` ও database অক্ষত রেখে একই ZIP-এর application files overwrite -> `npm ci --omit=dev --ignore-scripts` -> restart
- **GitHub Desktop:** একই ZIP extract করে repository root-এ copy -> Commit -> Push origin
- **পরবর্তী update:** GitHub Actions signed Release তৈরি করলে P2PFlow -> System Update -> Check Now -> Update Now

## Startup

```text
Node.js: 20+
Startup file: server.js
Install: npm ci --omit=dev --ignore-scripts
Build: npm run build
Start: npm start
```

`server.js` এখন shared-hosting compatible main-thread supervisor। HTTP server মূল Node process-এই চলে; fresh install-এ বর্তমান source নিজে managed release snapshot হয়। আলাদা Hosting Migration বা Hosting Ready package প্রয়োজন নেই।

## Data safety

Updater code এবং database আলাদা রাখে। Update install-এর আগে active writes শেষ করে database backup নেয়। `.env`, `.p2pflow`, `shared/` এবং external MariaDB/MySQL/PostgreSQL data release package-এর অংশ নয়। নতুন release ready না হলে previous code স্বয়ংক্রিয়ভাবে restore করা হয়।

## Version

Internal SemVer: `1.5.11`
UI: `1.5`

Normal next version: `SET_NEXT_VERSION.bat` -> `1.6.0`  
Hotfix: `SET_HOTFIX_VERSION.bat` -> `1.5.12`

## Database history safety

P2PFlow keeps authoritative business/application data in MariaDB/MySQL/PostgreSQL. State payloads are compressed with Brotli before AES-256-GCM encryption, proofs/chat media are stored as encrypted database objects, and identical newly uploaded proof/media bytes use content-addressed object IDs to avoid duplicate blobs. The default is 3 retained recovery checkpoints with a 6-hour archive interval and 5 retained automatic database backups. Older uncompressed state/history/backup payloads are upgraded incrementally after startup. Health Check reports each P2PFlow database table's allocated size/row count, current encrypted state payload size, compression saving percentage, and proof/chat object usage so database-MB growth can be inspected without terminal access. `shared/`, `.p2pflow`, `.env`, `releases/` and temporary restart/update markers are operational bootstrap/update metadata only; they are not an application/business-data store. The application runtime itself does not write proof, chat, audit, order, ledger, notification or recovery-code data to local files.

## v1.5.11 Automatic Multi-Email Failover

Settings-এর **Email Sending System** এখন একটি Primary route-এর পাশাপাশি সর্বোচ্চ ৩টি ordered Backup Email Route রাখতে পারে। Login OTP, recovery/security verification, order mail, notification mail এবং অন্য সব site email Primary -> Backup 1 -> Backup 2 -> Backup 3 priority-তে delivery চেষ্টা করে।

প্রতিটি backup-এর নিজস্ব provider, From/Reply-To এবং SMTP credentials থাকে। Provider/auth/quota/TLS/network/sender/relay/policy failure হলে next route চেষ্টা হয়। Permanent recipient rejection হলে অন্য provider-এ retry হয় না, এবং SMTP DATA পাঠানোর পর ambiguous connection loss হলে duplicate email এড়াতে failover বন্ধ থাকে।

Login OTP সব configured mail route fail হওয়ার পরেই Security Question fallback বা Owner Mail Service Down Emergency Login-এ যায়। Email OTP disabled থাকলে existing 6-digit PIN-only continuation অপরিবর্তিত। Settings-এ Full Mail Chain, Login OTP Failover এবং প্রতিটি Backup Route-এর direct test আছে।
