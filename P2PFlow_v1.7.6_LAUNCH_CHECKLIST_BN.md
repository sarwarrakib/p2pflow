# P2PFlow v1.7.6 — Launch Checklist

## 1. Code validation
- [ ] `npm ci --omit=dev --ignore-scripts`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run preflight:production`

## 2. Runtime files preserve করুন
- [ ] Existing `.env` replace করবেন না।
- [ ] `.p2pflow/`, `shared/`, database এবং runtime secrets preserve করুন।
- [ ] Deployment-এর আগে database backup নিন।

## 3. Performance defaults
- [ ] `P2PFLOW_BINANCE_HTTP_CONCURRENCY=8`
- [ ] `P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY=3`
- [ ] `P2PFLOW_BINANCE_HTTP_MAX_QUEUE=600`
- [ ] `P2PFLOW_BINANCE_ROUTINE_DETAIL_BUDGET=8`
- [ ] `P2PFLOW_STATIC_CACHE_MB=32`
- [ ] `P2PFLOW_STATIC_CACHE_ENTRY_KB=2048`
- [ ] `P2PFLOW_SLOW_REQUEST_MS=2500`
- [ ] `P2PFLOW_DB_UPDATED_COALESCE_MS=1200`

## 4. Production smoke test
- [ ] Login + session persistence।
- [ ] Dashboard first load এবং route switching।
- [ ] Orders: Ongoing first paint, Fulfilled switch, filters, manual refresh।
- [ ] New Binance order realtime arrival।
- [ ] Paid/status update এবং current-order non-destructive patch।
- [ ] Binance chat receive/send + image upload + reconnect।
- [ ] Ads list/edit/status + multi-account scope।
- [ ] Accounting realtime update + expense/income/capital/closing।
- [ ] Payment account add/edit + permission scope।
- [ ] Notifications / browser push / sound preference।

## 5. Hosting checks
- [ ] Outbound HTTPS to `api.binance.com:443` allowed।
- [ ] Outbound WSS/HTTPS to `im.binance.com:443` allowed।
- [ ] Reverse proxy WebSocket/SSE buffering/timeouts configured correctly।
- [ ] Server clock synchronized।
- [ ] Health page-এ scheduler queue abnormal নয় এবং realtime chat connected।

## 6. Observe after deploy
- [ ] Slow request logs (`[slow-request]`) 2.5s+ endpoint identify করুন।
- [ ] HTTP 418/429 frequency monitor করুন।
- [ ] Binance scheduler queue sustained high হচ্ছে কি না দেখুন।
- [ ] Database write/CPU/load এবং process memory observe করুন।
- [ ] Browser Network tab-এ initial page bundles lazy হচ্ছে নিশ্চিত করুন।
