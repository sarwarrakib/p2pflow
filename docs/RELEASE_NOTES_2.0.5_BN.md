# P2PFlow 2.0.5 Release Notes

## Release scope

2.0.5 হলো **Accounting / Permission Isolation / Scale / Production QA hardening** checkpoint। 2.0.4-এর Extension, Market, Push ও signed update architecture এবং 2.0.3-এর SaaS/Billing foundation retained আছে।

## Binance account permission isolation

- account-level permission-এর canonical set এক জায়গায় define করা হয়েছে।
- non-owner user-এর জন্য global permission **এবং** exact Binance account grant—দুটোই লাগবে।
- পুরনো “কোনো account grant নেই => সব account allowed” fallback বাদ দেওয়া হয়েছে।
- account permission save-এর সময় Binance credential একই tenant-এর কিনা verify হয়।
- account-level grant user-এর global permission-এর বাইরে দেওয়া যায় না।
- `binance.sync` এবং `p2p.profile.sync` আলাদা account-scoped permission।
- Orders sync এবং P2P Profile sync route সেই explicit permission দিয়েই protect করা হয়েছে।
- frontend permission matrix, descriptions এবং backend canonical list-এর static contract audit যোগ হয়েছে।

## User / Role / Credential performance

- Agent/User list-এর effective permissions, preferences, security status, audit counts এবং Binance grants set-based bulk query-তে আনা হয়েছে।
- Role list-এর per-role permission N+1 query বাদ দেওয়া হয়েছে।
- Binance credential options-এর per-account permission lookup set-based করা হয়েছে।
- large workspace-এ user/role/account permission page-এর DB round-trip সংখ্যা user count-এর সঙ্গে linear N+1 আকারে বাড়বে না।

## Accounting normalized facts

Completed Binance C2C order-এ তিনটি reporting fact persist হয়:

- `accounting_net_asset`
- `accounting_fee_asset`
- `accounting_fact_version`

BUY order-এ documented taker amount/net-credit semantics এবং SELL order-এ actual deducted/outflow semantics ব্যবহার করা হয়; unavailable field হলে deterministic gross/fee fallback থাকে। Source raw payload report render-এর সময় বারবার parse করতে হয় না।

## Accounting report parity / scale

- Overview summary, User/Agent performance, payment-method balances, daily replacement rows, close history, Income/Capital entries এবং Cost report নতুন relational model-এ wired।
- Agent/co-agent split assignment amount-weighted SQL aggregation ব্যবহার করে।
- Agent-scoped report শুধু নিজের daily/agent performance দেয়; company Binance projection, capital totals এবং closing history hidden।
- Accounting entry search/type/agent filters SQL-এ apply হয়; `page/rows` pagination যোগ হয়েছে।
- total এবং category aggregate current page নয়—সম্পূর্ণ filtered result set থেকে SQL-এ calculate হয়।
- Payment Account historical balance method report set-based ledger lookup ব্যবহার করে।
- business expense report outgoing payment principal-কে expense ধরে না; manual expense, transfer charge/refund এবং normalized Binance fee আলাদা করে।
- Daily close full normalized summary snapshot persist করে।

### Binance balance naming

Supplied C2C SAPI docs-এ authorized Funding Wallet total-এর জন্য নির্ভরযোগ্য endpoint এই project flow-তে establish করা হয়নি। তাই 2.0.5 কোনো undocumented balance endpoint guess করে না। UI-তে value-টি **Binance Asset (Order Projection)** হিসেবে দেখানো হয়।

### Replacement-profit model note

2.0.5 normalized `completed BUY net yield + SELL outflow` model ব্যবহার করে এবং old frontend fields preserve করে। Legacy 1.7.7-এর day-locked historical carryover-lot reconstruction data নতুন normalized database-এ না থাকলে তা বানিয়ে/guess করে না; existing close snapshot থাকলে opening history preserve হয়। এই distinction production accounting reconciliation-এ যাচাই করতে হবে।

## Migration 015

PostgreSQL / MySQL / MariaDB তিন family-তেই:

- normalized order accounting fact columns
- accounting report index
- exchange-account permission lookup index
- `binance.sync`
- `p2p.profile.sync`
- current version `2.0.5`

যোগ করা হয়েছে।

## Production QA tooling

- `scripts/permission-contract-audit.mjs`
- `scripts/accounting-contract-audit.mjs`
- `scripts/api-contract-audit.mjs`
- `scripts/production-preflight.sh`
- `scripts/http-smoke-load.mjs`

`production-preflight.sh` source/test/vet/build-এর পাশাপাশি production `.env` থাকলে DB driver, HTTPS, secure cookie, migration mode, APP_SECRET, update signature key এবং VERSION consistency validate করে।

## External/live validation

এই source checkpoint local deterministic QA pass করলেও real PostgreSQL/MySQL/MariaDB servers, logged-in Binance browser session, public Push Service, selected payment gateway এবং production multi-instance infrastructure এই sandbox থেকে production-verified বলা হয়নি। বিস্তারিত `docs/QA_2.0.5.md` ও launch checklist-এ আছে।
