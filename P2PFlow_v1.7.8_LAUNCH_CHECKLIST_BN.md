# P2PFlow v1.7.8 — Launch / Performance Verification Checklist

## Deploy safety

- [ ] Existing `.env`, `.p2pflow`, `shared/` এবং database backup/preserve করা হয়েছে।
- [ ] Application files update করা হয়েছে; runtime secrets replace করা হয়নি।
- [ ] Production dependency install complete।
- [ ] `npm run build` PASS।
- [ ] `npm test` PASS।
- [ ] Process/reverse proxy restart complete।

## Browser performance check

- [ ] Hard refresh-এর পরে Dashboard usable time observe করুন।
- [ ] Orders, Chat, Ads, Settings, Accounting প্রথম click ও দ্বিতীয় click compare করুন।
- [ ] Slow/regular network-এ Page A click করে সঙ্গে সঙ্গে Page B click করুন — UI পরে Page A-তে jump-back করা যাবে না।
- [ ] Orders/Ads-এর বড় table render-এর সময় browser freeze/long pause আছে কি না দেখুন।
- [ ] Navigation sidebar route change-এ flicker/rebuild হচ্ছে কি না দেখুন।
- [ ] Bengali ↔ English language switch ঠিক আছে কি না দেখুন।

## Save / API check

- [ ] Settings save 200 JSON দেয়; HTML 504 নয়।
- [ ] `/api/chat-account-controls` save verify করুন।
- [ ] `X-P2PFlow-Response-Ms` এবং `X-P2PFlow-Persist-Ms` abnormal হলে log রাখুন।
- [ ] সাধারণ Save/Update user interaction practical target হিসেবে 6s-এর নিচে আছে কি না production-এ measure করুন।

## Realtime / Binance regression

- [ ] New order realtime আসে।
- [ ] Chat WebSocket/SSE realtime update কাজ করে।
- [ ] Ads account selector/action permission অনুযায়ী কাজ করে।
- [ ] Order/payment final actions duplicate বা stale UI তৈরি করে না।
- [ ] Network health-এ Binance scheduler unhealthy/queue saturation নেই।

## Rollout

- [ ] প্রথমে one admin + one normal/agent account দিয়ে smoke test।
- [ ] তারপর limited production users।
- [ ] 15–30 মিনিট slow-request/DB/Binance queue logs observe করে full traffic দিন।
