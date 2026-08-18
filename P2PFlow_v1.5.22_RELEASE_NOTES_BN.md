# P2PFlow v1.5.22 — Release Notes

- Application version: `1.5.22`
- Database schema: `33`
- Package type: Unified
- Database migration: প্রয়োজন নেই

## ১. Work Status এখন শুধু Header-এ

Work ON/OFF control-এর duplicate placement সরানো হয়েছে। এখন এটি কেবল global header-এর top-actions area-তে থাকবে।

সরানো হয়েছে:

- Orders page-এর account strip-এর নিচের Work button
- Standalone P2P Message page-এর Work button
- Order Details-এর embedded P2P chat-এর Work button

Orders page-এ Work Status OFF থাকলে eligible Agent-এর জন্য আগের confirmation popup বহাল আছে। Popup-এর উদ্দেশ্য শুধু login/session শুরুতে Agent কাজ গ্রহণ করতে চান কি না নিশ্চিত করা; এটি আর একটি স্থায়ী duplicate button নয়।

## ২. Live Order permission থাকলে Work button দেখাবে না

Work Status auto-assignment eligibility নিয়ন্ত্রণ করে। যেসব user-এর অন্তত একটি নির্দিষ্ট Binance account-এ effective `binance.sync` permission আছে, তারা live Binance order synchronization/access workflow ব্যবহার করে; তাদের header-এ Work button দেখানো হবে না।

Visibility rule:

```text
Enabled user
+ Agent role
+ Agent record
+ Global Orders View
+ কোনো effective Binance Live Order permission নেই
= Header Work button visible
```

Effective Live Order permission বলতে global `binance.sync` এবং একই Binance credential-এর account-level `binance.sync`—দুটিই বোঝায়। Admin implicit all-account access রাখে, তাই Admin-এর Work buttonও দেখানো হয় না।

Permission বা role update হলে server realtime `user.work_availability.updated` event পাঠায়। ফলে open browser session-এ page reload ছাড়াই header Work button show/hide হয়।

## ৩. Notification master শুধু Standalone P2P Message page-এ

Notifications ON/OFF master button এখন শুধু standalone **P2P Message** page-এর উপরে থাকবে।

সরানো হয়েছে:

- Order Details-এর embedded chat-এর Notification button
- Embedded chat-এর combined Work/Notification bar

Notifications page-এর category/channel preferences master button নয়; সেটি In App, Email এবং Background category filtering-এর জন্য থাকবে।

## ৪. Notifications OFF-এর কঠোর আচরণ

Current device-এ Notifications OFF করলে:

- Button সঙ্গে সঙ্গে OFF state নেয়।
- Foreground new-order sound বন্ধ হয়।
- Assignment notification sound বন্ধ হয়।
- Incoming P2P-message sound বন্ধ হয়।
- Browser Push subscription server থেকে delete হয়।
- Browser-এর local Push subscription unsubscribe হয়।
- Current device-এ browser/system notification আর পাঠানো হয় না।
- আগে চলমান custom audio থাকলে pause/reset হয়।

Server request ব্যর্থ হলে UI state নিরাপদভাবে আগের অবস্থায় ফিরে যায়। Local subscription server delete সফল হওয়ার পরে unsubscribe হয়, যাতে network failure-এর সময় button ON দেখিয়ে subscription হারিয়ে যাওয়ার inconsistent state না তৈরি হয়।

OFF state per-device। একই user-এর অন্য bonded device-এ আলাদা active subscription থাকলে সেই device-এর setting অপরিবর্তিত থাকবে।

## ৫. Notifications ON-এর আচরণ

Current bonded device-এ Notifications ON করলে:

1. HTTPS, browser Push support এবং trusted/bonded device যাচাই হয়।
2. Browser notification permission নেওয়া হয়।
3. Service Worker register হয়।
4. VAPID-backed Push subscription তৈরি/refresh হয়।
5. Current user-এর সব Background notification category ON হয়।
6. Selected notification sound test হিসেবে বাজে।

Automatic foreground sound master button-এর সঙ্গে যুক্ত। Sound Type selector-এর আলাদা `Off` option সরানো হয়েছে; ফলে Notifications OFF-ই order/message sound এবং browser notification বন্ধ করার একমাত্র master control।

Available sounds:

- Chime
- Bell
- Alert
- Soft
- Custom uploaded audio

Custom sound browser-local storage-এ থাকে। Application/page চলমান অবস্থায় incoming order, assignment অথবা P2P message event-এর জন্য selected sound বাজে। Application সম্পূর্ণ বন্ধ বা mobile locked অবস্থায় Web Push notification-এর actual sound browser/operating-system policy অনুসরণ করে; web page custom audio জোর করে চালাতে পারে না।

## ৬. Sound button সবার জন্য

Notifications master rendering কোনো role বা operational permission দিয়ে আলাদাভাবে hide করা হয়নি। P2P Message page access থাকা প্রতিটি logged-in user একই ON/OFF button পাবে। Notifications page নিজেও সব standard role-এর জন্য available এবং category preferences আগের মতো থাকবে।

## ৭. Automatic sound category gate

Foreground sound এখন device master state এবং category preference—দুইটি যাচাই করে:

```text
Notifications master ON
+ current device subscribed
+ relevant Background category ON
= automatic sound allowed
```

Category mapping:

- New live order → `orders`
- Order assignment → `assignments`
- Incoming Binance P2P message → `messages`

Master OFF থাকলে event deduplication key consume করা হয় না; পরে ON করার পরে নতুন event স্বাভাবিকভাবে sound করতে পারে।

## ৮. Binance chat transport অপরিবর্তিত

এই release শুধু P2PFlow UI control placement, Work visibility এবং notification master/sound gating পরিবর্তন করে। Binance chat credential, WebSocket connection, message payload, chat-history sync এবং account-scoped Binance authorization পরিবর্তন করা হয়নি।

## ৯. Backward compatibility

- Database schema `33` অপরিবর্তিত।
- Existing user Work state সংরক্ষিত থাকবে।
- Existing Push subscription অন্য device-এ সংরক্ষিত থাকবে।
- Existing custom sound browser-local storage-এ থাকবে। পুরোনো Sound Type `off` value থাকলে এটি safeভাবে default `chime`-এ normalize হবে; master Notifications OFF থাকলে তবুও sound বাজবে না।
- Orders, Ads, Chat delta sync, Payment Accounts, Offline Business, ledger এবং accounting data পরিবর্তন হবে না।

## ১০. Verification

Release-specific automated checks যাচাই করে:

- Header-এ ঠিক একটি Work control আছে
- Orders এবং P2P Message page duplicate Work control render করে না
- Embedded order chat-এ Work/Notification control bar নেই
- Live Order permission Work control hide করে
- Permission/role update realtime Work visibility refresh করে
- Standalone P2P Message page master Notification button render করে
- Notification Settings master button duplicate করে না
- Notifications OFF foreground sound gate বন্ধ করে
- Notifications OFF server subscription delete ও browser unsubscribe করে
- Sound selector-এ দ্বিতীয় `Off` mode নেই
- Push delivery server-side master/subscription/category gate মানে

## Update-এর পরে

1. Database, `.env`, `.p2pflow/` এবং `shared/` backup নিন।
2. Application files replace করুন; persistent data overwrite করবেন না।
3. `npm ci --omit=dev --ignore-scripts`
4. `npm run build`
5. `npm test`
6. Service restart করুন।
7. Browser hard refresh এবং CDN/reverse-proxy cache purge করুন।
8. Agent, Live Order user এবং normal user দিয়ে visibility test করুন।
9. Bonded device-এ Notifications ON/OFF দিয়ে foreground sound এবং background browser notification পরীক্ষা করুন।
