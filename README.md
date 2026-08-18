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

Internal SemVer: `1.5.20`
UI: `1.5`
Database schema: `33`

Normal next version: `SET_NEXT_VERSION.bat` -> `1.6.0`  
Hotfix: `SET_HOTFIX_VERSION.bat` -> `1.5.21`

## Database history safety

P2PFlow keeps authoritative business/application data in MariaDB/MySQL/PostgreSQL. State payloads are compressed with Brotli before AES-256-GCM encryption, proofs/chat media are stored as encrypted database objects, and identical newly uploaded proof/media bytes use content-addressed object IDs to avoid duplicate blobs. The default is 3 retained recovery checkpoints with a 6-hour archive interval and 5 retained automatic database backups. Older uncompressed state/history/backup payloads are upgraded incrementally after startup. Health Check reports each P2PFlow database table's allocated size/row count, current encrypted state payload size, compression saving percentage, and proof/chat object usage so database-MB growth can be inspected without terminal access. `shared/`, `.p2pflow`, `.env`, `releases/` and temporary restart/update markers are operational bootstrap/update metadata only; they are not an application/business-data store. The application runtime itself does not write proof, chat, audit, order, ledger, notification or recovery-code data to local files.

## v1.5.20 Stable Session, Fast Orders/Ads, Background Push ও Smooth Chat

- Mobile network/Wi-Fi IP বদলালেও session আর IP-prefix mismatch-এর কারণে হঠাৎ logout করবে না। নতুন session stable browser-family binding ব্যবহার করে; bonded device থাকলে cryptographic device ID-ও binding-এর অংশ। পুরোনো v1 session safeভাবে v2-তে upgrade হয়।
- Transient 401 হলে frontend সঙ্গে সঙ্গে login page-এ না গিয়ে `/api/me` দিয়ে session confirm করে একবার request retry করে।
- Orders list একই response-এ unread count দেয় এবং mobile navigation একটি combined count endpoint ব্যবহার করে। Ads initial load cached merchant/readiness data দিয়ে render হয়; explicit refresh/action ছাড়া blocking live probe হয় না।
- Bonded/trusted device-এ Notifications ON করলে native Web Push subscription হয়। App background, inactive বা supported platform-এ বন্ধ থাকলেও new order assignment, new P2P message এবং enabled category notification system notification হিসেবে পৌঁছাতে পারে। Notifications OFF করলে background delivery বন্ধ থাকে।
- iPhone/iPad-এ Home Screen web app থেকে permission দিতে হবে। Browser/OS notification sound control করে; app foreground custom sound এবং background system sound আলাদা।
- Work Status button সব enabled user-এর top bar, Orders এবং Chat area-তে দেখা যায়। Agent-এর Work Status ON হলে offline থাকলেও eligible order assign হতে পারে; PAUSED হলে online থাকলেও নতুন order assign হয় না।
- Order chat এখন `/chat-delta` দিয়ে শুধু নতুন message merge করে। Incoming/outgoing message-এ পুরো order page reload হয় না; scroll/focus অক্ষত থাকে এবং পুরোনো message পড়ার সময় “new messages” button দেখা যায়। P2P Message inbox-ও thread list partial refresh করে।
- Notification Preferences-এ In App, Email এবং Background channel আলাদা category অনুযায়ী manage করা যায়। Chat-এর master Notifications ON করলে সব background category ON হয়।
- Database schema `33`; migration additive এবং existing users, sessions, trusted devices, orders, Ads, chats, payment accounts, ledger ও accounting data preserve করে।

বিস্তারিত: `P2PFlow_v1.5.20_RELEASE_NOTES_BN.md`, `P2PFlow_v1.5.20_MANUAL_UPDATE_BN.md` এবং `P2PFlow_v1.5.20_LAUNCH_CHECKLIST_BN.md`।

## v1.5.13 Settings Workspace & Compact Mail Failover UI

Settings আর একটি দীর্ঘ single-page form নয়। এখন **General, Binance & Sync, Login & Security, Email Delivery, Notifications, Presence & Activity**—এই ৬টি purpose-based section আছে। Desktop-এ compact section navigation এবং mobile-এ horizontal section switcher ব্যবহার করা হয়; selected section browser-এ মনে থাকে।

Email Delivery page-এ Primary route এবং Backup 1/2/3 compact route card হিসেবে দেখায়। প্রতিটি backup-এর পুরো SMTP form একসাথে repeat করে দেখানো হয় না; Provider, From Email, status এবং Test action সামনে থাকে, আর connection/sender details প্রয়োজন হলে expand করা যায়। Primary -> Backup 1 -> Backup 2 -> Backup 3 chain একটি compact delivery strip-এ দেখা যায়।

Mail failover engine v1.5.11-এর behavior অপরিবর্তিত: Login OTP, recovery/security verification, order mail, notification mail এবং অন্য site email একই ordered chain ব্যবহার করে। Permanent recipient rejection হলে next provider retry হয় না এবং ambiguous post-DATA disconnect duplicate email এড়াতে retry হয় না। Login OTP সব usable mail route fail হওয়ার পর Security Question fallback বা Owner Emergency Login-এ যায়; Email OTP disabled থাকলে PIN-only flow অপরিবর্তিত।

Email test controls-ও এক জায়গায় আনা হয়েছে: Test Full Chain, Test Login OTP, optional Mail Test Recipient এবং collapsible low-level SMTP/local tests।
