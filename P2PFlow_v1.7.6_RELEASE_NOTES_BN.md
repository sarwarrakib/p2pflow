# P2PFlow v1.7.6 — Performance Merge Release Notes

## উদ্দেশ্য
v1.7.5-এর দুইটি আলাদা performance branch-এর শক্তিশালী অংশ একত্র করে এমন একটি build তৈরি করা হয়েছে যেখানে fast initial browser load, realtime sync, Binance API pressure control, database write reduction এবং timeout resistance একসাথে থাকে।

## যেগুলো একত্র করা হয়েছে

### Browser / UI fast path
- সব page bundle আর application boot-এ একসাথে download/parse হয় না।
- `page-preload.js` current route-এর page module-টি app core-এর সাথে parallel-এ preload করে।
- অন্য page module প্রথমবার route open হলে lazy-load হয়।
- Generic `db_updated` event realtime-heavy pages (Orders, Ads, Chat, Accounting, P2P Market) rebuild করে না; page-specific realtime events প্রধান update path।
- Notification center প্রতিটি database event-এ refresh না করে relevant notification/order/chat event-এ refresh হয়।

### Orders hybrid loading
- প্রথম paint-এ শুধু active group (`ongoing` অথবা `fulfilled`) API payload আসে।
- First paint শেষ হওয়ার পর inactive group background-এ hydrate হয়।
- Hydration শেষ হলে Ongoing/Fulfilled switch আবার DOM-only instant toggle হয়।
- User hydration শেষ হওয়ার আগেই tab চাপলে শুধু selected group fetch হয়; full order history download হয় না।
- 120-row progressive rendering অপরিবর্তিত।

### Binance / realtime protection
- Shared Binance SAPI scheduler রাখা হয়েছে: global concurrency 8, per-key 3, bounded queue 600।
- HTTP 418/429 `Retry-After` backoff রাখা হয়েছে।
- Financial/final actions background list/detail calls-এর উপর priority পায়।
- Rapid routine order-detail budget রাখা হয়েছে; critical/new/missing-payment order budget bypass করে।
- Default heavy detail cycle 30 seconds / 12 open-order detail rows।
- C2C chat WebSocket healthy থাকলে background REST chat sweep skip হয়।
- WebSocket ping/pong half-open detection ও reconnect রাখা হয়েছে।
- Open chat browser fallback: realtime connected হলে 20s, disconnected হলে 3s; compact 20-row REST catch-up।

### Database / event pressure
- Request-scoped save tracking duplicate whole-state mutation checkpoint আটকায়।
- `/api/activity/heartbeat` request-level durable flush থেকে বাদ; activity checkpoint 60s।
- Broad `db_updated` notification configurable coalescing window-এ (default 1200ms) collapse হয়।
- Realtime chat burst persistence 125ms coalesced save path ব্যবহার করে।

### Static assets / diagnostics
- Hot raw JS/CSS/HTML + gzip/Brotli process-local bounded LRU cache রাখা হয়েছে।
- Slow request log threshold default 2500ms।
- `Server-Timing` এবং `X-P2PFlow-Response-Ms` response timing পাওয়া যায়।
- Network health-এ Binance scheduler এবং realtime chat health থাকে।

## Realtime safety polling
- Ads: SSE healthy 30s safety / disconnected 5s fallback।
- Accounting: SSE healthy 30s safety / disconnected 5s fallback।
- Chat inbox: SSE healthy 30s safety / disconnected 8s fallback।
- P2P Market: 8s bounded refresh।
- Open order chat: SSE healthy 20s / disconnected 3s REST fallback; WebSocket remains primary.

## Compatibility
- Database schema remains 37.
- Protected Binance order-ingestion engine remains byte-protected from the established v1.6.4 core.
- Existing permissions, account scopes, accounting rules, payment rules, update system and security behavior are covered by the existing self-test suite.

## Validation
- `node scripts/check-all-js.js`: 109 JavaScript files syntax checked.
- `npm test`: PASS.
- `npm run build`: PASS.
- `performance-merged-v176-self-test.js`: PASS, including live scheduler concurrency simulation.
