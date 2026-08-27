# P2PFlow v1.7.9 — Owner Permission Launch Checklist

## Deploy safety

- [ ] `.env`, `.p2pflow`, `shared/` এবং database backup/preserve করা হয়েছে।
- [ ] `npm run build` PASS।
- [ ] `npm test` PASS।
- [ ] Application process/reverse proxy restart complete।

## Owner all-rounder verification

- [ ] Owner login-এর পরে Orders page permission denied ছাড়াই খোলে।
- [ ] Owner P2P Message/Chat open/read/send permission gate pass করে।
- [ ] Owner Binance Sync action চালাতে পারে।
- [ ] API Credentials page-এ **Sync Payment Methods** চাপলে multiple Binance account থাকলেও "Select the Binance account" error আসে না।
- [ ] Sync response-এ account count এবং created/updated summary আসে।
- [ ] Owner অন্য user/agent-এর Payment Account operationally access/use করতে পারে।
- [ ] নতুন Binance credential add করার পর Owner-কে আলাদা permission grant না দিয়েও Orders/Chat/Sync account scope পাওয়া যায়।

## Feature-control separation

- [ ] Advertisement OFF করলে Chat/Sync permission deny হয় না।
- [ ] Orders OFF করলে শুধু সেই account-এর Orders visibility/assignment behavior OFF থাকে।
- [ ] Notifications OFF করলে শুধু notification behavior পরিবর্তন হয়।
- [ ] Ads ON/OFF শুধু Advertisement behavior নিয়ন্ত্রণ করে।

## Non-owner RBAC regression

- [ ] Non-owner Admin/Manager role label একা exact Binance-account access দেয় না।
- [ ] Agent কেবল explicit granted account/permission অনুযায়ী কাজ করে।
- [ ] Permission editor থেকে non-owner unauthorized account grant করা যায় না।

## Existing performance/realtime smoke test

- [ ] Settings save 200 JSON দেয়; HTML 504 নয়।
- [ ] Orders/Chat/Ads page navigation stale response দিয়ে পুরনো page-এ jump-back করে না।
- [ ] Chat realtime WebSocket/SSE কাজ করে।
- [ ] Binance scheduler queue/rate-limit health স্বাভাবিক।
