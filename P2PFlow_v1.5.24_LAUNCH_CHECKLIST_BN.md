# P2PFlow v1.5.24 — Public Launch Checklist

## Package ও backup

- [ ] `P2PFlow_v1.5.24_UNIFIED.zip` SHA-256 verify করা হয়েছে।
- [ ] Production database encrypted backup নেওয়া হয়েছে।
- [ ] Backup অন্য database/server-এ restore করে যাচাই করা হয়েছে।
- [ ] `.env`, `.p2pflow/` ও `shared/` backup নেওয়া হয়েছে।
- [ ] Previous application package/rollback copy প্রস্তুত আছে।
- [ ] Runtime secret, production DB, private key বা persistent uploads ZIP/GitHub-এ নেই।

## Install ও process

- [ ] Node.js 20+ চলছে।
- [ ] `npm ci --omit=dev --ignore-scripts` সফল।
- [ ] `npm run build` সফল।
- [ ] `npm test` সফল।
- [ ] Production preflight সফল।
- [ ] Schema `34` startup migration সফল।
- [ ] Service restart-এর পরে healthy।
- [ ] Browser/CDN cache থেকে v1.5.24 assets load হচ্ছে।

## Payment Account permissions

- [ ] Admin সব account manage করতে পারে।
- [ ] Manager সব account manage করতে পারে।
- [ ] `accounts.manage_all` custom non-Agent role expectedভাবে কাজ করে।
- [ ] Agent শুধু নিজের owned account manage করতে পারে।
- [ ] Agent অন্য user-এর account edit/delete করতে পারে না।
- [ ] `accounts.manage` Add/Edit/Delete/Bulk action নিয়ন্ত্রণ করে।
- [ ] `ledger.adjust` Manual Transaction আলাদাভাবে নিয়ন্ত্রণ করে।
- [ ] Search permission scope-এর বাইরে account প্রকাশ করে না।

## Single Delete

- [ ] Zero-balance unreserved account delete হয়।
- [ ] Non-zero balance account delete block হয়।
- [ ] Pending Offline Business reservation account delete block হয়।
- [ ] Pending/partial order split account delete block হয়।
- [ ] Deleted account active list/selection থেকে সরেছে।
- [ ] Ledger/statement/audit history অক্ষত আছে।

## Multi-select ও Bulk Edit

- [ ] Checkbox শুধু manageable account-এ দেখা যায়।
- [ ] Select All/Clear ঠিকভাবে কাজ করে।
- [ ] Edit Selected selected count ঠিক দেখায়।
- [ ] Unchecked fields অপরিবর্তিত থাকে।
- [ ] Status, Type, Label ও Account Name bulk update হয়।
- [ ] Serial sequence natural increment ও leading zero preserve করে।
- [ ] Serial scope conflict পুরো batch block করে।
- [ ] Owner/Agent access bulk edit শুধু authorized user পায়।
- [ ] Limits এবং Charge/Commission rule bulk update হয়।

## Bulk Delete

- [ ] একাধিক zero-balance unreserved account একসঙ্গে delete হয়।
- [ ] একটি invalid account থাকলে পুরো batch block হয়।
- [ ] Error affected account ও exact blocker দেখায়।
- [ ] কোনো partial delete হয় না।
- [ ] Statement history preserve হয়।

## Personal ও Merchant fee

- [ ] Send Money-তে configured fee deduct হয়।
- [ ] Cash Out-এ configured fee deduct হয়।
- [ ] Receive Money-তে fee হয় না।
- [ ] Bill Pay-তে fee হয় না।
- [ ] Payment-এ fee হয় না।
- [ ] Mobile Recharge-এ fee হয় না।
- [ ] Fixed rule ঠিক।
- [ ] Percentage rule ঠিক।
- [ ] Fixed + percentage rule ঠিক।
- [ ] Tier rule ঠিক।
- [ ] Manual actual amount required/override ঠিক।
- [ ] Main movement ও fee আলাদা statement row।

## Agent commission

- [ ] Agent account valid Agent user-owned।
- [ ] Incoming transaction-এর পরে commission credit হয়।
- [ ] Outgoing transaction-এর পরে commission credit হয়।
- [ ] ছয়টি transaction type-এ configured Agent commission rule কাজ করে।
- [ ] Outgoing মূল amount-এর জন্য insufficient balance block হয়।
- [ ] Commission আলাদা ledger row।
- [ ] Commission protected automatic accounting income।
- [ ] Commission reversal protected automatic expense।
- [ ] Automatic row UI থেকে আলাদাভাবে delete করা যায় না।

## Order payment split

- [ ] Personal/Merchant split charge deduction ঠিক।
- [ ] Agent receive split commission credit ঠিক।
- [ ] Agent send split commission credit ঠিক।
- [ ] Split amount কমালে exact commission reversal হয়।
- [ ] Historical পুরোনো charge split charge হিসেবেই থাকে।
- [ ] Account reservation ও permission isolation অক্ষত।

## Accounting

- [ ] Wallet commission balance ও accounting income reconcile করে।
- [ ] Reversal expense reconcile করে।
- [ ] Agent income/expense per-Agent report-এ আসে।
- [ ] Individual-only Agent commission company totals থেকে বাদ যায়।
- [ ] Included Agent commission company income/capital-এ যোগ হয়।
- [ ] Automatic rows **Automatic** badge দেখায়।
- [ ] Manual income/expense delete behavior অপরিবর্তিত।

## Core regression

- [ ] Login, OTP, secret-code ও trusted-device session ঠিক।
- [ ] Security page কাজ করে।
- [ ] Orders দ্রুত load এবং Binance account scope ঠিক।
- [ ] Ads দুই Binance account-এ update/publish isolation ঠিক।
- [ ] P2P chat smooth incremental update করে।
- [ ] Work Status visibility permission অনুযায়ী ঠিক।
- [ ] Notifications OFF sound ও browser Push বন্ধ করে।
- [ ] Notifications ON foreground sound ও browser Push চালু করে।
- [ ] Offline Business full/partial receipt ও reservation ঠিক।
- [ ] Database encryption/history/backup health ঠিক।
- [ ] Signed update ও rollback staging-এ পরীক্ষা করা হয়েছে।

## Public launch gate

- [ ] Valid HTTPS/TLS certificate active।
- [ ] Reverse proxy, trusted proxy ও allowed hosts configured।
- [ ] SMTP primary/backup delivery test সফল।
- [ ] Controlled real Binance Orders/Ads/Chat test সফল।
- [ ] Android, iPhone/iPad Home Screen ও desktop responsive smoke test সফল।
- [ ] Locked-device notification ON/OFF test সফল।
- [ ] Monitoring, log rotation, certificate expiry ও backup-age alerts active।
- [ ] Maintenance ও rollback procedure দায়িত্বপ্রাপ্ত team জানে।
