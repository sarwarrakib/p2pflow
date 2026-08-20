# P2PFlow v1.5.33 — Release Notes

**Application:** 1.5.33  
**Database schema:** 35  
**Migration:** প্রয়োজন নেই

## 1. Order Chat আর reload/jump করবে না

Order detail/chat খোলা অবস্থায় background database/order events আর পুরো order page re-render করে না। Current order state non-destructiveভাবে refresh হয় এবং chat message `chat-delta`/realtime event দিয়ে incrementalভাবে merge হয়।

- chat খুলে প্রথম কয়েক সেকেন্ডে repeated full reload বন্ধ;
- user উপরে scroll করলে সেই scroll position রাখা হয়;
- নতুন message এলেও user-কে জোর করে bottom/top-এ নেওয়া হয় না;
- chat box hide/show করে layout jump বন্ধ;
- user bottom-এর কাছে থাকলেই নতুন message-এর সঙ্গে natural bottom-follow হয়।

## 2. Realtime Binance C2C chat

Enabled Binance credential-এর জন্য server persistent C2C WebSocket connection রাখার চেষ্টা করে। Incoming message পাওয়া গেলে message database-এ import করে authenticated SSE event পাঠানো হয়, তাই open chat-এ full page reload ছাড়াই message দেখা যায়।

WebSocket unavailable/disconnected হলে active order chat-এর fallback sync **1.5 seconds** interval-এ চলে। Reconnect exponential backoff ব্যবহার করে। API Mode live না হলে realtime sockets বন্ধ থাকে।

## 3. P2P Market 5-second refresh, কিন্তু scroll stable

P2P Market data প্রতি 5 seconds background-এ update হতে পারে এবং rate/order অনুযায়ী cards reorder হতে পারে। তবে refresh-এর আগে first visible market card/viewport anchor capture করা হয় এবং render শেষে একই visual anchor restore করা হয়।

Background refresh-এ loading repaint দেওয়া হয় না এবং page scroll top-এ reset করা হয় না।

## 4. Settings typing/focus stability

Settings, Chat এবং P2P Market interactive page generic `db_updated` event থেকে full auto-render বাদ দেওয়া হয়েছে। ফলে Settings-এ input/select edit করার সময় 5-second background event এসে লেখা কেটে দেওয়া বা form reset করার কথা নয়।

## 5. নতুন Order দ্রুত discovery

Detailed Binance order reconciliation cycle-এর পাশাপাশি নতুন lightweight **Fast Order Discovery** path যোগ হয়েছে। Default interval প্রায় **3 seconds** (`CRM_FAST_ORDER_DISCOVERY_MS`, minimum 2000 ms)।

Fast path:

- enabled Binance credentials parallelভাবে lightweight order list check করে;
- নতুন order বা material status/payment-method change পেলেই database persist + SSE broadcast করে;
- unchanged existing rows কেবল `updated` হিসেবে ফেরত এলেই database write/broadcast করে না, তাই 3-second write storm হয় না;
- deeper detail/chat reconciliation আগের slower background cycle-এ থাকে।

বাস্তব order visibility Binance API response/network latency-এর ওপরও নির্ভর করে; build environment থেকে production Binance latency guarantee করা যায় না।

## 6. Mark as Paid fast path

Synced order-এ exact Binance `orderNumber` এবং selected `payId` আগে থেকেই থাকলে Mark as Paid এখন heavy detail refresh-এর আগে সরাসরি documented action call করার fast path নেয়। Identifier missing হলে safe exact-order refresh fallback চলে।

এতে আগে দেখা 20–30 second unnecessary pre-refresh latency কমানোর উদ্দেশ্যে change করা হয়েছে। Production network/API latency এখনও Binance দ্বারা নিয়ন্ত্রিত।

## 7. Camera attachment

Order chat attachment tray-এ এখন:

- **Camera** — mobile device-এ rear/environment camera request করতে পারে;
- **Album** — gallery/file picker।

Application `Permissions-Policy`-তে same-origin camera অনুমোদিত; microphone/geolocation-এর আগের restriction অপরিবর্তিত। Browser/device support অনুযায়ী Camera button native camera picker খুলবে।

## 8. Screenshot/image send reliability

Chat image pipeline compact করা হয়েছে:

- large screenshots earlier stage-এ compress হয়;
- maximum image dimension 1440px target;
- oversized PNG প্রয়োজনে JPEG-এ convert হয়;
- compressed chat image 2 MB limit-এর মধ্যে আনার চেষ্টা করা হয়;
- Binance pre-signed PUT bounded timeout ব্যবহার করে;
- timeout/expired URL/403/408/429 ধরনের failure হলে একটি fresh pre-signed URL নিয়ে retry করা হয়;
- send button selected media-এর progress দেখায়।

এতে indefinite spinner-এর বদলে bounded success/failure path থাকে।

## 9. Existing v1.5.32 Release Verification

v1.5.32-এর challenge-driven Release behavior অক্ষত আছে: first Release probe minimal থাকে, Binance concrete Google/SMS/Fund/FIDO2/YubiKey challenge দিলে শুধু সেই verification screen আসে; ambiguous error থেকে generic verification-code field তৈরি হয় না।

## Verification performed

Source tree-তে:

- 89 JavaScript files syntax check;
- `npm run build`;
- সম্পূর্ণ `npm test`;
- realtime UI stability self-test;
- chat scroll/non-destructive refresh test;
- persistent WSS + 1.5s fallback static regression;
- P2P Market viewport-anchor regression;
- Settings generic rerender exclusion;
- fast order discovery/write-storm guard;
- Mark Paid fast-path regression;
- Camera/capture regression;
- image fresh-presign retry regression;
- existing Payment Split, Release Verification, RBAC, Ads isolation, session/security, DB persistence/encryption, accounting এবং signed updater tests।

Final Unified ZIP clean-extract করার পর একই build/test/PHP lint আবার চালানো হবে/হয়েছে release verification-এর অংশ হিসেবে।

## Live deployment limitation

এই build environment থেকে real production Binance credential দিয়ে নতুন order arrival timing, live C2C WebSocket delivery, real camera capture, screenshot upload এবং live Mark as Paid mutation end-to-end করা হয়নি। Deployment-এর পরে controlled live test আবশ্যক।
