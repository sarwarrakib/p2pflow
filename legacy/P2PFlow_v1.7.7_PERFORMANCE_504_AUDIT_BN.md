# P2PFlow v1.7.7 — 504 / Save Performance Audit

## Root cause

v1.7.6-এ duplicate save scheduling ইতিমধ্যে কমানো হয়েছিল, কিন্তু response durability barrier এখনও global ছিল। `sendJson()` mutating request-এর জন্য `flushDatabaseSave()` ব্যবহার করত। State store-এর `flush()` queue empty না হওয়া পর্যন্ত loop করত। Background Binance sync, realtime chat checkpoint, notification/session state বা অন্য writer চললে user-এর settings request নিজের save complete হওয়ার পরও নতুন background save-এর জন্য অপেক্ষা করতে পারত।

এই starvation pattern `/api/chat-account-controls`-এর মতো খুব ছোট mutation-কে 504 পর্যন্ত নিয়ে যেতে পারে।

## New persistence model

প্রতিটি schedule-এর sequence ticket আছে:

1. Mutation `saveDb()` করে এবং ticket N পায়।
2. Existing snapshot যদি ticket N-এর আগে শুরু হয়ে থাকে, N next coalesced snapshot-এ যায়।
3. Snapshot commit হলে store `persistedSaveTicket` advance করে।
4. Request ticket N persisted হলেই response দিতে পারে।
5. Ticket N-এর পরে আসা Binance/chat/background work response-কে আর block করে না।

এটি optimistic fake-success নয়; response এখনও নিজের durable checkpoint-এর জন্য অপেক্ষা করে। শুধু unrelated future queue-এর wait বাদ দেওয়া হয়েছে।

## Synthetic contention verification

Self-test-এ প্রতি ~12ms background save noise চলার সময় 55ms simulated DB write ব্যবহার করা হয়েছে। User settings mutation background noise শেষ হওয়ার আগেই প্রায় 100ms range-এ resolve করেছে, এবং পরে full `flush()` সব ticket drain করেছে।

## Cold first-load improvement

v1.7.6 memory LRU প্রথম request-এর পর দ্রুত ছিল। v1.7.7 startup-এ `index.html`, `style.css`, `app.js`, route core এবং common page bundles raw + Brotli + gzip prewarm করে। তাই process restart/deploy-এর পর প্রথম real user-কে on-demand compression-এর cost বহন করতে হয় না। Browser/network cold cache cost অবশ্যই network quality-এর উপর নির্ভরশীল।

## Production diagnosis

Response headers:

- `X-P2PFlow-Response-Ms`
- `X-P2PFlow-Persist-Ms`
- `Server-Timing: app;dur=..., persist;dur=...`

Slow request log:

`[slow-request] PATCH /api/... -> 200 in ...ms (saveCalls=..., persistWait=...ms)`

যদি v1.7.7-এও persistence কয়েক সেকেন্ড ছাড়ায়, তাহলে সেটা global queue starvation নয়; DB/network/storage latency আলাদা করে health/slow log দিয়ে ধরা যাবে।

## Safety

Payment/order/ledger/final-action mutations non-durable করা হয়নি। Database failure হলে আগের fail-safe maintenance/restart behavior বজায় থাকে।
