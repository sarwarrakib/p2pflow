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

Internal SemVer: `1.5.19`
UI: `1.5`
Database schema: `32`

Normal next version: `SET_NEXT_VERSION.bat` -> `1.6.0`  
Hotfix: `SET_HOTFIX_VERSION.bat` -> `1.5.20`

## Database history safety

P2PFlow keeps authoritative business/application data in MariaDB/MySQL/PostgreSQL. State payloads are compressed with Brotli before AES-256-GCM encryption, proofs/chat media are stored as encrypted database objects, and identical newly uploaded proof/media bytes use content-addressed object IDs to avoid duplicate blobs. The default is 3 retained recovery checkpoints with a 6-hour archive interval and 5 retained automatic database backups. Older uncompressed state/history/backup payloads are upgraded incrementally after startup. Health Check reports each P2PFlow database table's allocated size/row count, current encrypted state payload size, compression saving percentage, and proof/chat object usage so database-MB growth can be inspected without terminal access. `shared/`, `.p2pflow`, `.env`, `releases/` and temporary restart/update markers are operational bootstrap/update metadata only; they are not an application/business-data store. The application runtime itself does not write proof, chat, audit, order, ledger, notification or recovery-code data to local files.

## v1.5.19 Payment Account Scope, Notification Preferences ও Offline Business

- Add/Bulk Add Payment Account-এ Account User logged-in user হিসেবে default selected হয়। Admin/Manager সব account manage করে; Agent `accounts.manage` থাকলে শুধু নিজের account manage করে। Custom non-Agent role-এর জন্য `accounts.manage_all` আছে।
- Payment Account-এ Label ও unique Serial Number যোগ হয়েছে; number, label ও serial দিয়ে permission-scoped search করা যায়।
- সব 31টি global এবং per-Binance-account permission row-এর ডান পাশে eye button আছে; click/keyboard/touch-এ পূর্ণ scope ও dependency দেখা যায়।
- Security page-এর undefined date formatter regression ঠিক করা হয়েছে।
- Notifications page-এ per-user In App/Email category preference আছে; Security category mandatory।
- Order P2P Information-এর Open Feedback Page button extension task-এর exact advertiser URL নতুন tab-এ খোলে।
- নতুন Offline Business page requested amount ও per-number limit দিয়ে eligible numbers reserve করে, full/partial received entry দিয়ে balance বাড়ায় এবং full অথবা explicit partial completed offline order তৈরি করে। Active session-এর reserved number অন্য session-এ reuse হয় না।
- Database schema `32`; migration additive এবং existing users, orders, Ads, payment accounts, ledger, accounting ও security data preserve করে।
- v1.5.17-এর Order Acceptance, Agent payment permission fixes এবং v1.5.16-এর multi-account Orders/Ads behavior বহাল আছে।

বিস্তারিত: `P2PFlow_v1.5.19_RELEASE_NOTES_BN.md`, `P2PFlow_v1.5.19_MANUAL_UPDATE_BN.md` এবং `P2PFlow_v1.5.19_LAUNCH_CHECKLIST_BN.md`।

## v1.5.13 Settings Workspace & Compact Mail Failover UI

Settings আর একটি দীর্ঘ single-page form নয়। এখন **General, Binance & Sync, Login & Security, Email Delivery, Notifications, Presence & Activity**—এই ৬টি purpose-based section আছে। Desktop-এ compact section navigation এবং mobile-এ horizontal section switcher ব্যবহার করা হয়; selected section browser-এ মনে থাকে।

Email Delivery page-এ Primary route এবং Backup 1/2/3 compact route card হিসেবে দেখায়। প্রতিটি backup-এর পুরো SMTP form একসাথে repeat করে দেখানো হয় না; Provider, From Email, status এবং Test action সামনে থাকে, আর connection/sender details প্রয়োজন হলে expand করা যায়। Primary -> Backup 1 -> Backup 2 -> Backup 3 chain একটি compact delivery strip-এ দেখা যায়।

Mail failover engine v1.5.11-এর behavior অপরিবর্তিত: Login OTP, recovery/security verification, order mail, notification mail এবং অন্য site email একই ordered chain ব্যবহার করে। Permanent recipient rejection হলে next provider retry হয় না এবং ambiguous post-DATA disconnect duplicate email এড়াতে retry হয় না। Login OTP সব usable mail route fail হওয়ার পর Security Question fallback বা Owner Emergency Login-এ যায়; Email OTP disabled থাকলে PIN-only flow অপরিবর্তিত।

Email test controls-ও এক জায়গায় আনা হয়েছে: Test Full Chain, Test Login OTP, optional Mail Test Recipient এবং collapsible low-level SMTP/local tests।
