# P2PFlow v1.7.6 — Manual Update

1. বর্তমান `.env`, `.p2pflow/`, `shared/` এবং database backup নিন।
2. `P2PFlow_v1.7.6_UNIFIED.zip` application root-এ extract করে application files overwrite করুন। Runtime data/secrets overwrite করবেন না।
3. Production dependency install চালান: `npm ci --omit=dev --ignore-scripts`।
4. `npm run build` এবং `npm test` চালান।
5. `npm run preflight:production` চালিয়ে host/proxy/database configuration verify করুন।
6. Node service restart করুন।
7. Health Check-এ database, Binance REST, C2C WebSocket এবং scheduler queue verify করুন।
8. Orders, chat, Ads, Accounting এবং notifications smoke test করুন।

Database schema 37 অপরিবর্তিত; v1.7.6 performance merge-এর জন্য নতুন schema migration প্রয়োজন নেই।
