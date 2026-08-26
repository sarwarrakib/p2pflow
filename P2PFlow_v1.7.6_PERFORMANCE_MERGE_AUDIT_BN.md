# P2PFlow v1.7.6 — দুই v1.7.5 branch merge audit

## Merge policy
Base হিসেবে Binance/realtime-protected v1.7.5 branch নেওয়া হয়েছে। অন্য v1.7.5 branch থেকে এমন optimization port করা হয়েছে যেগুলো correctness বা realtime latency নষ্ট না করে browser/DB load কমায়। যেখানে দুই branch-এর strategy conflict করেছে সেখানে hybrid behavior ব্যবহার করা হয়েছে।

## Conflict resolution

| Area | Branch A strength | Branch B strength | v1.7.6 decision |
|---|---|---|---|
| Initial JS | all page modules eager | active page only | B-style lazy modules + active route preload |
| Orders | all history loaded, instant tab | active group only | active group first paint + post-paint inactive hydration + instant switch after hydration |
| Mutation durability | duplicate save protection | heartbeat non-durable | both |
| db_updated | immediate broad event | 1.8s coalescing | configurable 1.2s broad coalescing; targeted events immediate |
| Binance calls | global/per-key scheduler | direct calls | A scheduler retained |
| Order details | 30s/12 rows + budget | 15s/100 rows | A bounded detail profile retained |
| C2C chat | WebSocket-first, REST suppressed | aggressive REST polling | A WebSocket-first retained |
| Ads/Accounting safety | 15s healthy / 5s down | 30s fixed | 30s healthy / 5s disconnected hybrid |
| Chat inbox safety | 12s | 30s | 30s healthy / 8s disconnected hybrid |
| Static files | raw+compressed bounded LRU | compressed-only cache | A raw+compressed LRU retained |
| Diagnostics | slow log + scheduler health | response-ms header | both |

## Important invariants preserved
- Protected order core was not rewritten.
- Mutation endpoints still receive durable response flush except explicitly non-durable activity heartbeat.
- Critical Binance final actions are not auto-retried by the scheduler.
- New/missing-payment order detail enrichment bypasses routine background budget.
- Browser realtime remains event-driven; slower intervals are safety fallbacks, not the primary sync path.

## Test result
- Full project test suite: PASS.
- Build suite: PASS.
- 109 JavaScript files: syntax PASS.
- Merged performance self-test: PASS.

## Static boot payload benchmark
একই Brotli quality 5 basis-এ script payload sum:

| First page | v1.7.5 eager branch | v1.7.6 merged | Reduction |
|---|---:|---:|---:|
| Dashboard | 253.8 KB | 139.0 KB | 45.2% |
| Orders | 253.8 KB | 150.0 KB | 40.9% |
| Ads | 253.8 KB | 160.8 KB | 36.7% |
| Accounting | 253.8 KB | 149.2 KB | 41.2% |
| Chat | 253.8 KB | 142.4 KB | 43.9% |

v1.7.6 first paint সাধারণত 6টি script path ব্যবহার করে (history router, route host, page preloader, device auth, app core, active page module), যেখানে eager branch 28টি script path load করত।

## Request pressure profile
- Open Binance chat healthy realtime: 20s REST safety catch-up = প্রায় 3 requests/minute; disconnected fallback = 3s।
- Legacy aggressive 1.5s chat polling-এর তুলনায় healthy অবস্থায় REST request প্রায় 92.5% কম।
- Activity heartbeat durable checkpoint 60s; request-level heartbeat flush disabled।
- Generic `db_updated` burst default 1200ms window-এ coalesce হয়।
