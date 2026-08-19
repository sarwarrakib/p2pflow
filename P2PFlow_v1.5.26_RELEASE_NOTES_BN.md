# P2PFlow v1.5.26 — Payment Split Edit/Delete, Limit Reconciliation & Binance Final Action Fix

## Version

- Application: `1.5.26`
- Database schema: `35`
- Package: Unified
- Database migration: প্রয়োজন নেই

## Payment Split edit/delete

Order-এর Payment Split এখন permission অনুযায়ী Edit ও Delete করা যায়। Agent তার নিজের assigned split edit/delete করতে পারে; Admin/Manager তাদের permitted order scope অনুযায়ী করতে পারে। Finalized/Released/Completed/Cancelled order-এর split immutable থাকে।

Edit modal-এ Amount, Transaction ID, Proof Screenshot, Note এবং applicable charge/commission পরিবর্তন করা যায়। Delete করলে active split row সরানো হয়, কিন্তু ledger/statement/audit history রাখা হয়।

## Daily/monthly limit reconciliation

আগের implementation-এ split কমানোর compensating ledger (`refund_in` / `refund_out`) বিপরীত direction-এর নতুন usage হিসেবে count হচ্ছিল। ফলে 1,000 BDT split পরে 500 BDT করলে balance ঠিক হলেও daily/monthly limit 1,000 BDT consumed দেখাতে পারত।

এখন compensating rows original transaction-side quota restore করে:

- Send split 1,000 → 500: send usage 500 restore হয়।
- Receive split 1,000 → 500: receive usage 500 restore হয়।
- Split Delete: principal usage সম্পূর্ণ restore হয়।
- Charge/commission balance-এ প্রভাব ফেলে, কিন্তু principal daily/monthly limit ভুলভাবে consume করে না।

Configured percentage/fixed/tier charge edit-এর পরে amount অনুযায়ী পুনরায় calculate হয়। Explicit manual adjustment থাকলে user সেটি preserve/clear করতে পারে। Manual-rule account-এ required amount ছাড়া split save/update block হয়।

## Split evidence UX

Payment Split form-এ Transaction ID যোগ করা হয়েছে। Existing full split থাকলেও evidence missing হলে final-action modal থেকে একমাত্র missing split-এ Transaction ID/Proof যোগ করা যায়; zero remaining থাকার কারণে নতুন duplicate split বানানোর প্রয়োজন নেই।

## Mark as Paid / Release fix

Live Binance final action-এর আগে এখন exact linked Binance account দিয়ে order detail refresh করা হয়। Server-synced selected payment ID client-side hidden value-এর চেয়ে অগ্রাধিকার পায়।

একটি গুরুত্বপূর্ণ bug ঠিক হয়েছে: generic nested `id` field আর `payId` হিসেবে ধরা হবে না। শুধু selected/payment-method context থেকে payment ID resolve করা হয়।

`Get Payment Method by ID` request-এ query key `payId` থেকে documented `id` করা হয়েছে। Mark as Paid এবং Release payload-এ documented `payId`-ই থাকে।

আরেকটি status bug ঠিক হয়েছে: `BINANCE_UNPAID` text-এর ভেতরে `PAID` substring থাকার কারণে order ভুলভাবে paid হিসেবে ধরা হচ্ছিল। এখন explicit unpaid states আগে detect হয়। ফলে Mark as Paid button আর ভুলভাবে hide হবে না।

Release button cached local state-এর কারণে permanently disabled থাকবে না। Paid status stale হলে button `Check Paid & Release` দেখাবে; server exact live detail refresh এবং `checkIfCanReleaseCoin` pass করার পরেই release mutation করবে।

## Regression tests

নতুন `payment-split-final-action-self-test.js` যাচাই করে:

- Send 1,000 → 500 limit restoration;
- Receive 1,000 → 500 limit restoration;
- Split delete balance/limit restoration;
- configured percentage charge recalculation;
- arbitrary generic `id` payId হিসেবে reject;
- payment-method candidate payId selection;
- `BINANCE_UNPAID` paid হিসেবে misclassify না হওয়া;
- edit/delete UI/route wiring;
- exact live order refresh before final action।

## Deployment note

Production Binance credential দিয়ে এই build environment থেকে Mark as Paid/Release mutation চালানো হয়নি। Update-এর পরে controlled ছোট BUY ও SELL order দিয়ে live smoke test করুন।
