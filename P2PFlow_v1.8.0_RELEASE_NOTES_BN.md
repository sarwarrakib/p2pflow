# P2PFlow v1.8.0 — Scalable Node Core

এই release পুরো application rewrite নয়। P2PFlow-এর existing Node.js runtime, current UI/UX, Orders, Ads, Chat, Payment Accounts, Accounting, permission model, notifications, extension bridge, Binance SAPI integration এবং signed update flow preserve রেখে সবচেয়ে বড় performance/scaling bottleneckগুলো ভিতর থেকে clean করা হয়েছে।

## কেন এই update

পুরনো architecture-এ application state একটি বড় object হিসেবে memory-তে থাকত এবং durable mutation-এর সময় বড় state payload serialize/compress/encrypt করে database-এর main state row replace করা হতো। Data বাড়ার সঙ্গে chat/audit/ledger history-ও ওই state-এর সঙ্গে বাড়ত। একই সঙ্গে multiple Binance account sync অনেক জায়গায় account-by-account serial ছিল এবং hot UI/API path-এ repeated full-array scan ছিল।

v1.8.0-এর লক্ষ্য: Node.js রেখেই data growth, API-account growth এবং background load যেন interactive request-কে অযথা block না করে।

## মূল পরিবর্তন

### 1. High-growth state segmentation

`chats`, `ledgers` এবং `auditLogs` এখন main state-এর মধ্যে অনন্তকাল পুরো array হিসেবে rewrite হয় না। Default 500-row chunk পূর্ণ হলে সেটি existing encrypted database object store-এ immutable, content-addressed object হিসেবে seal হয়। Main state-এ থাকে sealed object references এবং ছোট active tail।

ফলে settings/permission-এর মতো unrelated ছোট save-এ পুরনো হাজার/লাখ chat/ledger/audit row আবার serialize + compress + encrypt + write করার প্রয়োজন কমে যায়। Existing legacy full-state database এখনও load হয়; প্রথম successful v1.8.0 save থেকে নতুন segmented representation ব্যবহার হতে পারে।

Environment tuning:

```env
P2PFLOW_STATE_SEGMENT_CHUNK_ROWS=500
```

500 default production-safe starting point। Benchmark ছাড়া খুব ছোট/খুব বড় value ব্যবহার করবেন না।

### 2. Runtime indexes — full-array scan কমানো

In-memory arrays authoritative থাকলেও frequently-used lookups-এর জন্য lazy runtime indexes যোগ হয়েছে। ID lookup, chat-by-order, external Binance message dedupe, latest incoming chat, unread snapshot, ledger account balance, daily/monthly usage এবং ledger-by-order hot path cache/index ব্যবহার করে।

Array replace/append হলে cache signature দেখে invalidation/rebuild হয়। Business data duplicate store করা হয় না এবং cache process restart-এর পর database থেকে পুনরায় তৈরি হয়।

### 3. Multiple Binance API account sync bounded-parallel

একাধিক credential/account থাকলে সব account sequentially শেষ করার বদলে independent account sync bounded concurrency-তে চলে। Default:

```env
P2PFLOW_BINANCE_ACCOUNT_SYNC_CONCURRENCY=3
P2PFLOW_BINANCE_FAST_ACCOUNT_SYNC_CONCURRENCY=4
```

Existing central Binance HTTP scheduler এখনও global/per-key concurrency, priority, queue এবং 429/backoff control-এর boundary। তাই account বাড়লেই unbounded `Promise.all()` দিয়ে Binance rate limit আঘাত করা হয় না।

Ads synchronization এবং merchant-status verification-ও bounded account concurrency ব্যবহার করে। Global ads asset/fiat catalog একই cycle-এ credential প্রতি অপ্রয়োজনীয়ভাবে repeat করা হয় না।

### 4. Background save coalescing

Auto-sync/cleanup/merchant-status/Ads background path-এর checkpoint save coalesced হয়েছে। একই short window-তে background job-এর একাধিক state change অপ্রয়োজনীয়ভাবে back-to-back full durable save queue তৈরি করবে না।

### 5. Durability classification

Security, credential, permission, settings, financial/accounting এবং final order actions durable-before-response থাকে। Low-risk notification read/unread acknowledgement-এর মতো mutation relaxed durability ব্যবহার করতে পারে, যাতে UI শুধু read marker save-এর disk/database latency অযথা বহন না করে।

এই classification intentionally narrow। Financial বা permission mutation-কে relaxed করা হয়নি।

### 6. Future multi-customer workspace foundation

Schema 38-এ primary workspace metadata এবং legacy business records-এর `workspaceId` foundation যোগ হয়েছে। বর্তমান deployment এখনও **single workspace**। এই release public SaaS multi-tenancy চালু করছে না।

উদ্দেশ্য হলো ভবিষ্যতে customer/tenant isolation migration করার সময় existing records কোন workspace-এর তা deterministic থাকা। Public customer registration চালুর আগে server-side workspace filter, unique constraints, authorization boundary, credential ownership, subscription/entitlement এবং tenant-isolation regression test আলাদা phase-এ complete করতে হবে।

### 7. Existing realtime/chat architecture preserve

Binance C2C chat-এর existing persistent WebSocket flow preserve করা হয়েছে। REST pagination reconnect/catch-up/fallback হিসেবে ব্যবহার করা যেতে পারে; primary realtime message delivery polling-only architecture-এ নামানো হয়নি।

### 8. Health diagnostics

Health diagnostics এখন runtime index stats, account-sync concurrency এবং segmented-state metadata expose করতে পারে। Production public health endpoint-এ sensitive details expose করবেন না।

## Deployment model

Default production deployment এখনও সহজ:

```text
Node.js application
        |
MariaDB / MySQL / PostgreSQL
```

Redis, NATS, Kafka, Kubernetes বা Docker Compose **required নয়**। Current data model-এ multiple independent app writers চালাবেন না; database state store single-writer assumption preserve করে। Real load এক process-এর capacity ছাড়ালে প্রথম safe separation হবে Binance/background execution architecture, কিন্তু তার আগে persistence/tenant modelকে multi-writer-safe করতে হবে।

## Database/schema

- Application version: `1.8.0`
- Database schema: `38`
- Existing data migration: automatic
- Primary DB providers preserved: MariaDB/MySQL/PostgreSQL
- Existing encrypted state/history/object storage preserved

## Compatibility

- Existing UI/routes retained
- Existing permission/role semantics retained
- Existing Binance API credential model retained
- Existing Extension v6.1.9 integration contract retained
- Existing system-update mechanism retained
- Existing database remains authoritative

## Important rollback note

v1.8.0 first successful persistence-এর পর schema 38 এবং segmented-state manifest/database objects তৈরি হতে পারে। পুরনো v1.7.9 code segmented main-state representation বোঝে না। তাই v1.8.0 থেকে code-only downgrade করে v1.7.9 চালানো safe ধরে নেবেন না। Upgrade-এর আগে database backup বাধ্যতামূলক। Rollback হলে v1.7.9 code-এর সঙ্গে pre-v1.8 database backup restore করতে হবে, অথবা tested v1.8 rollback path ব্যবহার করতে হবে।

## Validation included

Source package-এ scalable-core self-test, JS parse/static checks এবং existing regression self-tests রাখা হয়েছে। Final public launch-এর আগে real database clone/staging environment-এ migration + restart + Binance read/sync + UI regression test চালাতে হবে। Financially destructive Binance action test production account-এ automatedভাবে চালানো উচিত নয়।
