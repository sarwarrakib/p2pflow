# P2PFlow v1.5.22 — Manual Update Guide

## লক্ষ্য

Existing P2PFlow installation-কে application version `1.5.22`, database schema `33`-এ update করা। এই release Work Status placement/visibility এবং per-device Notifications master/sound behavior সংশোধন করে। Database migration প্রয়োজন নেই।

## ১. Update-এর আগে backup

Backup নিন:

- Production database
- `.env`
- `.p2pflow/`
- `shared/`
- reverse-proxy/systemd/hosting configuration
- previous application directory অথবা previous Unified ZIP

Update package-এর application files দিয়ে persistent data overwrite করবেন না।

## ২. Maintenance window

- Active order/chat operation সাময়িকভাবে controlled রাখুন।
- Current version ও database health লিখে রাখুন।
- Push notification test-এর জন্য অন্তত একটি bonded desktop/Android device প্রস্তুত রাখুন।
- iPhone/iPad test করলে Home Screen-installed web app প্রস্তুত রাখুন।

## ৩. Files replace

`P2PFlow_v1.5.22_UNIFIED.zip` temporary directory-তে extract করুন। Existing application root-এ application files copy/overwrite করুন। Preserve করুন:

```text
.env
.p2pflow/
shared/
database/external database data
releases/
runtime logs
```

## ৪. Production dependencies

Node.js 20+ ব্যবহার করুন:

```bash
npm ci --omit=dev --ignore-scripts
```

Lockfile পরিবর্তন করে এমন `npm install` ব্যবহার করবেন না।

## ৫. Build, test ও preflight

```bash
npm run build
npm test
```

Production preflight configured থাকলে:

```bash
npm run preflight:production
```

কোনো command fail হলে service restart বা public traffic চালু করবেন না।

## ৬. Service restart

Systemd উদাহরণ:

```bash
sudo systemctl restart p2pflow
sudo systemctl status p2pflow --no-pager
```

Hosting panel হলে configured Node application restart action ব্যবহার করুন।

## ৭. Browser/CDN cache

- Browser hard refresh করুন।
- পুরোনো open tab বন্ধ করে নতুন tab খুলুন।
- CDN/reverse-proxy static cache purge করুন।
- DevTools Network-এ `app.js?v=1.5.22`, `orders.js?v=1.5.22` এবং `chat.js?v=1.5.22` load হচ্ছে নিশ্চিত করুন।
- Service Worker Application panel-এ `/sw.js` active কিনা দেখুন।

## ৮. Work Status placement verification

### A. Assignment Agent, Live Order permission ছাড়া

1. Agent-এর global `orders.view` নিশ্চিত করুন।
2. Agent record active রাখুন।
3. কোনো Binance account-এ `binance.sync` grant দেবেন না।
4. Agent login করুন।
5. Header-এ Work ON/PAUSED button দেখা নিশ্চিত করুন।
6. Orders page account strip-এ দ্বিতীয় Work button নেই নিশ্চিত করুন।
7. Standalone P2P Message page-এ Work button নেই নিশ্চিত করুন।
8. Order Details embedded chat-এ Work button নেই নিশ্চিত করুন।

### B. Live Order permission user

1. User-কে global `binance.sync` দিন।
2. অন্তত একটি নির্দিষ্ট Binance credential-এ account-level `binance.sync` দিন।
3. User session open থাকলে permission save করুন।
4. Page reload ছাড়াই header Work button hide হওয়া নিশ্চিত করুন।
5. Permission remove করলে eligible Agent-এর header Work button আবার দেখা নিশ্চিত করুন।

### C. Admin/Manager/Auditor

- Admin-এর Work button না থাকা নিশ্চিত করুন।
- Non-Agent user-এর meaningless Work button না থাকা নিশ্চিত করুন।
- Users page থেকে Agent Work state manage করা যাচ্ছে নিশ্চিত করুন।

## ৯. Notification button placement verification

1. Standalone **P2P Message** page খুলুন।
2. উপরে Notifications ON/OFF button দেখা নিশ্চিত করুন।
3. কোনো order খুলে embedded P2P chat panel দেখুন।
4. Embedded chat-এ Work button বা Notifications button নেই নিশ্চিত করুন।
5. Notifications page-এ category preferences আছে, কিন্তু আরেকটি master button নেই নিশ্চিত করুন।

## ১০. Notifications OFF verification

একটি bonded/trusted device ব্যবহার করুন।

1. P2P Message page থেকে Notifications OFF করুন।
2. Button সঙ্গে সঙ্গে OFF দেখায় নিশ্চিত করুন।
3. অন্য user/system থেকে নতুন eligible order তৈরি করুন।
4. Current open page-এ automatic sound না বাজা নিশ্চিত করুন।
5. Agent assignment event তৈরি করুন; sound না বাজা নিশ্চিত করুন।
6. Binance test account থেকে incoming P2P message পাঠান; sound না বাজা নিশ্চিত করুন।
7. App background/locked করে browser notification না আসা নিশ্চিত করুন।
8. Browser Push subscription এবং server current-device subscription removed হয়েছে নিশ্চিত করুন।
9. একই user-এর অন্য bonded device থাকলে সেটির independent state অক্ষত কিনা যাচাই করুন।

Email এবং In App category preferences master browser Push button থেকে আলাদা; এই test শুধু current-device browser notification ও automatic sound-এর জন্য।

## ১১. Notifications ON verification

1. Device Security page থেকে bonded/trusted কিনা নিশ্চিত করুন।
2. HTTPS origin ব্যবহার করুন।
3. P2P Message page থেকে Notifications ON করুন।
4. Browser permission prompt Allow করুন।
5. Button ON দেখায় এবং selected sound test বাজে নিশ্চিত করুন।
6. Settings → Notifications থেকে built-in sound নির্বাচন করে test করুন।
7. Custom audio upload করে app/page open থাকা অবস্থায় incoming event-এ selected audio বাজে নিশ্চিত করুন।
8. App background/locked করে new order ও P2P message browser/system notification আসে নিশ্চিত করুন।
9. Fully closed/locked অবস্থায় actual sound OS/browser notification settings অনুসরণ করবে; custom webpage audio guaranteed নয়।

## ১২. Category preference verification

Notifications page থেকে:

- `Orders` Background OFF করলে order push/sound category বন্ধ হয়
- `Assignments` Background OFF করলে assignment push/sound category বন্ধ হয়
- `P2P Messages` Background OFF করলে incoming message push/sound category বন্ধ হয়
- Master Notifications OFF করলে সব category current device-এ বন্ধ হয়
- Master Notifications আবার ON করলে সব Background category ON হয়; প্রয়োজন হলে পরে category-specific setting পুনরায় OFF করুন

## ১৩. Regression verification

- Orders page দ্রুত load হয়।
- Ads page cached initial render দ্রুত।
- P2P chat incoming/outgoing message পুরো page reload করে না।
- Exact Binance account permission অক্ষত।
- Payment Account ownership, Label/Serial uniqueness এবং Offline Business reservation অক্ষত।
- Screen/network change-এ bonded session অপ্রয়োজনীয় logout করে না।

## ১৪. Rollback

Code rollback প্রয়োজন হলে:

1. Service stop করুন।
2. Previous application files restore করুন।
3. Database schema পরিবর্তিত হয়নি (`33`), তাই data migration rollback প্রয়োজন নেই।
4. Service start করুন।
5. Login, Orders, Ads, Chat, Work Status এবং Notifications smoke test করুন।

Push subscription state database-এ থাকে। Previous release restore করার পরে target device-এ Notifications OFF/ON পুনরায় করে subscription refresh করা যেতে পারে।
