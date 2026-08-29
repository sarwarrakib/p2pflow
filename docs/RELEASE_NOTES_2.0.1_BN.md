# P2PFlow 2.0.1 Release Notes

এই checkpoint-এর মূল কাজ হলো Binance Core, Orders, Ads এবং Chat path-কে 2.x normalized architecture-এ production-scale ব্যবহারের জন্য harden করা।

## Binance Core

- C2C signed REST client + per-key/global scheduler এবং interactive request reserve চালু আছে।
- Orders/Ads background sync এখন configurable multi-page sync (`P2PFLOW_BINANCE_SYNC_MAX_PAGES`, default 5)।
- 418/429 per-key backoff বজায় রেখে background request interactive action block করার ঝুঁকি কমানো হয়েছে।
- FUND_PWD release-এর জন্য legacy-compatible C2C RSA public-key endpoint, RSA/OAEP-SHA256 local encryption এবং encrypted release payload যোগ হয়েছে। এই RSA endpoint supplied C2C SAPI v7.4 document-এর তালিকায় নেই; এটি 1.7.x production compatibility path হিসেবে isolated রাখা হয়েছে এবং শুধুমাত্র FUND_PWD flow-তে call হয়।

## Orders / Final Action

- Mark as Paid শুধুমাত্র BUY order এবং Release/Quick Release শুধুমাত্র SELL order-এ enforced।
- Missing Binance payId হলে authoritative order detail refresh করা হয়।
- Non-FUND_PWD release-এ documented `checkIfCanReleaseCoin` pre-check ব্যবহার হয়।
- Binance Google/SMS/Email/YubiKey/FIDO2/FUND_PWD challenge error concrete হলে UI-তে exact verification field ফেরত যায়; generic verification failure থেকে নতুন method অনুমান করা হয় না।
- P2PFlow local release verification one-time token এখন session-bound, hashed-at-rest, expiring এবং single-use। Client-supplied `verificationPassed=true` bypass নেই।
- Quick Release-এর জন্য আলাদা `orders.quick_release` permission; default admin/manager পায়।
- Payment Split + proof final-action gate server-side enforced।
- Payment Split screenshot/Data URL এখন proof storage-এ persist হয়; split response legacy frontend-compatible `paymentSplits`, `hasProof`, `proofUrl`, direction এবং final-action gate state দেয়।
- Order auto-sync-এ detail refresh-এর পর counterparty statistics ও chat sync parallel করা হয়েছে।

## Chat / Realtime

- Worker-owned persistent Binance chat WebSocket in-process server-এর outbound send-এ reuse হয়; horizontally separated worker/web process হলে documented direct credential/WSS fallback থাকে।
- Binance image pre-signed URL path-এ per-account rolling limiter রাখা হয়েছে (documented 36/min limit-এর নিচে safety margin)।
- Chat inbox ও unread count N+1 SQL loop বাদ দিয়ে set-based snapshot query করা হয়েছে।
- Order list unread/split summary-ও batched query ব্যবহার করে, ফলে list size বাড়লেও প্রতি order-এর জন্য আলাদা chat/split query লাগে না।

## Ads

- Ads background/manual sync multi-page হয়েছে এবং page size 20 রাখা হয়েছে।
- Existing create/update/status/merchant control/reference price/fee-rate/payment-option endpoints 2.x normalized store-এর উপর থাকে।

## Database

PostgreSQL, MySQL ও MariaDB-এর `011_binance_core_hardening.sql` migration-এ:

- final-action verification token/session fields
- quick-release permission
- unread-chat lookup index
- update state `2.0.1`

যোগ হয়েছে।
