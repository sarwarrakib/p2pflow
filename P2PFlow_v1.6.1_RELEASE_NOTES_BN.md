# P2PFlow v1.6.1 — Login, Scroll Stability & Orders Filter Update

## এই আপডেটে যা পরিবর্তন হয়েছে

### Login / CSRF

- Login ও Trusted Device authentication-এর pre-session POST routeগুলোকে exact-path CSRF bootstrap scope-এ আনা হয়েছে।
- পুরোনো/স্টেল session cookie থাকলেও login page আর `/api/login/device/challenge`, `/api/login/device`, `/api/login/device/upgrade` অথবা `/api/login/recover-email` request-এ ভুল করে **Invalid CSRF token** দেখাবে না।
- `/api/logout` এবং authenticated write endpointগুলো CSRF protected-ই আছে।
- Same-Origin write protection, password/PIN এবং signed trusted-device challenge অপরিবর্তিত আছে।

### Chat scroll jump

- P2P Message inbox live refresh-এর পরে scroll position আর delayed `requestAnimationFrame` দিয়ে restore করা হয় না।
- Current order chat-এ user উপরে scroll করতে থাকলে background/new-message update আর জোর করে chat-কে bottom-এ নামিয়ে দেয় না।
- User নিজে bottom-এ থাকলে normal live-chat stick-to-bottom behavior বজায় থাকে; নতুন message indicatorও বজায় আছে।

### P2P Market scroll jump

- Live market refresh-এর viewport snapshot এখন API request শুরু হওয়ার সময় নয়, DOM update commit করার ঠিক আগে নেওয়া হয়।
- ফলে request চলাকালে user scroll করলে পুরোনো scroll position দিয়ে পরে আর তাকে আগের জায়গায় ফেরত পাঠানো হয় না।
- Infinite-scroll append এবং background refresh—দুই ক্ষেত্রেই visible ad anchor/scroll position preserve করা হয়।
- Persistent route host-ও আর next animation frame-এ পুরোনো scroll position লিখে user scroll overwrite করে না।

### Orders performance

- **Ongoing** এবং **Fulfilled** group একই render-এ প্রস্তুত থাকে।
- Ongoing ↔ Fulfilled click করলে আর পুরো Orders page re-render বা API call হয় না; শুধু active group visibility switch হয়।
- এর ফলে বড় order history থাকলেও group switch তাৎক্ষণিক হয়।
- Orders list fetch সব accessible account-এর data একবারে নেয়; API account change এখন client-side filter, তাই filter করতে network round-trip লাগে না।

### Orders filter

- Orders page-এর পুরোনো API account selector strip সরানো হয়েছে।
- তিন-ডট action menu-এর বাম পাশে user-supplied funnel/filter icon ব্যবহার করা হয়েছে। Icon file পরিবর্তন/পুনরায় তৈরি করা হয়নি।
- Filter popup-এ এখন:
  - **API Account**
  - **Buy / Sell**
  - **Payment Method**
  - **Date**
- **Apply** বর্তমান session-এর জন্য filter প্রয়োগ করে।
- **Save** browser-এ user-scoped filter persist করে, ফলে পরের visit-এ একই filter ফিরে আসে।
- **Reset** current এবং saved filter clear করে।
- Filter active থাকলে icon-এর পাশে active-filter count দেখায়।

### Version rule

- Release version: **1.6.1**।
- Version utility এখন PATCH digit 9 হলে carry করে: `1.6.9 -> 1.7.0`।
- MINOR digit 9 carry করলে: `1.9.9 -> 2.0.0`।
- Future version updates package metadata, UI cache-busting এবং self-test version expectations sync করবে।

## যাচাই

- JavaScript syntax check: 99 files.
- `npm run build`: passed.
- `npm test`: passed.
- Dedicated v1.6.1 stability test covers Login CSRF bootstrap, Chat scroll stability, P2P Market viewport stability, instant Orders group switch, four Orders filters, supplied icon integrity এবং version digit carry.

## Production update note

Update করার আগে `.env`, `.p2pflow`, `shared/` এবং production database-এর backup রাখুন। Application files replace করার সময় persistent runtime data overwrite করবেন না। এরপর production server-এ dependency install, `npm run build`, `npm test`, production preflight এবং service restart সম্পন্ন করুন।
