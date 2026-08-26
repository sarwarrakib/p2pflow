# P2PFlow v1.7.7 — 504 / Settings Save Latency Hotfix

## প্রধান সমস্যা

`PATCH /api/chat-account-controls` সহ সাধারণ POST/PATCH/PUT/DELETE response durable হওয়ার আগে `flushDatabaseSave()` দিয়ে পুরো global save queue idle হওয়া পর্যন্ত অপেক্ষা করত। Binance order/chat/background checkpoint চলতে থাকলে unrelated save বারবার queue-তে ঢুকতে পারত। ফলে একটি ছোট settings change-ও proxy timeout পর্যন্ত (সাধারণত ~60s) অপেক্ষা করে HTML `504 Gateway Time-out` পেতে পারত।

## v1.7.7 পরিবর্তন

- PostgreSQL ও MariaDB/MySQL state store-এ monotonic **durability ticket** যোগ হয়েছে।
- প্রতিটি `saveDb()` এখন নিজের ticket-scoped Promise পায়।
- HTTP mutation response এখন শুধু **নিজের mutation যে committed snapshot-এ ঢুকেছে** সেই পর্যন্ত অপেক্ষা করে; unrelated future background queue drain হওয়ার জন্য অপেক্ষা করে না।
- Financial/order durability semantics বজায় আছে: confirmed mutation response দেওয়ার আগে তার ticket committed হতে হয়।
- `/api/activity/heartbeat` আগের মতো non-durable fast path-এ আছে।
- `Server-Timing` এখন `app` এবং `persist` আলাদা দেখায়।
- `X-P2PFlow-Persist-Ms` response header যোগ হয়েছে।
- slow-request log-এ `persistWait=...ms` দেখা যাবে।
- DB health payload-এ save queue ticket lag/waiter metrics যোগ হয়েছে।
- প্রথম cold request-এর disk read + Brotli/gzip cost কমাতে server startup-এ hot static assets prewarm হয়।
- Chat account settings Save button-এ `Saving…`/busy feedback এবং failure recovery যোগ হয়েছে।
- Main Settings form duplicate submit guard + `Saving…` state পেয়েছে।

## Regression protection

নতুন `scripts/mutation-persistence-v177-self-test.js` continuous background save noise simulate করে PostgreSQL ও MySQL দুই store-এই যাচাই করে যে user mutation global queue idle হওয়া পর্যন্ত আটকে থাকে না।

## Compatibility

- Database schema: **37 — unchanged**
- কোনো migration প্রয়োজন নেই।
- Existing `.env`, database, `.p2pflow`, `shared/` preserve করতে হবে।
