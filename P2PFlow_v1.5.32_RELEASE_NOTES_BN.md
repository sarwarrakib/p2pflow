# P2PFlow v1.5.32 — Release Notes

**Application:** 1.5.32  
**Database schema:** 35  
**Migration:** প্রয়োজন নেই

## Release Verification regression — মূল সমাধান

v1.5.29–v1.5.31-এর verification redesign-এর পরে কিছু production order-এ Release flow pre-emptively verification screen খুলছিল এবং পুরোনো saved failure থেকে generic **Binance verification code** field পুনরায় দেখাতে পারত। এই generic field Binance-এর concrete Google/SMS code type ছিল না; P2PFlow error parser-এর ambiguity থেকে তৈরি হচ্ছিল।

v1.5.32-এ Release flow pre-v1.5.20 working sequence-এর সঙ্গে আবার সামঞ্জস্য করা হয়েছে:

1. Payment Split gate satisfied হলে Release click-এর সঙ্গে সঙ্গে প্রথম Binance request যায়।
2. প্রথম request-এ guessed Google/SMS/Fund Password/FIDO2 code পাঠানো হয় না।
3. Binance concreteভাবে যে verification method চায়, কেবল সেই challenge পাওয়া গেলে আলাদা responsive verification screen খোলে।
4. Google challenge হলে Authenticator App field, SMS হলে Mobile OTP, Fund Password হলে FUND_PWD, ইত্যাদি exact field দেখানো হয়।
5. generic `Verification failed` বা ambiguous `verification code is missing` থেকে আর কোনো user-facing generic code input বানানো হয় না।

## Stale challenge reset

পুরোনো `lastFinalActionFailure`-এ generic verification challenge save থাকলেও নতুন Release attempt সেটি UI-তে restore করবে না। নতুন direct probe-এর শুরুতে stale failure state বাদ দেওয়া হয় এবং শুধু current Binance response বিবেচনা করা হয়।

শুধু concrete previous challenge—যেমন Google/SMS/Fund/FIDO2—retry-এর `Verification failed` response-এর ক্ষেত্রে একই field ধরে fresh code চাইতে পারে।

## Per-API verification setting এখন preference

API Credentials-এর gear icon থেকে নির্বাচিত Binance verification method এখন **preference**, forced first-request payload নয়।

উদাহরণ:

- Settings = Google Authenticator → প্রথম Release request তবুও minimal যাবে; Binance Google চাইলে তখন Google field আসবে।
- Settings = Fund Transfer Password → প্রথম request Fund Password force করবে না; Binance সত্যিই FUND_PWD চাইলে তখন সেটি ব্যবহার হবে।
- Settings = Binance Auto → প্রথম request minimal; Binance Google/SMS যা চাইবে সেটিই দেখাবে।

## Google / SMS payload compatibility

- Google challenge → `googleVerifyCode`
- SMS challenge → `mobileVerifyCode`

Google/SMS dedicated field-এর সঙ্গে unnecessary `authType=GOOGLE/SMS` force করা হয় না।

## Saved Fund Transfer Password

Saved Fund Transfer Password:

- browser-এ expose হয় না;
- first release request-এ pre-send হয় না;
- Binance concrete `FUND_PWD` challenge দিলে তবেই eligible হয়;
- Auto-use enabled থাকলে configured P2PFlow Primary/Secondary verification pass করার পরে server-side থেকে exact saved password apply হয়।

## Payment Split behavior

- Payment Split requirement OFF → Release click সরাসরি Binance probe চালায়।
- Payment Split requirement ON + valid split already saved → split page পুনরায় আসে না; সরাসরি Binance probe।
- split/proof সত্যিই incomplete হলে তবেই split flow আগে আসে।

## UI

Concrete Binance challenge এলে responsive Release Verification screen আগের মতো থাকবে:

- mobile: full-screen;
- desktop/tablet: centered verification card;
- only required field;
- Paste + Submit;
- raw Binance JSON user-facing form-এ দেখানো হয় না।

## API Credentials

v1.5.30-এর per-account credential improvements বহাল:

- P2P username credential identity;
- Connect & Save-এর সময় automatic validation + live check;
- compact icon actions;
- gear icon-এ per-API Release Verification settings।

## Automated verification

v1.5.32 regression coverage-এর মধ্যে রয়েছে:

- direct minimal Release probe;
- no pre-emptive configured Google/SMS/Fund payload;
- stale generic challenge ignored;
- ambiguous generic verification-code field removed;
- concrete Google missing-code detection;
- Google/SMS dedicated payload mapping;
- Fund Password exact-value preservation;
- Fund auto-use local verification guard;
- Payment Split ON/OFF and proof modes;
- split edit/delete limit reconciliation;
- multi-account RBAC/Ads/notification scope;
- session/security/database/accounting/updater regression।

Real production Binance credential দিয়ে live coin release automated test environment-এ করা হয়নি। Deployment-এর পরে একটি ছোট controlled SELL order দিয়ে Binance Auto mode-এ পরীক্ষা করুন।
