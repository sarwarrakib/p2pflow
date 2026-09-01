# P2PFlow Node.js Scalability Architecture — v1.8.0 Foundation

## Design principle

এই codebase-কে microservice rewrite করা হয়নি। লক্ষ্য হলো existing Node.js application-এর business behavior preserve করে **Modular Monolith + bounded background work** model-এ hot path clean করা। Deployment এক app process রেখেই সহজ থাকতে পারে।

## Request path

```text
Browser / Android / Extension
        |
     Node HTTP API
        |
  validate + authorize
        |
 local state / DB mutation
        |
 durability class
        |-----------------------------+
        |                             |
critical mutation                 background/low-risk
wait durable save                 coalesced/relaxed checkpoint
        |                             |
     response                      response/push
```

External Binance synchronization interactive local setting save-এর সঙ্গে tightly coupled করা উচিত নয়। UI-তে local/cached state first দেখানো এবং changed data realtime push করা preferred pattern।

## Data path

### Current authoritative storage

MariaDB/MySQL/PostgreSQL state store authoritative। High-growth append-only data segmented object store ব্যবহার করে:

```text
main encrypted state
  ├─ ordinary mutable collections
  └─ __p2pflowSegments
       ├─ chats: sealed object refs + active tail
       ├─ ledgers: sealed object refs + active tail
       └─ auditLogs: sealed object refs + active tail
```

Boot-এর সময় sealed chunks hydrate হয়ে application-এর legacy-compatible in-memory arrays reconstruct করে। তাই feature code ধাপে ধাপে modernize করা যায়; একসঙ্গে সব route rewrite দরকার নেই।

### Future normalization

অনেক independent customer/tenant এবং horizontal app replicas দরকার হলে next persistence phase হবে tenant-scoped normalized tables, যেমন:

```text
workspaces
users / memberships / roles
binance_credentials
orders
chats / chat_read_states
ads
payment_accounts
ledger_entries
notifications
audit_logs
```

প্রতিটি tenant-owned table-এ `workspace_id` + appropriate index/unique constraint থাকবে। Application authorization query-তেই workspace scope enforce হবে। PostgreSQL হলে optional Row Level Security defence-in-depth হিসেবে যোগ করা যেতে পারে।

v1.8.0 শুধু deterministic workspace foundation রাখে; এই future phase complete না হওয়া পর্যন্ত public multi-tenant isolation claim করা যাবে না।

## Binance concurrency model

দুই স্তরের bound থাকবে:

1. account-level sync pool — একই সময়ে কয়টি independent API account sync হবে
2. existing HTTP scheduler — global/per-key request concurrency, priority, queue, 429/backoff

এই দুই layer ছাড়া account সংখ্যা বাড়লে sequential latency বা বিপরীতে unbounded request storm—দুটোর যেকোনো একটি হয়।

Recommended start:

```env
P2PFLOW_BINANCE_ACCOUNT_SYNC_CONCURRENCY=3
P2PFLOW_BINANCE_FAST_ACCOUNT_SYNC_CONCURRENCY=4
P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY=3
```

Actual production 429/latency দেখে tune করতে হবে।

## Realtime

Binance C2C chat-এর জন্য persistent WebSocket primary realtime transport হিসেবে রাখুন। REST message pagination history/reconnect catch-up/fallback। P2PFlow browser side-এ existing SSE/targeted realtime event ব্যবহার করে changed data push করুন; page reload/polling primary mechanism করবেন না।

## What remains intentionally simple

- No mandatory Redis
- No mandatory NATS/Kafka
- No Kubernetes
- No 20+ microservices
- No Go rewrite
- No multiple app writers yet

এইগুলো scale signal ছাড়া যোগ করলে deployment/debug complexity বাড়বে কিন্তু current giant-state/data-query bottleneck নিজে থেকে solve করবে না।

## Scale triggers

পরবর্তী separation/normalization কাজ শুরু করার practical signal:

- DB main-state save p95/p99 steadily বাড়ে
- event-loop lag user-visible হয়
- Binance account queue saturation/429 increases despite tuning
- one process CPU/RAM sustained high
- customer isolation/public signup requirement আসে
- horizontal replica দরকার হয়

তখন প্রথম priority persistence normalization + tenant enforcement; তারপর background Binance worker process; এরপর প্রয়োজনমতো realtime/billing separation।
