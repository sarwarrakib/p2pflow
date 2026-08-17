# P2PFlow v1.5.17 Release Notes

Release date: 2026-08-17  
Application version: `1.5.17`  
Database schema: `31`

## Release status

এই release-এ Agent-দের Payment Account add/edit permission কার্যকর করা হয়েছে, সব permission-এর পূর্ণ scope hover/focus help-এ দেখানো হয়েছে এবং online presence-এর পরিবর্তে persistent **Order Acceptance** switch দিয়ে order auto-assignment নিয়ন্ত্রণ করা হয়েছে। v1.5.16-এর multi-account Orders/Ads, exact Binance-account RBAC, Security Question এবং profit-scope behavior অপরিবর্তিত রাখা হয়েছে।

## Payment Account permission সংশোধন

আগে frontend এবং backend—দুই জায়গাতেই `Admin/Manager` role gate থাকায় Agent-কে `accounts.manage` বা `ledger.adjust` দেওয়ার পরও action button এবং API operation কাজ করত না। এখন authorization role-name নয়, exact permission অনুযায়ী চলে।

- `accounts.view`: assigned payment account ও অনুমোদিত statement দেখা।
- `accounts.use`: order split/transaction flow-তে assigned payment account ব্যবহার।
- `accounts.manage`: payment account add, bulk add, edit, status, owner এবং Agent access পরিচালনা।
- `ledger.adjust`: Offline Txn, top-up, cash-out, correction ও অন্য permitted statement adjustment।
- `accounts.manage` অথবা `ledger.adjust` দেওয়া হলে Payment Accounts page খোলার জন্য প্রয়োজনীয় read access implied হয়; mutation-এর জন্য মূল write permission এখনো বাধ্যতামূলক।
- `accounts.manage` থাকা Agent সব payment account manage করতে পারে। শুধু `accounts.view` থাকা Agent নিজের assigned account-ই দেখে।
- Agent-এর জন্য Payment Accounts এবং Account Statement navigation permission অনুযায়ী দৃশ্যমান হয়।
- Add Account, Bulk Add, Edit / Access, Offline Txn এবং Statement action button এখন role hard-code ছাড়া permission অনুযায়ী render হয়।
- Backend create, bulk create, update ও ledger adjustment endpoint থেকে Admin/Manager-only blocker সরানো হয়েছে; audit log-এ actual acting user সংরক্ষিত থাকে।

## Permission Scope Help

সব 29টি global permission-এর জন্য English ও Bangla-তে পূর্ণ কার্যক্রম লেখা হয়েছে।

- Permission row-এর যেকোনো অংশে mouse hover করলে scope tooltip দেখা যায়।
- `?` help control keyboard focus, click এবং touch-এও কাজ করে।
- Tooltip modal-এর বাইরে body-level overlay হিসেবে render হয়, তাই scrollable permission modal-এর ভেতরে কাটা পড়ে না।
- Add/Edit User-এর Global Permissions এবং প্রতিটি Binance account-এর account-level permission matrix—দুই জায়গাতেই একই help পাওয়া যায়।
- Description-এ permission কী করতে পারে, কী করতে পারে না এবং exact Binance-account grant/অন্য dependency লাগলে তা উল্লেখ করা হয়েছে।

## Order Acceptance ও auto-assignment

Agent Orders page-এর account buttons-এর পাশে নতুন persistent control আছে:

- `অর্ডার গ্রহণ: চালু`
- `অর্ডার গ্রহণ: বন্ধ`

### ON থাকলে

- Agent offline, away বা browser বন্ধ থাকলেও routing-এর candidate হতে পারে।
- Enabled Agent user, global `orders.view`, exact Binance account-এর `orders.view`, matching routing rule এবং existing amount/capacity rules এখনো প্রয়োজন।
- Active assignment count ও route priority আগের মতো load balancing-এ ব্যবহৃত হয়।

### OFF থাকলে

- Agent online থাকলেও নতুন order auto-assign হবে না।
- Manager/Admin manual assignment-ও ওই Agent-এর OFF state bypass করতে পারবে না।
- Existing assigned order স্বয়ংক্রিয়ভাবে সরানো হয় না; switch শুধু নতুন assignment eligibility নিয়ন্ত্রণ করে।

### Login/Orders prompt

Agent login করে Orders list খুললে এবং Order Acceptance OFF থাকলে একবার popup আসে:

`স্যার, আপনি কি অর্ডার গ্রহণ করতে চান?`

- `না` দিলে OFF থাকে।
- `হ্যাঁ` দিলে server-এ ON save হয় এবং সঙ্গে সঙ্গে control update হয়।
- Browser refresh বা নতুন login session-এ OFF থাকলে prompt আবার দেখা যাবে।

### Presence separation

- Online/idle/away/offline status এখন monitoring, activity analytics এবং operational visibility-এর জন্য।
- Presence আর auto-assignment eligibility নির্ধারণ করে না।
- Agent নিজের switch পরিবর্তন করলে realtime event-এর মাধ্যমে অন্য permitted Users/Routing/Activity view এবং নিজের Orders control update হতে পারে।

## Database migration

Schema `31` migration additive:

- Agent record-এ `orderAcceptanceUpdatedAt` যোগ হয়।
- Agent record-এ `orderAcceptanceUpdatedBy` যোগ হয়।
- Existing `allowNewOrders` value Order Acceptance state হিসেবে ব্যবহার হয়।
- Existing Agent-এর value না থাকলে backwards-compatibleভাবে ON ধরা হয়, যাতে upgrade-এর সঙ্গে সব assignment হঠাৎ বন্ধ না হয়ে যায়।
- Non-Agent-linked record assignment candidate হতে পারে না।
- Existing orders, Ads, payment accounts, ledger, accounting এবং security data পরিবর্তন বা বাদ দেওয়া হয় না।

## Regression verification

Final source tree-তে নিচের automated verification চালানো হয়েছে:

- 76টি active JavaScript file syntax check
- `npm run build`
- পূর্ণ `npm test`
- নতুন Order Acceptance / Payment Permission self-test
- 29 permission description coverage test
- Multi-account Orders/Ads UI regression
- Account-scoped Binance RBAC
- Ads merchant-account isolation এবং Business/Online/Break state
- Security Question, trusted device, owner recovery এবং OTP-disabled flow
- Mail delivery, routing এবং failover
- PostgreSQL/MySQL encrypted state এবং database-only persistence
- Production preflight ও security hardening
- Signed update, WAF transport, package safety, supervisor এবং rollback
- Accounting model/self-test

## Live-operation limitation

Automated environment-এ real Binance credential দিয়ে production order/Ad mutation করা হয়নি। Order Acceptance CRM-side assignment control; এটি Binance order API contract পরিবর্তন করে না। Deployment-এর পরে staging বা controlled test order দিয়ে ON/OFF, offline assignment, exact account permission এবং routing behavior যাচাই করুন।
