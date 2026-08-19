# P2PFlow v1.5.26 — Public Launch Checklist

## Package ও deployment

- [ ] `P2PFlow_v1.5.26_UNIFIED.zip` SHA-256 verify করা হয়েছে।
- [ ] Production database এবং runtime config backup আছে।
- [ ] `npm ci --omit=dev --ignore-scripts` সফল।
- [ ] `npm run build` সফল।
- [ ] `npm test` সফল।
- [ ] Production preflight সফল।
- [ ] Schema `35` healthy।
- [ ] Browser/CDN v1.5.26 assets load করছে।

## Payment Split edit/delete

- [ ] Admin/Manager permitted split Edit করতে পারে।
- [ ] Agent নিজের assigned split Edit করতে পারে।
- [ ] Agent অন্য user-এর split Edit/Delete করতে পারে না।
- [ ] Split Delete action দেখা যায় এবং কাজ করে।
- [ ] Finalized/Released/Completed split immutable।
- [ ] Transaction ID edit/save হয়।
- [ ] Proof replacement/save হয়।
- [ ] Statement/audit history Delete-এর পরেও থাকে।

## Limit reconciliation

- [ ] Send split 1,000 → 500 করলে daily send used 500 হয়।
- [ ] Send split Delete করলে corresponding send usage restore হয়।
- [ ] Receive split 1,000 → 500 করলে daily receive used 500 হয়।
- [ ] Receive split Delete করলে corresponding receive usage restore হয়।
- [ ] Monthly usage একই net principal অনুসরণ করে।
- [ ] Automatic transfer charge principal daily/monthly limit হিসেবে count হয় না।
- [ ] Percentage/fixed/tier charge amount edit-এর পরে সঠিকভাবে recalculate হয়।
- [ ] Manual-rule split required manual charge/commission ছাড়া save হয় না।

## Mark as Paid / Release

- [ ] `BINANCE_UNPAID` order-এ Mark as Paid button ভুলভাবে hide হয় না।
- [ ] BUY order final action exact linked Binance credential ব্যবহার করে।
- [ ] Mark as Paid-এর আগে exact order detail refresh হয়।
- [ ] selected payment-method payId সঠিক account/order থেকে resolve হয়।
- [ ] unrelated generic `id` payId হিসেবে ব্যবহার হয় না।
- [ ] SELL order paid হলে Release Coin কাজ করে।
- [ ] cached status stale হলেও `Check Paid & Release` live check চালায়।
- [ ] `checkIfCanReleaseCoin` deny করলে `releaseCoin` পাঠানো হয় না।
- [ ] Binance error হলে local order success/final status হিসেবে ভুলভাবে save হয় না।
- [ ] Required extra release verification field UI-তে দেখা যায়।

## Core regression

- [ ] Orders fast load/account selector ঠিক।
- [ ] Ads দুই Binance account isolation ঠিক।
- [ ] P2P chat smooth/incremental।
- [ ] Payment Account search/filter/bulk actions ঠিক।
- [ ] Personal/Merchant charges ঠিক।
- [ ] Agent commissions ঠিক।
- [ ] Notification scope/sound/push ঠিক।
- [ ] Security/trusted-device login stable।
- [ ] Offline Business flow ঠিক।
- [ ] Accounting totals reconcile।
- [ ] Database encryption/backup health ঠিক।
- [ ] Signed update/rollback staging-এ test হয়েছে।
