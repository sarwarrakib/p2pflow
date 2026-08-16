# P2PFlow v1.5.14 Release Notes

## Multi-Account Security, Ads Management ও Profit Scope Update

এই release-এ multi-Binance-account operation-এর permission model account-scoped করা হয়েছে। এখন global permission এবং নির্দিষ্ট Binance account grant—দুইটিই মিললে user সেই account-এর action করতে পারবে। Admin সব account-এর implicit owner access রাখে; অন্য কোনো role account grant ছাড়া Binance order, ad, chat বা P2P profile data ব্যবহার করতে পারবে না।

## 1. Security Question এখন সরাসরি Add/Edit User form-এ

- **Users & Permissions -> Add User + Login / Edit User** modal-এ আলাদা **Login Security & Recovery** panel যোগ হয়েছে।
- Security Question, Security Answer এবং existing fallback remove করার option একই জায়গায় পাওয়া যাবে।
- নতুন fallback চালু করতে question ও answer—দুইটিই বাধ্যতামূলক।
- Security Answer plaintext হিসেবে রাখা হয় না; one-way password hash হিসেবে সংরক্ষিত হয়।
- সাধারণ user অন্য user-এর Security Question বা Binance account grant দেখতে পাবে না; user-management permission থাকা operator-ই পূর্ণ configuration দেখতে পারবে।

## 2. Exact Binance Account Permission Matrix

প্রতিটি login user-এর জন্য প্রতিটি Binance API account আলাদাভাবে permission দেওয়া যায়। Permission group:

- Orders: View, Create, Assign, Split, Final Action, Quick Release
- Sync & Chat: Binance Sync, Binance Chat
- Advertisements: Ads View, Ads Manage
- P2P Profile: Profile View, Profile Sync

নিয়ম:

- Account-level permission global permission bypass করে না।
- User-এর global permission এবং selected account grant—দুইটিই থাকতে হবে।
- Manager role-এর জন্য আর কোনো hidden/implicit order permission bypass নেই; Admin যেসব global permission ও account grant দেবে শুধু সেগুলোই কার্যকর হবে।
- User Account A-এর permission পেলে Account B-এর orders/ads দেখতে বা পরিবর্তন করতে পারবে না।
- Permission grant করা non-admin operator নিজের global permission বা account-level access-এর চেয়ে বেশি permission অন্যকে দিতে পারবে না।

## 3. Orders এখন Account-Scoped

- Orders page-এ **Binance Account** selector যোগ হয়েছে।
- “All assigned accounts” দিয়ে user তার অনুমোদিত সব account-এর order দেখতে পারবে; exact account নির্বাচন করলে শুধু সেই account-এর order দেখাবে।
- Order list/card/detail-এ Binance account badge দেখা যাবে।
- Binance order create ও manual sync-এর সময় account নির্বাচন বাধ্যতামূলক, যদি একাধিক eligible account থাকে।
- Order detail refresh, counterparty sync, chat sync/send/read, Additional KYC verification, Mark as Paid, Release এবং Quick Release order-এর linked credential দিয়েই চলে।
- Assign/Split/Final Action permission order-এর exact Binance account অনুযায়ী যাচাই হয়।
- কোনো agent-কে এমন Binance order assign করা যাবে না যার account-এ তার `orders.view` grant নেই।
- একই Binance order number ভিন্ন Binance account-এ থাকলে এখন `(credentialId + orderNo)` অনুযায়ী আলাদা record হিসেবে রাখা হয়।
- Offline order account scope-এর বাইরে থাকে এবং আগের মতো local workflow ব্যবহার করে।

## 4. Ads Management Repair ও Multi-Account Ads

- Ads page-এ Binance Account selector এবং account context যোগ হয়েছে।
- এক account-এর ads অন্য account-এর ads থেকে আলাদা রাখা ও sync করা হয়।
- Create/Edit/Delete/Publish/Online-Offline status/merchant control/asset balance/fee lookup—সব action selected বা ad-linked credential দিয়ে চলে।
- Ad editor-এ শুধু `ads.manage` grant থাকা account দেখানো হয়। Existing ad অন্য account-এ move করা যায় না।
- Manual sync এখন selected account-এর জন্য চলে; background sync enabled সব Binance credential আলাদাভাবে process করে।
- Active Manager online না থাকলে Ads mutation block করার পুরোনো restriction সরানো হয়েছে। Permission থাকলেই authorised user ads manage করতে পারবে।
- Save, publish বা delete-এর পর selected account-এর list সঙ্গে সঙ্গে refresh হয়।
- Advertisement uniqueness এখন `(credentialId + advNo)` অনুযায়ী।
- Binance list/post/update/status calls account-specific credential দিয়ে পাঠানো হয়।

## 5. Individual-Only Profit

Users & Permissions-এর user editor-এ নতুন option:

**Include this user's profit in company income and capital totals**

- ON: user-এর profit Company-counted User Profit, company income এবং recognized capital-এ যোগ হবে।
- OFF: user-এর individual income/profit report দৃশ্যমান থাকবে, কিন্তু Total User Income ও Company Recognized Asset/Capital-এ গণনা হবে না।
- Accounting Overview, Capital এবং Daily Closing-এ এখন Actual Business Asset, Individual-only Profit Excluded এবং Company Recognized Asset আলাদাভাবে দেখা যায়।
- Agent table-এ `Company total` বা `Individual only` accounting scope দেখায়।
- Existing users defaultভাবে company totals-এ included থাকে, তাই upgrade-এর পর পুরোনো হিসাব নিজে থেকে বাদ যাবে না।

## 6. Migration ও Backward Compatibility

- Application schema version: `29`
- Existing Manager users-এর পুরোনো operational access existing Binance credentials-এর explicit grants-এ migrate হয়।
- Existing `allowedP2pCredentialIds` account-specific permission rows-এ migrate হয়।
- Existing Binance orders এবং ads-এ credential link না থাকলে oldest existing credential migration target হিসেবে যুক্ত হয়।
- Offline orders-এর credential link clear রাখা হয়।
- Existing agents-এর `includeProfitInCompanyTotals` default `true` করা হয়।
- `.env`, database credentials, encrypted database data, proofs, orders, ledgers, mail settings এবং update history package দ্বারা replace হয় না।

## Verification

এই release-এর জন্য JavaScript syntax checks, full `npm test`, release/update/database self-tests, accounting self-test এবং `npm run build` চালানো হয়েছে। Account-scoped RBAC, Security Question UI, Orders/Ads account context এবং individual-profit exclusion-এর জন্য নতুন release self-test যোগ হয়েছে।

Version: `1.5.14`
