# P2PFlow v1.5.20 — Release Notes

- Application version: `1.5.20`
- Database schema: `33`
- Package type: Unified

## ১. হঠাৎ logout ও secret-code re-login সমস্যা

পুরোনো session binding network IP-prefix-এর সঙ্গে যুক্ত ছিল। Mobile carrier, Wi-Fi, proxy বা IPv6 route বদলালে একই browser session-ও mismatch হয়ে logout হতে পারত।

v1.5.20-এ:

- নতুন session stable browser-family binding v2 ব্যবহার করে।
- Trusted/Bonded device থাকলে cryptographic device ID binding-এর অংশ হয়।
- IP address শুধু audit metadata; IP বদলালেই session invalid হয় না।
- পুরোনো v1 session একই browser family প্রমাণিত হলে v2-তে upgrade হয়।
- কোনো API call সাময়িক 401 দিলে frontend `/api/me` দিয়ে session confirm করে একবার request retry করে; প্রথম 401-তেই login page-এ পাঠায় না।
- Revoked trusted device, disabled user, expired session বা প্রকৃত binding mismatch এখনও fail-closed থাকে।

## ২. Orders ও Ads দ্রুত load

### Orders

- Orders response-এর সঙ্গে unread chat count, latest unread state ও account context একবারে আসে।
- Mobile/sidebar badge-এর জন্য Orders, Chat ও Approval আলাদা তিনটি request-এর বদলে একটি `/api/navigation-counts` request ব্যবহার হয়।
- Order list filter ও accessible-order calculation precomputed context ব্যবহার করে।

### Ads

- Ads page প্রথম render-এ cached merchant/readiness state ব্যবহার করে।
- Normal page open বা account switch-এ blocking live merchant probe চালানো হয় না।
- Live refresh background-এ quietভাবে হয়।
- Explicit Sync, Business/Online/Break action এবং mutation-এর সময় exact account live validation বহাল থাকে।

## ৩. Bonded device Background Web Push

Trusted/Bonded device-এ Chat বা Notifications page থেকে **Notifications ON** করলে browser Web Push subscription তৈরি হয়।

Supported platform-এ app background, inactive বা closed থাকলেও system notification আসতে পারে:

- নতুন order assignment
- নতুন Binance P2P message
- user-এর enabled Background notification categories
- security এবং জরুরি system alert

Master Notifications ON করলে সব Background category ON হয়। Notifications OFF করলে background push delivery বন্ধ থাকে। Notification Preferences page থেকে In App, Email এবং Background channel category অনুযায়ী আবার customize করা যায়।

Implementation:

- Service Worker: `public/sw.js`
- PWA manifest: `public/manifest.webmanifest`
- VAPID key pair encrypted database settings-এ একবার generate/persist হয়।
- Existing subscription ধরে রাখতে server move-এর সময় একই database বা একই VAPID keys preserve করতে হবে।
- Push endpoint public HTTPS network validation ও permanent 404/410 subscription cleanup আছে।
- Payload RFC 8291/RFC 8188 `aes128gcm` encryption এবং VAPID authentication ব্যবহার করে।

### Platform limitation

- HTTPS বাধ্যতামূলক।
- User gesture থেকে browser notification permission দিতে হবে।
- iPhone/iPad-এ site-টি **Add to Home Screen** করে Home Screen web app থেকে permission দিতে হবে।
- App পুরো বন্ধ থাকলে notification sound, vibration ও interruption level OS/browser নিয়ন্ত্রণ করে। P2PFlow `silent:false` পাঠায়, কিন্তু custom foreground sound-কে background system notification-এ বাধ্য করা যায় না।

## ৪. Work Status সবার জন্য

সব enabled user-এর top bar, Orders page এবং Chat area-তে **Work: ON / PAUSED** button দেখা যায়।

- Agent-এর Work Status ON: offline থাকলেও permission, account scope, routing ও capacity match করলে নতুন order assign হতে পারে।
- Agent-এর Work Status PAUSED: online থাকলেও নতুন auto/manual assignment block হয়।
- Non-Agent user-এর button operational availability দেখায়; Agent assignment candidate না হলে এটি assignment permission তৈরি করে না।
- Presence/Online status শুধু monitoring; assignment decision-এর উৎস নয়।
- Admin user editor থেকে Agent setting পরিবর্তন করলে linked user Work Status-এর সঙ্গে sync হয়।

## ৫. Smooth Binance chat

আগে নতুন incoming/outgoing message-এ order detail পুরো re-render হওয়ায় page jump, scroll reset ও composer disturbance হতে পারত।

v1.5.20-এ:

- নতুন `/api/orders/:id/chat-delta?afterId=...` endpoint শুধু নতুন chat rows ফেরত দেয়।
- SSE `chat.message.received` ও `chat.message.sent` event পুরো order reload না করে delta fetch করে।
- Text, image/video এবং quick payment-number send-এর পর response থেকে নতুন message merge হয়।
- Chat scroll bottom-এর কাছে থাকলে smoothভাবে latest message দেখায়।
- পুরোনো message পড়লে scroll নড়ে না; **New messages** button দেখায়।
- P2P Message inbox full page replace না করে thread list ও unread summary partial refresh করে।
- Search focus, cursor position ও window scroll preserve হয়।

Binance chat credential/WebSocket send format এবং paginated message history API অপরিবর্তিত রাখা হয়েছে।

## ৬. Database migration

Schema `33` additive migration:

- user Background Notification master state
- per-category Push preferences
- Web Push subscriptions ও delivery health
- encrypted VAPID settings
- persistent Work Status normalization
- session binding v2 metadata

Existing users, trusted devices, orders, Ads, chats, payment accounts, offline transactions, ledger, accounting, audit ও security data preserve হয়।

## ৭. নতুন verification

`scripts/session-push-chat-performance-self-test.js` যোগ হয়েছে। এটি যাচাই করে:

- stable session binding v2 IP-independent
- combined navigation counts
- Service Worker/PWA push wiring
- RFC 8291/RFC 8188 encrypted payload roundtrip
- global Work Status controls
- incremental chat flow
- fast cached Ads initial load

## Update-এর পরে

1. Database, `.env`, `.p2pflow` ও `shared/` backup নিন।
2. Application files replace করুন; persistent files overwrite করবেন না।
3. `npm ci --omit=dev --ignore-scripts`
4. `npm run build`
5. `npm test`
6. Service restart করুন।
7. Browser hard refresh/CDN cache purge করুন।
8. Security থেকে device Bond/Trust করুন।
9. Chat-এর Notifications ON button থেকে permission দিন।
10. Mobile lock/background অবস্থায় controlled test order/message দিয়ে push যাচাই করুন।

Live production Binance credential বা real mobile lock-screen push এই build environment থেকে mutation/end-to-end test করা হয়নি; staging/production device verification প্রয়োজন।
