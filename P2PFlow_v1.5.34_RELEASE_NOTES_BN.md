# P2PFlow v1.5.34 — Release Notes

**Application:** 1.5.34  
**Database schema:** 35  
**Migration:** নতুন schema migration প্রয়োজন নেই

## Agent permission কার্যকর হওয়ার সমস্যা ঠিক করা হয়েছে

এই release-এ Agent role, Binance account-level permission এবং auto-assignment eligibility একই policy অনুযায়ী কাজ করে।

### Agent role নির্বাচন করলে permission auto-fill

- Add/Edit User-এ কোনো Agent/User Role নির্বাচন করলে সেই role template-এর Global Permissions স্বয়ংক্রিয়ভাবে tick হবে।
- একই সঙ্গে enabled Binance API account-গুলোর account-level matrix-এ role-এর প্রযোজ্য permissions-ও defaultভাবে tick হবে।
- Save করার আগে Admin/Manager প্রয়োজনমতো যেকোনো account/permission untick করতে পারবেন।
- Global permission ছাড়া account-level grant কার্যকর হবে না—দুই স্তরের RBAC boundary অক্ষত আছে।

## Live Order permission এখন সত্যিকারের live-order visibility দেয়

আগে Agent-কে `binance.sync`/Live Order permission দিলেও Orders list backend assigned-order-only filter করত। ফলে permission থাকা সত্ত্বেও unassigned live order দেখা যেত না।

এখন:

- একই Binance credential-এ `binance.sync` grant থাকলে Agent assigned এবং unassigned—দুই ধরনের live order দেখতে পারবে।
- `binance.sync` একই credential-এর `orders.view` visibility imply করে।
- Chat, Ads, Final Action বা অন্য mutation permission এতে স্বয়ংক্রিয়ভাবে পাওয়া যাবে না।
- অন্য Binance account-এর order দেখা যাবে না; credential scope অপরিবর্তিত।

## Live Order Agent-এর hidden Work OFF আর assignment আটকাবে না

Live Order permission থাকা user-এর Work ON/OFF button intentionally দেখানো হয় না। আগের build-এ পুরোনো hidden `workAvailable=false` state থেকে গেলে user auto-assignment candidate হতে পারত না।

এখন Live Order Agent:

- enabled Agent login হলে,
- Orders View/Live Order access থাকলে,
- routing/min-max/max-active rules pass করলে,

hidden Work state-এর কারণে আর বাদ যাবে না।

## নতুন Order-only Agent / Payment Account Capacity Guard

Payment Account শুধু accounting/balance automation-এর জন্য ব্যবহার করতে চাইলে আগের capacity protection চালু রাখা যাবে। আবার এমন Agent রাখা যাবে যে শুধু P2P order manage করবে এবং তার নিজের Payment Account বা balance থাকা বাধ্যতামূলক হবে না।

### Settings → General

নতুন option:

**Payment Account capacity guard for Agent auto assignment**

- **ON:** accounting-enabled Agent-এর route-এ Capacity Guard থাকলে assigned Payment Account, active status, send/receive capacity ও balance বিবেচনা করা হবে।
- **OFF:** সব Agent auto-assignment-এর জন্য Order-only mode-এ থাকবে; Payment Account/balance/capacity assignment block করবে না।

### User / Agent Edit

নতুন per-user option:

**Use Payment Account calculation for auto assignment**

- Checked: existing accounting-aware capacity rules প্রযোজ্য।
- Unchecked: শুধু ওই Agent-এর জন্য Order-only mode; Payment Account না থাকলেও auto-assignment হতে পারবে।

Global setting OFF থাকলে সব Agent-এর capacity guard bypass হবে। Global setting ON থাকলেও নির্দিষ্ট Agent-এর per-user option OFF করা যাবে।

## Order-only mode কী bypass করে, কী করে না

Order-only mode শুধু auto-assignment/co-agent candidate selection-এর Payment Account capacity dependency বাদ দেয়। নিচের rules এখনও বাধ্যতামূলক:

- user enabled হতে হবে;
- Agent role/linked Agent থাকতে হবে;
- required global/account-level permissions থাকতে হবে;
- Binance credential scope মিলতে হবে;
- Routing rule enabled হতে হবে;
- route min/max amount pass করতে হবে;
- Max Active Orders pass করতে হবে;
- explicit permission/RBAC checks pass করতে হবে।

Payment Split, ledger movement, charge/commission এবং actual Payment Account transaction করলে সেই accounting validation আগের মতোই প্রযোজ্য। Order-only mode accounting history bypass বা balance mutation তৈরি করে না।

## Co-agent assignment

Co-agent selection-এও Order-only Agent-এর জন্য Payment Account capacity বাধ্যতামূলক নয়। Accounting-enabled Agent-এর ক্ষেত্রে existing capacity protection অক্ষত।

## Verification

Automated coverage-এ অন্তর্ভুক্ত:

- 90 JavaScript syntax check;
- Agent role Global + account-level permission auto-tick;
- Live Order grant → unassigned order visibility;
- credential isolation;
- Live Order Agent hidden Work OFF regression;
- global Order-only assignment mode;
- per-Agent Order-only mode;
- accounting-enabled capacity guard preserved;
- co-agent Order-only candidate flow;
- full build/test regression suite;
- Payment Split/Release verification, realtime chat/market, Ads, accounting, database encryption/persistence এবং updater regression।

Real production Binance account দিয়ে live auto-assignment mutation এই build environment-এ করা হয়নি। Deployment-এর পরে controlled test order দিয়ে Live Order Agent এবং Order-only Agent দুটো scenario যাচাই করুন।
