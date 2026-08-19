# P2PFlow v1.5.25 — Public Launch Checklist

## Package ও backup

- [ ] `P2PFlow_v1.5.25_UNIFIED.zip` SHA-256 verify করা হয়েছে।
- [ ] Production database backup নেওয়া ও restore test করা হয়েছে।
- [ ] `.env`, `.p2pflow/`, `shared/` এবং previous application backup আছে।
- [ ] Runtime secret/database/private key persistent upload ZIP/GitHub-এ নেই।

## Install ও process

- [ ] Node.js 20+ চলছে।
- [ ] `npm ci --omit=dev --ignore-scripts` সফল।
- [ ] `npm run build` সফল।
- [ ] `npm test` সফল।
- [ ] Production preflight সফল।
- [ ] Schema `35` migration সফল।
- [ ] Service healthy।
- [ ] Browser/CDN v1.5.25 assets load করছে।

## Payment Account ownership ও UI

- [ ] Admin/Manager সব permitted account manage করতে পারে।
- [ ] Agent account type non-Agent enabled Account User-এর অধীনেও save হয়।
- [ ] Agent role-এর user তার own-scope permission rule অতিক্রম করতে পারে না।
- [ ] Search typing-এর সঙ্গে সঙ্গে filter করে; আলাদা Search button নেই।
- [ ] Account Type filter ঠিক।
- [ ] Label filter ঠিক।
- [ ] Payment Method filter ঠিক।
- [ ] Permission scope-এর বাইরের account search/filter result-এ নেই।
- [ ] Row ও toolbar actions compact icon-based এবং mobile-এ usable।

## Personal/Merchant rules

- [ ] Send Money Charge আলাদা rate ব্যবহার করছে।
- [ ] Cash Out Charge আলাদা rate ব্যবহার করছে।
- [ ] Send Money rate বদলালে Cash Out rate বদলায় না।
- [ ] Cash Out rate বদলালে Send Money rate বদলায় না।
- [ ] Receive Money/Bill Pay/Payment/Mobile Recharge automatic fee-free।
- [ ] Fixed/Percentage/Fixed+Percentage/Tier/Manual modes ঠিক।
- [ ] Manual transaction ও applicable order split একই intended rule ব্যবহার করে।

## Agent rules

- [ ] Agent form-এ শুধু Received Money Commission ও Cash In Commission দেখা যায়।
- [ ] Agent manual transaction list-এ শুধু Received Money ও Cash In আছে।
- [ ] Received Money commission balance-এ credit হয়।
- [ ] Cash In principal debit এবং commission credit সঠিকভাবে হয়।
- [ ] দুই commission rate স্বাধীন।
- [ ] Invalid Personal/Merchant transaction type Agent account-এ server-side reject হয়।
- [ ] Automatic commission ledger/accounting entry protected।
- [ ] Non-Agent owner-এর Agent-type account company-level commission accounting সঠিক।

## Bulk/delete/serial regression

- [ ] Multi-select/Edit Selected/Delete Selected ঠিক।
- [ ] Bulk operation atomic।
- [ ] Non-zero/pending-reserved account delete block হয়।
- [ ] Soft-deleted account history preserve হয়।
- [ ] Same Method + same Label + same Serial conflict block হয়।
- [ ] Different non-empty Label একই Serial reuse করতে পারে।
- [ ] No Label নিজস্ব scope।

## Orders/Ads notification scope

- [ ] Orders `All` selected → সব permitted account-এর order/message sound + notification।
- [ ] Orders Account A selected → শুধু A-এর order/message sound + notification।
- [ ] Ads Account B selected → শুধু B-এর order/message sound + notification।
- [ ] Orders/Ads selector পরিবর্তন করলে একই device-এর active notification scope update হয়।
- [ ] Specific Binance scope-এ অন্য account এবং local/offline order notification suppressed।
- [ ] `All`-এ ফিরে এলে সব permitted account notification পুনরায় আসে।
- [ ] Security/System notification account scope দিয়ে ভুলভাবে suppressed হয় না।
- [ ] Notifications OFF → foreground sound ও browser/background Push বন্ধ।
- [ ] Notifications ON → eligible foreground sound ও Push চালু।
- [ ] Bonded device background/locked test pass।

## Core production gate

- [ ] Login/OTP/secret/trusted-device stable।
- [ ] Security page কাজ করে।
- [ ] Orders দ্রুত load করে এবং account isolation ঠিক।
- [ ] Ads দুই Binance account-এ update/publish test pass।
- [ ] P2P chat incremental update smooth।
- [ ] Offline Business full/partial flow ও reservation ঠিক।
- [ ] Accounting totals reconcile।
- [ ] Database encryption/history/backup health ঠিক।
- [ ] Valid HTTPS/TLS, allowed hosts ও trusted proxy configured।
- [ ] SMTP primary/backup test pass।
- [ ] Android/iPhone/desktop responsive smoke test pass।
- [ ] Signed update এবং rollback staging-এ test করা হয়েছে।
- [ ] Monitoring/log rotation/certificate expiry/backup alerts active।
