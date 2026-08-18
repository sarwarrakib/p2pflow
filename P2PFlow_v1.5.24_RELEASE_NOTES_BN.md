# P2PFlow v1.5.24 — Payment Account Bulk Management, Manual Fees & Agent Commission

- Application version: `1.5.24`
- Database schema: `34`
- Package type: Unified
- Migration: additive ও automatic

## ১. Payment Account Delete

Payment Account list-এ এখন প্রতিটি manageable account-এর জন্য **Delete** action আছে। Delete hard-delete নয়; safe soft-delete হিসেবে কাজ করে।

Delete করার আগে server বাধ্যতামূলকভাবে যাচাই করে:

- current calculated balance শূন্য;
- pending Offline Business reservation নেই;
- pending/partial order payment split lock নেই;
- accountটি logged-in user-এর management scope-এর মধ্যে;
- accountটি আগে delete করা হয়নি।

Delete সফল হলে account active list, search, new order selection ও Offline Business candidate list থেকে সরানো হয়। কিন্তু নিচের historical data অক্ষত থাকে:

- ledger ও statement rows;
- order/payment split references;
- accounting links;
- audit trail;
- account number, method, Label ও Serial history।

Balance বা pending reservation থাকলে delete block হবে এবং exact reason দেখাবে।

## ২. Multi-select, Bulk Edit ও Bulk Delete

Payment Accounts page-এ manageable accountগুলোর পাশে checkbox যোগ হয়েছে। নতুন controls:

- **Select All / Clear**
- **Edit Selected**
- **Delete Selected**

### Bulk Edit-এ পরিবর্তনযোগ্য field

- Status
- Account Type
- Label
- Account Name
- generated Serial sequence
- Account User/Owner — অনুমোদিত all-account manager-এর জন্য
- Agent access list — অনুমোদিত all-account manager-এর জন্য
- Daily receive/send limits
- Monthly receive/send limits
- Charge/Commission mode
- Fixed amount
- Percentage
- Tier rules

Unchecked field অপরিবর্তিত থাকে। Bulk Serial sequence v1.5.23-এর authoritative uniqueness rule অনুসরণ করে:

```text
Normalized Payment Method Name + Normalized Label + Serial
```

No Label একটি আলাদা scope; এটি named Label-এর wildcard নয়।

### Atomic validation

Bulk Edit ও Bulk Delete দুটোই all-or-nothing:

```text
একটি selected account validation fail
= কোনো selected account পরিবর্তন হবে না
```

এতে partial edit/delete ও inconsistent data তৈরি হয় না। Error response affected account number ও exact validation reason দেখায়, তবে permission-এর বাইরে থাকা account information প্রকাশ করে না।

## ৩. Payment Account permission scope

- Admin ও Manager সব Payment Account manage করতে পারে।
- `accounts.manage_all` থাকা non-Agent custom role all-account management করতে পারে।
- Agent শুধু নিজের owned Payment Account manage/delete করতে পারে।
- Agent-কে ভুলভাবে `accounts.manage_all` দিলেও Agent all-account access পায় না।
- `accounts.manage` ছাড়া Add/Edit/Delete/Bulk action পাওয়া যায় না।
- `ledger.adjust` আলাদা permission; এটি manual transaction করার জন্য প্রয়োজন।
- Assigned account ব্যবহার করার `accounts.use` permission Add/Edit/Delete permission নয়।

## ৪. Manual Balance Transaction-এর ছয়টি type

Manual transaction form এখন নির্দিষ্ট transaction type ব্যবহার করে:

1. Send Money
2. Receive Money
3. Cash Out
4. Bill Pay
5. Payment
6. Mobile Recharge

প্রতিটি transaction main wallet ledger হিসেবে record হয়। Reference, note, creator, timestamp, account owner এবং transaction type statement-এ সংরক্ষিত থাকে।

## ৫. Personal ও Merchant account fee rule

Personal ও Merchant account একই fee behavior ব্যবহার করে। Configured charge শুধু:

- **Send Money**
- **Cash Out**

transaction-এ balance থেকে deduct হয়।

নিচের type-এ fee হয় না:

- Receive Money
- Bill Pay
- Payment
- Mobile Recharge

Supported rule:

- None
- Fixed amount
- Percentage
- Fixed + percentage
- Tier-based
- Manual actual amount

Configured rule থাকলে form amount অনুযায়ী charge preview করে। Actual charge আলাদা হলে operator Charge box-এ override দিতে পারে। Rule `manual` হলে charge amount বাধ্যতামূলক। Main transaction এবং fee আলাদা ledger row হিসেবে record হয়, ফলে statement-এ মূল amount ও fee আলাদাভাবে দেখা যায়।

Outgoing transaction-এর আগে server main amount, applicable fee, current balance এবং send limit যাচাই করে। Validation fail করলে কোনো ledger row তৈরি হয় না।

## ৬. Agent incoming ও outgoing commission

Agent account-এর configured rule fee নয়; এটি **earned commission** হিসেবে কাজ করে।

Agent account-এ:

- টাকা এলে মূল amount credit হয়, তারপর commission credit হয়;
- টাকা গেলে মূল amount debit হয়, তারপর commission credit হয়;
- Send Money, Receive Money, Cash Out, Bill Pay, Payment ও Mobile Recharge—সব incoming/outgoing movement-এ configured commission rule কার্যকর হয়;
- fixed, percentage, fixed+percentage, tiered ও manual actual commission সমর্থিত।

উদাহরণ:

```text
Agent Receive Money: 1,000 BDT
Commission: 2% = 20 BDT
Net wallet increase: 1,020 BDT
```

```text
Agent Send Money: 500 BDT
Commission: 2% = 10 BDT
Net wallet decrease: 490 BDT
```

Outgoing Agent movement-এর আগে account-এ মূল transfer amount থাকতে হবে। Commission পরে credit হয়; commission ধরে insufficient balance bypass করা যায় না।

## ৭. Order payment split-এ Agent commission

Order-এর Payment Split flow-তেও account type অনুযায়ী adjustment model প্রয়োগ হয়:

- Personal/Merchant account: applicable transfer charge deduction;
- Agent account: incoming/outgoing commission credit।

Split actual amount কমানো বা reversal হলে previously credited Agent commission-এর corresponding reversal ledger ও protected accounting expense তৈরি হয়। Existing historical split যেগুলো পুরোনো release-এ charge deduction হিসেবে already moved হয়েছে, migration সেগুলোকে commission হিসেবে reinterpret করে না। শুধু untouched planned Agent split নতুন commission model নেয়।

## ৮. Commission accounting

প্রতিটি Agent commission-এর সঙ্গে linked automatic business accounting entry তৈরি হয়:

- normal commission: protected automatic `income`;
- commission reversal: protected automatic `expense`;
- wallet ledger ID, manual transaction ID/order ID/split ID এবং Agent ID link থাকে;
- UI-তে Delete button-এর পরিবর্তে **Automatic** badge দেখা যায়;
- linked automatic entry আলাদাভাবে delete করা যায় না।

এতে wallet balance ও accounting income/expense একে অন্যের সঙ্গে reconcile করা যায়।

### Individual-only profit

Agent-এর **Include profit in company totals** setting OFF থাকলে:

- Agent-এর commission তার individual income/profit-এ দেখা যাবে;
- total all-user income/profit report-এ দেখা যাবে;
- company-counted income, recognized capital ও owner total-এ যোগ হবে না।

Setting ON থাকলে commission company totals-এ অন্তর্ভুক্ত হবে।

## ৯. Migration safety

Schema `34` migration:

- Payment Account type normalize করে;
- Personal/Merchant rule `send` scope-এ রাখে;
- Agent rule `both` scope-এ রাখে;
- soft-delete metadata initialize করে;
- existing Label, Serial, limits, balance ও ownership preserve করে;
- existing ledgers/statements delete বা rewrite করে না;
- historical completed split charge preserve করে;
- untouched planned Agent split commission model-এ নেয়।

Migration idempotent এবং future schema downgrade করে না।

## ১০. Verification

Release-specific test যাচাই করে:

- individual safe delete;
- multi-select bulk edit/delete;
- atomic validation;
- zero-balance requirement;
- pending reservation blocker;
- statement history preservation;
- Personal Send Money fee;
- Personal Bill Pay no-fee;
- Merchant Cash Out fee;
- Agent incoming commission;
- Agent outgoing commission;
- order split incoming/outgoing commission;
- commission reversal;
- protected automatic accounting entries;
- individual-only company-total exclusion;
- manual rule amount requirement;
- schema 33 → 34 migration safety।

Full JavaScript syntax check, build, regression suite, database crypto/persistence tests, authentication/security tests, Ads multi-account tests, updater/rollback tests এবং accounting self-test-ও pass করেছে।

## ১১. Binance API boundary

এই release-এর fee/commission, Payment Account bulk management ও wallet accounting P2PFlow-এর internal CRM layer। Binance Ads, Orders, Payment Method, Chat বা Commission API payload/endpoint পরিবর্তন করা হয়নি। Production Binance credential দিয়ে এই build environment থেকে live mutation চালানো হয়নি।
