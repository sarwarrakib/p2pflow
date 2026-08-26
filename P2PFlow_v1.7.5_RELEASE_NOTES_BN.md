# P2PFlow v1.7.5 — Performance & Realtime Optimization

## লক্ষ্য

এই রিলিজের মূল লক্ষ্য হলো UI/navigation-কে lightweight রাখা, Binance C2C sync-এ অপ্রয়োজনীয় request burst কমানো, realtime data path-কে WebSocket/SSE-first করা, এবং slow request/HTTP timeout-এর প্রধান server-side কারণগুলো সরানো।

## যেসব bottleneck ঠিক করা হয়েছে

### 1. Mutation-এর পরে duplicate full-state persistence

আগে একটি POST/PATCH/PUT/DELETE handler নিজে `saveDb()` করার পর response wrapper আবার persistence schedule করতে পারত। Full state serialize + Brotli encrypt + database transaction হওয়ায় একই request-এ দ্বিতীয় write latency বাড়াত।

v1.7.5-এ request-scoped persistence tracking যোগ হয়েছে। Handler ইতিমধ্যে durable save schedule করলে response safety layer আর দ্বিতীয় full-state save করে না। Safety fallback রাখা হয়েছে—কোনো mutation handler save ভুলে গেলে wrapper এখনও save করবে।

### 2. Realtime chat-এ WebSocket থাকা সত্ত্বেও REST polling

Binance C2C chat এখন primary path হিসেবে persistent WebSocket ব্যবহার করে। Healthy WebSocket থাকলে background chat reconciliation REST call skip হয়। Browser-side open chat SSE connected থাকলে 20 সেকেন্ডের lightweight REST safety/catch-up interval ব্যবহার করে; SSE disconnect হলে 3 সেকেন্ড fallback হয়।

Server WebSocket-এ ping/pong health check এবং half-open connection terminate/reconnect যোগ হয়েছে। Incoming chat bursts-এর persistence 125ms coalescing window-এ durable save হয় যাতে message-per-write amplification না হয়।

### 3. Order detail sequential call pressure

Fast order-discovery path 3 সেকেন্ডেই রাখা হয়েছে। Heavy detail reconciliation-এর legacy defaults পরিবর্তন করা হয়েছে:

- `binanceAutoSyncSeconds`: 15 → 30 (শুধু exact legacy default হলে; owner-custom value preserve হয়)
- `binanceOpenOrderDetailRows`: 100 → 12 (শুধু exact legacy default হলে)
- rapid routine detail budget: default 8 / 25s per credential

নতুন order, missing payId/payment detail, generic/missing payment snapshot এবং missing raw detail routine budget bypass করে—অর্থাৎ গুরুত্বপূর্ণ enrichment delay করা হয়নি।

### 4. Binance SAPI request burst / queue timeout

Shared request scheduler যোগ হয়েছে:

- global concurrency default: 8
- per API key concurrency default: 3
- local queue max: 600
- bounded queue-wait deadline
- 418/429 `Retry-After` adaptive backoff
- mutation/final-action requests background read-sync-এর চেয়ে বেশি priority পায়
- mutation request automatic retry করা হয় না, যাতে duplicate trading action না হয়

### 5. Static JS/CSS repeated disk read + compression

Process-local bounded LRU static cache যোগ হয়েছে। Raw asset এবং compressed representation cache হয়। Browser `br` support করলে Brotli quality 5 ব্যবহার হয়; fallback gzip থাকে। Sample production assets-এ Q5 Brotli gzip-এর তুলনায় প্রায় 5.7%–11.3% ছোট হয়েছে।

### 6. Extension polling hang / dead-server hammering

Binance C2C Advertiser Feedback CRM Collector v6.1.9-এ:

- AbortController fetch timeout
- task GET timeout 8s
- result POST timeout 12s
- consecutive failure adaptive backoff, max 30s
- result POST auto-retry disabled to avoid duplicate result submission

## Observability

- `P2PFLOW_SLOW_REQUEST_MS` default 2500ms
- slow requests server log-এ method, path, status, duration এবং request-এর save count দেখায়
- `Server-Timing` response header যোগ হয়েছে
- network health output-এ Binance scheduler queue/concurrency এবং realtime chat connection health যুক্ত হয়েছে

## Performance environment options

```env
P2PFLOW_BINANCE_HTTP_CONCURRENCY=8
P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY=3
P2PFLOW_BINANCE_HTTP_MAX_QUEUE=600
P2PFLOW_BINANCE_ROUTINE_DETAIL_BUDGET=8
P2PFLOW_STATIC_CACHE_MB=32
P2PFLOW_STATIC_CACHE_ENTRY_KB=2048
P2PFLOW_SLOW_REQUEST_MS=2500
```

Defaults দিয়েই শুরু করা উচিত। Production metrics দেখে পরে tune করুন; concurrency অকারণে বাড়ালে Binance throttling বাড়তে পারে।

## Realtime flow

Normal path:

`Binance C2C WebSocket → P2PFlow server → durable state → SSE delta → browser DOM patch`

Fallback/catch-up:

`Binance REST pagination → local state → SSE/browser refresh`

Page reload realtime sync-এর অংশ নয়; existing route host/data patching ব্যবহার করা হয়।

## Regression protection

- database schema: 37 (unchanged)
- proven Binance order-ingestion core remains `v1.6.4-byte-protected`
- dedicated `performance-realtime-v175-self-test.js` added
- full JavaScript syntax scan, realtime UI stability test, protected order-core test, complete `npm test` suite pass required before packaging

## Deployment note

Existing production server update করার সময় `.env`, `.p2pflow`, persistent database/shared data এবং runtime secrets overwrite করবেন না। New source replace করে production dependency install, build/test/preflight এবং controlled restart করুন।
