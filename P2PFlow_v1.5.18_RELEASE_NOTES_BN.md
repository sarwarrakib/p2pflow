# P2PFlow v1.5.18 Release Notes

Release date: 2026-08-18  
Application version: `1.5.18`  
Database schema: `32`

## Release summary

এই release-এ Payment Account ownership ও access scope পরিষ্কার করা হয়েছে, permission-এর ডান পাশে click-based eye help যোগ হয়েছে, Security page-এর runtime error সংশোধন হয়েছে, per-user Notification Preferences যোগ হয়েছে, Manual Feedback button-কে extension-এর advertiser URL-এর সঙ্গে যুক্ত করা হয়েছে এবং Label/Serial-ভিত্তিক Payment Account search ও নতুন Offline Business receipt workflow চালু হয়েছে।

## Payment Account ownership ও permission scope

### Default Account User

- `Add Account` এবং `Bulk Add` খুললে **Account User** হিসেবে বর্তমানে লগইন করা user default selected থাকে।
- নিজের-account scope থাকা user client থেকে অন্য owner পাঠালেও backend account owner-কে logged-in user-এ সীমাবদ্ধ রাখে।
- Agent-এর নতুন account defaultভাবে Agent account type ব্যবহার করে এবং তার linked Agent access স্বয়ংক্রিয়ভাবে অন্তর্ভুক্ত হয়।
- Agent/own-scope user-এর owner field hidden ও server-enforced থাকলে form synchronization এখন select-only guard ব্যবহার করে; ফলে `Add Account` click-এর পর `ownerSelect.options is not iterable` JavaScript crash আর হয় না।

### Admin, Manager, Agent ও other-role behavior

- **Admin এবং Manager:** সব Payment Account দেখতে, add/edit করতে, owner পরিবর্তন করতে এবং Agent access assign/remove করতে পারে।
- **Agent:** `accounts.manage` থাকলে শুধু নিজের নামে থাকা Payment Account add/edit/manage করতে পারে। অন্য user-এর account-এর owner/access পরিবর্তন করতে পারে না।
- **Other custom role:** `accounts.manage_all` দিলে সব Payment Account manage এবং Account User/Agent access পরিবর্তন করতে পারে।
- `accounts.use`, `ledger.adjust` এবং `offline.transactions.manage` আলাদা capability; একটি permission অন্য write action স্বয়ংক্রিয়ভাবে দেয় না।
- Search, list, statement ও offline candidate API server-side scope filter করে; hidden account ID পাঠিয়ে access বাড়ানো যায় না।

## Payment Account Label ও Serial Number

প্রতিটি Payment Account-এ এখন:

- `Label`
- `Serial Number`

রাখা যায়। Serial Number non-empty হলে system-wide unique হতে হয়। Number, account name, Label, Serial, payment method এবং permitted owner information দিয়ে search করা যায়। Agent বা সীমিত user-এর search result-এ শুধু তার access থাকা account-ই আসে।

## Permission eye details

সব 31টি global permission এবং per-Binance-account permission row-এর ডান পাশে eye button আছে।

- Eye button click করলে ওই permission কী করতে পারে, কী করতে পারে না এবং dependency/অতিরিক্ত account grant প্রয়োজন কিনা—সম্পূর্ণ description দেখা যায়।
- Keyboard focus/Enter, touch এবং mouse click সমর্থিত।
- Tooltip modal-এর বাইরে fixed layer-এ render হওয়ায় scroll container-এর মধ্যে কেটে যায় না।
- বাইরে click, Escape, scroll বা resize করলে details বন্ধ হয়।

নতুন permission:

- `accounts.manage_all` — সব Payment Account manage, Account User পরিবর্তন এবং Agent access control।
- `offline.transactions.manage` — Offline Business receipt session, reservation, received entry এবং full/partial order finalization।

## Security page fix

Security page trusted-device information render করার সময় undefined `formatDate()` call-এর কারণে page থেমে যাচ্ছিল। এখন shared `fmt()` formatter ব্যবহার করা হয়েছে। Trusted Devices, current-session security controls এবং recovery-related UI আবার render করে।

## Notification Preferences

Notifications page-এ এখন per-user preference panel আছে। User আলাদাভাবে In App এবং Email channel-এর জন্য নিচের category ON/OFF করতে পারে:

- Orders
- Assignments
- P2P Messages
- Payments & Accounts
- Ads & Binance
- Accounting
- Team & Access
- System
- Security

Security notification mandatory এবং disable করা যায় না। Preference database-এ user profile-এর সঙ্গে সংরক্ষিত থাকে। Notification list, notification center, chat badge এবং notification-email recipients সংশ্লিষ্ট preference অনুযায়ী filter হয়। Global mail setting disabled থাকলে per-user Email ON থাকলেও email পাঠানো হয় না।

## Manual Feedback advertiser link

Order → P2P Information-এর **Open Feedback Page** button এখন সেই exact advertiser URL ব্যবহার করে, যা CRM extension task-এর `advertiserUrl` field-এ পাঠায়।

- Button নতুন browser tab-এ URL খোলে।
- URL Binance allowlist validation pass না করলে button disabled থাকে।
- Popup blocked হলে user-কে browser permission-এর নির্দেশ দেখানো হয়।
- Extension-এর background worker একই `task.advertiserUrl` দিয়ে tab খোলে; তাই manual এবং extension workflow একই source URL ব্যবহার করে।

## Offline Business receipt workflow

Accounting navigation-এ নতুন **Offline Business** page যোগ হয়েছে।

### Receipt session তৈরি

- Requested amount, per-number limit, payment method, reference, counterparty এবং note দেওয়া যায়।
- Number/Label/Serial দিয়ে eligible Payment Account search করা যায়।
- Candidate list শুধু active, permitted, unreserved এবং receive limit থাকা account দেখায়; কোনো pending normal order split-এ numberটি locked থাকলেও candidate থেকে বাদ যায়।
- System available daily/monthly receive limit ও per-number limit অনুযায়ী suggested amount হিসাব করে।

### Reservation

- Session তৈরি হলে নির্বাচিত numberগুলো reservation পায়।
- `pending`, `partially_received` বা `ready` session-এর reserved number অন্য active offline session বা normal order payment split-এ ব্যবহার করা যায় না।
- একইভাবে normal order-এর `planned`/`partial` payment split-এ locked number Offline Business session বা অন্য নতুন order split-এ নেওয়া যায় না।
- Zero received হলে session cancel করে reservation release করা যায়।

### Received এবং balance

- প্রতিটি reserved account-এ পূর্ণ বা কম amount লিখে **Received** করা যায়।
- Received entry account ledger-এ `offline_receive` হিসেবে যোগ হয় এবং account balance বাড়ে।
- Planned amount-এর বেশি অথবা current receive limit-এর বেশি গ্রহণ করা যায় না।
- Repeated partial receipt support আছে যতক্ষণ allocation-এর planned amount পূর্ণ না হয়।

### Offline order finalization

- Requested total পূর্ণ হলে full offline order তৈরি করা যায়।
- Total অসম্পূর্ণ হলেও explicit partial confirmation দিয়ে যত টাকা received হয়েছে ঠিক সেই amount-এর completed offline order তৈরি করা যায়।
- Received accountগুলো completed payment split হিসেবে order-এর সঙ্গে যুক্ত হয়।
- Unused reservation release হয় এবং finalized session পুনরায় mutate করা যায় না।

## Database migration

Schema `32` additive migration:

- User notification preferences normalize/initialize করে।
- Payment Account `label`, `serialNumber`, owner-linked Agent access এবং scope metadata normalize করে।
- `offlineTransactions` collection ও nested allocation identifiers initialize করে।
- Existing order, Ads, ledger, accounting, login/security এবং credential data অক্ষত থাকে।

## Verification performed

Final source/package verification-এ অন্তর্ভুক্ত:

- 78টি JavaScript file syntax check
- `npm run build`
- পূর্ণ `npm test`
- Payment Account ownership/all-scope/Agent-own regression
- Label/Serial uniqueness ও scoped search markers
- Permission eye and 31-description coverage
- Security-page formatter regression
- Notification preference category/channel enforcement
- Manual advertiser URL source equivalence
- Offline reservation/received/full-partial finalization checks
- Real headless Chromium UI smoke: Security render, 9 notification categories/save, Offline Business 10 লাখ/50 হাজার defaults ও Label/Serial candidate, Add User permission-eye tooltip এবং Agent Add Account owner-default flow
- Multi-account Orders/Ads UI এবং exact Binance-account RBAC
- Ads merchant account isolation ও Business/Online/Break state
- Authentication, Security Question, trusted device এবং mail failover
- Database encryption/persistence, accounting, update/rollback ও production hardening

## Live-operation limitation

Automated verification real production Binance credential, real SMTP recipient বা public production database দিয়ে mutation চালায়নি। Label/Serial, notification preference এবং Offline Business workflow P2PFlow-এর internal CRM capability; supplied Binance Payment Method API contract পরিবর্তন করা হয়নি। Deployment-এর পরে controlled test data দিয়ে permission scope, receipt balance, partial finalization এবং advertiser-link behavior যাচাই করতে হবে।
