# P2PFlow v1.5.25 — Separate Wallet Rules, Fast Filters & Account-scoped Notifications

## Version

- Application: `1.5.25`
- Database schema: `35`
- Package: Unified

## Payment Account charge/commission model

### Personal ও Merchant

`Send Money Charge` এবং `Cash Out Charge` এখন সম্পূর্ণ আলাদা rule। দুইটির rate একই হওয়া বাধ্যতামূলক নয়। প্রতিটির জন্য আলাদাভাবে ব্যবহার করা যায়:

- None
- Fixed amount
- Percentage
- Fixed + percentage
- Tier-based
- Manual actual amount

Receive Money, Bill Pay, Payment এবং Mobile Recharge-এ automatic charge হয় না। Manual transaction ও applicable order split একই rule engine ব্যবহার করে।

### Agent account

`Agent` এখন Payment Account-এর wallet behaviour; এটি login user's role নয়। তাই Admin, Manager, Agent অথবা অন্য enabled Account User-এর অধীনে Agent-type Payment Account রাখা যায়, permission scope অপরিবর্তিত থাকে।

Agent-type account-এ manual transaction শুধু:

- `Received Money` — balance credit + Received Money Commission
- `Cash In` — principal debit + Cash In Commission credit

Agent account form-এ Personal/Merchant charge controls দেখায় না; শুধু Received Money Commission এবং Cash In Commission দেখায়। দুই commission rate আলাদা হতে পারে।

Agent-type account যদি non-Agent user-এর মালিকানায় থাকে, automatic commission company-level protected accounting income হিসেবে record হয়। Linked Agent owner থাকলে existing Agent profit inclusion/exclusion rules প্রযোজ্য থাকে।

## Payment Account UX

- Search box-এ লেখা শুরু করলেই list instant filter হয়; আলাদা Search button নেই।
- Account Type filter যোগ হয়েছে।
- Label filter যোগ হয়েছে।
- Payment Method filter যোগ হয়েছে।
- Search permission-scoped loaded account list-এর মধ্যেই চলে; inaccessible account প্রকাশ করে না।
- Add, Bulk Add, Refresh, Edit, Delete, Statement, Manual Transaction এবং bulk actions compact icon button ব্যবহার করে।
- Existing multi-select, atomic Bulk Edit/Delete এবং safe soft-delete বহাল আছে।
- Order split account selector-এ এখন applicable Send Money charge / Received commission / Cash In commission-এর সঠিক rule summary দেখা যায়; পুরোনো single generic rule text নেই।

## Orders/Ads account selection এবং notification scope

Orders অথবা Ads page-এ account selector এখন current device-এর order/message notification scope-ও নির্ধারণ করে:

- `All` selected → permitted সব Binance account-এর নতুন order, assignment এবং P2P message notification/sound আসবে।
- নির্দিষ্ট Binance account selected → শুধু সেই account-এর order, assignment এবং P2P message notification/sound আসবে।
- Specific Binance account selected থাকলে local/offline order notification ওই scoped Binance stream-এর অংশ হিসেবে বাজবে না।
- Current scope browser local state-এ থাকে এবং active bonded-device push subscription-এ server-side persist হয়, ফলে supported background/locked-device Push-ও একই scope অনুসরণ করে।
- Security/System-এর মতো non-order notification account selector দিয়ে suppress করা হয় না।
- Master Notifications OFF থাকলে account scope যাই থাকুক automatic sound ও browser/background push বন্ধ থাকে।

## Database migration

Schema `35` additive migration existing Payment Account-এর schema-34 single charge/commission rule relevant দুই transaction rule-এ copy করে:

- Personal/Merchant legacy rule → Send Money + Cash Out
- Agent legacy rule → Received Money + Cash In

এতে upgrade-এর পরে পুরোনো configured rate হঠাৎ হারায় না। Historical ledger, completed split, balance, statement, accounting এবং audit record পরিবর্তন করা হয় না। এরপর user চাইলে দুই rate আলাদা করে edit করতে পারে।

## Regression protection

Dedicated self-test যোগ হয়েছে যা যাচাই করে:

- Send Money ও Cash Out আলাদা rate;
- Agent account ownership role-independent;
- Agent manual types শুধু Received Money/Cash In;
- account-type অনুযায়ী dynamic charge/commission UI;
- typing-as-you-search;
- Account Type/Label/Payment Method filter;
- compact icon actions;
- Orders/Ads account selector foreground sound scope;
- per-device browser Push scope;
- All বনাম specific-account notification behaviour।

## Deployment note

Production Binance credential, public SMTP এবং বাস্তব locked mobile device ব্যবহার করে এই source package থেকে live mutation করা হয়নি। Update-এর পরে staging/controlled production account দিয়ে payment rule এবং notification scope smoke test করতে হবে।
