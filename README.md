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

Internal SemVer: `1.5.24`
UI: `1.5`
Database schema: `34`

Normal next version: `SET_NEXT_VERSION.bat` -> `1.6.0`  
Hotfix: `SET_HOTFIX_VERSION.bat` -> `1.5.25`

## Database history safety

P2PFlow keeps authoritative business/application data in MariaDB/MySQL/PostgreSQL. State payloads are compressed with Brotli before AES-256-GCM encryption, proofs/chat media are stored as encrypted database objects, and identical newly uploaded proof/media bytes use content-addressed object IDs to avoid duplicate blobs. The default is 3 retained recovery checkpoints with a 6-hour archive interval and 5 retained automatic database backups. Older uncompressed state/history/backup payloads are upgraded incrementally after startup. Health Check reports each P2PFlow database table's allocated size/row count, current encrypted state payload size, compression saving percentage, and proof/chat object usage so database-MB growth can be inspected without terminal access. `shared/`, `.p2pflow`, `.env`, `releases/` and temporary restart/update markers are operational bootstrap/update metadata only; they are not an application/business-data store. The application runtime itself does not write proof, chat, audit, order, ledger, notification or recovery-code data to local files.

## v1.5.24 Payment Account Bulk Management, Manual Fees & Agent Commission

- Payment Account list-এ single Delete, multi-select, Select All, Edit Selected এবং Delete Selected যোগ হয়েছে। Bulk operation atomic: একটি selected account validation fail করলে কোনো account edit/delete হবে না।
- Delete safe soft-delete হিসেবে কাজ করে। Account balance শূন্য হতে হবে এবং pending order split বা Offline Business reservation থাকা যাবে না। Ledger, statement, audit ও accounting history মুছে যায় না।
- Bulk Edit থেকে Status, Account Type, Label, Account Name, serial sequence, Account User, Agent access, receive/send limits এবং Charge/Commission rule একসঙ্গে পরিবর্তন করা যায়। Serial scope validation v1.5.23-এর method + label rule-ই অনুসরণ করে।
- Manual Balance Transaction এখন Send Money, Receive Money, Cash Out, Bill Pay, Payment ও Mobile Recharge transaction type ব্যবহার করে।
- Personal ও Merchant account-এ configured fee শুধু Send Money এবং Cash Out-এ deduct হয়। Fixed, percentage, fixed+percentage, tiered এবং manual actual amount rule সমর্থিত।
- Agent account-এ configured rule fee নয়, earned commission। Money incoming বা outgoing—দুই ক্ষেত্রেই commission সঙ্গে সঙ্গে wallet balance-এ credit হয় এবং protected automatic accounting income হিসেবে record হয়। Reversal প্রয়োজন হলে linked automatic expense record তৈরি হয়।
- Agent-এর `Include profit in company totals` OFF থাকলে commission individual income-এ দৃশ্যমান থাকবে, কিন্তু company income/capital total-এ যোগ হবে না।
- Database schema `34`; migration additive এবং existing accounts, balances, ledgers, statements ও historical transfer charges preserve করে। Existing completed/historical split deductions charge হিসেবেই থাকে; শুধু untouched planned Agent split commission model নেয়।

বিস্তারিত: `P2PFlow_v1.5.24_RELEASE_NOTES_BN.md`, `P2PFlow_v1.5.24_MANUAL_UPDATE_BN.md` এবং `P2PFlow_v1.5.24_LAUNCH_CHECKLIST_BN.md`।

## v1.5.23 Payment Account Bulk Serial Scope Fix

- Bulk Add-এর false-positive Serial conflict ঠিক করা হয়েছে। পুরোনো Label-ছাড়া Payment Account আর নতুন named Label-এর account block করে না।
- Serial uniqueness `normalized Payment Method name + normalized Label` scope-এ চলে; no-Label একটি আলাদা scope।
- Same Method + same normalized Label + same Serial block হয়; different Label বা different Method একই Serial reuse করতে পারে।
- Bulk Add atomic এবং diagnostics exact row, Serial ও Label দেখায়।
- Database schema `33`; কোনো data migration প্রয়োজন ছিল না।

## v1.5.22 Header-only Work Status & Notification Master

- Work ON/OFF control এখন শুধু global header-এ থাকে। Orders page, standalone P2P Message page এবং order-detail embedded chat থেকে duplicate Work control সরানো হয়েছে।
- Work control শুধু auto-assignment eligible Agent-এর জন্য দেখা যায়। কোনো user-এর অন্তত একটি নির্দিষ্ট Binance account-এ effective `binance.sync` (Binance live order sync) permission থাকলে Work control দেখানো হয় না।
- Permission বা role পরিবর্তনের পরে open session-এ realtime event দিয়ে header Work control সঙ্গে সঙ্গে show/hide হয়।
- Notifications ON/OFF master button শুধু standalone **P2P Message** page-এ থাকে; order-detail embedded chat-এ আর থাকে না। এটি Work বা `orders.view` permission-এর ওপর নির্ভর করে না; `orders.view` ছাড়া user inbox data না দেখেও device notification control ব্যবহার করতে পারে। Notification Preferences page category/channel configuration-এর জন্য, master button duplicate করে না।
- Notifications OFF করলে current device-এর push subscription server এবং browser—দুই দিক থেকেই সরানো হয় এবং foreground order/assignment/P2P-message sound সঙ্গে সঙ্গে বন্ধ হয়।
- Notifications ON করলে current bonded device browser push subscription নেয়, সব background category ON করে এবং Settings-এ selected built-in/custom sound foreground event-এ ব্যবহার করে।
- Sound Type selector থেকে আলাদা `Off` option সরানো হয়েছে; master Notifications button-ই browser notification ও automatic sound-এর একমাত্র ON/OFF control।
- Fully closed/locked browser notification-এর actual sound OS/browser policy অনুসরণ করে; selected custom audio web app/page চলমান থাকলে বাজে।
- Database schema `33`; কোনো data migration প্রয়োজন নেই।

বিস্তারিত: `P2PFlow_v1.5.22_RELEASE_NOTES_BN.md`, `P2PFlow_v1.5.22_MANUAL_UPDATE_BN.md` এবং `P2PFlow_v1.5.22_LAUNCH_CHECKLIST_BN.md`।

## v1.5.21 Payment Account Serial Scope

- Payment Account Serial Number আর পুরো system-এ globally unique নয়; normalized Payment Method name অনুযায়ী আলাদা namespace ব্যবহার করে।
- একই Payment Method এবং একই non-empty Label-এর মধ্যে একই Serial Number দ্বিতীয়বার save করা যাবে না।
- একই Payment Method-এর ভিন্ন non-empty Label-এ একই Serial Number পুনরায় ব্যবহার করা যাবে।
- v1.5.21-এ Label blank থাকলে method-wide conflict করা হয়েছিল; v1.5.24 থেকে no-Label নিজস্ব fallback scope এবং named Label-কে আর block করে না।
- ভিন্ন Payment Method-এ একই Label/Serial ব্যবহার করা যাবে।
- Add, Edit, Bulk Add এবং CSV/structured import একই server-side rule ব্যবহার করে। Bulk modal save-এর আগেই একই scope-এর duplicate row দেখায়।
- Comparison trim, case-insensitive, repeated-space normalization এবং Unicode NFKC normalization ব্যবহার করে।
- Database schema `33`; কোনো data migration প্রয়োজন নেই।

## v1.5.20 Stable Session, Fast Orders/Ads, Background Push ও Smooth Chat

- Mobile network/Wi-Fi IP বদলালেও session আর IP-prefix mismatch-এর কারণে হঠাৎ logout করবে না। নতুন session stable browser-family binding ব্যবহার করে; bonded device থাকলে cryptographic device ID-ও binding-এর অংশ। পুরোনো v1 session safeভাবে v2-তে upgrade হয়।
- Transient 401 হলে frontend সঙ্গে সঙ্গে login page-এ না গিয়ে `/api/me` দিয়ে session confirm করে একবার request retry করে।
- Orders list একই response-এ unread count দেয় এবং mobile navigation একটি combined count endpoint ব্যবহার করে। Ads initial load cached merchant/readiness data দিয়ে render হয়; explicit refresh/action ছাড়া blocking live probe হয় না।
- P2P Message page-এর Notifications ON করলে current bonded/trusted device-এ native Web Push subscription হয়। App background, inactive বা supported platform-এ বন্ধ থাকলেও new order assignment, new P2P message এবং enabled category notification system notification হিসেবে পৌঁছাতে পারে। Notifications OFF করলে current device-এর subscription সরানো হয় এবং ওই device-এ automatic order/message sound ও browser notification বন্ধ থাকে।
- iPhone/iPad-এ Home Screen web app থেকে permission দিতে হবে। Browser/OS notification sound control করে; app foreground custom sound এবং background system sound আলাদা।
- Work Status button শুধু global header-এ এবং শুধু auto-assignment Agent-এর জন্য দেখা যায়। Effective Binance Live Order (`binance.sync`) access থাকা user-এর Work button লাগে না ও দেখানো হয় না। Eligible Agent-এর Work ON হলে offline থাকলেও order assign হতে পারে; PAUSED হলে online থাকলেও নতুন order assign হয় না।
- Order chat এখন `/chat-delta` দিয়ে শুধু নতুন message merge করে। Incoming/outgoing message-এ পুরো order page reload হয় না; scroll/focus অক্ষত থাকে এবং পুরোনো message পড়ার সময় “new messages” button দেখা যায়। P2P Message inbox-ও thread list partial refresh করে।
- Notification Preferences-এ In App, Email এবং Background channel আলাদা category অনুযায়ী manage করা যায়। P2P Message page-এর একমাত্র master Notifications button ON করলে current device subscribe হয় ও সব background category ON হয়; individual order chat-এ এই control থাকে না।
- Database schema `33`; migration additive এবং existing users, sessions, trusted devices, orders, Ads, chats, payment accounts, ledger ও accounting data preserve করে।
## v1.5.13 Settings Workspace & Compact Mail Failover UI

Settings আর একটি দীর্ঘ single-page form নয়। এখন **General, Binance & Sync, Login & Security, Email Delivery, Notifications, Presence & Activity**—এই ৬টি purpose-based section আছে। Desktop-এ compact section navigation এবং mobile-এ horizontal section switcher ব্যবহার করা হয়; selected section browser-এ মনে থাকে।

Email Delivery page-এ Primary route এবং Backup 1/2/3 compact route card হিসেবে দেখায়। প্রতিটি backup-এর পুরো SMTP form একসাথে repeat করে দেখানো হয় না; Provider, From Email, status এবং Test action সামনে থাকে, আর connection/sender details প্রয়োজন হলে expand করা যায়। Primary -> Backup 1 -> Backup 2 -> Backup 3 chain একটি compact delivery strip-এ দেখা যায়।

Mail failover engine v1.5.11-এর behavior অপরিবর্তিত: Login OTP, recovery/security verification, order mail, notification mail এবং অন্য site email একই ordered chain ব্যবহার করে। Permanent recipient rejection হলে next provider retry হয় না এবং ambiguous post-DATA disconnect duplicate email এড়াতে retry হয় না। Login OTP সব usable mail route fail হওয়ার পর Security Question fallback বা Owner Emergency Login-এ যায়; Email OTP disabled থাকলে PIN-only flow অপরিবর্তিত।

Email test controls-ও এক জায়গায় আনা হয়েছে: Test Full Chain, Test Login OTP, optional Mail Test Recipient এবং collapsible low-level SMTP/local tests।
