# P2PFlow v1.5.23 — Public Launch Checklist

## Package ও backup

- [ ] `P2PFlow_v1.5.23_UNIFIED.zip` SHA-256 verify করা হয়েছে।
- [ ] Production database backup নেওয়া হয়েছে।
- [ ] `.env`, `.p2pflow/` ও `shared/` backup নেওয়া হয়েছে।
- [ ] Previous application package/rollback copy প্রস্তুত আছে।
- [ ] Runtime secret বা production database ZIP/GitHub-এ কপি করা হয়নি।

## Install ও process

- [ ] Node.js 20+ চলছে।
- [ ] `npm ci --omit=dev --ignore-scripts` সফল।
- [ ] `npm run build` সফল।
- [ ] `npm test` সফল।
- [ ] Production preflight সফল।
- [ ] Service restart-এর পরে healthy অবস্থায় আছে।
- [ ] Browser/CDN cache থেকে v1.5.23 assets load হচ্ছে।

## Payment Account Serial scope

- [ ] Same Payment Method + same normalized Label + same Serial block হয়।
- [ ] Different named Labels একই Serial reuse করতে পারে।
- [ ] Named Label ও no-Label একই Serial reuse করতে পারে।
- [ ] দুইটি no-Label row একই Method/Serial-এ block হয়।
- [ ] Different Payment Method একই Label/Serial reuse করতে পারে।
- [ ] Legacy no-Label existing account নতুন named Label row block করে না।
- [ ] Case, repeated space ও Unicode normalization expectedভাবে কাজ করে।
- [ ] Edit নিজের current record-কে duplicate ধরে না।

## Bulk Add diagnostics

- [ ] Duplicate row preview-তে লাল highlight হয়।
- [ ] Warning exact Serial দেখায়।
- [ ] Warning exact Label অথবা no-Label scope দেখায়।
- [ ] Warning conflicting Account row number দেখায়।
- [ ] Existing conflict হলে accessible account number দেখায়।
- [ ] Permission-এর বাইরে থাকা account number error response-এ প্রকাশ পায় না।
- [ ] একটি সত্যিকারের error হলে batch atomic থাকে এবং কোনো partial account তৈরি হয় না।

## Payment Account permissions

- [ ] Admin/Manager সব Payment Account access পায়।
- [ ] Agent শুধু নিজের permitted Payment Account দেখে ও manage করে।
- [ ] Add Account-এ Agent নিজে default owner হয়।
- [ ] Label/Serial search permission scope-এর বাইরে data দেখায় না।
- [ ] Ledger Adjust আলাদা permission অনুযায়ী কাজ করে।

## Core regression

- [ ] Login ও trusted-device session স্থিতিশীল।
- [ ] Security page কাজ করে।
- [ ] Orders দ্রুত load হয় এবং account scope ঠিক থাকে।
- [ ] Ads দুই Binance account-এ update/publish isolation ঠিক থাকে।
- [ ] P2P chat smooth incremental update করে।
- [ ] Work Status visibility permission অনুযায়ী ঠিক।
- [ ] Notifications ON/OFF foreground sound ও browser Push অনুযায়ী কাজ করে।
- [ ] Offline Business reservation ও partial/full order flow ঠিক।
- [ ] Accounting/ledger totals অপরিবর্তিত।

## Public launch gate

- [ ] Real database backup restore drill সফল।
- [ ] HTTPS, reverse proxy ও allowed hosts configured।
- [ ] SMTP primary/backup delivery test সফল।
- [ ] Controlled Binance Orders/Ads/Chat test সফল।
- [ ] Android/iPhone/desktop responsive smoke test সফল।
- [ ] Monitoring, log rotation ও backup alerts active।
- [ ] Rollback procedure staging-এ পরীক্ষা করা হয়েছে।
