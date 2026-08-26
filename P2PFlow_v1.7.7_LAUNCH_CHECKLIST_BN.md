# P2PFlow v1.7.7 Launch Checklist

- [ ] `.env`, database, `.p2pflow/`, `shared/` backup আছে
- [ ] `npm ci --omit=dev --ignore-scripts` সফল
- [ ] `npm run build` সফল
- [ ] `npm test` সফল
- [ ] `npm run preflight:production` সফল
- [ ] `/api/chat-account-controls` save 504 দেয় না
- [ ] Main Settings save normal latency-তে complete হয়
- [ ] Notification Preferences save complete হয়
- [ ] Network response-এ `X-P2PFlow-Persist-Ms` দেখা যায়
- [ ] slow-request log-এ নতুন `persistWait` telemetry কাজ করে
- [ ] `/api/health` database save queue lag অস্বাভাবিক নয়
- [ ] First cold page load ও second cached load দুটো test করা হয়েছে
- [ ] Orders / Ads / Accounting / Chat realtime event flow regression নেই
- [ ] Binance WS-first chat এবং REST fallback স্বাভাবিক
- [ ] Payment/final-action durability test সম্পন্ন

স্বাভাবিক production latency target কয়েক সেকেন্ডের মধ্যে রাখা হয়েছে; DB/network outage হলে false success না দিয়ে error/maintenance fail-safe বজায় থাকবে।
