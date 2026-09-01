# P2PFlow v1.8.0 — Production Launch Checklist

Public/critical traffic দেওয়ার আগে এই checklist complete করুন।

## Backup & rollback

- [ ] Full database backup নেওয়া হয়েছে এবং restore test জানা আছে
- [ ] Existing v1.7.9 source/runtime config backup আছে
- [ ] v1.8.0 → v1.7.9 rollback হলে old DB backup restore করতে হবে—team জানে
- [ ] `.env`, API keys, secret vault key GitHub/ZIP/public logs-এ নেই

## Build & regression

- [ ] `npm ci --omit=dev --ignore-scripts` successful
- [ ] `npm run build` successful
- [ ] `npm test` successful
- [ ] `npm run preflight:production` reviewed
- [ ] Browser console-এ critical JS error নেই

## Database & migration

- [ ] Schema 38 boot/migration successful
- [ ] Restart-এর পর data intact
- [ ] chats/ledgers/audit history visible
- [ ] Payment Account balances match pre-upgrade sample
- [ ] Accounting totals/reports match selected pre-upgrade dates
- [ ] Health diagnostics DB/state information reasonable

## Performance

- [ ] Settings/permission save-এর latency baseline নেওয়া হয়েছে
- [ ] Large chat inbox খুলে UI freeze নেই
- [ ] Large order list pagination/filter usable
- [ ] Event-loop lag/slow-request logs reviewed
- [ ] Background sync চলার সময় navigation/API response acceptable
- [ ] Database storage growth monitored

## Binance/API accounts

- [ ] At least one authorized Binance API account sync successful
- [ ] Multiple account sync bounded concurrency-তে চলছে
- [ ] HTTP 429/backoff logs abnormal নয়
- [ ] Fast order discovery duplicate order তৈরি করছে না
- [ ] Ads sync account isolation preserve করছে
- [ ] Merchant status sync correct account-এ apply হচ্ছে
- [ ] Interactive user action background sync-এর queue-তে starve হচ্ছে না

## Chat/realtime

- [ ] Chat credential retrieval works for authorized account
- [ ] Persistent C2C WebSocket connects/reconnects
- [ ] Incoming text message realtime আসে
- [ ] Duplicate message suppressed
- [ ] REST pagination history/catch-up works
- [ ] Image upload/download flow authorized staging test-এ works (যদি feature enabled থাকে)

## Security & permissions

- [ ] Owner/Admin/Manager/Agent sample roles regression tested
- [ ] Account-scoped Binance permission verified
- [ ] Agent অন্য account/customer data দেখতে পারে না
- [ ] Credential secret UI/log-এ plaintext leak হয় না
- [ ] Security question/trusted device/login flows tested
- [ ] Financial final actions required authorization ছাড়া সম্ভব নয়

## Future customer scale boundary

- [ ] Team বোঝে v1.8.0 workspaceId **foundation**, full public multi-tenancy নয়
- [ ] Public customer signup এখনো enable করা হয়নি যদি tenant-isolation phase complete না হয়
- [ ] Multiple app writer/replica deploy করা হয়নি; current state store single-writer
- [ ] Customer growth-এর আগে normalized tenant-scoped tables + server-side enforcement roadmap scheduled

## Sign-off

- [ ] Staging/live-read smoke test passed
- [ ] Backup verified
- [ ] Monitoring/alerts enabled
- [ ] Rollback owner assigned
- [ ] Release approved
