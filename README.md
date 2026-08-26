# P2PFlow 1.6 - Unified Package

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

Internal SemVer: `1.7.7`
UI: `1.6`
Database schema: `37`

Normal next version: `SET_NEXT_VERSION.bat` -> `1.8.0`  
Hotfix: `SET_HOTFIX_VERSION.bat` -> `1.7.8`

## Database history safety

P2PFlow keeps authoritative business/application data in MariaDB/MySQL/PostgreSQL. State payloads are compressed with Brotli before AES-256-GCM encryption, proofs/chat media are stored as encrypted database objects, and identical newly uploaded proof/media bytes use content-addressed object IDs to avoid duplicate blobs. The default is 3 retained recovery checkpoints with a 6-hour archive interval and 5 retained automatic database backups. Older uncompressed state/history/backup payloads are upgraded incrementally after startup. Health Check reports each P2PFlow database table's allocated size/row count, current encrypted state payload size, compression saving percentage, and proof/chat object usage so database-MB growth can be inspected without terminal access. `shared/`, `.p2pflow`, `.env`, `releases/` and temporary restart/update markers are operational bootstrap/update metadata only; they are not an application/business-data store. The application runtime itself does not write proof, chat, audit, order, ledger, notification or recovery-code data to local files.

## v1.7.7 Dedicated Frontend Architecture — Fixed AppShell & Clean History Routes

- Authenticated browser document এখন `100dvh` fixed AppShell; `html/body/#app/main` আর application page-এর সঙ্গে scroll করে না। Desktop sidebar ও top header স্থায়ী, শুধু active route viewport page scroll করে।
- Canonical navigation clean History API URL ব্যবহার করে: `/orders/123`, `/p2p/market`, `/accounting`, `/system/update`। পুরোনো `/#/...` bookmark readable এবং clean URL-এ migrate হয়।
- Node server known SPA route-এ History fallback দিয়ে `index.html` serve করে, তাই nested route সরাসরি refresh করলেও application খুলতে পারে।
- প্রতিটি route-এর persistent detached DOM host আছে। Inactive route live DOM থেকে detach হয়, কিন্তু form/DOM/scroll state bounded cache-এ preserve হয়; target route নিজের shell সঙ্গে সঙ্গে mount/restore হয়।
- Navigation **Latest Navigation Wins**: নতুন route পুরোনো navigation request abort করে; stale response guard mismatch হলে current page DOM-এ commit করতে পারে না। Browser Back/Forward একই authority ব্যবহার করে।
- Explicit `PAGE_RUNTIME` lifecycle registry page leave-এর সঙ্গে Market observer/timer, Order/Chat sync, Ads polling এবং Accounting timer deactivate করে। Existing feature pageগুলো `public/js/pages/*.js` আলাদা file-এই থাকে।
- Realtime/API refresh active route host destroy করে না। Stable DOM morph existing nodes/data patch করে; Orders/Chat/Market/Ads dedicated incremental updater বহাল।
- Page modules document/window scrolling ব্যবহার করে না; active route scroller API ব্যবহার করে। Settings/Order sticky controls fixed header-এর বাইরে নতুন viewport অনুযায়ী adjust করা হয়েছে।
- Global route progress fixed clipped overlay; browser width পরিবর্তন বা প্রতি cycle horizontal scrollbar তৈরি করতে পারে না। Table/chip-এর প্রয়োজনীয় local horizontal scroll আলাদা wrapper-এ সীমাবদ্ধ।
- PWA start URL, login return, push notification links এবং Security redirect clean routes ব্যবহার করে।
- v1.5.38 Ads UI, v1.5.37 secret vault/one-click verification, v1.5.36 Binance FUND_PWD RSA flow এবং permission/accounting/realtime backend behavior preserved।
- Database schema `37`; নতুন migration নেই।

বিস্তারিত: `P2PFlow_v1.7.7_RELEASE_NOTES_BN.md`, `P2PFlow_v1.7.7_MANUAL_UPDATE_BN.md` এবং `P2PFlow_v1.7.7_LAUNCH_CHECKLIST_BN.md`.

## v1.5.38 Reference UI, Minimal Verification & Binance Ad Flow (historical)

- Release Verification screen ultra-minimal করা হয় এবং Binance-reference responsive Orders/Market/Ads/Post Ad UI যোগ হয়।
- Post Ad 3-step editor, Fixed/Floating Price, live Binance reference-price guide, SELL saved payment accounts এবং BUY generic payment methods (maximum 5) যোগ হয়।
- Existing CRM fields/actions/permissions বাদ দেওয়া হয়নি।
- Database schema `37`; migration প্রয়োজন ছিল না।

## v1.5.35 Permission-Authoritative Roles & Advertisement Rate Guard (historical; rate inputs superseded in v1.5.38)

- Role name/template family is no longer runtime authority. Effective access comes only from the user/role's checked Global Permissions and exact Binance Account Permissions.
- Selecting a User Role still copies that role template's permissions into the user form and auto-ticks matching permissions for enabled Binance accounts; every checkbox can then be reviewed before Save.
- Page visibility, Live Orders, assignment, Payment Accounts, split actions, approvals, accounting scope and notification audiences no longer check Admin/Manager/Agent/Auditor names for authorization.
- `binance.sync` still implies `orders.view` for the same exact Binance credential; it never grants another credential.
- Schema 36 migration is permission-only too: legacy explicit account IDs are preserved, while broad legacy access is materialized across existing credentials only when the user actually has `credentials.manage` or `agents.manage`. Role names never create grants.
- v1.5.35-এ local Minimum/Maximum Rate guard ছিল; **v1.5.38 থেকে এই editable fields আর current UI-তে নেই**। বর্তমান Ads editor Binance live reference-price guide দেখায় এবং Binance submit-time validation authoritative।
- Existing Order-only assignment/payment-account capacity settings remain permission/routing driven and are not tied to an Agent role name.
- Database schema `36`; additive migration runs automatically from schema 35.

বিস্তারিত: `P2PFlow_v1.5.35_RELEASE_NOTES_BN.md`, `P2PFlow_v1.5.35_MANUAL_UPDATE_BN.md` এবং `P2PFlow_v1.5.35_LAUNCH_CHECKLIST_BN.md`.

## v1.5.33 Realtime UI Stability, Faster Orders & Chat Media

- Order detail/chat background events আর পুরো page/order DOM rebuild করে না। Incoming chat incrementalভাবে append হয়; user উপরে scroll করে থাকলে scroll position ধরে রাখা হয় এবং নতুন message এলেও viewport কে নিচে টেনে আনা হয় না।
- Enabled Binance credentials-এর জন্য persistent C2C chat WebSocket listener যোগ হয়েছে। WSS unavailable হলে active chat 1.5-second fallback sync ব্যবহার করে।
- P2P Market 5-second background refresh চালু রাখে, কিন্তু visible card/viewport anchor ধরে রাখে; loading repaint বা forced scroll-to-top হয় না।
- Settings page generic database-update event-এ auto-render হয় না, তাই input/select-এ typing মাঝপথে হারায় না।
- Fast Binance order discovery default প্রায় 3 seconds-এ চলে এবং নতুন/status-changed order পেলেই SSE broadcast করে; unchanged list-এর জন্য database write/SSE storm করে না। Detailed reconciliation আগের background cycle-এ থাকে।
- Mark as Paid exact synced `orderNumber + payId` থাকলে heavy order-detail refresh-এর আগে direct fast path ব্যবহার করে; missing identifiers হলেই fallback refresh হয়।
- Order chat attachment tray-এ **Camera** এবং **Album** দুটো option আছে। Mobile camera `capture=environment` ব্যবহার করতে পারে; image compression আরও compact এবং Binance image upload timeout/failure-এ fresh presigned URL দিয়ে bounded retry হয়।
- Release Verification v1.5.32-এর challenge-driven/minimal-probe behavior অক্ষত আছে।
- Database schema `35`; নতুন migration প্রয়োজন নেই।

## v1.5.32 Challenge-Driven Release Verification

- Release/Quick Release Payment Split gate satisfied হলে প্রথম request minimal Binance request দিয়ে শুরু হয়; concrete Google/SMS/Fund/FIDO2/YubiKey challenge এলে তবেই dedicated verification screen খোলে।
- ambiguous verification error থেকে generic “Binance verification code” field বানানো হয় না এবং stale generic challenge নতুন attempt-এ reuse হয় না।
- Google `googleVerifyCode`, SMS `mobileVerifyCode` dedicated field ব্যবহার করে; saved Fund Password কেবল concrete `FUND_PWD` challenge ও local step-up pass করার পরে server-side apply হয়।
- Database schema `35`; নতুন migration প্রয়োজন নেই।

## v1.5.28 Saved Split Direct Final Action & Verification Retry

- Mark Paid/Release/Quick Release-এর relevant Payment Split আগে থেকেই validভাবে save থাকলে final-action button আর Payment Split popup পুনরায় খুলবে না; সরাসরি dedicated final-action/Binance verification modal খুলবে।
- Split প্রথমবার প্রয়োজন হলে Split modal শুধু split save/complete করবে, তারপর Continue দিয়ে final verification step-এ যাবে।
- Binance final action fail হলেও saved split অক্ষত থাকে; retry-তে balance/limit movement duplicate হয় না এবং Split page আবার আসে না।
- Failed Release-এর parsed additional verification requirement order state-এ preserve হয়; একই action retry করলে required field সরাসরি verification modal-এ দেখা যায়।
- Release eligibility `checkIfCanReleaseCoin` error-ও verification parser-এর মাধ্যমে handled হয়; check fail/deny হলে `releaseCoin` পাঠানো হয় না।
- Full order response-এ authoritative `finalActionSplitGate` state থাকে, তাই frontend stale local remaining state-এর বদলে server readiness অনুসরণ করে।
- Database schema `35`; migration প্রয়োজন নেই।

## v1.5.27 Separate Wallet Rules, Fast Filters & Account-scoped Notifications

- Personal/Merchant Payment Account-এ `Send Money Charge` এবং `Cash Out Charge` এখন সম্পূর্ণ আলাদা rule; দুইটির fixed/percentage/tier/manual rate ভিন্ন হতে পারে।
- `Agent` হলো Payment Account-এর transaction behaviour; এটি আর login user-এর Agent role-এর সঙ্গে বাধ্যতামূলকভাবে বাঁধা নয়। প্রয়োজনীয় Payment Account permissions থাকা যেকোনো Account User-এর অধীনেও Agent-type SIM রাখা যায়।
- Agent-type account-এ manual transaction শুধু `Received Money` এবং `Cash In`; UI-তেও শুধু Received Money Commission ও Cash In Commission rule দেখায়। Personal/Merchant-এর charge controls Agent form-এ দেখায় না।
- Payment Account search এখন typing-এর সঙ্গে সঙ্গে instant filter করে; আলাদা Search button নেই। Account Type, Label ও Payment Method filter যোগ হয়েছে এবং row actions compact icon-based।
- Orders/Ads-এ নির্দিষ্ট Binance account selected থাকলে current device-এ নতুন order/assignment/message-এর sound ও browser push শুধু সেই account-এর জন্য হয়। `All` selected থাকলে permitted সব account-এর notification আসে। Scope per-device push subscription-এ persist হয়।
- Existing v1.5.24 safe soft-delete, multi-select, atomic bulk edit/delete, label+serial scope এবং protected Agent commission accounting বহাল আছে।
- Database schema `35`; migration additive এবং schema-34 single charge/commission rule-কে relevant দুই transaction rule-এ copy করে, যাতে existing behaviour নষ্ট না হয়। Historical ledger/order-split records অপরিবর্তিত থাকে।

বিস্তারিত: `P2PFlow_v1.5.27_RELEASE_NOTES_BN.md`, `P2PFlow_v1.5.27_MANUAL_UPDATE_BN.md` এবং `P2PFlow_v1.5.27_LAUNCH_CHECKLIST_BN.md`।

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
- v1.5.21-এ Label blank থাকলে method-wide conflict করা হয়েছিল; v1.5.23 থেকে no-Label নিজস্ব fallback scope এবং named Label-কে আর block করে না।
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
